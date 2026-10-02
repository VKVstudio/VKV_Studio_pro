"""Offline RS256 verification boundary. No JWKS fetch, cookie or listener.

Public keys, subject roles and freshness are supplied by a trusted operator.
Account configuration, key refresh and browser session integration are separate.
"""
import base64
import json
import re
import time

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from editorial import require
from private_api import Principal


def decode_segment(value):
    require(isinstance(value,str) and 1<=len(value)<=8192 and re.fullmatch(r'[A-Za-z0-9_-]+',value),'invalid JWT encoding')
    return base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True)


def unique_json(raw):
    def unique(pairs):
        result={}
        for key,value in pairs:
            require(key not in result,'duplicate JWT claim');result[key]=value
        return result
    value=json.loads(raw.decode('utf8'),object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JWT claim')))
    require(isinstance(value,dict),'JWT object required')
    return value


class PinnedJWTVerifier:
    def __init__(self, *, issuer, audience, keys, subject_roles, keys_fresh_until,
                 revoked_subjects=(), max_lifetime_seconds=3600, clock=time.time):
        require(isinstance(issuer,str) and issuer.startswith('https://') and isinstance(audience,str) and 1<=len(audience)<=200,'identity pins required')
        require(isinstance(keys,dict) and 1<=len(keys)<=10,'bounded trusted keyring required')
        for kid,key in keys.items():
            require(isinstance(kid,str) and 1<=len(kid)<=200 and isinstance(key,rsa.RSAPublicKey)
                    and 2048<=key.key_size<=4096,'trusted RSA key required')
        require(isinstance(subject_roles,dict) and 1<=len(subject_roles)<=11,'subject pins required')
        require(all(isinstance(sub,str) and 1<=len(sub)<=200 and isinstance(roles,frozenset)
                    and bool(roles) and roles <= {'owner','worker'} for sub,roles in subject_roles.items()),'invalid server role pins')
        require(type(keys_fresh_until) is int and type(max_lifetime_seconds) is int
                and 1<=max_lifetime_seconds<=86400,'explicit key freshness and token lifetime required')
        require(isinstance(revoked_subjects,(set,frozenset,list,tuple)) and len(revoked_subjects)<=1000
                and all(isinstance(sub,str) and 1<=len(sub)<=200 for sub in revoked_subjects),'invalid revocation subjects')
        self.issuer,self.audience=issuer,audience
        self.keys,self.roles=dict(keys),dict(subject_roles)
        self.fresh_until=keys_fresh_until;self.revoked=frozenset(revoked_subjects)
        self.lifetime,self.clock=max_lifetime_seconds,clock

    def authenticate(self,environ):
        try:
            now=int(self.clock())
            require(0<self.fresh_until-now<=86400,'keyring stale or beyond refresh policy')
            authorization=environ.get('HTTP_AUTHORIZATION','')
            require(isinstance(authorization,str) and authorization.startswith('Bearer ') and len(authorization)<=8192,'bearer required')
            token=authorization[7:];parts=token.split('.')
            require(len(parts)==3,'invalid compact JWT')
            header=unique_json(decode_segment(parts[0]))
            require({'alg','kid'} <= set(header) <= {'alg','kid','typ'} and header['alg']=='RS256'
                    and isinstance(header['kid'],str) and header.get('typ','JWT')=='JWT','unsupported JWT header')
            key=self.keys[header['kid']]
            signature=decode_segment(parts[2])
            require(len(signature)==key.key_size//8,'invalid signature size')
            key.verify(signature,(parts[0]+'.'+parts[1]).encode('ascii'),padding.PKCS1v15(),hashes.SHA256())
            claims=unique_json(decode_segment(parts[1]))
            require(claims.get('iss')==self.issuer,'wrong issuer')
            audiences=claims.get('aud')
            require(audiences==self.audience or (isinstance(audiences,list) and 1<=len(audiences)<=10
                    and all(isinstance(x,str) for x in audiences) and self.audience in audiences),'wrong audience')
            exp,issued,not_before=claims.get('exp'),claims.get('iat'),claims.get('nbf',claims.get('iat'))
            require(all(type(value) is int for value in (exp,issued,not_before)) and issued<=now and not_before<=now<exp
                    and 0<exp-issued<=self.lifetime,'expired/future/overlong JWT')
            subject=claims.get('sub')
            require(isinstance(subject,str) and subject in self.roles and subject not in self.revoked,'subject denied')
            # Token role/email/actor fields never decide application ownership.
            return Principal(subject,self.issuer,self.audience,exp,self.roles[subject])
        except Exception:
            return None
