"""Bounded official-source fetcher. No fetch happens at import or in tests."""
from __future__ import annotations
import hashlib
import http.client
import ipaddress
import socket
import ssl
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, urljoin


class SourceError(ValueError):
    pass


def collect_source(*args, **kwargs):
    """Production entrypoint: disabled until bounded DNS and egress are reviewed.

    No user/request/config flag can enable transport. ``fetch_source`` remains an
    isolated experimental primitive for injected-transport security tests only.
    """
    raise SourceError("Network collector disabled: bounded DNS/egress review required")


def validate_destination(url: str, allowed_hosts: set[str], resolver=socket.getaddrinfo):
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) <= 32 for c in url) or "\\" in url:
        raise SourceError("Invalid source URL")
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        valid = parsed.scheme == "https" and host in allowed_hosts and parsed.port in (None, 443)
    except ValueError as exc:
        raise SourceError("Invalid source URL") from exc
    if not valid or parsed.username or parsed.password or parsed.fragment:
        raise SourceError("Source must use an exact approved HTTPS host")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise SourceError("IP literals are not official source hosts")
    try:
        addresses = sorted({item[4][0] for item in resolver(host, 443, type=socket.SOCK_STREAM)})
    except OSError as exc:
        raise SourceError("Source DNS resolution failed") from exc
    if not addresses:
        raise SourceError("No source addresses")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        mapped = getattr(ip, "ipv4_mapped", None)
        if not ip.is_global or (mapped and not mapped.is_global):
            raise SourceError("Source resolves to a forbidden network")
    return parsed, addresses


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, hostname, address, timeout):
        super().__init__(hostname, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # DNS is not resolved a second time; TLS still verifies the official host.
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def fetch_source(url: str, allowed_hosts: set[str], *, max_bytes=1024 * 1024,
                 timeout=10, redirects=2, resolver=socket.getaddrinfo, connection=PinnedHTTPS):
    if connection is PinnedHTTPS:
        raise SourceError("Real transport disabled: bounded DNS/egress review required")
    if not (1 <= max_bytes <= 2 * 1024 * 1024 and 0 < timeout <= 20 and 0 <= redirects <= 3):
        raise SourceError("Unsafe collector limits")
    current = url
    deadline = time.monotonic() + timeout
    for hop in range(redirects + 1):
        parsed, addresses = validate_destination(current, allowed_hosts, resolver)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise SourceError("Source time limit exceeded")
        conn = connection(parsed.hostname, addresses[0], remaining)
        try:
            target = parsed.path or "/"
            if parsed.query:
                target += "?" + parsed.query
            conn.request("GET", target, headers={"Accept-Encoding": "identity", "User-Agent": "VKVEditorialSourceReview/1.0"})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location or hop == redirects:
                    raise SourceError("Source redirect limit")
                current = urljoin(current, location)
                # Next iteration validates host, DNS and network again.
                continue
            if response.status != 200:
                raise SourceError("Source HTTP response was not successful")
            if (response.getheader("Content-Encoding") or "identity").lower() != "identity":
                raise SourceError("Compressed source responses are not accepted")
            media_type = (response.getheader("Content-Type") or "").split(";", 1)[0].strip().lower()
            if media_type not in {"text/html", "text/plain", "application/json", "application/rss+xml", "application/atom+xml", "application/xml", "text/xml"}:
                raise SourceError("Unsupported source type")
            length = response.getheader("Content-Length")
            if length is not None:
                try:
                    declared = int(length)
                except ValueError as exc:
                    raise SourceError("Invalid source size") from exc
                if not 0 <= declared <= max_bytes:
                    raise SourceError("Source too large")
            chunks = []
            size = 0
            while size <= max_bytes:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise SourceError("Source time limit exceeded")
                if getattr(conn, "sock", None) is not None:
                    conn.sock.settimeout(remaining)
                reader = getattr(response, "read1", response.read)
                chunk = reader(min(65536, max_bytes + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
            body = b"".join(chunks)
            if len(body) > max_bytes:
                raise SourceError("Source too large")
            return {"sourceUrl": url, "finalUrl": current, "fetchedAt": datetime.now(timezone.utc).isoformat(),
                    "contentType": media_type, "contentSha256": hashlib.sha256(body).hexdigest(), "body": body}
        finally:
            conn.close()
    raise SourceError("Source could not be fetched")
