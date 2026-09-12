#!/usr/bin/env python3
"""Compare local GSI delivery evidence with an independently converted IN1.

Uses NumPy weighted least squares, never WorkWise's numerical kernel. Inputs
stay local; stdout contains hashes, counts and error metrics, not coordinates.
IN1 must contain only explicit from,to,height-difference(m),length(km) rows.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def solve(rows, known):
    unknown = sorted({p for f, t, _, _ in rows for p in (f, t)} - known.keys())
    if not unknown:
        raise ValueError('reference must contain unknown points')
    columns = {p: j for j, p in enumerate(unknown)}
    matrix = np.zeros((len(rows), len(unknown)))
    rhs = np.zeros(len(rows))
    lengths = np.array([r[3] for r in rows])
    if not np.all(np.isfinite(lengths)) or np.any(lengths <= 0):
        raise ValueError('reference lengths must be positive finite metres')
    for i, (start, end, height, _) in enumerate(rows):
        if start == end or not np.isfinite(height):
            raise ValueError('invalid reference observation')
        rhs[i] = height
        for point, sign in ((start, -1), (end, 1)):
            if point in known:
                rhs[i] -= sign * known[point]
            else:
                matrix[i, columns[point]] = sign
    weighted = matrix / np.sqrt(lengths)[:, None]
    heights, _, rank, _ = np.linalg.lstsq(weighted, rhs / np.sqrt(lengths), rcond=None)
    dof = len(rows) - rank
    if rank != len(unknown) or dof <= 0:
        raise ValueError('reference lacks datum, full rank or redundant observations')
    residuals = matrix @ heights - rhs
    variance = float(np.sum(residuals ** 2 / lengths) / dof)
    covariance = np.linalg.inv(weighted.T @ weighted) * variance
    return unknown, heights, np.sqrt(np.diag(covariance)), int(dof)


def self_check():
    # Closed-form reference: inverse-length weights 1 and 1/3 distribute a
    # +0.4 mm loop closure as -0.1 mm on the first leg and -0.3 mm on return.
    _, heights, _, dof = solve([('BM', 'P', 1.0, 1), ('P', 'BM', -0.9996, 3)], {'BM': 100.0})
    assert dof == 1 and abs(float(heights[0]) - 100.9999) < 1e-10
    try:
        solve([('A', 'B', 1.0, 1), ('B', 'A', -0.9996, 3)], {})
    except ValueError:
        return
    raise AssertionError('independent reference accepted a datum-free network')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--actual', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--reference-in1', required=True)
    parser.add_argument('--known-points', required=True)
    args = parser.parse_args()
    self_check()
    actual = json.loads(Path(args.actual).read_text())
    source_bytes = Path(args.source).read_bytes()
    reference_bytes = Path(args.reference_in1).read_bytes()
    known_bytes = Path(args.known_points).read_bytes()
    if actual['sourceSha256'] != sha256(source_bytes) or actual['knownPointsSha256'] != sha256(known_bytes):
        raise ValueError('actual evidence is not bound to the selected source and controls')
    if actual['parserId'] != 'leica-gsi-leveling-block-parser' or actual['parserVersion'] != '0.4.0':
        raise ValueError('actual evidence lacks corrected cumulative-height semantics')
    known = {}
    for line in known_bytes.decode('gb18030').splitlines():
        if not line.strip():
            continue
        fields = line.replace(',', ' ').split()
        if len(fields) != 2 or fields[0] in known or not np.isfinite(float(fields[1])):
            raise ValueError('invalid or duplicate control point')
        known[fields[0]] = float(fields[1])
    rows = []
    for line in reference_bytes.decode('gb18030').splitlines():
        if not line.strip():
            continue
        fields = [x.strip() for x in line.split(',')]
        if len(fields) != 4:
            raise ValueError('IN1 requires explicit from,to,dh(m),length(km) columns')
        rows.append((fields[0], fields[1], float(fields[2]), float(fields[3]) * 1000))
    ids, heights, standard_errors, dof = solve(rows, known)
    actual_points = {p['id']: p for p in actual['points']}
    if len(actual_points) != len(actual['points']):
        raise ValueError('duplicate actual point identity')
    fixed_ids = set(known) & {p for f, t, _, _ in rows for p in (f, t)}
    if any(p not in actual_points or abs(actual_points[p]['height'] - known[p]) > 1e-9 for p in fixed_ids):
        raise ValueError('actual controls differ from the independent reference datum')
    if dof != actual['degreesOfFreedom']:
        raise ValueError('actual/reference redundancy differs')
    differences = np.array([abs(actual_points[p]['height'] - h) for p, h in zip(ids, heights)])
    if not np.all(np.isfinite(differences)):
        raise ValueError('non-finite comparison')
    mismatches = int(np.sum(differences > standard_errors + 1e-9))

    # Independently converted IN1 omits internal turning points. Sum canonical
    # GSI edges until each surveyed endpoint, retaining source order and sign.
    reduced = []
    pending = None
    for observation in actual['observations']:
        if pending is None:
            pending = [observation['from'], observation['from'], 0.0, 0.0]
        if observation['from'] != pending[1]:
            raise ValueError('GSI source chain is discontinuous')
        pending[1] = observation['to']
        pending[2] += observation['value']
        pending[3] += observation['routeLength']
        if not observation['to'].startswith('gsi-block-'):
            reduced.append(pending)
            pending = None
    if pending is not None or len(reduced) != len(rows):
        raise ValueError('actual/reference route coverage differs')
    if any(a[:2] != list(r[:2]) for a, r in zip(reduced, rows)):
        raise ValueError('actual/reference route endpoints or order differ')
    height_differences = [abs(a[2] - r[2]) for a, r in zip(reduced, rows)]
    distance_differences = [abs(a[3] - r[3]) for a, r in zip(reduced, rows)]
    # Report strict source differences separately; passing the numerical
    # comparison must not silently bless edits/truncation in converted IN1.
    closures = []
    for i in range(0, len(rows), 2):
        if i + 1 >= len(rows) or rows[i][:2] != rows[i + 1][1::-1]:
            raise ValueError('reference requires paired forward/return routes')
        closures.append((reduced[i][2] + reduced[i + 1][2], rows[i][2] + rows[i + 1][2]))
    print(json.dumps({
        'scope': 'independent-numerical-comparison-not-packaged-gui-acceptance',
        'method': 'numpy.linalg.lstsq; inverse-route-length weights; residual-scaled covariance',
        'numpyVersion': np.__version__,
        'checkerSha256': sha256(Path(__file__).read_bytes()),
        'sourceSha256': sha256(source_bytes), 'referenceIn1Sha256': sha256(reference_bytes),
        'knownPointsSha256': sha256(known_bytes), 'packageAsarSha256': actual.get('packageAsarSha256'),
        'referenceObservations': len(rows), 'comparedUnknownPoints': len(ids),
        'comparedFixedPoints': len(fixed_ids), 'degreesOfFreedom': dof,
        'numericalComparison': {
            'maximumHeightDifferenceMm': float(np.max(differences) * 1000),
            'maximumReferenceStandardErrorMm': float(np.max(standard_errors) * 1000),
            'rule': 'each unknown within one reference standard error; fixed heights within 1e-9 m',
            'mismatches': mismatches, 'passed': mismatches == 0,
        },
        'sourceConversionComparison': {
            'routesWithMatchingEndpoints': len(rows),
            'maximumHeightDifferenceMm': max(height_differences) * 1000,
            'strictHalfPrintedUnitMismatches': sum(d > 0.000005001 for d in height_differences),
            'maximumDistanceDifferenceMetres': max(distance_differences),
            'maximumClosureDifferenceMm': max(abs(a - b) for a, b in closures) * 1000,
            'sourceDifferencesRequireReview': any(d > 0.000005001 for d in height_differences),
        },
        'selfCheck': 'closed-form two-route solution and datum-free rejection passed',
    }, indent=2, allow_nan=False))
    if mismatches:
        raise ValueError('independent reference precision comparison failed')


if __name__ == '__main__':
    main()
