"""Listener-free private WSGI boundary. Default authentication rejects everything."""
from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass
from typing import Protocol

from editorial import EditorialError, canonical


@dataclass(frozen=True)
class Principal:
    subject: str
    issuer: str
    audience: str
    expires_at: int
    roles: frozenset[str]


class IdentityVerifier(Protocol):
    # A deployment adapter must verify signature, issuer, audience, expiry and
    # revocation before returning this server-side value. Headers are not identity.
    def authenticate(self, environ: dict) -> Principal | None: ...


class DenyAll:
    def authenticate(self, environ):
        return None


class ApiError(ValueError):
    def __init__(self, status, code):
        self.status, self.code = status, code


class PrivateAPI:
    """Bearer-only, no cookies/CORS, no forward-header identity, no network calls.

    Supply a reviewed IdentityVerifier and pinned server-side identity policy to
    enable access. Merely naming the owner in a request never grants permissions.
    A lock serializes this local slice; production needs admission at the gateway.
    """
    def __init__(self, pipeline, *, verifier=None, issuer=None, audience=None,
                 owner_subject=None, worker_subjects=(), origin=None,
                 requests_per_minute=30, max_body=1024 * 1024, clock=time.time, publication_policy=None):
        self.pipeline = pipeline
        self.verifier = verifier or DenyAll()
        self.issuer, self.audience = issuer, audience
        self.owner_subject, self.worker_subjects = owner_subject, frozenset(worker_subjects)
        self.origin = origin
        self.publication_policy=publication_policy
        self.clock, self.max_body = clock, max_body
        if (type(requests_per_minute) is not int or type(max_body) is not int
                or not 1 <= requests_per_minute <= 60 or not 1 <= max_body <= 1024 * 1024):
            raise ValueError("Unsafe API limits")
        self.limit, self.rates = requests_per_minute, {}
        self.lock = threading.Lock()

    def __call__(self, environ, start_response):
        headers = [("Content-Type", "application/json; charset=utf-8"),
                   ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
                   ("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"),
                   ("Referrer-Policy", "no-referrer")]
        acquired = False
        try:
            if environ.get("wsgi.url_scheme") != "https":
                raise ApiError(403, "https_required")
            if environ.get("HTTP_COOKIE") or environ.get("HTTP_TRANSFER_ENCODING"):
                raise ApiError(400, "unsupported_request")
            origin = environ.get("HTTP_ORIGIN")
            if origin and (not self.origin or origin != self.origin):
                raise ApiError(403, "origin_denied")
            token = environ.get("HTTP_AUTHORIZATION", "")
            if len(token) > 8192 or not token.startswith("Bearer ") or len(token) <= 7:
                raise ApiError(401, "unauthenticated")
            principal = self.verifier.authenticate(environ)
            now = int(self.clock())
            if (not isinstance(principal, Principal) or not self.issuer or not self.audience
                    or principal.issuer != self.issuer or principal.audience != self.audience
                    or type(principal.expires_at) is not int or principal.expires_at <= now):
                raise ApiError(401, "unauthenticated")
            owner = (bool(self.owner_subject) and principal.subject == self.owner_subject
                     and "owner" in principal.roles)
            worker = principal.subject in self.worker_subjects and "worker" in principal.roles
            if not owner and not worker:
                raise ApiError(403, "forbidden")
            acquired = self.lock.acquire(blocking=False)
            if not acquired:
                raise ApiError(429, "busy")
            minute = now // 60
            # Only pinned identities get entries; old windows are discarded.
            self.rates = {k: v for k, v in self.rates.items() if v[0] == minute}
            window, count = self.rates.get(principal.subject, (minute, 0))
            if count >= self.limit:
                raise ApiError(429, "rate_limited")
            self.rates[principal.subject] = (window, count + 1)
            method, path = environ.get("REQUEST_METHOD"), environ.get("PATH_INFO", "")
            query=environ.get('QUERY_STRING','')
            if (query and not (method=='GET' and path=='/v1/packs' and re.fullmatch(r'after=[a-z0-9-]{1,100}',query))) or len(path) > 200:
                raise ApiError(400, "invalid_route")
            match = re.fullmatch(r"/v1/packs/([a-z0-9]+(?:-[a-z0-9]+)*)(?:/([a-z-]+))?", path)
            historical=re.fullmatch(r'/v1/packs/([a-z0-9]+(?:-[a-z0-9]+)*)/revisions/([1-9][0-9]{0,8})',path)
            if method=='GET' and path in {'/v1/packs','/v1/usage','/v1/publication/control'}:
                if not owner: raise ApiError(403,'owner_required')
                if path=='/v1/packs': result=self.pipeline.queue(query.removeprefix('after='))
                elif path=='/v1/usage': result=self.pipeline.usage()
                else:
                    if self.publication_policy is None: raise ApiError(503,'publication_control_unavailable')
                    result=self.publication_policy.control()
            elif method=='GET' and historical:
                if not owner: raise ApiError(403,'owner_required')
                result=self.pipeline.snapshot(historical[1],int(historical[2]))
            elif method == "GET" and match and match[2] is None:
                result = self.pipeline.get(match[1])
            elif method == "POST":
                body = self.body(environ)
                if path=='/v1/publication/kill':
                    if not owner: raise ApiError(403,'owner_required')
                    if self.publication_policy is None: raise ApiError(503,'publication_control_unavailable')
                    if body!={}: raise ApiError(400,'invalid_request')
                    self.publication_policy.kill(principal.subject)
                    result=self.publication_policy.control()
                elif path == "/v1/packs":
                    result = self.pipeline.discover(body, principal.subject)
                elif match and match[2]:
                    action = match[2]
                    worker_actions = {"extract", "draft", "images", "social", "skeptic", "repair"}
                    owner_actions = {"facts-review", "edit", "visual-review", "approve", "reject", "export", "revise-source", "revise-ledger"}
                    if action not in worker_actions | owner_actions:
                        raise ApiError(404, "not_found")
                    if action in owner_actions and not owner:
                        raise ApiError(403, "owner_required")
                    result = self.pipeline.transition(match[1], action, body, principal.subject)
                else:
                    raise ApiError(404, "not_found")
            else:
                raise ApiError(405 if match or path == "/v1/packs" else 404, "method_or_route_denied")
            status, payload = 200, result
        except ApiError as exc:
            status, payload = exc.status, {"error": exc.code}
        except EditorialError:
            status, payload = 409, {"error": "validation_or_revision_conflict"}
        except (ValueError, TypeError, KeyError, RecursionError):
            status, payload = 400, {"error": "invalid_request"}
        except Exception:
            # Never reflect raw source, provider output, SQL or credential errors.
            status, payload = 503, {"error": "service_unavailable"}
        finally:
            if acquired:
                self.lock.release()
        labels = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
                  404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
                  413: "Content Too Large", 415: "Unsupported Media Type",
                  429: "Too Many Requests", 503: "Service Unavailable"}
        if status == 401:
            headers.append(("WWW-Authenticate", 'Bearer realm="private-editorial"'))
        data = canonical(payload)
        headers.append(("Content-Length", str(len(data))))
        start_response(f"{status} {labels[status]}", headers)
        return [data]

    def body(self, environ):
        if environ.get("CONTENT_TYPE", "").lower() != "application/json":
            raise ApiError(415, "json_required")
        value = environ.get("CONTENT_LENGTH", "")
        if not re.fullmatch(r"[0-9]{1,8}", value):
            raise ApiError(400, "content_length_required")
        length = int(value)
        if length > self.max_body:
            raise ApiError(413, "body_too_large")
        data = environ["wsgi.input"].read(length)
        if len(data) != length:
            raise ApiError(400, "incomplete_body")
        def unique(pairs):
            result = {}
            for key, item in pairs:
                if key in result:
                    raise ValueError("duplicate JSON key")
                result[key] = item
            return result
        result = json.loads(data.decode("utf-8"), object_pairs_hook=unique,
                            parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))
        if not isinstance(result, dict):
            raise ApiError(400, "object_required")
        return result
