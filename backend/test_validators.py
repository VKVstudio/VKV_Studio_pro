import base64
import hashlib
import tempfile
import unittest
import io
from PIL import Image
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from editorial import canonical,digest
from validators import ReviewAuthority,LocalValidators
from test_editorial import candidate,ledger,article
from test_future_news import news


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.now=1790812800
        self.key=Ed25519PrivateKey.generate() # ephemeral fixture only; not provisioned credentials
        public=self.key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        self.trust={'fixture':{'subject':'reviewer-fixture','gates':{'evidence','legal','safety','media'},'revoked':False,'publicKey':public}}
        self.root=Path(tempfile.mkdtemp(prefix='vkv-validator-fixtures-'))
        (self.root/'images').mkdir();(self.root/'og').mkdir()
        def image_bytes(format,size):
            output=io.BytesIO();Image.new('RGB',size,'#345678').save(output,format=format);return output.getvalue()
        files={'/images/story-one.webp':image_bytes('WEBP',(32,32)),'/og/story-one.png':image_bytes('PNG',(1200,627))}
        for name,body in files.items():(self.root/name.lstrip('/')).write_bytes(body)
        draft=article();draft['takeaway']='WATCH: Wait for a measured release.';draft['minutes']=1
        record=news();record['dateEvidence']={'publishedAt':{'label':'published','quote':'Published: 2026-09-25'},'updatedAt':{'label':'updated','quote':'Updated: 2026-09-26'}}
        source=candidate()['sourceExcerpt']+' Published: 2026-09-25. Updated: 2026-09-26.'
        self.snapshot={'id':'story-one','revision':1,'status':'social_ready','pack':{'candidate':candidate(),'ledger':ledger(),'article':draft,'newsRecord':record,'sourceText':source,'sourceSha256':digest(source),
            'mediaManifest':[{'url':url,'sha256':hashlib.sha256(body).hexdigest(),'rights':'Synthetic fixture only','alt':'Fixture'} for url,body in files.items()]}}

    def attest(self,gate):
        body={'schemaVersion':1,'keyId':'fixture','reviewerSubject':'reviewer-fixture','gate':gate,'snapshotSha256':digest(self.snapshot),'issuedAt':self.now,'note':'Offline review fixture only'}
        return {'payload':body,'signature':base64.b64encode(self.key.sign(canonical(body))).decode()}

    def engine(self):
        receipts={g:self.attest(g) for g in ('evidence','legal','safety','media')}
        return LocalValidators(authority=ReviewAuthority(self.trust),attestation_store={digest(self.snapshot):receipts},media_root=self.root,allowed_hosts={'example.org'},allowed_topics={'Local AI'},service_urls={article()['service']['url']},now=lambda:self.now)

    def test_default_unsigned_gates_deny_and_signed_review_is_bound(self):
        default=LocalValidators(now=lambda:self.now).evaluate(self.snapshot)
        self.assertFalse(all(r.passed for r in default))
        self.assertFalse(next(r.passed for r in default if r.gate=='evidence'))
        engine=self.engine();self.assertTrue(all(r.passed for r in engine.evaluate(self.snapshot)))
        self.snapshot['pack']['article']['takeaway']='WATCH: Changed content.'
        self.assertFalse(next(r.passed for r in engine.evaluate(self.snapshot) if r.gate=='evidence'))

    def test_revoked_key_or_forged_subject_cannot_approve(self):
        attestation=self.attest('evidence');authority=ReviewAuthority(self.trust)
        attestation['payload']['reviewerSubject']='owner'
        self.assertFalse(authority.verify('evidence',self.snapshot,attestation,self.now))
        self.trust['fixture']['revoked']=True
        self.assertFalse(authority.verify('evidence',self.snapshot,self.attest('evidence'),self.now))

    def test_media_actual_bytes_missing_og_and_escape_fail(self):
        engine=self.engine();(self.root/'og/story-one.png').write_bytes(b'changed')
        self.assertFalse(next(r.passed for r in engine.evaluate(self.snapshot) if r.gate=='media'))
        self.snapshot['pack']['mediaManifest'][0]['url']='/images/../../outside.png'
        self.assertFalse(next(r.passed for r in engine.evaluate(self.snapshot) if r.gate=='media'))

    def test_inconsistent_source_digest_and_duplicate_sources_fail(self):
        engine=self.engine();self.snapshot['pack']['sourceSha256']='0'*64
        self.assertFalse(any(r.passed for r in engine.evaluate(self.snapshot)))
        self.snapshot['pack']['sourceSha256']=digest(self.snapshot['pack']['sourceText'])
        self.snapshot['pack']['article']['sources']*=2
        self.assertFalse(next(r.passed for r in engine.evaluate(self.snapshot) if r.gate=='quality'))

    def test_signed_hash_cannot_approve_corrupt_wrong_format_or_oversized_media(self):
        for body in (b'not-an-image', (self.root/'og/story-one.png').read_bytes()):
            target=self.root/'images/story-one.webp';target.write_bytes(body)
            self.snapshot['pack']['mediaManifest'][0]['sha256']=hashlib.sha256(body).hexdigest()
            self.assertFalse(next(r.passed for r in self.engine().evaluate(self.snapshot) if r.gate=='media'))
        output=io.BytesIO();Image.new('RGB',(8193,1)).save(output,format='PNG')
        body=output.getvalue();(self.root/'og/story-one.png').write_bytes(body)
        self.snapshot['pack']['mediaManifest'][1]['sha256']=hashlib.sha256(body).hexdigest()
        with self.assertRaises(ValueError):self.engine().media(self.snapshot)


if __name__=='__main__':unittest.main()
