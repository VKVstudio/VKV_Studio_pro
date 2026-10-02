import base64
import json
import unittest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding,rsa
from identity import PinnedJWTVerifier
from test_private_api import NOW,request
from pipeline import Pipeline
from private_api import PrivateAPI
from pathlib import Path


class IdentityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048) # ephemeral synthetic test key only

    def verifier(self,**extra):
        return PinnedJWTVerifier(issuer='https://identity.invalid',audience='editorial-fixture',keys={'fixture':self.key.public_key()},
            subject_roles={'worker-fixture':frozenset({'worker'})},keys_fresh_until=NOW+300,clock=lambda:NOW,**extra)

    def token(self,claims=None,header=None,raw=None):
        encode=lambda b:base64.urlsafe_b64encode(b).rstrip(b'=').decode()
        h=header or {'alg':'RS256','kid':'fixture','typ':'JWT'}
        body={'iss':'https://identity.invalid','aud':['editorial-fixture'],'sub':'worker-fixture','iat':NOW,'exp':NOW+60}
        body.update(claims or {})
        signed=encode(json.dumps(h).encode())+'.'+encode(raw or json.dumps(body).encode())
        return signed+'.'+encode(self.key.sign(signed.encode(),padding.PKCS1v15(),hashes.SHA256()))

    def test_signature_issuer_audience_subject_times_and_key_freshness(self):
        verifier=self.verifier();check=lambda token:verifier.authenticate({'HTTP_AUTHORIZATION':'Bearer '+token})
        self.assertEqual(check(self.token()).roles,frozenset({'worker'}))
        for patch in ({'iss':'https://evil.invalid'},{'aud':'other'},{'sub':'owner'},{'exp':NOW},{'iat':NOW+1},
                      {'nbf':NOW+1},{'exp':NOW+3601},{'exp':True}):
            self.assertIsNone(check(self.token(patch)))
        token=self.token();self.assertIsNone(check(token[:-4]+'AAAA'))
        verifier.fresh_until=NOW;self.assertIsNone(check(token))

    def test_header_alg_confusion_duplicate_claims_revocation_and_role_escalation(self):
        verifier=self.verifier()
        for header in ({'alg':'none','kid':'fixture'},{'alg':'HS256','kid':'fixture'},{'alg':'RS256','kid':'unknown'},
                       {'alg':'RS256','kid':'fixture','jku':'https://evil.invalid/keys'}):
            self.assertIsNone(verifier.authenticate({'HTTP_AUTHORIZATION':'Bearer '+self.token(header=header)}))
        raw=b'{"iss":"https://identity.invalid","iss":"https://identity.invalid"}'
        self.assertIsNone(verifier.authenticate({'HTTP_AUTHORIZATION':'Bearer '+self.token(raw=raw)}))
        forged=self.token({'roles':['owner'],'actor':'owner'})
        self.assertEqual(verifier.authenticate({'HTTP_AUTHORIZATION':'Bearer '+forged}).roles,frozenset({'worker'}))
        self.assertIsNone(self.verifier(revoked_subjects={'worker-fixture'}).authenticate({'HTTP_AUTHORIZATION':'Bearer '+forged}))
        pipeline=Pipeline(Path(':memory:'));self.addCleanup(pipeline.db.close)
        api=PrivateAPI(pipeline,verifier=verifier,issuer=verifier.issuer,audience=verifier.audience,
            owner_subject='owner-fixture',worker_subjects={'worker-fixture'},clock=lambda:NOW)
        response=request(api,'POST','/v1/packs/story-one/approve',{'expectedRevision':1},token=forged)
        self.assertEqual(response['status'],403)

    def test_revocation_configuration_cannot_silently_split_a_subject_string(self):
        for malformed in ('worker-fixture',b'worker-fixture',{'worker-fixture':False},[None],[''],['x'*201]):
            with self.assertRaises(ValueError):self.verifier(revoked_subjects=malformed)


if __name__=='__main__':unittest.main()
