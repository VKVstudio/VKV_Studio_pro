"""Mechanical source/date/event/benefit checks; not semantic truth verification."""
import re
from datetime import datetime
from decimal import Decimal, localcontext
from editorial import require, digest, plain_text, https_url, iso_date


def event_identity(publisher, product, announcement):
    return digest({"publisher":publisher,"product":product,"announcement":announcement})


def validate_news_record(value, source_text, source_url):
    https_url(source_url,'captured source URL')
    fields={"eventId","publisher","product","announcementKey","publishedAt","updatedAt","discoveredAt","changeKind","claims"}
    require(isinstance(value,dict) and fields <= set(value) <= fields|{"dateEvidence","calculations"}, "invalid news record")
    for key in ("publisher","product","announcementKey"):
        plain_text(value[key],key)
    require(value["eventId"] == event_identity(value["publisher"],value["product"],value["announcementKey"]), "immutable event identity mismatch")
    for key in ("publishedAt","updatedAt"):
        if value[key] is not None:
            iso_date(value[key],key)
    require(isinstance(value["discoveredAt"],str),"discovered date required")
    discovered = datetime.fromisoformat(value["discoveredAt"])
    require(discovered.tzinfo is not None,"discoveredAt needs timezone")
    if value["publishedAt"] is not None and value["updatedAt"] is not None:
        require(value["publishedAt"] <= value["updatedAt"],"update precedes publication")
    for key in ("publishedAt","updatedAt"):
        if value[key]: require(value[key] <= discovered.date().isoformat(),"source date follows discovery")
    require(value["changeKind"] in {"initial","meaningful-update","editorial-correction","unknown"},"invalid change kind")
    if "dateEvidence" in value:
        require(isinstance(value["dateEvidence"],dict) and set(value["dateEvidence"])=={"publishedAt","updatedAt"},"invalid date evidence")
        for key,label in (("publishedAt","published"),("updatedAt","updated")):
            evidence=value["dateEvidence"][key]
            if value[key] is None: require(evidence is None,"unknown date cannot claim evidence")
            else:
                require(isinstance(evidence,dict) and set(evidence)=={"label","quote"} and evidence["label"]==label,"date label mismatch")
                quote=plain_text(evidence["quote"],"date quote")
                require(quote in source_text and value[key] in quote and re.search(r"\b"+label+r"\b",quote,re.I),"source date label evidence absent")
    if "calculations" in value: verify_calculations(value["calculations"])
    require(isinstance(value["claims"],list) and 1 <= len(value["claims"]) <= 100,"invalid claims")
    ids=set()
    for claim in value["claims"]:
        require(isinstance(claim,dict) and set(claim)=={"id","text","kind","status","sourceUrl","quote","qualitativeBenefit"},"invalid news claim")
        plain_text(claim["id"],"claim ID"); plain_text(claim["text"],"claim text")
        require(claim["id"] not in ids,"duplicate claim ID");ids.add(claim["id"])
        require(claim["kind"] in {"source-assertion","editorial-hypothesis"},"claim kind required")
        require(claim["status"] in {"announced","planned","tested","deployed","unknown"},"claim status required")
        require(type(claim["qualitativeBenefit"]) is bool,"benefit classification required")
        if claim["kind"]=="source-assertion":
            https_url(claim["sourceUrl"],"source URL")
            require(claim['sourceUrl']==source_url,'claim URL has no captured snapshot')
            quote=plain_text(claim["quote"],"evidence quote")
            require(quote in source_text,"quote absent from source snapshot")
        else:
            require(claim["sourceUrl"] is None and claim["quote"] is None,"hypothesis is not a source assertion")
        benefit=bool(re.search(r"\b(faster|quicker|saves?|improves?|reduces?|increase[sd]?)\b",claim["text"],re.I))
        require(not benefit or claim["qualitativeBenefit"],"unclassified qualitative benefit")
        if benefit or claim["qualitativeBenefit"]:
            require(claim["kind"]=="source-assertion" and re.search(r"\b(faster|quicker|sav\w*|improv\w*|reduc\w*|increas\w*)\b",claim["quote"],re.I),"qualitative benefit lacks source evidence")
    return value


def verify_calculations(items):
    require(isinstance(items,list) and len(items)<=100,"invalid calculation count")
    with localcontext() as ctx:
        ctx.prec=50
        for item in items:
            require(isinstance(item,dict) and set(item)=={"operation","operands","result"},"invalid calculation")
            require(item["operation"] in {"add","subtract","multiply","divide","percent-change"},"invalid calculation operation")
            require(isinstance(item["operands"],list) and len(item["operands"])==2,"two operands required")
            def number(text):
                require(isinstance(text,str) and re.fullmatch(r"-?\d{1,20}(?:\.\d{1,10})?",text),"bounded decimal required")
                return Decimal(text)
            a,b=map(number,item["operands"]); result=number(item["result"])
            if item["operation"]=="add":expected=a+b
            elif item["operation"]=="subtract":expected=a-b
            elif item["operation"]=="multiply":expected=a*b
            elif item["operation"]=="divide":
                require(b!=0,"division by zero");expected=a/b
            else:
                require(a!=0,"percentage baseline cannot be zero");expected=(b-a)/a*100
            require(abs(expected-result)<=Decimal('0.0000000001'),"calculation result mismatch")
    return True


def article_spans(article):
    spans={key:article[key] for key in ('category','title','dek','takeaway','evidence','limits','facts','interpretation','practicalDecision')}
    spans['service.reason']=article['service']['reason']
    spans['service.label']=article['service']['label']
    if 'eventLabel' in article:spans['eventLabel']=article['eventLabel']
    for index,source in enumerate(article['sources']):spans[f'source.{index}.label']=source['label']
    for index,section in enumerate(article['sections']):
        spans[f'section.{index}.heading']=section['heading']
        for paragraph,text in enumerate(section['paragraphs']):spans[f'section.{index}.paragraph.{paragraph}']=text
    return spans


def validate_skeptic(result, data):
    required={'verdict','claims','reasons'}
    require(isinstance(result,dict) and required <= set(result) <= required|{'articleCoverage'},"invalid skeptic schema")
    require(isinstance(result["verdict"],str) and result["verdict"] in {"pass","revise","human"},"invalid skeptic verdict")
    require(isinstance(result["reasons"],list) and 1 <= len(result["reasons"]) <= 20,"skeptic reasons required")
    for reason in result["reasons"]: plain_text(reason,"skeptic reason")
    ledger={x["id"]:x for x in data["ledger"]["claims"]}
    expected=set(ledger);seen=set()
    require(isinstance(result["claims"],list) and len(result["claims"])==len(expected),"skeptic must cover every claim")
    for claim in result["claims"]:
        require(isinstance(claim,dict) and set(claim)=={"id","verdict","sourceUrl","quote","reason"},"invalid claim verdict")
        require(isinstance(claim["id"],str) and claim["id"] in expected and claim["id"] not in seen,"invalid skeptic claim ID"); seen.add(claim["id"])
        require(isinstance(claim["verdict"],str) and claim["verdict"] in {"supported","unsupported","hypothesis","unknown"},"invalid claim verdict")
        plain_text(claim["reason"],"claim verdict reason")
        if claim["verdict"]=="supported":
            require(isinstance(claim["sourceUrl"],str) and claim["sourceUrl"] in {x["url"] for x in data["article"]["sources"]},"skeptic source not cited")
            require(claim["sourceUrl"]==data["candidate"]["sourceUrl"],"no captured snapshot for secondary source")
            require(plain_text(claim["quote"],"support quote") in data["sourceText"],"skeptic quote absent from source")
        else:
            require(claim["quote"] is None,"non-supported verdict cannot invent quote")
        if result["verdict"]=="pass":
            require(claim["verdict"] in {"supported","hypothesis"},"ambiguous or unsupported claim cannot pass")
            if claim["verdict"]=="hypothesis":
                require(ledger[claim["id"]]["kind"]=="estimate","hypothesis verdict requires an explicit estimate")
            if ledger[claim["id"]]["kind"]=="source":
                require(claim["verdict"]=="supported","source claim needs source support")
    if result['verdict']=='pass':
        spans=article_spans(data['article']);coverage=result.get('articleCoverage');seen_spans=set()
        require(isinstance(coverage,list) and len(coverage)==len(spans),'skeptic must review every article span')
        for item in coverage:
            require(isinstance(item,dict) and set(item)=={'spanId','textSha256','claimIds','classification','reason'},'invalid article coverage')
            span=item['spanId']
            require(isinstance(span,str) and span in spans and span not in seen_spans,'invalid/duplicate article span');seen_spans.add(span)
            require(item['textSha256']==digest(spans[span]),'article span changed')
            plain_text(item['reason'],'coverage reason')
            require(item['classification'] in {'ledger-fact','editorial-hypothesis','no-factual-claim'},'ambiguous article span requires human review')
            ids=item['claimIds']
            require(isinstance(ids,list) and len(ids)<=100 and all(isinstance(x,str) and x in expected for x in ids)
                    and len(set(ids))==len(ids),'invalid span claim IDs')
            if item['classification']=='ledger-fact':
                require(bool(ids) and all(ledger[x]['kind'] in {'source','ours'} for x in ids),'factual span needs factual ledger claims')
            elif item['classification']=='editorial-hypothesis':
                require(bool(ids) and all(ledger[x]['kind']=='estimate' for x in ids),'hypothesis span needs explicit estimate claims')
            else: require(not ids,'nonfactual span cannot cite factual claims')
            # This is a conservative exception trigger, not a truth detector.
            if re.search(r'\b(?:ROI|return on investment|our completed|our factory|we tested|we measured|our client test)\b',spans[span],re.I):
                require(False,'own-test/ROI assertion requires separate human evidence review')
    return result
