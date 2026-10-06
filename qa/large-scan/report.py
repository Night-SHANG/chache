#!/usr/bin/env python3
"""Fail-closed, streaming analysis of completed frozen-rules-3 campaigns.

Usage: python3 qa/large-scan/report.py --campaign DIR --output DIR
No game execution, dependency installation, network access, or checkpoint trust.
Only scalar wall-time samples are retained for exact empirical quantiles. JSONL
is hashed/read in bounded chunks and each parsed run is discarded after folding.
"""
import argparse
from array import array
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import re
import sys

STRATEGIES = ('random', 'greedy', 'route')
EFFECTS = ('overfill', 'deep_route', 'small_parcels', 'chain', 'contract', 'variety',
           'side_gate', 'pallet_pass', 'small_order_first', 'light_orders', 'stock_orders',
           'four_choices', 'pallet_supply', 'rush_buffer', 'hazard_clearance', 'wild_supply',
           'sweep_route', 'extra_pickup')
# Exact frozen UI titles from src/domain/v2/content.ts; stable effect IDs remain unchanged.
UPGRADE_TITLES = {
    'overfill': '超额装载', 'deep_route': '深入仓库', 'small_parcels': '小件补给',
    'chain': '连锁加速', 'contract': '优质合约', 'variety': '多品联运',
    'side_gate': '西南侧门', 'pallet_pass': '托盘通行', 'small_order_first': '小单先行',
    'light_orders': '轻量订单', 'stock_orders': '库存合约', 'four_choices': '四件候选',
    'pallet_supply': '托盘补给', 'rush_buffer': '加急缓冲', 'hazard_clearance': '危险品清障',
    'wild_supply': '万能补给', 'sweep_route': '路线清扫', 'extra_pickup': '顺路搬运',
}
PROBABILITY = ('small_parcels', 'stock_orders', 'wild_supply')
TRAITS = ('normal', 'pallet', 'rush', 'hazard', 'wildcard')
TIMINGS = ('botMs', 'engineMs', 'saveMs', 'observerMs', 'replayMs', 'ipcMs')
ENGINE_BINS = (25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000,
               50000, 100000, 250000, 1000000, None)
MAX_LINE = 16 * 1024 * 1024
LIMITATIONS = [
    '连续seed 1…N，每个seed配对random/greedy/route；并非全32bit种子空间均匀随机抽样。',
    '配对结果仅为策略经验分布的描述，非因果：不能估计单项升级的因果收益。',
    'uniform-upgrade为新协议，与旧300局首项升级协议不能混算。',
    'independent仅指升级游标与放置/游戏RNG隔离。同seed三策略使用相同botSeed/upgradeSeed（common random numbers），并非跨策略独立样本；offers/分支不同会令实际升级ID分化，不给IID置信区间。',
    '机器人失败只表明该协议下的这条轨迹失败，不能称该seed绝对不可解。',
    '未测浏览器、微信、真人触控或听感；计时不是手机帧率。',
    '不是百万局、Overtime长期生存或全seed安全/可解性证明；母文档并未强制百万局。',
    '冻结standard一次最多4条shipment；64仅为防御guard。事件数不是内部算法步骤。',
    'small_parcels/stock_orders/wild_supply只记probabilityOpportunities，不把随机输出当作实际触发。',
    '自然扫描未观测不等于升级无效；专门fixture证据不计入本扫描分母。',
]


class ValidationError(Exception):
    """An incomplete, corrupt, mixed-protocol, or inconsistent campaign."""


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def integer(value, name, minimum=0, maximum=None):
    require(type(value) is int and value >= minimum and (maximum is None or value <= maximum),
            f'{name}: expected integer in [{minimum}, {maximum}]')
    return value


def number(value, name):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0,
            f'{name}: expected finite nonnegative number')
    return value


def object_of_counts(value, name, keys=None):
    require(isinstance(value, dict), f'{name}: expected object')
    if keys is not None:
        require(set(value) == set(keys), f'{name}: unexpected or missing keys')
    for key, count in value.items():
        integer(count, f'{name}.{key}')
    return value


def digest(path):
    require(path.is_file() and not path.is_symlink(), f'missing or unsafe file: {path}')
    hasher, size = hashlib.sha256(), 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            hasher.update(block)
            size += len(block)
    return hasher.hexdigest(), size


def parse(data, label):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f'{label}: duplicate JSON key {key}')
            result[key] = value
        return result
    try:
        return json.loads(data, object_pairs_hook=unique,
                          parse_constant=lambda token: (_ for _ in ()).throw(ValidationError(f'{label}: nonfinite JSON {token}')))
    except (ValueError, UnicodeError) as error:
        raise ValidationError(f'{label}: invalid JSON: {error}') from error


def read_json(path):
    require(path.is_file() and not path.is_symlink(), f'missing or unsafe file: {path}')
    require(path.stat().st_size <= MAX_LINE, f'metadata too large: {path}')
    data = path.read_bytes()
    return parse(data, str(path)), hashlib.sha256(data).hexdigest()


def int32(value):
    value &= 0xffffffff
    return value if value < 0x80000000 else value - 0x100000000


def identity(row):
    return {key: row[key] for key in ('seedIndex', 'seed', 'botSeed', 'upgradeSeed',
            'strategy', 'upgradePolicy', 'rulesetVersion', 'mode', 'finalChecksum')}


def validate_row(row, seed_index, strategy, max_commands):
    require(isinstance(row, dict), 'row must be object')
    for key in ('seedIndex', 'seed', 'botSeed', 'upgradeSeed'):
        integer(row.get(key), key, 0)
    require(row.get('seedIndex') == seed_index and row.get('strategy') == strategy,
            f'identity mismatch: expected seedIndex={seed_index}, strategy={strategy}')
    require(row.get('seed') == seed_index + 1, 'seed must equal seedIndex + 1')
    require(row.get('botSeed') == int32(row['seed'] ^ 0x51f15e), 'botSeed XOR mismatch')
    require(row.get('upgradeSeed') == int32(row['seed'] ^ 0x6a09e667), 'upgradeSeed XOR mismatch')
    require(row.get('upgradePolicy') == 'uniform', 'uniform upgrade protocol required; legacy mixing forbidden')
    require(row.get('rulesetVersion') == 3 and row.get('mode') == 'standard', 'rules3 standard required')
    require(row.get('status') in ('won', 'failed') and row.get('capped') is not True, 'nonterminal/capped run')
    for key in ('commands', 'placements', 'orders', 'score', 'shift', 'occupiedCellsSum',
                'occupancySamples', 'peakOccupiedCells', 'terminalOccupiedCells', 'maxChain',
                'maxResolutionSteps', 'snapshotChecks', 'generatedPieces'):
        integer(row.get(key), key)
    require(1 <= row['placements'] <= row['commands'] <= max_commands, 'command/placement bounds')
    require(1 <= row['shift'] <= 8, 'shift outside frozen standard bounds')
    chain = object_of_counts(row.get('chainDistribution'), 'chainDistribution')
    require(set(chain) <= set('01234'), 'chain must be 0..4')
    require(sum(chain.values()) == row['placements'], 'chain sum != placements')
    require(sum(int(key) * value for key, value in chain.items()) == row['orders'], 'weighted chain != orders')
    maximum = max((int(key) for key, value in chain.items() if value), default=0)
    require(row['maxChain'] == maximum == row['maxResolutionSteps'], 'chain / shipment event maximum mismatch')
    require(row['snapshotChecks'] == row['commands'], 'snapshotChecks != commands')
    require(row.get('replayVerified') is True, 'replayVerified must be true')
    require(isinstance(row.get('finalChecksum'), str) and re.fullmatch(r'[a-f0-9]{8}', row['finalChecksum']), 'finalChecksum missing/invalid')
    hist = row.get('occupancyHistogram')
    require(isinstance(hist, list) and len(hist) == 50, 'occupancyHistogram must have 50 bins')
    for count in hist:
        integer(count, 'occupancyHistogram count')
    require(sum(hist) == row['placements'] == row['occupancySamples'], 'occupancy sample conservation')
    require(sum(index * count for index, count in enumerate(hist)) == row['occupiedCellsSum'], 'occupancy weighted sum')
    require(max(index for index, count in enumerate(hist) if count) <= row['peakOccupiedCells'] <= 49,
            'occupancy peak bounds')
    require(row['terminalOccupiedCells'] <= row['peakOccupiedCells'], 'terminal occupancy > peak')
    first = row.get('firstShipmentPlacements')
    if row['orders']:
        integer(first, 'firstShipmentPlacements', 1, row['placements'])
    else:
        require(first is None, 'firstShipmentPlacements must be null when unshipped')
    blockage = row.get('candidateBlockage')
    require(isinstance(blockage, dict) and set(blockage) <= {'3', '4'}, 'candidateBlockage must be 3/4')
    for size, counts in blockage.items():
        object_of_counts(counts, f'candidateBlockage.{size}', ('observations', 'allBlocked'))
        require(counts['allBlocked'] <= counts['observations'], 'candidate blockage numerator exceeds denominator')
    offered = object_of_counts(row.get('upgradeOffered'), 'upgradeOffered', [f'upgrade.{key}' for key in EFFECTS])
    selected = object_of_counts(row.get('upgradeSelected'), 'upgradeSelected', offered)
    require(all(selected[key] <= offered[key] for key in offered), 'upgrade selected exceeds offered')
    require(sum(selected.values()) == row['commands'] - row['placements'], 'upgrade commands conservation')
    require(sum(offered.values()) == sum(selected.values()) * 3, 'upgrade offered triples conservation')
    timing = row.get('timings')
    require(isinstance(timing, dict), 'timings missing')
    for key in (*TIMINGS, 'wallMs', 'maxEngineMs'):
        number(timing.get(key), f'timings.{key}')
    engine_hist = timing.get('engineMicrosecondHistogram')
    require(isinstance(engine_hist, list) and len(engine_hist) == len(ENGINE_BINS), 'engine histogram bins')
    for count in engine_hist:
        integer(count, 'engine histogram count')
    require(sum(engine_hist) == row['commands'], 'engine histogram sum != commands')
    coverage = row.get('coverage')
    require(isinstance(coverage, dict), 'coverage missing')
    require(coverage.get('anomalies') == {} and coverage.get('firstAnomaly') == {}, 'coverage anomalies must be empty')
    for key in ('initialStates', 'commands', 'successfulCommands', 'rejectedCommands', 'generatedPieces',
                'placedCells', 'shipments', 'shippedUnits'):
        integer(coverage.get(key), f'coverage.{key}')
    require(coverage['initialStates'] == 1, 'coverage initialStates != 1')
    require(coverage['commands'] == coverage['successfulCommands'] == row['commands'] and coverage['rejectedCommands'] == 0,
            'coverage commands conservation')
    require(coverage['shipments'] == row['orders'], 'coverage shipments != orders')
    require(coverage['generatedPieces'] == row['generatedPieces'], 'generatedPieces conservation')
    traits = coverage.get('traits')
    require(isinstance(traits, dict) and set(traits) == {'generated', 'placed', 'shipped'}, 'traits shape')
    for stage in traits:
        object_of_counts(traits[stage], f'traits.{stage}', TRAITS)
    require(sum(traits['generated'].values()) == row['generatedPieces'], 'generated traits conservation')
    require(sum(traits['placed'].values()) == row['placements'], 'placed traits conservation')
    for key, keys in {'rushExpired': ('events', 'cells'), 'waste': ('generated', 'cleared'),
                      'pallet': ('shippedCells', 'shippedUnits', 'bonusUnits'),
                      'wildcard': ('shippedCells', 'crossCargoCells', 'crossCargoShipments')}.items():
        object_of_counts(coverage.get(key), key, keys)
    require(coverage['waste']['generated'] == coverage['rushExpired']['cells'], 'waste / rush expiry conservation')
    require(coverage['pallet']['shippedCells'] == traits['shipped']['pallet'], 'pallet cells conservation')
    require(coverage['pallet']['shippedUnits'] == 2 * traits['shipped']['pallet'] and coverage['pallet']['bonusUnits'] == traits['shipped']['pallet'], 'pallet units conservation')
    require(coverage['wildcard']['shippedCells'] == traits['shipped']['wildcard'], 'wildcard cells conservation')
    require(coverage['shippedUnits'] == sum(traits['shipped'].values()) + coverage['pallet']['bonusUnits'], 'shipped units conservation')
    object_of_counts(coverage.get('actualEffects'), 'actualEffects', EFFECTS)
    object_of_counts(coverage.get('probabilityOpportunities'), 'probabilityOpportunities', PROBABILITY)
    require(all(coverage['actualEffects'][key] == 0 for key in PROBABILITY), 'probability effects cannot be counted as actualEffects')
    checks = object_of_counts(coverage.get('checks'), 'checks')
    expected_checks = {'initial.fresh': 1, 'supported': row['commands'] * 2 + 1,
                       'command.index': row['commands'], 'generation.ids': row['commands'] + 1,
                       'generation.trait': row['generatedPieces'], 'generation.count': row['commands'],
                       'reconcile.board': row['commands'], 'reconcile.traits': row['commands'],
                       'reconcile.score': row['commands'], 'placement.event': row['placements'],
                       'placement.cells': row['placements']}
    expected_checks.update({f'shipment.{key}': row['orders'] for key in
                          ('oldOrder', 'chain', 'cells', 'units', 'score', 'extraClearedCells')})
    for key, expected in expected_checks.items():
        require(checks.get(key, 0) == expected, f'checks.{key} conservation')
    require(isinstance(coverage.get('firstWitness'), dict), 'firstWitness must be object')
    for key, witness in coverage['firstWitness'].items():
        require(isinstance(witness, dict) and 'command' in witness and isinstance(witness.get('eventSummary'), dict), f'witness {key} shape')
        integer(witness.get('commandIndex'), f'witness {key} commandIndex', 0, row['commands'])


def quantile(sorted_values, q):
    return sorted_values[max(0, math.ceil(len(sorted_values) * q) - 1)] if sorted_values else None


def distribution(values):
    ordered = sorted(values)
    return {'count': len(ordered), 'min': ordered[0] if ordered else None,
            'max': ordered[-1] if ordered else None, 'mean': sum(ordered) / len(ordered) if ordered else None,
            **{f'p{int(q * 100)}': quantile(ordered, q) for q in (.5, .95, .99)},
            'quantileMethod': 'exact empirical nearest-rank, rank=ceil(q*n)'}


def histogram_distribution(hist):
    total = sum(hist.values())
    result = {'count': total, 'histogram': {str(key): hist[key] for key in sorted(hist)}}
    result['mean'] = sum(key * count for key, count in hist.items()) / total if total else None
    for q in (.5, .95, .99):
        cumulative, value = 0, None
        for key in sorted(hist):
            cumulative += hist[key]
            if cumulative >= math.ceil(q * total):
                value = key
                break
        result[f'p{int(q * 100)}'] = value
    result['quantileMethod'] = 'exact empirical nearest-rank from integer histogram'
    return result


def engine_distribution(counts):
    quantiles = {}
    for q in (.5, .95, .99):
        cumulative, lower, interval = 0, 0, None
        for upper, count in zip(ENGINE_BINS, counts):
            cumulative += count
            if cumulative >= math.ceil(sum(counts) * q):
                interval = {'lowerExclusive': lower, 'upperInclusive': upper,
                            'overflow': upper is None, 'approximate': True}
                break
            lower = upper
        quantiles[f'p{int(q * 100)}'] = interval
    return {'unit': 'microseconds per committed reducer command', 'upperInclusiveBins': list(ENGINE_BINS),
            'counts': counts, 'samples': sum(counts), 'quantiles': quantiles,
            'quantileMethod': 'approximate quantile intervals from histogram; null upper bound is +infinity'}


def add_counts(target, source):
    for key, value in source.items():
        target[key] = target.get(key, 0) + value


class Aggregate:
    def __init__(self):
        self.runs = 0
        self.status = {'won': 0, 'failed': 0}
        self.sums = Counter()
        self.failure_shifts = Counter()
        self.first_shipments = Counter()
        self.occupancy = Counter()
        self.peak_occupancy = Counter()
        self.terminal_occupancy = Counter()
        self.max_chains = Counter()
        self.chains = {str(key): 0 for key in range(5)}
        self.blockage = {str(size): {'observations': 0, 'allBlocked': 0, 'runsObserved': 0, 'runsBlocked': 0} for size in (3, 4)}
        self.offered = {f'upgrade.{key}': 0 for key in EFFECTS}
        self.selected = dict(self.offered)
        self.actual = {key: 0 for key in EFFECTS}
        self.opportunities = {key: 0 for key in PROBABILITY}
        self.coverage = {key: Counter() for key in ('rushExpired', 'waste', 'pallet', 'wildcard', 'checks')}
        self.traits = {key: Counter() for key in ('generated', 'placed', 'shipped')}
        self.timing_sums = {key: 0.0 for key in TIMINGS}
        self.walls = array('d')
        self.engine_hist = [0] * len(ENGINE_BINS)
        self.max_engine = 0
        self.witness = {}
        self.extremes = {key: [] for key in ('earliestFailure', 'highestChain', 'highestOccupancy', 'slowestEngineCommand', 'slowestEngineTotal')}
        self.first_runs = []

    def add(self, row):
        self.runs += 1
        self.status[row['status']] += 1
        for key in ('commands', 'placements', 'orders', 'score', 'snapshotChecks', 'generatedPieces', 'occupiedCellsSum'):
            self.sums[key] += row[key]
        if row['status'] == 'failed':
            self.failure_shifts[row['shift']] += 1
        if row['firstShipmentPlacements'] is not None:
            self.first_shipments[row['firstShipmentPlacements']] += 1
        add_counts(self.chains, row['chainDistribution'])
        for index, count in enumerate(row['occupancyHistogram']):
            if count:
                self.occupancy[index] += count
        self.peak_occupancy[row['peakOccupiedCells']] += 1
        self.terminal_occupancy[row['terminalOccupiedCells']] += 1
        self.max_chains[row['maxChain']] += 1
        for size, counts in row['candidateBlockage'].items():
            add_counts(self.blockage[size], counts)
            self.blockage[size]['runsObserved'] += int(counts['observations'] > 0)
            self.blockage[size]['runsBlocked'] += int(counts['allBlocked'] > 0)
        add_counts(self.offered, row['upgradeOffered'])
        add_counts(self.selected, row['upgradeSelected'])
        coverage = row['coverage']
        for key in self.coverage:
            add_counts(self.coverage[key], coverage[key])
        for stage in self.traits:
            add_counts(self.traits[stage], coverage['traits'][stage])
        for key in ('initialStates', 'successfulCommands', 'rejectedCommands', 'placedCells', 'shipments', 'shippedUnits'):
            self.sums[key] += coverage[key]
        add_counts(self.actual, coverage['actualEffects'])
        add_counts(self.opportunities, coverage['probabilityOpportunities'])
        for key, witness in coverage['firstWitness'].items():
            if key not in self.witness:
                self.witness[key] = {**identity(row), 'witness': witness}
        for key in TIMINGS:
            self.timing_sums[key] += row['timings'][key]
        self.walls.append(row['timings']['wallMs'])
        self.max_engine = max(self.max_engine, row['timings']['maxEngineMs'])
        for index, count in enumerate(row['timings']['engineMicrosecondHistogram']):
            self.engine_hist[index] += count
        candidate = {**identity(row), **{key: row[key] for key in ('status', 'shift', 'placements', 'orders', 'score', 'maxChain', 'peakOccupiedCells')},
                     'engineMs': row['timings']['engineMs'], 'maxEngineMs': row['timings']['maxEngineMs'], 'wallMs': row['timings']['wallMs']}
        if len(self.first_runs) < 20:
            self.first_runs.append(candidate)
        keys = {'highestChain': (-row['maxChain'], -row['orders'], row['seedIndex']),
                'highestOccupancy': (-row['peakOccupiedCells'], row['seedIndex']),
                'slowestEngineCommand': (-row['timings']['maxEngineMs'], row['seedIndex']),
                'slowestEngineTotal': (-row['timings']['engineMs'], row['seedIndex'])}
        if row['status'] == 'failed':
            keys['earliestFailure'] = (row['shift'], row['placements'], row['seedIndex'])
        for category, key in keys.items():
            self.extremes[category].append((key, candidate))
            self.extremes[category].sort(key=lambda item: item[0])
            del self.extremes[category][3:]

    def result(self):
        first = histogram_distribution(self.first_shipments)
        first.update({'observedRuns': sum(self.first_shipments.values()),
                      'unshippedRuns': self.runs - sum(self.first_shipments.values()), 'denominatorRuns': self.runs,
                      'unit': 'actual placements until first shipment; unshipped terminal runs excluded from quantiles'})
        blockage = {}
        for size, counts in self.blockage.items():
            blockage[size] = {**counts, 'allBlockedPerObservation': counts['allBlocked'] / counts['observations'] if counts['observations'] else None,
                              'blockedRunsPerObservedRun': counts['runsBlocked'] / counts['runsObserved'] if counts['runsObserved'] else None}
        upgrades = {}
        for effect in EFFECTS:
            upgrades[effect] = {'offered': self.offered[f'upgrade.{effect}'], 'selected': self.selected[f'upgrade.{effect}'],
                                'actualEffects': self.actual[effect], 'probabilityOpportunities': self.opportunities.get(effect, 0),
                                'evidenceType': 'opportunity_only' if effect in PROBABILITY else 'actual_effect',
                                'unobservedReason': ('Only eligible opportunities; individual random outputs are not attributed.' if effect in PROBABILITY else
                                                     'No qualifying actual-effect witness in this campaign.' if not self.actual[effect] else None)}
        return {'runs': self.runs, 'status': self.status, 'wonFraction': self.status['won'] / self.runs,
                'failureShiftDistribution': dict(sorted(self.failure_shifts.items())), 'totals': dict(self.sums),
                'firstShipmentPlacements': first, 'ordersPer100Placements': self.sums['orders'] * 100 / self.sums['placements'],
                'chainDistribution': self.chains, 'maxChainDistribution': dict(sorted(self.max_chains.items())),
                'maximumShipmentsPerPlacement': max(self.max_chains),
                'occupancy': {'postPlacement': histogram_distribution(self.occupancy),
                              'perRunPeakIncludingPlacement': histogram_distribution(self.peak_occupancy),
                              'terminal': histogram_distribution(self.terminal_occupancy), 'boardCells': 49},
                'candidateBlockage': blockage, 'upgrades': upgrades,
                'coverage': {'traits': self.traits, **self.coverage, 'actualEffects': self.actual,
                             'probabilityOpportunities': self.opportunities, 'anomalies': {}},
                'timings': {'componentSumsMs': self.timing_sums, 'wallMs': distribution(self.walls),
                            'maxEngineCommandMs': self.max_engine, 'engineMicroseconds': engine_distribution(self.engine_hist)},
                'extremes': {key: [item[1] for item in candidates] for key, candidates in self.extremes.items()}}


def validate_manifest(manifest):
    require(manifest.get('protocolVersion') == 1 and manifest.get('rulesetVersion') == 3, 'protocolVersion=1 / rulesetVersion=3 required')
    require(manifest.get('mode') == 'standard' and manifest.get('upgradePolicy') == 'uniform', 'manifest standard uniform protocol required')
    require(manifest.get('strategies') == list(STRATEGIES), 'manifest strategies must be random, greedy, route')
    integer(manifest.get('totalSeeds'), 'totalSeeds', 1, 33334)
    integer(manifest.get('batchSize'), 'batchSize', 1, 100)
    integer(manifest.get('maxCommands'), 'maxCommands', 1, 2000)
    require(manifest.get('seedPlan') == {'kind': 'consecutive', 'start': 1, 'step': 1}, 'manifest seed plan must be consecutive seed=idx+1')
    require(manifest.get('rngSeeds') == {'placementXor': 0x51f15e, 'upgradeXor': 0x6a09e667}, 'manifest XOR RNG seeds mismatch')
    require(isinstance(manifest.get('campaignId'), str) and manifest['campaignId'], 'manifest campaignId required')
    require(isinstance(manifest.get('gameCommit'), str) and re.fullmatch(r'[a-f0-9]{40}', manifest['gameCommit']), 'gameCommit required')
    for key in ('sourceSha256', 'rulesSha256', 'gameJsSha256'):
        require(isinstance(manifest.get(key), str) and re.fullmatch(r'[a-f0-9]{64}', manifest[key]), f'{key}: SHA256 required')


def analyze(campaign):
    manifest, manifest_hash = read_json(campaign / 'manifest.json')
    validate_manifest(manifest)
    progress, progress_hash = read_json(campaign / 'progress.json')
    planned = manifest['totalSeeds'] * 3
    require(progress.get('status') == 'completed', 'progress status must be completed')
    require(progress.get('manifestHash') == manifest_hash, 'progress manifestHash mismatch')
    require(progress.get('campaignId') == manifest['campaignId'], 'progress campaignId mismatch')
    require(progress.get('totalRuns') == progress.get('completedRuns') == planned, 'progress completed/planned mismatch')
    require(progress.get('currentRun') is None and progress.get('workerPid') is None, 'completed progress still has active worker/run')
    require(not (campaign / 'failure.json').exists(), 'active failure.json exists')
    pending = campaign / 'pending'
    require(not pending.exists() or not any(pending.iterdir()), 'pending artifacts remain')
    batches = campaign / 'batches'
    require(batches.is_dir() and not batches.is_symlink(), 'missing or unsafe batches directory')
    expected_files, descriptors = set(), []
    for start in range(0, manifest['totalSeeds'], manifest['batchSize']):
        count = min(manifest['batchSize'], manifest['totalSeeds'] - start)
        stem = f'{start:06d}-{start+count-1:06d}'
        descriptors.append((start, count, stem))
        expected_files.update(stem + suffix for suffix in ('.jsonl', '.receipt.json', '.stats.json'))
    actual_files = {path.name for path in batches.iterdir()}
    require(not actual_files - expected_files, f'unexpected batch files: {sorted(actual_files - expected_files)}')
    require(not expected_files - actual_files, f'missing batch files: {sorted(expected_files - actual_files)}')
    require(progress.get('completedBatches') == len(descriptors), 'progress completedBatches mismatch')
    aggregates = {strategy: Aggregate() for strategy in STRATEGIES}
    global_aggregate = Aggregate()
    resources = {'validatedBatches': len(descriptors), 'batchWallMsSum': 0.0, 'batchCpuUserMsSum': 0.0,
                 'batchCpuSystemMsSum': 0.0, 'maxWorkerRssKiB': 0, 'verifiedJsonlBytes': 0,
                 'supervisorReportedElapsedMs': number(progress.get('elapsedMs'), 'progress elapsedMs'),
                 'timingScope': 'sum of authenticated completed-batch worker stats; supervisor elapsed is a reported derived value, not completion proof',
                 'rssScope': 'maximum worker high-water RSS across batches; not a sum or simultaneous campaign RSS'}
    receipts, paired_outcomes = [], Counter()
    differences = {f'{left}_minus_{right}': {key: 0 for key in ('score', 'orders', 'placements', 'wins')} for left, right in (('greedy', 'random'), ('route', 'random'), ('route', 'greedy'))}
    for start, count, stem in descriptors:
        receipt, receipt_hash = read_json(batches / (stem + '.receipt.json'))
        require(receipt.get('manifestHash') == manifest_hash, f'{stem}: receipt manifestHash mismatch')
        for key, expected in {'protocolVersion': 1, 'start': start, 'count': count, 'runs': count * 3,
                              'file': stem + '.jsonl', 'statsFile': stem + '.stats.json'}.items():
            require(receipt.get(key) == expected, f'{stem}: receipt {key} mismatch')
        path = batches / receipt['file']
        file_hash, file_size = digest(path)
        require(file_hash == receipt.get('sha256'), f'{stem}: JSONL SHA256 mismatch')
        require(file_size == receipt.get('bytes'), f'{stem}: receipt byte count mismatch')
        stats, stats_hash = read_json(batches / receipt['statsFile'])
        require(stats_hash == receipt.get('statsSha256'), f'{stem}: stats SHA256 mismatch')
        require(stats.get('runs') == count * 3, f'{stem}: stats runs mismatch')
        for key in ('wallMs', 'cpuUserMs', 'cpuSystemMs', 'maxRssKiB'):
            number(stats.get(key), f'{stem}: stats {key}')
            require(stats[key] == receipt.get(key), f'{stem}: receipt/stats {key} mismatch')
        resources['batchWallMsSum'] += stats['wallMs']
        resources['batchCpuUserMsSum'] += stats['cpuUserMs']
        resources['batchCpuSystemMsSum'] += stats['cpuSystemMs']
        resources['maxWorkerRssKiB'] = max(resources['maxWorkerRssKiB'], stats['maxRssKiB'])
        resources['verifiedJsonlBytes'] += file_size
        row_count, streamed_hash, paired = 0, hashlib.sha256(), []
        with path.open('rb') as stream:
            while True:
                line = stream.readline(MAX_LINE + 1)
                if not line:
                    break
                require(len(line) <= MAX_LINE, f'{stem}: JSONL line exceeds bound')
                require(line.endswith(b'\n'), f'{stem}: JSONL must be newline terminated')
                streamed_hash.update(line)
                require(row_count < count * 3, f'{stem}: extra row count')
                row = parse(line, f'{stem} line {row_count + 1}')
                try:
                    validate_row(row, start + row_count // 3, STRATEGIES[row_count % 3], manifest['maxCommands'])
                except ValidationError as error:
                    raise ValidationError(f'{stem} line {row_count + 1}: {error}') from error
                aggregates[row['strategy']].add(row)
                global_aggregate.add(row)
                paired.append({key: row[key] for key in ('status', 'score', 'orders', 'placements')})
                if len(paired) == 3:
                    paired_outcomes['/'.join(item['status'] for item in paired)] += 1
                    for name, total in differences.items():
                        left, right = name.split('_minus_')
                        a, b = paired[STRATEGIES.index(left)], paired[STRATEGIES.index(right)]
                        for metric in ('score', 'orders', 'placements'):
                            total[metric] += a[metric] - b[metric]
                        total['wins'] += int(a['status'] == 'won') - int(b['status'] == 'won')
                    paired.clear()
                row_count += 1
        require(row_count == count * 3, f'{stem}: row count {row_count} != {count * 3}')
        require(streamed_hash.hexdigest() == file_hash, f'{stem}: SHA256 changed during analysis')
        require(digest(batches / (stem + '.receipt.json'))[0] == receipt_hash, f'{stem}: receipt changed during analysis')
        receipts.append({'file': receipt['file'], 'sha256': file_hash, 'bytes': file_size, 'runs': row_count,
                         'receiptSha256': receipt_hash, 'statsFile': receipt['statsFile'], 'statsSha256': stats_hash})
    require(global_aggregate.runs == planned, 'validated run count != planned')
    require(all(aggregate.runs == manifest['totalSeeds'] for aggregate in aggregates.values()), 'strategy pairing incomplete')
    require(digest(campaign / 'manifest.json')[0] == manifest_hash and digest(campaign / 'progress.json')[0] == progress_hash,
            'manifest/progress changed during analysis')
    for effect, count in global_aggregate.actual.items():
        require(not count or effect in global_aggregate.witness, f'actual effect {effect}: missing first witness')
    for effect, count in global_aggregate.opportunities.items():
        require(not count or f'opportunity.{effect}' in global_aggregate.witness, f'probability opportunity {effect}: missing first witness')
    resources['batchCpuMsSum'] = resources['batchCpuUserMsSum'] + resources['batchCpuSystemMsSum']
    by_strategy = {key: aggregate.result() for key, aggregate in aggregates.items()}
    examples, seen = [], set()
    def example(candidate, reason):
        key = (candidate['seedIndex'], candidate['strategy'])
        if key in seen:
            for old in examples:
                if (old['seedIndex'], old['strategy']) == key and reason not in old['reasons']:
                    old['reasons'].append(reason)
            return
        if len(examples) < 20:
            seen.add(key)
            examples.append({**candidate, 'reasons': [reason]})
    # First cover each category/strategy; then use runner-up extremes and stable fallback.
    for rank in range(3):
        for category in global_aggregate.extremes:
            for strategy in STRATEGIES:
                candidates = by_strategy[strategy]['extremes'][category]
                if len(candidates) > rank:
                    example(candidates[rank], category)
    for strategy in STRATEGIES:
        for candidate in aggregates[strategy].first_runs:
            example(candidate, 'deterministicSupplement')
    return {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'campaignId': manifest['campaignId'], 'scope': {'kind': 'main' if planned == 100002 else 'pilot',
            'plannedRuns': planned, 'mainTargetRuns': 100002, 'seedCount': manifest['totalSeeds'],
            'seedPlan': manifest['seedPlan'], 'protocol': 'rules3-standard-uniform-upgrades-v1',
            'rngInterpretation': 'Upgrade cursor is separate from placement/game RNG; identical seeds across strategies use common random numbers, not independent strategy samples.',
            'limitations': LIMITATIONS},
            'completion': {'status': 'validated_completed', 'validatedRuns': global_aggregate.runs,
                           'validatedPairedSeeds': sum(paired_outcomes.values()), 'pending': 0, 'duplicates': 0,
                           'missing': 0, 'replayVerifiedRuns': global_aggregate.runs, 'coverageAnomalies': {},
                           'validationAuthority': 'manifest + completed progress + all receipt/SHA/rows + per-run invariants; checkpoint ignored',
                           'conservationChecks': ['sum(chain)=placements', 'sum(chain*count)=orders', 'snapshotChecks=commands',
                                                  'replayVerified=true', 'coverage.anomalies={}', 'generated and trait totals agree',
                                                  'occupancy histogram count/weighted sum agree', 'engine histogram sum=commands']},
            'provenance': {**{key: manifest.get(key) for key in ('gameCommit', 'sourceSha256', 'rulesSha256', 'gameJsSha256', 'toolCommit', 'nodeVersion')},
                           'manifestSha256': manifest_hash, 'progressSha256': progress_hash,
                           'analysisSha256': digest(Path(__file__).resolve())[0], 'analysisTool': 'qa/large-scan/report.py',
                           'pythonVersion': sys.version.split()[0], 'hashClaim': 'Source hashes are recorded from the manifest; analysis does not rerun or attest historical source bytes.'},
            'resources': resources, 'overall': global_aggregate.result(), 'strategies': by_strategy,
            'paired': {'statusOrder': list(STRATEGIES), 'statusCombinations': dict(sorted(paired_outcomes.items())),
                       'meanWithinSeedDifferences': {name: {key: value / manifest['totalSeeds'] for key, value in sums.items()} for name, sums in differences.items()},
                       'interpretation': 'Descriptive paired differences, not causal upgrade effects or matched trajectories.'},
            'firstWitness': global_aggregate.witness,
            'witnessRetention': 'Worker retains first witness of each key per batch across all strategies. Global earliest retained witness is preserved with full run identity; absence within one strategy is not proof of no effect.',
            'replayExamples': examples, 'replaySelection': 'Up to 20 unique identities: per-strategy top-three extremes, then deterministic supplements; fewer only when the pilot has fewer runs.',
            'extremeDefinitions': {'earliestFailure': 'lowest failure shift, then fewest placements, then lowest seedIndex',
                                   'highestChain': 'largest maxChain, then orders, then lowest seedIndex',
                                   'highestOccupancy': 'largest peak including pre-resolution placement, then lowest seedIndex',
                                   'slowestEngineCommand': 'largest maxEngineMs', 'slowestEngineTotal': 'largest summed engineMs'},
            'receipts': receipts}


def fmt(value, places=3):
    return '无' if value is None else f'{value:,.{places}f}' if isinstance(value, float) else f'{value:,}' if isinstance(value, int) else str(value)


def markdown(summary):
    scope, done, resources = summary['scope'], summary['completion'], summary['resources']
    lines = [f"# 冻结规则3 · {'100,002局正式' if scope['kind'] == 'main' else 'pilot试运行'}扫描报告", '',
             f"Campaign：`{summary['campaignId']}`；生成时间：{summary['generatedAt']}。", '',
             f"已逐文件、逐行核验 {done['validatedRuns']:,} 局，{done['validatedPairedSeeds']:,} 个seed，每个seed三策略完整配对。目标正式扫描为100,002局 = 33,334 seed × 3；本报告范围为 {scope['kind']}。", '',
             '## 完成证据与边界', '',
             'manifest与completed progress一致；每批receipt的manifestHash、JSONL与stats的SHA256、字节数、行数、seedIndex/strategy/seed均核验。checkpoint不作为完成证据。0 pending、0重复、0缺失；所有snapshot/replay、chain、generated、occupancy与observer守恒校验通过。', '',
             *[f'- {text}' for text in LIMITATIONS], '', '## 策略结果', '',
             '| 策略 | 局数 | 胜 / 失败 | 胜率 | 首次实际出货中位放置数 | 已出货 / 未出货 | 每100放置订单 | 平均占用格 / 峰值格（共49格） |',
             '|---|---:|---:|---:|---:|---:|---:|---:|']
    for strategy, item in summary['strategies'].items():
        first, occupancy = item['firstShipmentPlacements'], item['occupancy']
        lines.append(f"| {strategy} | {item['runs']:,} | {item['status']['won']:,} / {item['status']['failed']:,} | {item['wonFraction']:.2%} | {fmt(first['p50'])} | {first['observedRuns']:,} / {first['unshippedRuns']:,} | {item['ordersPer100Placements']:.3f} | {occupancy['postPlacement']['mean']:.3f} / {max(map(int, occupancy['perRunPeakIncludingPlacement']['histogram']))} |")
    lines += ['', '首次出货只统计实际出货的局，未出货局单列分母，未把它们当作0步。出货步数为placement计数，不含升级指令。占用均值按每次placement结算后采样；峰值包含落件后、消除前的瞬时占用。', '', '![策略分布](distributions.svg)', '']
    for strategy, item in summary['strategies'].items():
        first = item['firstShipmentPlacements']
        lines += [f'### {strategy}', '', f"- 失败班次：{json.dumps(item['failureShiftDistribution'], ensure_ascii=False)}",
                  f"- 首次出货p50/p95/p99：{fmt(first['p50'])} / {fmt(first['p95'])} / {fmt(first['p99'])}；已出货{first['observedRuns']:,}局，未出货{first['unshippedRuns']:,}局（分位数仅基于已出货局；未出货单列，不当作0步）。",
                  f"- Chain 0–4（每次放置）：{json.dumps(item['chainDistribution'])}；最多shipment事件{item['maximumShipmentsPerPlacement']}。",
                  f"- 每局最大chain分布：{json.dumps(item['maxChainDistribution'])}。"]
        for size, counts in item['candidateBlockage'].items():
            lines.append(f"- {size}候选全blocked：{counts['allBlocked']:,}/{counts['observations']:,}次观察；发生于{counts['runsBlocked']:,}/{counts['runsObserved']:,}个有此候选数的局。")
        lines += [f"- trait生成件数：{dict(item['coverage']['traits']['generated'])}；落件件数：{dict(item['coverage']['traits']['placed'])}；出货物理格数：{dict(item['coverage']['traits']['shipped'])}。",
                  f"- rush到期：{dict(item['coverage']['rushExpired'])}；waste：{dict(item['coverage']['waste'])}。",
                  f"- pallet：{dict(item['coverage']['pallet'])}；wildcard：{dict(item['coverage']['wildcard'])}。", '']
    lines += ['## 升级覆盖', '', '出现次数、选择次数、实际作用事件和概率机会的单位不同；不相除后解释为触发概率。完整按策略明细见upgrade-coverage.csv。', '',
              '| 中文标题 | effect | offered | selected | actualEffects | probabilityOpportunities | 说明 |', '|---|---|---:|---:|---:|---:|---|']
    for effect, item in summary['overall']['upgrades'].items():
        note = '仅机会，非实际触发' if effect in PROBABILITY else '已见实际作用' if item['actualEffects'] else '未观测到合格实际作用'
        lines.append(f"| {UPGRADE_TITLES[effect]} | {effect} | {item['offered']:,} | {item['selected']:,} | {item['actualEffects']:,} | {item['probabilityOpportunities']:,} | {note} |")
    lines += ['', 'summary.json保留每个effect/trait等key首次witness的seedIndex、seed、strategy、放置与升级Bot RNG种子、commandIndex、事件摘要及finalChecksum。每批witness跨策略去重，因此单策略缺少witness记录不能当作该策略从未生效。', '',
              '## 性能和资源', '',
              f"- 完整批worker wall总和：{fmt(resources['batchWallMsSum'] / 1000)}秒；CPU user/system：{fmt(resources['batchCpuUserMsSum'] / 1000)} / {fmt(resources['batchCpuSystemMsSum'] / 1000)}秒；CPU合计{fmt(resources['batchCpuMsSum'] / 1000)}秒。",
              f"- 单worker跨批峰值RSS：{fmt(resources['maxWorkerRssKiB'] / 1024)}MiB（KiB原值{fmt(resources['maxWorkerRssKiB'])}；不是RSS相加）。",
              f"- supervisor自报累计elapsed：{fmt(resources['supervisorReportedElapsedMs'] / 1000)}秒，属于派生时间信息，不用于完成证明；核验JSONL {fmt(resources['verifiedJsonlBytes'] / 1024 / 1024)}MiB。", '',
              '| 策略 | Bot ms | engine ms | save ms | observer ms | replay ms | IPC ms | 整局wall p50 / p95 / p99 ms |',
              '|---|---:|---:|---:|---:|---:|---:|---:|']
    for strategy, item in summary['strategies'].items():
        timing = item['timings']
        lines.append('| ' + strategy + ' | ' + ' | '.join(fmt(timing['componentSumsMs'][key]) for key in TIMINGS) +
                     ' | ' + ' / '.join(fmt(timing['wallMs'][key]) for key in ('p50', 'p95', 'p99')) + ' |')
    lines += ['', '整局wall分位数从每局数值精确排序，使用ceil(q*n)最近秩，包含整个QA循环。engine每指令微秒直方图只能给近似分位区间：', '']
    for strategy, item in summary['strategies'].items():
        quantiles = item['timings']['engineMicroseconds']['quantiles']
        labels = [f"{name}=({fmt(value['lowerExclusive'])}, {'∞' if value['upperInclusive'] is None else fmt(value['upperInclusive'])}]μs" for name, value in quantiles.items()]
        lines.append(f"- {strategy}：{'；'.join(labels)}；最大单次engine={fmt(item['timings']['maxEngineCommandMs'])}ms。")
    lines += ['', 'Bot包含预览搜索，save含每条指令存档往返验证，observer为独立只读对账，replay为终局完整重放，IPC为runner发送协议的耗时。剩余wall含checksum/循环等开销；这些数据不等于真实渲染/手机帧率。', '',
              '本次云环境测量受JIT/GC/调度及同时验证归档影响，不是隔离硬件基准；极端seed重放只保证状态/命令结果，不保证相同耗时。', '',
              '## 配对描述（非因果）', '', f"同seed状态组合顺序random/greedy/route：{json.dumps(summary['paired']['statusCombinations'])}。",
              f"同seed差值均值：{json.dumps(summary['paired']['meanWithinSeedDifferences'])}。动作、候选池和游戏RNG分支会分化，升级并非单变量控制实验。", '',
              '## 可复现极端局与重放候选', '',
              '“最早失败”按失败班次、放置数、seedIndex排序；最高chain、最高占用、最慢单指令engine、最慢engine总和分别选取。以下为去重候选，未在报告工具中额外运行重放：', '',
              '| strategy | seedIndex / seed | 状态 | shift / placements | chain / peak | maxEngine ms | checksum | 选择原因 |',
              '|---|---:|---|---:|---:|---:|---|---|']
    for row in summary['replayExamples']:
        lines.append(f"| {row['strategy']} | {row['seedIndex']} / {row['seed']} | {row['status']} | {row['shift']} / {row['placements']} | {row['maxChain']} / {row['peakOccupiedCells']} | {fmt(row['maxEngineMs'])} | `{row['finalChecksum']}` | {', '.join(row['reasons'])} |")
    lines += ['', '完整每策略各类别前3名和重放身份在summary.json；这份清单不是不可解seed清单。', '', '## Observer检查总量', '',
              'trait的generated/placed单位是件，shipped单位是物理格；shippedUnits另计托盘加成。', '',
              '```json', json.dumps(summary['overall']['coverage']['checks'], ensure_ascii=False, indent=2, sort_keys=True), '```', '',
              '## 来源与可审计文件', '']
    for key, value in summary['provenance'].items():
        lines.append(f'- {key}：`{value}`')
    lines += ['', '执行源和规则SHA来自已校验manifest；分析器不重新证明历史执行源字节。每批receipt/JSONL/stats哈希清单写入summary.json。报告文件不纳入冻结游戏执行源SHA；分析器另记自身SHA。', '']
    return '\n'.join(lines)


def upgrade_csv(summary):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream)
    writer.writerow(['strategy', 'effect', 'titleZh', 'offered', 'selected', 'actualEffects', 'probabilityOpportunities', 'evidenceType',
                     'unobservedReason', 'firstWitnessScope', 'firstWitnessSeedIndex', 'firstWitnessSeed', 'firstWitnessStrategy', 'firstWitnessFinalChecksum'])
    for strategy, aggregate in [('all', summary['overall']), *summary['strategies'].items()]:
        for effect, coverage in aggregate['upgrades'].items():
            witness = summary['firstWitness'].get(f'opportunity.{effect}' if effect in PROBABILITY else effect, {})
            writer.writerow([strategy, effect, UPGRADE_TITLES[effect], *[coverage[key] for key in ('offered', 'selected', 'actualEffects', 'probabilityOpportunities', 'evidenceType', 'unobservedReason')], 'global-across-strategies',
                             *[witness.get(key, '') for key in ('seedIndex', 'seed', 'strategy', 'finalChecksum')]])
    return stream.getvalue()


def svg(summary):
    colors = {'random': '#a33d3d', 'greedy': '#2475a0', 'route': '#287b55'}
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="960" height="670" viewBox="0 0 960 670" role="img" aria-labelledby="title desc">',
             '<title id="title">Validated scan distributions by strategy</title>',
             '<desc id="desc">Normalized chain 0 to 4 and post-placement occupancy histograms. Each strategy uses its own placement denominator.</desc>',
             '<rect width="960" height="670" fill="#fafaf8"/>', '<g font-family="sans-serif" fill="#222">',
             '<text x="45" y="32" font-size="20">Validated scan: strategy distributions</text>']
    for i, strategy in enumerate(STRATEGIES):
        parts += [f'<rect x="{570+i*120}" y="18" width="14" height="14" fill="{colors[strategy]}"/>',
                  f'<text x="{591+i*120}" y="30" font-size="13">{html.escape(strategy)}</text>']
    for panel, (title, bins, getter) in enumerate([
        ('Chain per placement (%)', 5, lambda item: item['chainDistribution']),
        ('Post-placement occupied cells (%)', 50, lambda item: item['occupancy']['postPlacement']['histogram'])]):
        top, bottom, left, width = 75 + panel * 290, 295 + panel * 290, 65, 850
        values = {strategy: [100 * getter(item).get(str(i), 0) / item['totals']['placements'] for i in range(bins)] for strategy, item in summary['strategies'].items()}
        maximum = max((value for series in values.values() for value in series), default=1) or 1
        scale = max(5, math.ceil(maximum / 5) * 5)
        parts.append(f'<text x="{left}" y="{top-15}" font-size="16">{title}</text>')
        for tick in range(5):
            val, y = scale * tick / 4, bottom - (bottom - top) * tick / 4
            parts += [f'<line x1="{left}" y1="{y}" x2="{left+width}" y2="{y}" stroke="#ddd"/>',
                      f'<text x="{left-10}" y="{y+4}" font-size="11" text-anchor="end">{val:.1f}</text>']
        step = width / bins
        for ordinal, (strategy, series) in enumerate(values.items()):
            for index, value in enumerate(series):
                bar_width = step * .8 / 3
                x, height = left + step * index + step * .1 + ordinal * bar_width, value / scale * (bottom-top)
                parts.append(f'<rect x="{x:.2f}" y="{bottom-height:.2f}" width="{bar_width:.2f}" height="{height:.2f}" fill="{colors[strategy]}"><title>{strategy}: {index} = {value:.4f}%</title></rect>')
        for index in range(bins):
            if bins == 5 or index % 5 == 0 or index == 49:
                parts.append(f'<text x="{left+step*(index+.5):.2f}" y="{bottom+20}" text-anchor="middle" font-size="11">{index}</text>')
    parts += ['<text x="65" y="640" font-size="12">Per-strategy placement denominators; descriptive bot evidence, not causal or all-seed guarantees.</text>', '</g></svg>\n']
    return '\n'.join(parts)


def write_outputs(summary, output):
    output.mkdir(parents=True, exist_ok=True)
    contents = {'summary.json': json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + '\n',
                'report.md': markdown(summary), 'upgrade-coverage.csv': upgrade_csv(summary),
                'distributions.svg': svg(summary)}
    for name, text in contents.items():
        temporary = output / f'.{name}.{os.getpid()}.tmp'
        try:
            with temporary.open('x', encoding='utf-8', newline='') as stream:
                stream.write(text)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, output / name)
        finally:
            if temporary.exists():
                temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--campaign', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    campaign, output = args.campaign.resolve(), args.output.resolve()
    try:
        require(output != campaign and not any(output == path or path in output.parents for path in (campaign / 'batches', campaign / 'pending', campaign / 'interrupted')),
                'output must not overwrite campaign evidence directories')
        summary = analyze(campaign)
        write_outputs(summary, output)
        print(json.dumps({'status': 'validated_completed', 'kind': summary['scope']['kind'],
                          'runs': summary['completion']['validatedRuns'], 'output': str(output)}))
    except (ValidationError, OSError, KeyError, TypeError) as error:
        print(f'REPORT_REJECTED: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
