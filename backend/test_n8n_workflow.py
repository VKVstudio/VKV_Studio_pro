import json
import shutil
import subprocess
import unittest
from pathlib import Path

from editorial import digest
from test_private_api import APIHarness, request
from test_editorial import candidate, article


class N8NWorkflowTests(APIHarness, unittest.TestCase):
    # Reuses the private API setup, not its tests (only methods defined here run).
    def code(self, node, data):
        executable = shutil.which("node") or "C:/Program Files/nodejs/node.exe"
        result = subprocess.run([executable, str(Path(__file__).parent / "workflows/emulate-code.mjs")],
                                input=json.dumps({"node": node, "data": data}), capture_output=True,
                                text=True, timeout=5)
        if result.returncode:
            raise ValueError("Code node rejected input")
        return json.loads(result.stdout)[0]["json"]

    def worker(self, operation):
        payload = {"mode": "fixture", "id": "story-one", "operation": operation}
        if operation == "discover":
            payload.update(candidate=candidate(), sourceText=candidate()["sourceExcerpt"])
        else:
            payload["expectedRevision"] = self.pipeline.get("story-one")["revision"]
        built = self.code("request", payload)["request"]
        self.assertTrue(built["url"].startswith("https://editorial.invalid/v1/packs"))
        result = request(self.api, built["method"], built["url"].removeprefix("https://editorial.invalid"),
                         built["body"], token="fixture-worker")
        self.assertEqual(result["status"], 200)
        return self.code("review", result["body"])

    def test_code_nodes_through_private_api_stop_at_human_reviews(self):
        self.assertEqual(self.worker("discover")["status"], "sourced")
        self.assertIn("semantic", self.worker("extract")["next"])
        self.review("facts-review", {"accepted": True, "notes": "Offline semantic acceptance"})
        self.assertIn("skeptic", self.worker("draft")["next"])
        self.worker('skeptic')
        self.step("edit", {"article": article()})
        self.assertIn("rights", self.worker("images")["next"])
        self.review("visual-review", {"imageId": "image-one", "rightsAccepted": True, "notes": "Fixture rights acceptance"})
        self.assertIn("export remains denied", self.worker("social")["next"])
        self.assertEqual(self.review("approve", {})["body"]["status"], "approved")
        self.assertEqual(self.review("export", {})["status"], 409)

    def test_workflow_cannot_route_owner_actions_or_source_host(self):
        for action in ("approve", "facts-review", "export", "reject", "visual-review", "edit"):
            with self.assertRaises(ValueError):
                self.code("request", {"mode": "fixture", "id": "story-one", "operation": action, "expectedRevision": 1})
        value = self.code("request", {"mode": "fixture", "id": "story-one", "operation": "extract", "expectedRevision": 1,
                                     "apiBase": "http://169.254.169.254", "role": "owner", "model": "fake"})
        self.assertEqual(value["request"]["url"], "https://editorial.invalid/v1/packs/story-one/extract")
        self.assertEqual(value["request"]["body"], {"expectedRevision": 1})

    def test_post_edit_skeptic_guard_accepts_edited_without_repeating_checker(self):
        self.worker('discover');self.worker('extract')
        self.review('facts-review',{'accepted':True,'notes':'Fixture acceptance'})
        self.worker('draft');self.step('edit',{'article':article()})
        result=self.worker('skeptic')
        self.assertEqual(result['status'],'edited');self.assertIn('image',result['next'])
        self.assertEqual([stage for stage,_ in self.provider.calls].count('skeptic'),1)
        self.assertEqual(self.pipeline.db.execute("SELECT charged,status FROM attempts WHERE stage='skeptic'").fetchone(),(1,'completed'))

    def test_separate_skeptic_workflow_and_worker_request(self):
        workflow=json.loads((Path(__file__).parent/"workflows/skeptic-offline.json").read_text(encoding="utf8"))
        self.assertFalse(workflow["active"])
        self.assertIn("operation:'skeptic'",next(node for node in workflow["nodes"] if node["id"]=='fixture')["parameters"]["jsCode"])
        built=self.code("request",{"mode":"fixture","id":"story-one","operation":"skeptic","expectedRevision":4})
        self.assertEqual(built["request"]["url"],"https://editorial.invalid/v1/packs/story-one/skeptic")
        for action in ('repair','skeptic'):
            self.assertNotIn('approval',self.code("request",{"mode":"fixture","id":"story-one","operation":action,"expectedRevision":4})["request"]["body"])

    def test_workflow_inactive_and_no_embedded_credentials_or_autopublish(self):
        workflow = json.loads((Path(__file__).parent / "workflows/editorial-offline.json").read_text(encoding="utf8"))
        self.assertIs(workflow["active"], False)
        for node in workflow["nodes"]:
            self.assertNotIn("credentials", node)
            self.assertNotIn("scheduleTrigger", node["type"])
        http = next(node for node in workflow["nodes"] if node["id"] == "api")
        self.assertIs(http["retryOnFail"], False)
        self.assertIs(http["parameters"]["options"]["redirect"]["redirect"]["followRedirects"], False)
        self.assertNotIn("Authorization", json.dumps(workflow))


if __name__ == "__main__":
    unittest.main()
