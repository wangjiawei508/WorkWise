#!/usr/bin/env python3
"""Read-only, aggregate Survey workflow evidence; never infer professional approval.

Reads two SQLite snapshots through mode=ro. Does not read source files, emit project
names/coordinates/paths, recompute adjustments, or send telemetry. A candidate cohort
is not a production sample. All period comparisons use UTC [start, end).
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import hashlib
import math
from pathlib import Path
import sqlite3
import statistics
import struct
import sys


def instant(value):
    if not isinstance(value, str):
        raise ValueError('timestamp missing')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('timestamp must include timezone')
    return result.astimezone(timezone.utc)


def records(connection, table):
    # table names below are constants, never caller input.
    rows = [json.loads(row[0]) for row in connection.execute('SELECT data_json FROM ' + table)]
    if any(not isinstance(row, dict) for row in rows):
        raise ValueError('invalid stored record')
    return rows


def indexed(rows, nested=None):
    result = {}
    for row in rows:
        identity = row.get(nested, {}) if nested else row
        key = identity.get('id')
        if not isinstance(key, str) or not key or key in result:
            raise ValueError('missing or duplicate stored identity')
        result[key] = row
    return result


@contextmanager
def readonly_database(path):
    connection = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        yield connection
    finally:
        connection.close()


def unavailable(reason):
    return {'value': None, 'status': 'not-measurable', 'reason': reason}


def snapshot_hash(value):
    """typed-json-sha256-v1, shared with EngineeringService's audit writer."""
    digest = hashlib.sha256()
    def put(text):
        digest.update(text.encode('utf-8'))
    def visit(item):
        if item is None:
            put('n')
        elif isinstance(item, bool):
            put('t' if item else 'f')
        elif isinstance(item, (int, float)):
            number = float(item)
            if not math.isfinite(number):
                raise ValueError('non-finite verification snapshot')
            put('d' + struct.pack('>d', 0.0 if number == 0 else number).hex())
        elif isinstance(item, str):
            encoded = item.encode('utf-8')
            put('s' + str(len(encoded)) + ':'); digest.update(encoded)
        elif isinstance(item, list):
            put('a' + str(len(item)) + ':[')
            for child in item:
                visit(child)
            put(']')
        elif isinstance(item, dict):
            keys = sorted(item, key=lambda key: key.encode('utf-8'))
            put('o' + str(len(keys)) + ':{')
            for key in keys:
                visit(key); visit(item[key])
            put('}')
        else:
            raise ValueError('unsupported verification snapshot value')
    visit(value)
    return digest.hexdigest()


def recorded_verification_metrics(engineering, survey, selected, networks, adjustments, start, end):
    names = {row[0] for row in engineering.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    missing = unavailable('No durable verification attempt table; historical checks cannot be inferred.')
    if 'engineering_verification_attempts' not in names:
        return {'recordedStrictReverificationCoverage': missing, 'recordedVerificationAttemptSuccessRate': missing}
    # Use exact serialized-event bytes for the audit digest, and portable typed
    # JSON digests for current metadata. No filesystem outputs are re-read here.
    rows = engineering.execute('SELECT sequence,id,project_id,manifest_id,started_at,completed_at,outcome,record_hash,data_json FROM engineering_verification_attempts ORDER BY sequence').fetchall()
    events = []
    latest = {}
    seen_ids = set()
    try:
        for sequence, identity, pid, mid, began, ended, outcome, digest, serialized in rows:
            event = json.loads(serialized)
            if (hashlib.sha256(serialized.encode('utf-8')).hexdigest() != digest
                    or identity in seen_ids or not identity
                    or event.get('schemaVersion') != 1
                    or any(event.get(key) != value for key, value in [('id', identity), ('projectId', pid), ('manifestId', mid), ('startedAt', began), ('completedAt', ended), ('outcome', outcome)])
                    or outcome not in ('passed', 'failed', 'error')):
                raise ValueError('invalid audit identity')
            seen_ids.add(identity)
            began_at, ended_at = instant(began), instant(ended)
            if began_at > ended_at:
                raise ValueError('backwards audit time')
            if ended_at < end:
                latest[(pid, mid)] = event
            if start <= ended_at < end:
                events.append(event)
    except (ValueError, TypeError, KeyError, AttributeError, UnicodeError):
        invalid = unavailable('Verification audit identity, digest or timestamp integrity failed; no earlier passing event is substituted.')
        return {'recordedStrictReverificationCoverage': invalid, 'recordedVerificationAttemptSuccessRate': invalid}

    allowed_tables = {'engineering_projects', 'engineering_manifests', 'engineering_runs', 'engineering_datasets', 'engineering_analyses'}
    cache = {}
    def identity_checked_records(connection, table, nested=None):
        cursor = connection.execute('SELECT * FROM ' + table)
        columns = [item[0] for item in cursor.description]
        if 'id' not in columns or 'data_json' not in columns:
            raise ValueError('durable identity columns unavailable')
        result = []
        bindings = {'id': 'id', 'project_id': 'projectId', 'revision': 'revision', 'network_id': 'networkId',
                    'dataset_id': 'datasetId', 'reference_adjustment_id': 'referenceAdjustmentId',
                    'current_adjustment_id': 'currentAdjustmentId', 'input_hash': 'inputHash',
                    'created_at': 'createdAt', 'updated_at': 'updatedAt'}
        for values in cursor:
            durable = dict(zip(columns, values))
            data = json.loads(durable['data_json'])
            identity = data[nested] if nested else data
            if any(identity.get(key) != durable[column] for column, key in bindings.items() if column in durable):
                raise ValueError('durable identity mismatch')
            result.append(data)
        return indexed(result, nested)
    def current_row(table, identity):
        if table not in allowed_tables or table not in names:
            return None
        if table not in cache:
            cache[table] = identity_checked_records(engineering, table)
        return cache[table].get(identity)
    deformation_cache = None
    network_cache = None
    adjustment_cache = None
    def still_bound(event):
        nonlocal deformation_cache, network_cache, adjustment_cache
        try:
            binding = event['bindings']
            verification = event['verification']
            if (event['outcome'] != 'passed' or event['bindingStable'] is not True or binding['complete'] is not True
                    or binding['algorithm'] != 'typed-json-sha256-v1' or not verification or verification.get('valid') is not True
                    or verification.get('projectId') != event['projectId'] or verification.get('manifestId') != event['manifestId']
                    or verification.get('reviewStatus') != 'draft'):
                return False
            checked = instant(verification['checkedAt'])
            if not instant(event['startedAt']) <= checked <= instant(event['completedAt']):
                return False
            manifest = current_row('engineering_manifests', event['manifestId'])
            if not manifest or manifest.get('projectId') != event['projectId'] or manifest.get('reviewStatus') != 'draft':
                return False
            required_rows = {('engineering_manifests', manifest['id']), ('engineering_projects', event['projectId']), ('engineering_runs', manifest['runId'])}
            required_rows.update(('engineering_datasets', item['id']) for item in manifest['inputDatasets'])
            required_rows.update(('engineering_analyses', identity) for identity in manifest['analyses'])
            actual_rows = [(item['table'], item['id']) for item in binding['engineeringRows']]
            if len(actual_rows) != len(set(actual_rows)) or set(actual_rows) != required_rows:
                return False
            for item in binding['engineeringRows']:
                current = current_row(item['table'], item['id'])
                if (not current or (item['table'] != 'engineering_projects' and current.get('projectId') != event['projectId'])
                        or snapshot_hash(current) != item['hash']):
                    return False
            required_networks = {item['networkId'] for item in manifest['adjustments']}
            for item in manifest['deformations']:
                # Deformation-only evidence must include both epoch networks.
                required_networks.update(epoch['networkId'] for epoch in item['epochs'])
            if len(binding['surveyNetworks']) != len(required_networks) or {item['id'] for item in binding['surveyNetworks']} != required_networks:
                return False
            if binding['surveyNetworks'] and network_cache is None:
                network_cache = identity_checked_records(survey, 'survey_networks')
            for item in binding['surveyNetworks']:
                current = network_cache.get(item['id'])
                if not current or current.get('projectId') != event['projectId'] or snapshot_hash(current) != item['hash']:
                    return False
            required_results = {item['id'] for item in manifest['adjustments']}
            required_results.update(epoch['resultId'] for item in manifest['deformations'] for epoch in item['epochs'])
            if len(binding['surveyResults']) != len(required_results) or {item['id'] for item in binding['surveyResults']} != required_results:
                return False
            if binding['surveyResults'] and adjustment_cache is None:
                adjustment_cache = identity_checked_records(survey, 'survey_adjustments', 'run')
            for item in binding['surveyResults']:
                stored = adjustment_cache.get(item['runId'], {})
                run, result = stored.get('run', {}), stored.get('result', {})
                if (run.get('projectId') != event['projectId'] or run.get('status') != 'completed' or result.get('validation') != 'valid'
                        or result.get('runId') != run.get('id') or result.get('id') != item['id']
                        or any(run.get(key) != item[key] or result.get(key) != item[key] for key in ['networkId', 'inputHash', 'algorithmVersion'])
                        or snapshot_hash(result) != item['hash']):
                    return False
            if len(binding['surveyDeformations']) != len(manifest['deformations']) or {item['id'] for item in binding['surveyDeformations']} != {item['id'] for item in manifest['deformations']}:
                return False
            if binding['surveyDeformations']:
                if deformation_cache is None:
                    deformation_cache = identity_checked_records(survey, 'survey_deformations')
                for item in binding['surveyDeformations']:
                    current = deformation_cache.get(item['id'])
                    if not current or current.get('projectId') != event['projectId'] or snapshot_hash(current) != item['hash']:
                        return False
            required_checks = {'manifest': 'passed', 'outputs': 'passed', 'inputs': 'passed',
                               'surveyReplay': 'passed' if required_networks else 'not-applicable',
                               'sources': 'passed' if required_networks else 'not-applicable'}
            if len(verification['checks']) != len(required_checks) or {item['id']: item['status'] for item in verification['checks']} != required_checks:
                return False
            return True
        except (ValueError, TypeError, KeyError, AttributeError, UnicodeError, sqlite3.Error):
            return False

    drafts = [manifest for _, manifest in selected if manifest.get('reviewStatus') == 'draft']
    identities = [(item.get('projectId'), item.get('id')) for item in drafts]
    valid_denominator = all(isinstance(pid, str) and pid and isinstance(mid, str) and mid for pid, mid in identities) and len(set(identities)) == len(identities)
    matching = [event for key, event in latest.items() if key in identities and still_bound(event)] if valid_denominator else []
    passed_attempts = sum(still_bound(event) for event in events)
    boundary = 'Historical checks only; metadata bindings match this database snapshot. Output/source bytes are not re-read, and this is not current validity, human approval or population completeness.'
    coverage = {
        'value': len(matching) / len(drafts) if drafts else None,
        'numerator': len(matching), 'denominator': len(drafts),
        'status': 'measured' if drafts else 'no-samples',
        'definition': 'Distinct draft manifests created in period whose latest recorded terminal check before period end passed with unchanged metadata bindings; subsequent failure supersedes a previous pass.',
        'checkedAtRange': [min(e['verification']['checkedAt'] for e in matching), max(e['verification']['checkedAt'] for e in matching)] if matching else None,
        'boundary': boundary
    } if valid_denominator else unavailable('Draft identities are missing or duplicated; denominator cannot be established.')
    return {
        'recordedStrictReverificationCoverage': coverage,
        'recordedVerificationAttemptSuccessRate': {
            'value': passed_attempts / len(events) if events else None,
            'numerator': passed_attempts, 'denominator': len(events), 'status': 'measured' if events else 'no-samples',
            'definition': 'Recorded terminal attempts completed in period that passed and still match snapshot metadata / all recorded terminal attempts in period, including failures and lookup errors. Crashes or failed audit writes have no event and are not counted.',
            'outcomes': {key: sum(e['outcome'] == key for e in events) for key in ['passed', 'failed', 'error']},
            'boundary': boundary}}


def measure(engineering, survey, cohort, start, end):
    if cohort not in ('candidate-fixture', 'production') or start >= end:
        raise ValueError('invalid cohort or period')
    projects = indexed(records(engineering, 'engineering_projects'))
    networks = indexed(records(survey, 'survey_networks'))
    adjustments = indexed(records(survey, 'survey_adjustments'), 'run')
    manifests = records(engineering, 'engineering_manifests')
    issues = {'invalidManifestTime': 0, 'invalidBoundInputTime': 0,
              'missingOrMismatchedBinding': 0, 'nonForwardTime': 0}
    selected = []
    history = []
    for manifest in manifests:
        try:
            timestamp = instant(manifest.get('createdAt'))
        except ValueError:
            issues['invalidManifestTime'] += 1
            continue
        if timestamp < end:
            history.append((timestamp, manifest))
        if start <= timestamp < end:
            selected.append((timestamp, manifest))
    first_draft = {}
    linked_manifests = 0
    for timestamp, manifest in sorted(history, key=lambda pair: pair[0]):
        if manifest.get('reviewStatus') != 'draft':
            continue
        pid = manifest.get('projectId')
        links = manifest.get('adjustments', [])
        if pid not in projects or not links or not manifest.get('outputs') or manifest.get('validation', {}).get('valid') is not True:
            issues['missingOrMismatchedBinding'] += 1
            continue
        inputs = []
        valid = True
        for link in links:
            record = adjustments.get(link.get('runId'), {})
            run = record.get('run', {})
            result = record.get('result', {})
            network = networks.get(link.get('networkId'), {})
            if (not network or network.get('projectId') != pid or run.get('projectId') != pid
                    or run.get('networkId') != network.get('id') or run.get('status') != 'completed'
                    or link.get('id') != result.get('id') or link.get('inputHash') != result.get('inputHash')
                    or result.get('inputHash') != run.get('inputHash') or not run.get('inputHash')
                    or result.get('runId') != run.get('id') or result.get('networkId') != network.get('id')
                    or not run.get('algorithmVersion')
                    or link.get('algorithmVersion') != run.get('algorithmVersion')
                    or result.get('algorithmVersion') != run.get('algorithmVersion')
                    or result.get('validation') != 'valid'):
                valid = False
                issues['missingOrMismatchedBinding'] += 1
                break
            try:
                imported = instant(network.get('createdAt'))
                completed = instant(run.get('completedAt'))
            except ValueError:
                valid = False
                issues['invalidBoundInputTime'] += 1
                break
            if not imported <= completed <= timestamp:
                valid = False
                issues['nonForwardTime'] += 1
                break
            inputs.append(imported)
        if valid:
            if timestamp >= start:
                linked_manifests += 1
            # Read pre-period history so repeat deliveries do not become first drafts.
            first_draft.setdefault(pid, (timestamp, (timestamp - min(inputs)).total_seconds()))
    durations = [duration for timestamp, duration in first_draft.values() if timestamp >= start]
    statuses = {}
    for _, item in selected:
        status = item.get('reviewStatus')
        # Bounded known states only; do not leak arbitrary persisted text.
        status = status if status in ('draft', 'reviewed', 'approved', 'rejected') else 'other'
        statuses[status] = statuses.get(status, 0) + 1
    verification_metrics = recorded_verification_metrics(engineering, survey, selected, networks, adjustments, start, end)
    return {
        'schemaVersion': 1, 'cohort': cohort,
        'cohortProvenance': 'Caller-declared database cohort; not independently certified. Candidate metrics must not be pooled with production.',
        'period': {'startInclusive': start.isoformat(), 'endExclusive': end.isoformat(), 'timezone': 'UTC'},
        'measurementBoundary': 'Snapshot metadata only; no byte verification, recomputation, standards assessment or signature validation.',
        'counts': {'projectsInSnapshot': len(projects), 'networksInSnapshot': len(networks),
                   'manifestsInPeriod': len(selected), 'manifestReviewStates': statuses,
                   'draftManifestsWithConsistentStoredBindings': linked_manifests,
                   'projectsWithFirstBoundDraftInPeriod': len(durations)},
        'importToFirstBoundDraftSeconds': {
            'value': statistics.median(durations) if durations else None,
            'statistic': 'median', 'sampleSize': len(durations),
            'definition': 'Earliest bound network import to first qualifying draft in retained project history, selecting first drafts in period; includes waiting and user interaction. Deleted history cannot be detected.',
            'status': 'measured' if durations else 'no-samples',
            'range': [min(durations), max(durations)] if durations else None},
        'approvedTraceableProductionProjects': unavailable('Current records lack verifiable human approval and digital signatures; draft counts are separate.'),
        'productionRepresentativeness': unavailable('The cohort label is a caller declaration; collection provenance and population coverage are not recorded.'),
        'firstAttemptImportSuccessRate': unavailable('Persisted networks omit rejected attempts and do not identify first attempts; denominator is unavailable.'),
        'mediumLeveling30MinuteTarget': unavailable('Medium-network size and representative production cohort have not been defined or collected.'),
        'numericalReproducibilityRate': unavailable('Requires explicit strict replay outcomes for every selected run; stored bindings are not replay.'),
        'strictReverificationCoverage': unavailable('Current strict validity requires re-reading output/source bytes and live replay. Recorded point-in-time checks are reported separately.'),
        **verification_metrics,
        'standardsTraceabilityRate': unavailable('Free-text citations do not prove authoritative version/clause verification.'),
        'unverifiedNumbersInDeliverables': unavailable('Requires complete artifact value provenance checks, not record counts.'),
        'licenseViolations': unavailable('Requires an independent license audit for the measured scope.'),
        'englishChineseResidue': unavailable('Requires English-rendered state coverage and raw-evidence exclusions.'),
        'oneClickEvidenceQuestionCoverage': unavailable('Requires an inventory of eligible result surfaces and verified question actions; database counts do not measure UI coverage.'),
        'dataQualityScope': 'Manifest timestamps across snapshot; binding and input-time checks for draft history before period end.',
        'dataQuality': issues}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engineering-db', type=Path, required=True)
    parser.add_argument('--survey-db', type=Path, required=True)
    parser.add_argument('--cohort', choices=['candidate-fixture', 'production'], required=True)
    parser.add_argument('--start', required=True, help='ISO timestamp including timezone')
    parser.add_argument('--end', required=True, help='Exclusive ISO timestamp including timezone')
    args = parser.parse_args()
    try:
        start, end = instant(args.start), instant(args.end)
        with readonly_database(args.engineering_db) as eng, readonly_database(args.survey_db) as survey:
            result = measure(eng, survey, args.cohort, start, end)
            result['snapshotConsistency'] = 'Independent read transactions; cross-database bindings checked. Use stopped-app copies for a common snapshot.'
            print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
    except (ValueError, TypeError, KeyError, AttributeError, sqlite3.Error, OSError):
        # Persisted values and paths may be sensitive; fail without echoing them.
        print('Measurement failed: check database availability, schema, record integrity, cohort and timezone-aware period.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
