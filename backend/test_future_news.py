import copy
import sqlite3
import tempfile
import unittest
from pathlib import Path

from editorial import digest
from news_checks import event_identity, validate_news_record, verify_calculations, validate_skeptic
from publication_policy import PublicationPolicy, GateReceipt, GATES
from pipeline import Pipeline
from test_private_api import APIHarness
from test_editorial import candidate, article


def news(product="tool-one", published="2026-09-25", updated="2026-09-26", change="initial"):
    return {"eventId":event_identity("vendor",product,"release-one"),"publisher":"vendor","product":product,
            "announcementKey":"release-one","publishedAt":published,"updatedAt":updated,
            "discoveredAt":"2026-10-01T08:00:00+00:00","changeKind":change,
            "claims":[{"id":"announced","text":"The vendor announced a tool.","kind":"source-assertion","status":"announced",
                       "sourceUrl":candidate()["sourceUrl"],"quote":candidate()["sourceExcerpt"],"qualitativeBenefit":False}]}


class FakeGates:
    def evaluate(self,snapshot):
        return [GateReceipt(gate,digest(snapshot),True,1790812800,"offline-validator-fixture") for gate in GATES]


class FutureNewsTests(APIHarness,unittest.TestCase):
    def test_unknown_or_mislabeled_hypotheses_cannot_pass_skeptic(self):
        data={'ledger':self.provider.outputs['extract'],'article':article(),'candidate':candidate(),'sourceText':candidate()['sourceExcerpt']}
        response=copy.deepcopy(self.provider.outputs['skeptic'])
        response['claims'][0].update(verdict='unknown',quote=None,sourceUrl=None)
        with self.assertRaises(ValueError):validate_skeptic(response,data)
        response['claims'][0]['verdict']='hypothesis'
        with self.assertRaises(ValueError):validate_skeptic(response,data)

    def test_unfetched_source_or_extra_article_assertion_cannot_pass(self):
        record=news();record['claims'][0]['sourceUrl']='https://unfetched.invalid/statement'
        with self.assertRaises(ValueError):validate_news_record(record,candidate()['sourceExcerpt'],candidate()['sourceUrl'])
        self.assertEqual(self.pipeline.db.execute('SELECT COUNT(*) FROM packs').fetchone()[0],0)
        data={'ledger':self.provider.outputs['extract'],'article':article(),'candidate':candidate(),'sourceText':candidate()['sourceExcerpt']}
        result=copy.deepcopy(self.provider.outputs['skeptic'])
        self.assertEqual(validate_skeptic(result,data)['verdict'],'pass')
        data['article']['sections'][0]['paragraphs'].append('Our completed factory test achieved a 95 percent return on investment.')
        with self.assertRaises(ValueError):validate_skeptic(result,data)
        from news_checks import article_spans
        result['articleCoverage']=[{'spanId':span,'textSha256':digest(text),'claimIds':[],
            'classification':'no-factual-claim','reason':'Hostile checker tries to hide an own-test claim'} for span,text in article_spans(data['article']).items()]
        with self.assertRaises(ValueError):validate_skeptic(result,data)

    def test_visible_metadata_claims_also_invalidate_article_coverage(self):
        for field in ('category','eventLabel','service.label','source.label'):
            draft=article();data={'ledger':self.provider.outputs['extract'],'article':draft,'candidate':candidate(),'sourceText':candidate()['sourceExcerpt']}
            hidden='Our completed factory test achieved a 95 percent return on investment.'
            if field=='service.label':draft['service']['label']=hidden
            elif field=='source.label':draft['sources'][0]['label']=hidden
            else:draft[field]=hidden
            with self.assertRaises(ValueError):validate_skeptic(self.provider.outputs['skeptic'],data)
    def test_publication_update_discovery_dates_not_merged(self):
        value=news(published=None)
        checked=validate_news_record(value,candidate()["sourceExcerpt"],candidate()["sourceUrl"])
        self.assertIsNone(checked["publishedAt"])
        self.assertEqual(checked["updatedAt"],"2026-09-26")
        self.assertEqual(checked["discoveredAt"],"2026-10-01T08:00:00+00:00")
        value["publishedAt"]="2026-10-02"
        with self.assertRaises(ValueError): validate_news_record(value,candidate()["sourceExcerpt"],candidate()["sourceUrl"])

    def test_update_label_cannot_prove_publication_and_arithmetic_is_exact(self):
        value=news()
        value["dateEvidence"]={"publishedAt":{"label":"updated","quote":"Updated: 2026-09-25"},"updatedAt":{"label":"updated","quote":"Updated: 2026-09-26"}}
        with self.assertRaises(ValueError):validate_news_record(value,"Updated: 2026-09-25. Updated: 2026-09-26. "+candidate()["sourceExcerpt"],candidate()["sourceUrl"])
        exact={"operation":"percent-change","operands":["4500","4950"],"result":"10"}
        self.assertTrue(verify_calculations([exact]))
        exact["result"]="12"
        with self.assertRaises(ValueError):verify_calculations([exact])

    def test_qualitative_faster_quicker_not_added_without_evidence(self):
        for word in ("faster","quicker"):
            value=news(); value["claims"][0]["text"]="The tool is "+word
            with self.assertRaises(ValueError): validate_news_record(value,candidate()["sourceExcerpt"],candidate()["sourceUrl"])
            value["claims"][0]["qualitativeBenefit"]=True
            with self.assertRaises(ValueError): validate_news_record(value,candidate()["sourceExcerpt"],candidate()["sourceUrl"])
        value=news(); value["claims"][0].update(kind="editorial-hypothesis",sourceUrl=None,quote=None,text="This may suit a document-review pilot.")
        self.assertEqual(validate_news_record(value,candidate()["sourceExcerpt"],candidate()["sourceUrl"])["claims"][0]["kind"],"editorial-hypothesis")

    def test_different_product_same_source_not_deduped_meaningful_update_preserved(self):
        first={"candidate":candidate(),"sourceText":candidate()["sourceExcerpt"],"newsRecord":news()}
        self.pipeline.discover(first,"owner-fixture")
        second=copy.deepcopy(first);second["candidate"]["id"]=second["candidate"]["slug"]="story-two";second["newsRecord"]=news("tool-two")
        self.pipeline.discover(second,"owner-fixture")
        update=copy.deepcopy(first);update["candidate"]["id"]=update["candidate"]["slug"]="story-update"
        update["sourceText"]+=" A meaningful availability update."
        update["newsRecord"]["updatedAt"]="2026-09-30";update["newsRecord"]["changeKind"]="meaningful-update"
        self.pipeline.discover(update,"owner-fixture")
        self.assertEqual(self.pipeline.get("story-update")["pack"]["newsRecord"]["eventId"],news()["eventId"])
        self.assertEqual(self.pipeline.get("story-update")["pack"]["newsRecord"]["publishedAt"],"2026-09-25")
        self.assertEqual(self.pipeline.get("story-update")["pack"]["newsRecord"]["updatedAt"],"2026-09-30")
        altered=news();altered["product"]="other"
        with self.assertRaises(ValueError):validate_news_record(altered,first["sourceText"],candidate()["sourceUrl"])

    def test_existing_event_revision_requires_explicit_dates_and_stable_identity(self):
        self.pipeline.discover({"candidate":candidate(),"sourceText":candidate()["sourceExcerpt"],"newsRecord":news()},"fixture-owner")
        self.assertEqual(self.step("revise-source",{"candidate":candidate(),"sourceText":candidate()["sourceExcerpt"]})["status"],409)
        altered=news("different-product")
        self.assertEqual(self.step("revise-source",{"candidate":candidate(),"sourceText":candidate()["sourceExcerpt"],"newsRecord":altered})["status"],409)
        updated=news(updated="2026-09-30",change="meaningful-update")
        result=self.step("revise-source",{"candidate":candidate(),"sourceText":candidate()["sourceExcerpt"]+" Availability changed.","newsRecord":updated})
        self.assertEqual(result["status"],200)
        self.assertEqual(result["body"]["pack"]["newsRecord"]["publishedAt"],"2026-09-25")
        self.assertEqual(self.pipeline.snapshot("story-one",1)["pack"]["newsRecord"]["updatedAt"],"2026-09-26")

    def test_skeptic_one_repair_then_quarantine_and_no_approval_privilege(self):
        self.discover();self.step("extract",token="fixture-worker")
        self.review("facts-review",{"accepted":True,"notes":"Fixture review"});self.step("draft",token="fixture-worker")
        verdict={"verdict":"revise","claims":[{"id":"announced","verdict":"unsupported","sourceUrl":None,"quote":None,"reason":"No evidence for faster benefit"},
          {"id":"availability","verdict":"unknown","sourceUrl":None,"quote":None,"reason":"No test"}],"reasons":["Repair unsupported qualitative speed claim"]}
        self.provider.outputs.update(skeptic=verdict,repair=article());self.pipeline.caps.update(skeptic=10,repair=10)
        self.assertEqual(self.step("skeptic",token="fixture-worker")["body"]["status"],"repair_pending")
        self.assertEqual(self.step("repair",token="fixture-worker")["body"]["pack"]["repairCycles"],1)
        self.assertEqual(self.step("skeptic",token="fixture-worker")["body"]["status"],"quarantined")
        self.assertEqual(self.step("repair",token="fixture-worker")["status"],409)
        self.assertNotIn("approval",self.pipeline.get("story-one")["pack"])

    def test_invalid_skeptic_response_quarantines_without_approving_or_retrying(self):
        self.discover();self.step("extract",token="fixture-worker")
        self.review("facts-review",{"accepted":True,"notes":"Fixture review"});self.step("draft",token="fixture-worker")
        self.provider.outputs["skeptic"]={"verdict":"pass","approval":{"actor":"owner"}}
        self.pipeline.caps["skeptic"]=10
        result=self.step("skeptic",token="fixture-worker")
        self.assertEqual(result["body"]["status"],"quarantined")
        self.assertNotIn("approval",result["body"]["pack"])
        self.assertEqual(self.step("skeptic",token="fixture-worker")["status"],409)
        self.assertEqual(self.pipeline.db.execute("SELECT charged,status FROM attempts WHERE stage='skeptic'").fetchone(),(None,'reserved'))

    def test_snapshot_backup_restore_history_and_never_overwrite(self):
        self.discover();self.step("extract",token="fixture-worker")
        policy=PublicationPolicy(self.pipeline,now=lambda:1790812800)
        policy.simulate_mode("bounded-auto","fixture-owner","OFFLINE SIMULATION ONLY")
        original=self.pipeline.snapshot("story-one",1)
        self.assertNotIn("ledger",original["pack"])
        with self.assertRaises(sqlite3.IntegrityError):
            self.pipeline.db.execute("UPDATE snapshots SET status='approved'")
        self.pipeline.db.rollback()
        # Only synthetic fixtures; retain task artifacts, never delete user data.
        task=Path(tempfile.mkdtemp(prefix="vkv-offline-recovery-"))
        backup,restore=task/"backup.sqlite3",task/"restored.sqlite3"
        self.pipeline.backup_to(backup)
        Pipeline.restore_to(backup,restore)
        restored=Pipeline(restore);self.addCleanup(restored.db.close)
        self.assertEqual(restored.snapshot("story-one",1),original)
        self.assertEqual(restored.get("story-one"),self.pipeline.get("story-one"))
        self.assertEqual(restored.db.execute("SELECT COUNT(*) FROM audit").fetchone()[0],2)
        restored_policy=PublicationPolicy(restored)
        self.assertTrue(restored_policy.control()["killed"])
        self.assertEqual(restored_policy.control()["mode"],"pilot")
        with self.assertRaises(ValueError):self.pipeline.backup_to(backup)
        with self.assertRaises(ValueError):Pipeline.restore_to(backup,restore)

    def prepared_nonfixture(self, ident="story-one", published="2026-09-25"):
        # Explicit synthetic future-policy fixture, NOT generated or publishable
        # content. No production publisher exists even when intent is ready.
        data={"candidate":candidate(),"sourceText":candidate()["sourceExcerpt"],"fixture":False,
              "article":article(),"newsRecord":news(published=published),
              "ledger":self.provider.outputs["extract"],"skeptic":{**copy.deepcopy(self.provider.outputs["skeptic"]),"reviewedArticleSha256":digest(article())}}
        data["newsRecord"]["dateEvidence"]={"publishedAt":{"label":"published","quote":"Published: "+published} if published else None,
          "updatedAt":{"label":"updated","quote":"Updated: 2026-09-26"}}
        data["sourceText"]+=" "+("Published: "+published+". " if published else "")+"Updated: 2026-09-26."
        with self.pipeline.db:self.pipeline._write(ident,data,1,"social_ready","synthetic-policy-fixture","fixture-owner")

    def test_default_pilot_kill_activation_disabled_and_scope_denied(self):
        self.prepared_nonfixture()
        policy=PublicationPolicy(self.pipeline,now=lambda:1790812800)
        result=policy.evaluate("story-one",1,"fixture")
        self.assertIn("kill-switch",result["reasons"])
        self.assertIn("pilot-human-approval-required",result["reasons"])
        with self.assertRaises(ValueError):policy.activate_production()
        result=policy.evaluate("story-one",1,"fixture",scope="social")
        self.assertIn("scope-denied-email-social-not-authorized",result["reasons"])

    def test_auto_simulation_gates_idempotency_caps_kill_rollback_no_publish(self):
        self.prepared_nonfixture()
        policy=PublicationPolicy(self.pipeline,gates=FakeGates(),daily_cap=1,weekly_cap=2,spend_cap_micro_usd=100,now=lambda:1790812800)
        policy.simulate_mode("bounded-auto","fixture-owner","OFFLINE SIMULATION ONLY")
        first=policy.evaluate("story-one",1,"fixture")
        self.assertEqual(first["status"],"dry-run-ready");self.assertIs(first["published"],False)
        self.assertEqual(policy.evaluate("story-one",1,"fixture"),first)
        self.prepared_nonfixture("story-two")
        self.assertIn("daily-cap",policy.evaluate("story-two",1,"fixture")["reasons"])
        plan=policy.rollback_plan("story-one",1,"fixture-owner","Fixture correction rollback plan")
        self.assertTrue(plan["requiresNewReview"]);self.assertFalse(plan["published"])
        self.assertEqual(policy.evaluate("story-one",1,"fixture")["status"],"vetoed")
        policy.kill("fixture-owner")
        self.assertTrue(policy.control()["killed"])

    def test_unknown_publication_date_and_missing_skeptic_gates_quarantine(self):
        self.prepared_nonfixture(published=None)
        policy=PublicationPolicy(self.pipeline,daily_cap=1,weekly_cap=2,spend_cap_micro_usd=100,now=lambda:1790812800)
        policy.simulate_mode("bounded-auto","fixture-owner","OFFLINE SIMULATION ONLY")
        result=policy.evaluate("story-one",1,"fixture")
        self.assertEqual(result["status"],"quarantined")
        self.assertIn("source-publication-date-unknown",result["reasons"])
        self.assertIn("gate-evidence",result["reasons"])

    def test_ready_intent_is_revoked_after_revision_or_receipt_expiry(self):
        self.prepared_nonfixture()
        now=[1790812800]
        policy=PublicationPolicy(self.pipeline,gates=FakeGates(),daily_cap=1,weekly_cap=2,spend_cap_micro_usd=100,now=lambda:now[0])
        policy.simulate_mode('bounded-auto','fixture-owner','OFFLINE SIMULATION ONLY')
        self.assertEqual(policy.evaluate('story-one',1,'fixture')['status'],'dry-run-ready')
        self.pipeline.transition('story-one','revise-source',{'expectedRevision':1,'candidate':candidate(),
            'sourceText':candidate()['sourceExcerpt']+' Updated information.','newsRecord':news()},'fixture-owner')
        result=policy.evaluate('story-one',1,'fixture')
        self.assertEqual(result['status'],'quarantined');self.assertIn('stale-revision',result['reasons'])
        self.prepared_nonfixture('story-two')
        self.assertEqual(policy.evaluate('story-two',1,'fixture')['status'],'dry-run-ready')
        now[0]+=86401
        result=policy.evaluate('story-two',1,'fixture')
        self.assertEqual(result['status'],'quarantined');self.assertIn('gate-evidence',result['reasons'])

    def test_duplicate_or_stale_receipts_cannot_enable_intent(self):
        self.prepared_nonfixture()
        class Duplicates(FakeGates):
            def evaluate(self,snapshot):
                receipts=super().evaluate(snapshot)
                return receipts+[receipts[0]]
        policy=PublicationPolicy(self.pipeline,gates=Duplicates(),daily_cap=1,weekly_cap=2,spend_cap_micro_usd=100,now=lambda:1790812800)
        policy.simulate_mode("bounded-auto","fixture-owner","OFFLINE SIMULATION ONLY")
        self.assertIn("invalid-or-duplicate-gate-receipt",policy.evaluate("story-one",1,"fixture")["reasons"])
        self.prepared_nonfixture("story-two")
        class WrongSnapshot(FakeGates):
            def evaluate(self,snapshot):
                return [GateReceipt(gate,"0"*64,True,1790812800,"fixture") for gate in GATES]
        policy.gates=WrongSnapshot()
        result=policy.evaluate("story-two",1,"fixture")
        self.assertEqual(result["status"],"quarantined")
        self.assertIn("gate-evidence",result["reasons"])


if __name__=="__main__":unittest.main()
