"""TEST-ONLY stdin bridge to real WSGI/state code. Never opens a socket.

An explicit flag creates only synthetic in-memory identities/providers/state.
It cannot load a database, key, endpoint, config or credential from a client.
"""
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_private_api import APIHarness,request


def main():
    if sys.argv[1:]!=['--offline-fixture-only']:
        raise SystemExit('Explicit offline-fixture-only flag required')
    class Harness(APIHarness,unittest.TestCase):pass
    harness=Harness();harness.setUp()
    try:
        harness.discover();harness.step('extract',token='fixture-worker')
        for _ in range(100):
            line=sys.stdin.buffer.readline(1024*1024+1)
            if not line:break
            if len(line)>1024*1024:raise ValueError('bounded fixture input required')
            value=json.loads(line)
            if value=={'method':'GET','path':'/fixture-pack.json'}:
                response={'status':200,'body':harness.pipeline.get('story-one')}
            else:
                if not isinstance(value,dict) or set(value)!={'method','path','body'}:raise ValueError('fixture request fields required')
                worker=value['path'].rsplit('/',1)[-1] in {'draft','skeptic','repair','images','social','extract'}
                response=request(harness.api,value['method'],value['path'],value['body'],token='fixture-worker' if worker else 'fixture-owner')
            print(json.dumps({'status':response['status'],'body':response['body']},ensure_ascii=True),flush=True)
    finally:harness.pipeline.db.close()


if __name__=='__main__':main()
