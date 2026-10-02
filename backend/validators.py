"""Local deterministic gates and signed reviewer attestations. No networking.

Semantic evidence, rights/legal and risk acceptance require a trusted signed
review, not an LLM boolean. Keys are supplied by the operator; none are created.
"""
import base64
import hashlib
import re
import io
import warnings
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from PIL import Image

from editorial import canonical, digest, require, validate_candidate, validate_ledger, validate_article
from news_checks import validate_news_record
from publication_policy import GateReceipt, GATES


class ReviewAuthority:
    def __init__(self, keys=None):
        self.keys=keys or {}

    def verify(self, gate, snapshot, attestation, now):
        try:
            require(isinstance(attestation,dict) and set(attestation)=={"payload","signature"},"invalid attestation")
            body=attestation["payload"]
            require(isinstance(body,dict) and set(body)=={"schemaVersion","keyId","reviewerSubject","gate","snapshotSha256","issuedAt","note"},"invalid review payload")
            require(body["schemaVersion"]==1 and body["gate"]==gate and body["snapshotSha256"]==digest(snapshot),"review binding mismatch")
            require(type(body["issuedAt"]) is int and 0<=now-body["issuedAt"]<=86400,"review expired or future")
            require(isinstance(body["note"],str) and 1<=len(body["note"])<=2000,"review note required")
            key=self.keys[body["keyId"]]
            require(key.get("revoked") is False and key["subject"]==body["reviewerSubject"] and gate in key["gates"],"review authority denied")
            signature=base64.b64decode(attestation["signature"],validate=True)
            require(len(signature)==64,"invalid signature length")
            Ed25519PublicKey.from_public_bytes(key["publicKey"]).verify(signature,canonical(body))
            return True
        except Exception:
            return False


class LocalValidators:
    def __init__(self, *, authority=None, attestation_store=None, media_root=None,
                 allowed_hosts=(), allowed_topics=(), service_urls=(), now=None):
        self.authority=authority or ReviewAuthority()
        # Store is a trusted server-side lookup keyed by snapshot hash. Request
        # JSON cannot supply it or introduce a trusted signing key.
        self.attestations=attestation_store or {}
        self.root=Path(media_root).resolve() if media_root is not None else None
        self.hosts=frozenset(allowed_hosts);self.topics=frozenset(allowed_topics)
        self.services=frozenset(service_urls)
        self.now=now or (lambda:0)
        self.last_results={}

    def media(self, snapshot):
        data=snapshot["pack"];manifest=data.get("mediaManifest")
        require(self.root is not None and self.root.is_dir(),"trusted media root missing")
        require(isinstance(manifest,list) and 1<=len(manifest)<=1000,"media manifest missing/bounded")
        seen=set();total=0
        for item in manifest:
            require(isinstance(item,dict) and set(item)=={"url","sha256","rights","alt"},"media manifest fields invalid")
            url=item["url"]
            require(isinstance(url,str) and re.fullmatch(r"/(?:images|og)/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg|avif)",url),"unsafe media URL")
            require(url not in seen,"duplicate media URL");seen.add(url)
            require(all(isinstance(item[key],str) and 1<=len(item[key])<=2000 for key in ("rights","alt")),"media rights/alt required")
            target=self.root.joinpath(url.lstrip('/'))
            require(not target.is_symlink() and target.resolve().is_relative_to(self.root) and target.is_file(),"media outside root/missing")
            for parent in target.parents:
                if parent==self.root: break
                require(not parent.is_symlink(),"symlink media parent")
            require(target.stat().st_size<=20*1024*1024,"media file too large")
            chunks=[];size=0
            with target.open('rb') as stream:
                while chunk:=stream.read(65536):
                    size+=len(chunk);require(size<=20*1024*1024,"media grew beyond cap");chunks.append(chunk)
            total+=size;require(total<=200*1024*1024,"media total cap")
            body=b''.join(chunks)
            require(hashlib.sha256(body).hexdigest()==item["sha256"],"media bytes changed")
            expected={'.png':'PNG','.webp':'WEBP','.jpg':'JPEG','.avif':'AVIF'}[target.suffix.lower()]
            # Decode the same bounded bytes whose hash was checked. Neither a
            # file extension nor a signed rights note proves a valid image.
            with warnings.catch_warnings():
                warnings.simplefilter('error',Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(body)) as image:
                    require(image.format==expected,"media format mismatch")
                    width,height=image.size
                    require(1<=width<=8192 and 1<=height<=8192 and width*height<=16_777_216,"media pixel cap")
                    require(getattr(image,'n_frames',1)==1,"animated media unsupported")
                    if url.startswith('/og/'):
                        require((width,height)==(1200,627),"OG dimensions must be 1200 by 627")
                    image.verify()
                with Image.open(io.BytesIO(body)) as decoded:
                    decoded.load()
        require(data["article"]["previewImage"] in seen and f"/og/{data['article']['slug']}.png" in seen,"required preview/OG missing")
        return True

    def evaluate(self,snapshot):
        fingerprint=digest(snapshot);data=snapshot["pack"];now=self.now()
        attestations=self.attestations.get(fingerprint,{})
        results={gate:False for gate in GATES}
        errors={}
        try:
            candidate=validate_candidate(data["candidate"])
            ledger=validate_ledger(data["ledger"],candidate)
            article=validate_article(data["article"],candidate,ledger)
            news=validate_news_record(data["newsRecord"],data["sourceText"],candidate['sourceUrl'])
            require({x['id'] for x in news['claims']} <= {x['id'] for x in ledger['claims']},'news claims absent from ledger')
            require(data["sourceSha256"]==digest(data["sourceText"]),"source snapshot hash mismatch")
            results["policy"]=(candidate["topic"] in self.topics and urlsplit(candidate["sourceUrl"]).hostname in self.hosts
                               and article["service"]["url"] in self.services and news["changeKind"]!='unknown')
            text=' '.join([article['dek'],article['takeaway'],*[' '.join(s['paragraphs']) for s in article['sections']]])
            results["quality"]=(len(article["title"])<=200 and len(article["dek"])<=400
                                and any(token in article["takeaway"] for token in ('ACT:','WATCH:','PASS:'))
                                and article["minutes"]<=max(2,(len(text.split())+199)//200+1)
                                and len({x["url"] for x in article["sources"]})==len(article["sources"]))
            results["evidence"]=("dateEvidence" in news and news["publishedAt"] is not None
                                 and self.authority.verify('evidence',snapshot,attestations.get('evidence'),now))
            for gate in ('legal','safety'):
                results[gate]=self.authority.verify(gate,snapshot,attestations.get(gate),now)
            try:
                results['media']=self.media(snapshot) and self.authority.verify('media',snapshot,attestations.get('media'),now)
            except (ValueError,OSError,KeyError,TypeError,Image.DecompressionBombError,Image.DecompressionBombWarning) as exc: errors['media']=type(exc).__name__
        except (ValueError,KeyError,TypeError) as exc:
            # A malformed source/ledger/article cannot emit partial passing gates.
            results={gate:False for gate in GATES};errors['contract']=type(exc).__name__
        self.last_results={"passed":results,"errors":errors,"snapshotSha256":fingerprint}
        return [GateReceipt(gate,fingerprint,passed,now,'local-validators-v1') for gate,passed in sorted(results.items())]
