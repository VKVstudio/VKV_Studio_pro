import unittest
import xml.etree.ElementTree as ET
from discovery import PublisherIndex,PUBLISHER_CANDIDATES


class DiscoveryTests(unittest.TestCase):
    def setUp(self):self.index=PublisherIndex(publisher='fixture vendor',origin='https://example.org',article_prefixes=('/news/',))

    def test_rss_atom_html_same_lead_and_dates_never_fabricated(self):
        rss=b'<rss><channel><item><title>One release</title><link>https://example.org/news/tool-one</link><pubDate>Updated yesterday</pubDate></item></channel></rss>'
        atom=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>One release</title><link href="/news/tool-one"/><updated>2026-10-01</updated></entry></feed>'
        html=b'<a href="/news/tool-one">One release</a><a href="/news/tool-one">Duplicate</a>'
        values=[self.index.parse(body,format) for body,format in ((rss,'rss'),(atom,'atom'),(html,'html'))]
        self.assertEqual(len({value[0]['leadId'] for value in values}),1)
        for value in values:self.assertEqual(len(value),1);self.assertIsNone(value[0]['publicationDateEvidence']);self.assertFalse(value[0]['approved'])

    def test_offsite_credentials_path_escape_and_unapproved_leads(self):
        for url in ('https://evil.invalid/news/tool','https://example.org@evil.invalid/news/tool','https://example.org:443/news/tool',
                    'http://example.org/news/tool','/news/%2e%2e/secret','/not-news/tool','/news/tool?redirect=evil'):
            with self.assertRaises(ValueError):self.index.article_url(url)
        self.assertEqual(self.index.parse(b'<a href="https://evil.invalid/news/tool">No</a>','html'),[])
        publishers={name for name,_ in PUBLISHER_CANDIDATES};self.assertTrue({'Meta','Apple','DeepSeek','Qwen'}<=publishers)

    def test_xml_entities_malformed_or_oversized_imports_fail_closed(self):
        for body in (b'<!DOCTYPE rss [<!ENTITY x "boom">]><rss/>',b'<broken',b'x'*(512*1024+1)):
            with self.assertRaises((ValueError,ET.ParseError)):self.index.parse(body,'rss')


if __name__=='__main__':unittest.main()
