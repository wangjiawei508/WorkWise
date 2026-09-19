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
from pathlib import Path
import sqlite3
import statistics
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
        'strictReverificationCoverage': unavailable('This database does not persist strict verification attempts and their outcomes; neither coverage numerator nor completeness can be established.'),
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
