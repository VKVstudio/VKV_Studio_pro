import unittest
from unittest.mock import patch
from source_collector import SourceError, collect_source, fetch_source, validate_destination


def dns(ip):
    return lambda *args, **kwargs: [(2, 1, 6, "", (ip, 443))]


class Response:
    status = 200
    def __init__(self):
        self.sent = False
    def getheader(self, name):
        return {"Content-Type": "text/html", "Content-Length": "7"}.get(name)
    def read(self, limit):
        if self.sent:
            return b""
        self.sent = True
        return b"fixture"


class Connection:
    calls = []
    response = Response()
    def __init__(self, host, address, timeout):
        self.calls.append((host, address))
    def request(self, *args, **kwargs):
        pass
    def getresponse(self):
        return type(self.response)()
    def close(self):
        pass


class CollectorTests(unittest.TestCase):
    def test_real_transport_and_entrypoint_disabled_before_dns(self):
        with patch("socket.getaddrinfo", side_effect=AssertionError("No DNS permitted")), patch("socket.create_connection", side_effect=AssertionError("No network permitted")):
            for call in (collect_source, fetch_source):
                with self.assertRaises(SourceError):
                    call("https://openai.com/a", {"openai.com"})

    def test_mixed_public_private_dns_and_dns_failure(self):
        def mixed(*args, **kwargs):
            return [(2, 1, 6, "", ("8.8.8.8", 443)), (2, 1, 6, "", ("169.254.169.254", 443))]
        def failure(*args, **kwargs):
            raise OSError("resolver failed")
        for resolver in (mixed, failure):
            with self.assertRaises(SourceError):
                validate_destination("https://openai.com/a", {"openai.com"}, resolver)

    def test_exact_host_and_private_addresses(self):
        hosts = {"openai.com"}
        for url in ["http://openai.com/index/a", "https://openai.com.evil.test/a", "https://user@openai.com/a", "https://openai.com:8443/a", "https://openai.com/a#x"]:
            with self.assertRaises(SourceError):
                validate_destination(url, hosts, dns("8.8.8.8"))
        for ip in ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1"]:
            with self.assertRaises(SourceError):
                validate_destination("https://openai.com/a", hosts, dns(ip))

    def test_transport_receives_pinned_address(self):
        Connection.calls = []
        result = fetch_source("https://openai.com/a", {"openai.com"}, resolver=dns("8.8.8.8"), connection=Connection)
        self.assertEqual(Connection.calls, [("openai.com", "8.8.8.8")])
        self.assertEqual(result["body"], b"fixture")

    def test_redirect_escape_is_rejected_before_second_request(self):
        class Redirect(Response):
            status = 302
            def getheader(self, name):
                return "https://internal.test/admin" if name == "Location" else None
        class RedirectConnection(Connection):
            response = Redirect()
        with self.assertRaises(SourceError):
            fetch_source("https://openai.com/a", {"openai.com"}, resolver=dns("8.8.8.8"), connection=RedirectConnection)

    def test_compression_and_oversize_rejected(self):
        class Compressed(Response):
            def getheader(self, name):
                return "gzip" if name == "Content-Encoding" else super().getheader(name)
        class CompressedConnection(Connection):
            response = Compressed()
        with self.assertRaises(SourceError):
            fetch_source("https://openai.com/a", {"openai.com"}, resolver=dns("8.8.8.8"), connection=CompressedConnection)
        with self.assertRaises(SourceError):
            fetch_source("https://openai.com/a", {"openai.com"}, max_bytes=3, resolver=dns("8.8.8.8"), connection=Connection)


if __name__ == "__main__":
    unittest.main()
