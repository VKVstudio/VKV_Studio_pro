"""Bounded offline discovery from imported official indexes/feeds.

No HTTP, DNS, scheduler or implicit publisher approval. Feed dates are leads,
never evidence of an article's publication date. Captured articles still need
source snapshots, event identity and semantic review in the pipeline.
"""
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit
from editorial import require,plain_text,digest


class PublisherIndex:
    def __init__(self, *, publisher, origin, article_prefixes):
        parts=urlsplit(origin)
        require(parts.scheme=='https' and parts.hostname and parts.netloc==parts.hostname
                and not parts.query and not parts.fragment and parts.path in ('','/'),'exact HTTPS publisher origin required')
        require(isinstance(article_prefixes,tuple) and 1<=len(article_prefixes)<=10
                and all(isinstance(p,str) and p.startswith('/') and '..' not in p and '?' not in p and '#' not in p for p in article_prefixes),'trusted article prefixes required')
        self.publisher=plain_text(publisher,'publisher');self.origin=origin.rstrip('/');self.prefixes=article_prefixes

    def article_url(self,value):
        require(isinstance(value,str) and 1<=len(value)<=2000 and not any(ord(c)<=32 for c in value),'invalid discovery URL')
        result=urlsplit(urljoin(self.origin+'/',value))
        require(result.scheme=='https' and result.netloc==urlsplit(self.origin).netloc and not result.username
                and not result.password and not result.query and not result.fragment,'publisher URL escape')
        require('%' not in result.path and '\\' not in result.path and '..' not in result.path.split('/'),'ambiguous publisher path')
        require(any(result.path.startswith(prefix) and result.path!=prefix for prefix in self.prefixes),'outside article prefixes')
        return result.geturl()

    def parse(self,body,format):
        require(isinstance(body,bytes) and 1<=len(body)<=512*1024,'bounded imported index required')
        text=body.decode('utf8');leads=[]
        if format=='html':
            class Links(HTMLParser):
                def __init__(self):super().__init__(convert_charrefs=True);self.href=None;self.title=[];self.entries=[];self.count=0
                def handle_starttag(self,tag,attrs):
                    if tag=='a':
                        self.count+=1;require(self.count<=1000,'index link cap');self.href=dict(attrs).get('href');self.title=[]
                def handle_data(self,data):
                    if self.href:self.title.append(data)
                def handle_endtag(self,tag):
                    if tag=='a' and self.href:self.entries.append((self.href,' '.join(self.title)));self.href=None
            parser=Links();parser.feed(text);entries=parser.entries
        elif format in {'rss','atom'}:
            require(not re.search(r'<!\s*(?:DOCTYPE|ENTITY)',text,re.I),'XML entities/DTD forbidden')
            root=ET.fromstring(text)
            nodes=root.findall('.//item') if format=='rss' else root.findall('{http://www.w3.org/2005/Atom}entry')
            require(len(nodes)<=100,'feed entry cap');entries=[]
            for node in nodes:
                if format=='rss':url=node.findtext('link');title=node.findtext('title')
                else:
                    link=next((link for link in node.findall('{http://www.w3.org/2005/Atom}link') if link.get('rel','alternate')=='alternate'),None)
                    url=link.get('href') if link is not None else None;title=node.findtext('{http://www.w3.org/2005/Atom}title')
                entries.append((url,title))
        else:raise ValueError('unsupported offline index format')
        seen=set()
        for href,title in entries:
            try:url=self.article_url(href);title=plain_text(' '.join((title or '').split()),'lead title')
            except ValueError:continue
            if url in seen:continue
            seen.add(url)
            require(len(seen)<=100,'discovery lead cap')
            leads.append({'publisher':self.publisher,'url':url,'title':title,'leadId':digest({'publisher':self.publisher,'url':url}),
                          'indexSha256':digest(text),'publicationDateEvidence':None,'approved':False})
        return leads


# Registry candidates, not approved integrations. No invented RSS/API endpoints.
# Exact news paths and data handling must be checked and owner accepted before
# any future collector can consume a candidate. China/Meta/Apple are explicit.
PUBLISHER_CANDIDATES=(
    ('OpenAI','https://openai.com'),('Google','https://blog.google'),('Google DeepMind','https://deepmind.google'),
    ('Anthropic','https://www.anthropic.com'),('Meta','https://ai.meta.com'),('Apple','https://machinelearning.apple.com'),
    ('Microsoft Research','https://www.microsoft.com'),('NVIDIA','https://www.nvidia.com'),('Mistral AI','https://mistral.ai'),
    ('DeepSeek','https://www.deepseek.com'),('Qwen','https://qwenlm.github.io'),
)
