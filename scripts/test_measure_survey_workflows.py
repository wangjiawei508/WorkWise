import importlib.util
from pathlib import Path
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('metrics', Path(__file__).with_name('measure-survey-workflows.py'))
metrics = importlib.util.module_from_spec(spec); spec.loader.exec_module(metrics)


class MetricsTests(unittest.TestCase):
    def setUp(self):
        self.eng = sqlite3.connect(':memory:'); self.survey = sqlite3.connect(':memory:')
        for connection, names in [(self.eng, ['engineering_projects','engineering_manifests']), (self.survey, ['survey_networks','survey_adjustments'])]:
            for table in names:connection.execute(f'CREATE TABLE {table} (data_json TEXT)')
        self.add(self.eng, 'engineering_projects', {'id':'p', 'name':'PRIVATE'})
        self.add(self.survey, 'survey_networks', {'id':'n','projectId':'p','createdAt':'2026-09-19T00:00:00Z'})
        self.add(self.survey, 'survey_adjustments', {'run':{'id':'r','projectId':'p','networkId':'n','inputHash':'hash','algorithmVersion':'7','status':'completed','completedAt':'2026-09-19T00:00:30Z'},'result':{'id':'result','runId':'r','networkId':'n','inputHash':'hash','algorithmVersion':'7','validation':'valid'}})

    def tearDown(self):
        self.eng.close(); self.survey.close()

    def add(self, connection, table, record):
        connection.execute('INSERT INTO '+table+' VALUES (?)',(json.dumps(record),))

    def draft(self, timestamp='2026-09-19T00:02:00Z', **updates):
        record={'projectId':'p','createdAt':timestamp,'reviewStatus':'draft','outputs':[{'path':'PRIVATE'}], 'validation':{'valid':True},'adjustments':[{'id':'result','runId':'r','networkId':'n','inputHash':'hash','algorithmVersion':'7'}]}
        record.update(updates);self.add(self.eng,'engineering_manifests',record)

    def measure(self):
        return metrics.measure(self.eng,self.survey,'candidate-fixture',metrics.instant('2026-09-19T00:00:00Z'),metrics.instant('2026-09-20T00:00:00Z'))

    def test_deduplicates_drafts_and_does_not_promote_unknown_metrics(self):
        self.draft();self.draft('2026-09-19T00:04:00Z')
        result=self.measure()
        self.assertEqual(result['counts']['manifestsInPeriod'],2)
        self.assertEqual(result['importToFirstBoundDraftSeconds']['value'],120)
        self.assertEqual(result['importToFirstBoundDraftSeconds']['sampleSize'],1)
        self.assertIsNone(result['firstAttemptImportSuccessRate']['value'])
        self.assertIsNone(result['approvedTraceableProductionProjects']['value'])
        self.assertNotIn('PRIVATE',json.dumps(result))

    def test_utc_exclusive_boundary(self):
        self.draft('2026-09-20T08:00:00+08:00'); self.draft('2026-09-19T08:02:00+08:00')
        self.assertEqual(self.measure()['counts']['manifestsInPeriod'],1)
        self.assertEqual(self.measure()['importToFirstBoundDraftSeconds']['value'],120)

    def test_cross_project_and_inconsistent_hash_excluded(self):
        self.draft(projectId='other');self.draft(adjustments=[{'id':'result','runId':'r','networkId':'n','inputHash':'tampered'}])
        result=self.measure()
        self.assertEqual(result['counts']['draftManifestsWithConsistentStoredBindings'],0)
        self.assertEqual(result['dataQuality']['missingOrMismatchedBinding'],2)
        self.assertIsNone(result['importToFirstBoundDraftSeconds']['value'])

    def test_backwards_time_and_naive_timestamp_not_measured(self):
        self.draft('2026-09-19T00:00:01Z'); self.draft('2026-09-19T00:02:00')
        result=self.measure()
        self.assertEqual(result['dataQuality']['nonForwardTime'],1)
        self.assertEqual(result['dataQuality']['invalidManifestTime'],1)
        self.assertEqual(result['importToFirstBoundDraftSeconds']['sampleSize'],0)

    def test_invalid_period_rejected(self):
        with self.assertRaises(ValueError):metrics.measure(self.eng,self.survey,'candidate-fixture',metrics.instant('2026-09-20T00:00:00Z'),metrics.instant('2026-09-19T00:00:00Z'))

    def test_algorithm_and_result_network_mismatch_rejected(self):
        self.draft(adjustments=[{'id':'result','runId':'r','networkId':'n','inputHash':'hash','algorithmVersion':'6'}])
        self.assertEqual(self.measure()['counts']['draftManifestsWithConsistentStoredBindings'],0)
        self.eng.execute('DELETE FROM engineering_manifests')
        record=json.loads(self.survey.execute('SELECT data_json FROM survey_adjustments').fetchone()[0])
        record['result']['networkId']='other'
        self.survey.execute('UPDATE survey_adjustments SET data_json=?',(json.dumps(record),))
        self.draft()
        self.assertEqual(self.measure()['counts']['draftManifestsWithConsistentStoredBindings'],0)

    def test_prior_period_draft_excludes_repeat_project_from_first_draft_sample(self):
        self.draft()
        self.draft('2026-09-20T00:02:00Z')
        result = metrics.measure(self.eng, self.survey, 'candidate-fixture',
                                 metrics.instant('2026-09-20T00:00:00Z'),
                                 metrics.instant('2026-09-21T00:00:00Z'))
        self.assertEqual(result['counts']['draftManifestsWithConsistentStoredBindings'], 1)
        self.assertEqual(result['counts']['projectsWithFirstBoundDraftInPeriod'], 0)
        self.assertIsNone(result['importToFirstBoundDraftSeconds']['value'])

    def test_non_draft_states_are_counted_but_never_measured_as_drafts_or_approval(self):
        self.draft(reviewStatus='approved')
        self.draft(reviewStatus='rejected')
        result = self.measure()
        self.assertEqual(result['counts']['manifestReviewStates'], {'approved': 1, 'rejected': 1})
        self.assertEqual(result['importToFirstBoundDraftSeconds']['sampleSize'], 0)
        self.assertIsNone(result['approvedTraceableProductionProjects']['value'])

    def test_empty_database_does_not_mean_perfect_success_or_reverification(self):
        result = self.measure()
        for key in ['firstAttemptImportSuccessRate', 'strictReverificationCoverage',
                    'numericalReproducibilityRate', 'licenseViolations', 'standardsTraceabilityRate']:
            self.assertIsNone(result[key]['value'])
            self.assertEqual(result[key]['status'], 'not-measurable')
            self.assertTrue(result[key]['reason'])

    def test_production_label_is_preserved_but_is_not_evidence_of_approval(self):
        self.draft()
        result = metrics.measure(self.eng, self.survey, 'production',
                                 metrics.instant('2026-09-19T00:00:00Z'),
                                 metrics.instant('2026-09-20T00:00:00Z'))
        self.assertEqual(result['cohort'], 'production')
        self.assertIsNone(result['productionRepresentativeness']['value'])
        self.assertIsNone(result['approvedTraceableProductionProjects']['value'])
        with self.assertRaises(ValueError):
            metrics.measure(self.eng, self.survey, 'mixed',
                            metrics.instant('2026-09-19T00:00:00Z'),
                            metrics.instant('2026-09-20T00:00:00Z'))

    def test_exact_start_zero_duration_and_end_exclusion(self):
        record = json.loads(self.survey.execute('SELECT data_json FROM survey_adjustments').fetchone()[0])
        record['run']['completedAt'] = '2026-09-19T00:00:00Z'
        self.survey.execute('UPDATE survey_adjustments SET data_json=?', (json.dumps(record),))
        self.draft('2026-09-19T00:00:00Z')
        self.draft('2026-09-20T00:00:00Z')
        result = self.measure()
        self.assertEqual(result['counts']['manifestsInPeriod'], 1)
        self.assertEqual(result['importToFirstBoundDraftSeconds']['value'], 0)

    def test_duplicate_stored_identity_does_not_silently_shrink_denominator(self):
        self.add(self.eng, 'engineering_projects', {'id': 'p'})
        with self.assertRaises(ValueError):
            self.measure()

    def test_readonly_connection_rejects_writes_and_missing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'survey.sqlite3'
            with sqlite3.connect(path) as database:
                database.execute('CREATE TABLE example (value TEXT)')
            before = path.read_bytes()
            with metrics.readonly_database(path) as database:
                with self.assertRaises(sqlite3.OperationalError):
                    database.execute("INSERT INTO example VALUES ('changed')")
            self.assertEqual(path.read_bytes(), before)
            missing = Path(directory) / 'missing.sqlite3'
            with self.assertRaises(sqlite3.OperationalError):
                with metrics.readonly_database(missing):
                    pass
            self.assertFalse(missing.exists())

    def test_cli_emits_only_anonymous_json_and_keeps_both_databases_unchanged(self):
        self.draft()
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / name for name in ['engineering.sqlite3', 'survey.sqlite3']]
            for source, path in zip([self.eng, self.survey], paths):
                source.commit()
                with sqlite3.connect(path) as target:
                    source.backup(target)
            before = [path.read_bytes() for path in paths]
            completed = subprocess.run([sys.executable, str(Path(metrics.__file__)),
                                        '--engineering-db', str(paths[0]), '--survey-db', str(paths[1]),
                                        '--cohort', 'candidate-fixture', '--start', '2026-09-19T00:00:00Z',
                                        '--end', '2026-09-20T00:00:00Z'], capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertNotIn('PRIVATE', completed.stdout)
            self.assertNotIn(directory, completed.stdout)
            self.assertEqual(json.loads(completed.stdout)['counts']['projectsInSnapshot'], 1)
            self.assertEqual([path.read_bytes() for path in paths], before)

if __name__=='__main__':unittest.main()
