"""Synthetic receipt fixtures only: these do not represent a real scan."""
import copy
import csv
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'qa/large-scan/report.py'
STRATEGIES = ['random', 'greedy', 'route']
EFFECTS = ['overfill', 'deep_route', 'small_parcels', 'chain', 'contract', 'variety',
           'side_gate', 'pallet_pass', 'small_order_first', 'light_orders', 'stock_orders',
           'four_choices', 'pallet_supply', 'rush_buffer', 'hazard_clearance', 'wild_supply',
           'sweep_route', 'extra_pickup']
PROBABILITY = ['small_parcels', 'stock_orders', 'wild_supply']
TRAITS = ['normal', 'pallet', 'rush', 'hazard', 'wildcard']


def encode(value):
    return (json.dumps(value, ensure_ascii=False) + '\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def row(index, strategy):
    placements = index + 2
    orders = 1 if index else 0
    upgraded = 1 if index else 0
    commands = placements + upgraded
    hist = [0] * 50
    hist[2] = placements
    upgrades = {f'upgrade.{key}': 0 for key in EFFECTS}
    offered = copy.deepcopy(upgrades)
    selected = copy.deepcopy(upgrades)
    if upgraded:
        for key in ['contract', 'overfill', 'deep_route']:
            offered[f'upgrade.{key}'] = 1
        selected['upgrade.contract'] = 1
    generated = placements + 3
    traits = {phase: {key: 0 for key in TRAITS} for phase in ['generated', 'placed', 'shipped']}
    traits['generated']['normal'] = generated
    traits['placed']['normal'] = placements
    traits['shipped']['normal'] = orders
    actual = {key: 0 for key in EFFECTS}
    actual['contract'] = upgraded
    checks = {'supported': commands * 2 + 1, 'initial.fresh': 1,
              'generation.trait': generated, 'generation.ids': commands + 1,
              'command.index': commands, 'generation.count': commands,
              'reconcile.board': commands, 'reconcile.traits': commands, 'reconcile.score': commands,
              'placement.event': placements, 'placement.cells': placements,
              'shipment.oldOrder': orders, 'shipment.chain': orders, 'shipment.cells': orders,
              'shipment.units': orders, 'shipment.score': orders, 'shipment.extraClearedCells': orders}
    return {'seedIndex': index, 'seed': index + 1, 'botSeed': (index + 1) ^ 0x51f15e,
            'upgradeSeed': (index + 1) ^ 0x6a09e667, 'strategy': strategy,
            'upgradePolicy': 'uniform', 'rulesetVersion': 3, 'mode': 'standard',
            'status': 'won' if strategy == 'route' and index > 1 else 'failed',
            'commands': commands, 'placements': placements, 'orders': orders,
            'score': orders * 100, 'shift': index + 1,
            'firstShipmentPlacements': 2 if orders else None,
            'occupiedCellsSum': placements * 2, 'occupancySamples': placements,
            'peakOccupiedCells': 3, 'terminalOccupiedCells': 2, 'occupancyHistogram': hist,
            'maxChain': orders, 'maxResolutionSteps': orders,
            'chainDistribution': {'0': placements - orders, '1': orders},
            'snapshotChecks': commands, 'replayVerified': True, 'generatedPieces': generated,
            'candidateBlockage': {'3': {'observations': placements, 'allBlocked': 0}},
            'upgradeOffered': offered, 'upgradeSelected': selected, 'finalChecksum': f'{index+1:08x}',
            'timings': {'botMs': 1.0, 'engineMs': 2.0, 'saveMs': 3.0, 'observerMs': 4.0,
                        'replayMs': 5.0, 'ipcMs': 0.5, 'wallMs': 20.0 + index,
                        'maxEngineMs': 0.02, 'engineMicrosecondHistogram': [commands] + [0] * 14},
            'coverage': {'initialStates': 1, 'commands': commands, 'successfulCommands': commands,
                         'rejectedCommands': 0, 'generatedPieces': generated,
                         'placedCells': placements * 2, 'shipments': orders, 'shippedUnits': orders,
                         'traits': traits, 'rushExpired': {'events': 0, 'cells': 0},
                         'waste': {'generated': 0, 'cleared': 0},
                         'pallet': {'shippedCells': 0, 'shippedUnits': 0, 'bonusUnits': 0},
                         'wildcard': {'shippedCells': 0, 'crossCargoCells': 0, 'crossCargoShipments': 0},
                         'actualEffects': actual, 'probabilityOpportunities': {key: 0 for key in PROBABILITY},
                         'firstWitness': {'contract': {'commandIndex': commands,
                                          'command': {'type': 'place', 'pieceId': 'piece.1', 'origin': {'x': 0, 'y': 0}},
                                          'eventSummary': {'score': 100}}} if upgraded else {},
                         'unobservedReason': {}, 'checks': checks, 'anomalies': {}, 'firstAnomaly': {}}}


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='scan-report-synthetic-')
        self.addCleanup(self.temp.cleanup)
        self.campaign = Path(self.temp.name) / 'synthetic-pilot'
        self.output = Path(self.temp.name) / 'report'
        self.campaign.mkdir()
        (self.campaign / 'batches').mkdir()
        (self.campaign / 'pending').mkdir()
        self.manifest = {'protocolVersion': 1, 'campaignId': 'synthetic-test-pilot', 'totalSeeds': 6,
                         'batchSize': 2, 'strategies': STRATEGIES, 'rulesetVersion': 3,
                         'mode': 'standard', 'maxCommands': 2000, 'upgradePolicy': 'uniform',
                         'seedPlan': {'kind': 'consecutive', 'start': 1, 'step': 1},
                         'rngSeeds': {'placementXor': 0x51f15e, 'upgradeXor': 0x6a09e667},
                         'gameCommit': '2f069901b69ecec8fcfbc0383c15fcf1ab7b7fc7',
                         'sourceSha256': 'a' * 64, 'rulesSha256': 'b' * 64,
                         'gameJsSha256': 'c' * 64, 'nodeVersion': 'v24.0.0',
                         'workerTimeoutMs': 60000, 'maxRssMiB': 512, 'maxDiskMiB': 1024}
        (self.campaign / 'manifest.json').write_bytes(encode(self.manifest))
        self.manifest_hash = sha(encode(self.manifest))
        self.rows = [[row(i, strategy) for i in range(start, start + 2) for strategy in STRATEGIES]
                     for start in range(0, 6, 2)]
        self.progress = {'protocolVersion': 1, 'campaignId': self.manifest['campaignId'],
                         'manifestHash': self.manifest_hash, 'status': 'completed',
                         'completedRuns': 18, 'totalRuns': 18, 'completedBatches': 3,
                         'elapsedMs': 1700, 'currentRun': None, 'workerPid': None}
        self.write_batches()
        self.write_progress()
        # A checkpoint is deliberately misleading: it must never be completion evidence.
        (self.campaign / 'checkpoint.json').write_text('{"completedRuns": 99999999}')

    def write_progress(self):
        (self.campaign / 'progress.json').write_bytes(encode(self.progress))

    def write_batches(self):
        for ordinal, rows in enumerate(self.rows):
            start = ordinal * 2
            stem = f'{start:06d}-{start+1:06d}'
            data = b''.join(encode(item) for item in rows)
            stats = {'runs': 6, 'wallMs': 500.0, 'cpuUserMs': 400.0, 'cpuSystemMs': 20.0, 'maxRssKiB': 120000}
            stats_bytes = encode(stats)
            receipt = {'protocolVersion': 1, 'manifestHash': self.manifest_hash,
                       'start': start, 'count': 2, 'file': stem + '.jsonl',
                       'runs': 6, 'bytes': len(data), 'sha256': sha(data),
                       'statsFile': stem + '.stats.json', 'statsSha256': sha(stats_bytes),
                       **{key: value for key, value in stats.items() if key != 'runs'}}
            for suffix, payload in [('.jsonl', data), ('.stats.json', stats_bytes), ('.receipt.json', encode(receipt))]:
                (self.campaign / 'batches' / (stem + suffix)).write_bytes(payload)

    def run_report(self):
        return subprocess.run([sys.executable, str(REPORT), '--campaign', str(self.campaign),
                               '--output', str(self.output)], capture_output=True, text=True)

    def assert_rejected(self, phrase):
        result = self.run_report()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(phrase, result.stderr)
        self.assertFalse((self.output / 'summary.json').exists())

    def test_validated_pilot_report_aggregates_and_preserves_identities(self):
        result = self.run_report()
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads((self.output / 'summary.json').read_text())
        self.assertEqual(summary['scope']['kind'], 'pilot')
        self.assertEqual(summary['completion']['validatedRuns'], 18)
        self.assertEqual(summary['completion']['validatedPairedSeeds'], 6)
        random = summary['strategies']['random']
        self.assertEqual(random['status'], {'won': 0, 'failed': 6})
        self.assertEqual(random['firstShipmentPlacements']['observedRuns'], 5)
        self.assertEqual(random['firstShipmentPlacements']['unshippedRuns'], 1)
        self.assertEqual(random['firstShipmentPlacements']['denominatorRuns'], 6)
        self.assertEqual(random['timings']['wallMs']['p50'], 22.0)
        self.assertEqual(random['timings']['engineMicroseconds']['quantiles']['p95']['upperInclusive'], 25)
        self.assertEqual(summary['resources']['batchWallMsSum'], 1500)
        self.assertEqual(summary['resources']['batchCpuMsSum'], 1260)
        self.assertEqual(summary['resources']['maxWorkerRssKiB'], 120000)
        self.assertEqual(summary['firstWitness']['contract']['seed'], 2)
        self.assertEqual(summary['firstWitness']['contract']['strategy'], 'random')
        self.assertEqual(summary['provenance']['analysisSha256'], sha(REPORT.read_bytes()))
        self.assertEqual(len(summary['replayExamples']), 18)
        self.assertTrue(all(item['finalChecksum'] for item in summary['replayExamples']))
        report = (self.output / 'report.md').read_text()
        for term in ['pilot', '近似', '未出货', '非因果', '微信', '100,002', '32', '64', '旧300', 'common random numbers', 'IID']:
            self.assertIn(term, report)
        self.assertIn('probabilityOpportunities', (self.output / 'upgrade-coverage.csv').read_text())
        self.assertIn('<svg', (self.output / 'distributions.svg').read_text())

    def test_report_labels_occupancy_as_cells(self):
        result = self.run_report()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = (self.output / 'report.md').read_text()
        self.assertIn('平均占用格 / 峰值格（共49格）', report)
        self.assertNotIn('| 占用均值 / 峰值 |', report)

    def test_report_labels_quantile_observed_population(self):
        result = self.run_report()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = (self.output / 'report.md').read_text()
        for strategy in STRATEGIES:
            section = report.split(f'### {strategy}\n', 1)[1].split('\n##', 1)[0]
            self.assertIn('首次出货p50/p95/p99：2 / 2 / 2；已出货5局，未出货1局', section)
            self.assertIn('分位数仅基于已出货局', section)
            self.assertNotIn('分母6局', section)


    def test_upgrade_table_and_csv_preserve_game_chinese_titles_and_effect_ids(self):
        source = (ROOT / 'src/domain/v2/content.ts').read_text()
        titles = dict(re.findall(r"upgrade\('([^']+)','([^']+)'", source))
        self.assertEqual(set(titles), set(EFFECTS))
        self.assertEqual(len(titles), 18)
        result = self.run_report()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = (self.output / 'report.md').read_text()
        self.assertIn('| 中文标题 | effect |', report)
        for effect, title in titles.items():
            self.assertIn(f'| {title} | {effect} |', report)
        with (self.output / 'upgrade-coverage.csv').open(newline='') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 18 * 4)
        for entry in rows:
            self.assertIn(entry['effect'], titles)
            self.assertEqual(entry.get('titleZh'), titles[entry['effect']])

    def test_report_discloses_environment_and_nonrepeatable_timing_limits(self):
        result = self.run_report()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = (self.output / 'report.md').read_text()
        self.assertIn('本次云环境测量受JIT/GC/调度及同时验证归档影响，不是隔离硬件基准', report)
        self.assertIn('极端seed重放只保证状态/命令结果，不保证相同耗时', report)


    def test_output_cannot_mutate_evidence_directory(self):
        self.output = self.campaign / 'batches'
        self.assert_rejected('evidence')

    def test_identity_requires_integers_not_boolean_aliases(self):
        self.rows[0][0]['seed'] = True
        self.write_batches()
        self.assert_rejected('integer')

    def test_first_witness_is_required_for_positive_actual_effect(self):
        for rows in self.rows:
            for value in rows:
                value['coverage']['firstWitness'] = {}
        self.write_batches()
        self.assert_rejected('missing first witness')

    def test_authenticated_nonterminated_jsonl_is_rejected(self):
        path = self.campaign / 'batches/000000-000001.jsonl'
        data = path.read_bytes().rstrip(b'\n')
        path.write_bytes(data)
        receipt_path = path.with_suffix('.receipt.json')
        receipt = json.loads(receipt_path.read_text())
        receipt['sha256'], receipt['bytes'] = sha(data), len(data)
        receipt_path.write_bytes(encode(receipt))
        self.assert_rejected('newline')

    def test_stats_and_receipt_must_agree(self):
        path = self.campaign / 'batches/000000-000001.receipt.json'
        receipt = json.loads(path.read_text()); receipt['wallMs'] = 999
        path.write_bytes(encode(receipt))
        self.assert_rejected('receipt/stats')

    def test_missing_positive_opportunity_witness_is_rejected(self):
        self.rows[0][0]['coverage']['probabilityOpportunities']['wild_supply'] = 1
        self.write_batches()
        self.assert_rejected('probability opportunity')


    def test_unfinished_progress_is_rejected(self):
        self.progress['status'] = 'running'; self.write_progress()
        self.assert_rejected('completed')

    def test_missing_batch_is_rejected_despite_checkpoint(self):
        (self.campaign / 'batches/000002-000003.jsonl').unlink()
        self.assert_rejected('missing')

    def test_duplicate_pair_is_rejected_with_valid_hash(self):
        self.rows[0][1] = copy.deepcopy(self.rows[0][0]); self.write_batches()
        self.assert_rejected('identity')

    def test_bad_jsonl_hash_is_rejected(self):
        with (self.campaign / 'batches/000000-000001.jsonl').open('ab') as out:
            out.write(b' ')
        self.assert_rejected('SHA256')

    def test_receipt_manifest_mismatch_is_rejected(self):
        path = self.campaign / 'batches/000000-000001.receipt.json'
        value = json.loads(path.read_text()); value['manifestHash'] = 'd' * 64
        path.write_bytes(encode(value)); self.assert_rejected('manifestHash')

    def test_stats_corruption_is_rejected(self):
        (self.campaign / 'batches/000000-000001.stats.json').write_bytes(b'{}\n')
        self.assert_rejected('stats SHA256')

    def test_seed_plan_and_protocol_mixing_are_rejected(self):
        for key, value, phrase in [('seed', 900, 'seed'), ('upgradePolicy', 'legacy', 'uniform')]:
            with self.subTest(key=key):
                original = self.rows[0][0][key]
                self.rows[0][0][key] = value; self.write_batches()
                self.assert_rejected(phrase)
                self.rows[0][0][key] = original

    def test_core_conservation_rejects_authenticated_bad_metrics(self):
        mutations = [
            ('chain', lambda r: r['chainDistribution'].__setitem__('0', 999)),
            ('weighted', lambda r: r.__setitem__('orders', 999)),
            ('snapshot', lambda r: r.__setitem__('snapshotChecks', 0)),
            ('replayVerified', lambda r: r.__setitem__('replayVerified', False)),
            ('anomalies', lambda r: r['coverage']['anomalies'].__setitem__('bad', 1)),
            ('generated', lambda r: r['coverage'].__setitem__('generatedPieces', 999)),
            ('occupancy', lambda r: r['occupancyHistogram'].__setitem__(2, 999)),
            ('engine', lambda r: r['timings']['engineMicrosecondHistogram'].__setitem__(0, 999)),
            ('probability', lambda r: r['coverage']['actualEffects'].__setitem__('wild_supply', 1)),
        ]
        original = copy.deepcopy(self.rows[0][0])
        for phrase, mutate in mutations:
            with self.subTest(phrase=phrase):
                self.rows[0][0] = copy.deepcopy(original); mutate(self.rows[0][0]); self.write_batches()
                self.assert_rejected(phrase)

    def test_pending_output_is_rejected(self):
        (self.campaign / 'pending/not-finished.tmp').write_text('pending')
        self.assert_rejected('pending')

    def test_unexpected_batch_is_rejected(self):
        (self.campaign / 'batches/extra.jsonl').write_text('{}\n')
        self.assert_rejected('unexpected')

    def test_row_count_and_newline_are_rejected(self):
        self.rows[0].pop(); self.write_batches(); self.assert_rejected('row count')


if __name__ == '__main__':
    unittest.main()
