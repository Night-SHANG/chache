#!/usr/bin/env node
/** Single-worker, fail-closed scan supervisor. All output is local to --output.
 * Final JSONL + its durable receipt are the authority; checkpoint is derived.
 * --worker is an explicit test seam and does not change the game executable.
 */
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  readdirSync, renameSync, rmSync, statSync, writeFileSync, writeSync,
} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireOutputLock, atomicJsonWithCommands, directoryBytes, fileDigest, jsonLines} from './supervisor-io.mjs';

const STRATEGIES = ['random', 'greedy', 'route'];
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_PROTOCOL_LINE = 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const iso = () => new Date().toISOString();

class ScanError extends Error {
  constructor(code, message) { super(message); this.name = 'ScanError'; this.code = code; }
}
function requireThat(condition, code, message) {
  if (!condition) throw new ScanError(code, message);
}
function syncDirectory(path) {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function atomicWrite(path, value) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  syncDirectory(dirname(path));
}
function atomicJson(path, value) { atomicWrite(path, JSON.stringify(value, null, 2) + '\n'); }
function parseJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new ScanError('INVALID_JSON', `Cannot read JSON ${path}: ${error.message}`); }
}
function validateManifest(manifest) {
  requireThat(manifest && typeof manifest === 'object', 'MANIFEST_INVALID', 'Manifest must be an object');
  requireThat(manifest.protocolVersion === 1, 'MANIFEST_INVALID', 'protocolVersion must be 1');
  requireThat(typeof manifest.campaignId === 'string' && manifest.campaignId.length > 0, 'MANIFEST_INVALID', 'campaignId is required');
  for (const key of ['totalSeeds', 'batchSize', 'workerTimeoutMs']) {
    requireThat(Number.isSafeInteger(manifest[key]) && manifest[key] > 0, 'MANIFEST_INVALID', `${key} must be a positive integer`);
  }
  requireThat(Number.isSafeInteger(manifest.totalSeeds * 3), 'MANIFEST_INVALID', 'totalSeeds exceeds safe integer range');
  requireThat(Number.isFinite(manifest.maxRssMiB) && manifest.maxRssMiB > 0, 'MANIFEST_INVALID', 'maxRssMiB must be positive');
  if (manifest.maxDiskMiB !== undefined) requireThat(Number.isFinite(manifest.maxDiskMiB) && manifest.maxDiskMiB > 0, 'MANIFEST_INVALID', 'maxDiskMiB must be positive');
  requireThat(JSON.stringify(manifest.strategies) === JSON.stringify(STRATEGIES), 'MANIFEST_INVALID', 'strategies must be exactly random, greedy, route in that order');
  requireThat(manifest.rulesetVersion === 3, 'MANIFEST_INVALID', 'rulesetVersion must be 3');
  requireThat(typeof manifest.gameCommit === 'string' && manifest.gameCommit.length > 0, 'MANIFEST_INVALID', 'gameCommit is required');
  if (manifest.seedPlan) {
    const plan = manifest.seedPlan;
    requireThat(plan.kind === 'consecutive' && Number.isSafeInteger(plan.start) && Number.isSafeInteger(plan.step) && plan.step > 0 && Number.isSafeInteger(plan.start + (manifest.totalSeeds - 1) * plan.step), 'MANIFEST_INVALID', 'seedPlan must describe safe consecutive seeds');
  }
  if (manifest.rngSeeds) requireThat(['placementXor', 'upgradeXor'].every(key => Number.isInteger(manifest.rngSeeds[key]) && manifest.rngSeeds[key] >= -2147483648 && manifest.rngSeeds[key] <= 4294967295), 'MANIFEST_INVALID', 'rngSeeds must specify 32-bit XOR masks');
  requireThat(manifest.sourceSha256 && (typeof manifest.sourceSha256 === 'string' || typeof manifest.sourceSha256 === 'object'), 'MANIFEST_INVALID', 'sourceSha256 is required');
}
function validateRunSeeds(run, manifest) {
  requireThat(['seed', 'botSeed', 'upgradeSeed'].every(key => Number.isSafeInteger(run[key])), 'BATCH_ROWS', 'Run requires integer seed, botSeed and upgradeSeed');
  if (manifest.seedPlan) requireThat(run.seed === manifest.seedPlan.start + run.seedIndex * manifest.seedPlan.step, 'SEED_PLAN', 'Run seed violates manifest.seedPlan');
  if (manifest.rngSeeds) {
    requireThat(run.botSeed === ((run.seed ^ manifest.rngSeeds.placementXor) | 0) && run.upgradeSeed === ((run.seed ^ manifest.rngSeeds.upgradeXor) | 0), 'RNG_SEEDS', 'Run RNG seeds violate manifest.rngSeeds');
  }
}
function batchStem(start, count) {
  return `${String(start).padStart(6, '0')}-${String(start + count - 1).padStart(6, '0')}`;
}
function expectedRun(start, ordinal) {
  return {seedIndex: start + Math.floor(ordinal / STRATEGIES.length), strategy: STRATEGIES[ordinal % STRATEGIES.length]};
}
function validateBatch(path, expected, expectedHash, manifest, evidencePath) {
  const actual = fileDigest(path);
  requireThat(SHA256.test(expectedHash) && actual.sha256 === expectedHash, 'BATCH_CHECKSUM', `Batch checksum mismatch: ${path}`);
  const evidence = evidencePath ? jsonLines(evidencePath) : null;
  let i = 0, seed;
  try {
    for (const row of jsonLines(path)) {
      const wanted = expectedRun(expected.start, i);
      requireThat(i < expected.count * 3 && row && row.seedIndex === wanted.seedIndex && row.strategy === wanted.strategy, 'BATCH_ROWS', `Missing, duplicate or out-of-order seed/strategy at row ${i + 1}: ${path}`);
      requireThat(row.status !== 'capped' && row.capped !== true, 'CAPPED', `Capped run at seedIndex ${row.seedIndex}, strategy ${row.strategy}`);
      requireThat(row.status === 'won' || row.status === 'failed', 'BATCH_ROWS', `Invalid terminal status at row ${i + 1}: ${path}`);
      validateRunSeeds(row, manifest);
      if (i % 3 === 0) seed = row.seed;
      else requireThat(row.seed === seed, 'BATCH_ROWS', `Strategies are not paired on the same seed at row ${i + 1}: ${path}`);
      if (evidence) {
        const event = evidence.next().value;
        requireThat(event && event.seedIndex === row.seedIndex && event.strategy === row.strategy && event.seed === row.seed, 'BATCH_ROWS', `Metrics differ from worker runStart at row ${i + 1}: ${path}`);
        for (const key of ['botSeed', 'upgradeSeed']) requireThat(event[key] === row[key], 'BATCH_ROWS', `Metrics ${key} differs from protocol at row ${i + 1}: ${path}`);
        for (const key of ['commands', 'status']) {
          if (event[key] !== undefined && row[key] !== undefined) requireThat(event[key] === row[key], 'BATCH_ROWS', `Metrics ${key} differs from protocol at row ${i + 1}: ${path}`);
        }
      }
      i++;
    }
    requireThat(i === expected.count * 3, 'BATCH_ROWS', `Batch contains ${i} rows; expected ${expected.count * 3}: ${path}`);
    if (evidence) requireThat(evidence.next().done, 'BATCH_ROWS', 'Extra protocol run evidence');
  } catch (error) { error.run = expectedRun(expected.start, i); throw error; }
  finally { evidence?.return(); }
  return {...actual, runs: i};
}
function serializeError(error) {
  return {code: error.code || 'SUPERVISOR_ERROR', message: error.message || String(error), stack: error.stack};
}
function quarantinePending(pendingDir, interruptedDir) {
  const names = readdirSync(pendingDir);
  if (!names.length) return;
  const destination = join(interruptedDir, `${Date.now()}-${randomUUID()}`);
  mkdirSync(destination, {recursive: true});
  for (const name of names) renameSync(join(pendingDir, name), join(destination, name));
  syncDirectory(destination); syncDirectory(pendingDir); syncDirectory(interruptedDir);
}

/** Read only this supervisor's direct child. Linux reports RSS and high-water RSS in KiB. */
function sampleChildResources(pid) {
  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
  const rss = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] || 0) / 1024;
  const highWater = Number(status.match(/^VmHWM:\s+(\d+)\s+kB$/m)?.[1] || 0) / 1024;
  return {rssMiB: rss, peakRssMiB: Math.max(rss, highWater), sampledAt: iso()};
}

export async function supervise({manifestPath, outputDir, resume = false, workerPath} = {}) {
  requireThat(manifestPath && outputDir, 'USAGE', '--manifest FILE and --output DIR are required');
  manifestPath = resolve(manifestPath); outputDir = resolve(outputDir);
  workerPath = resolve(workerPath || fileURLToPath(new URL('./worker.mjs', import.meta.url)));
  mkdirSync(outputDir, {recursive: true});
  let releaseLock;
  const startedAt = iso(), startedMs = Date.now();
  const pendingDir = join(outputDir, 'pending'), batchesDir = join(outputDir, 'batches'), interruptedDir = join(outputDir, 'interrupted');
  let manifest = null, manifestHash = null, completedBatches = [], currentRun = null, lastRun = null;
  let commandCount = 0, lastCommand = null, child = null, childFailurePath = null, signalError = null, cancelWorker = null;
  let protocolEvidence = null, evidenceFd = null, diskBytes = 0, activeEvidencePath = null;
  let workerResources = {rssMiB: 0, peakRssMiB: 0}, traceFd = null, tracePath = null;
  let priorElapsedMs = 0;
  const completedRuns = () => completedBatches.reduce((total, batch) => total + batch.runs, 0);
  const elapsedMs = () => priorElapsedMs + Date.now() - startedMs;
  const persistProgress = (status, extra = {}) => atomicJson(join(outputDir, 'progress.json'), {
    protocolVersion: 1, campaignId: manifest?.campaignId, manifestHash, status, startedAt, updatedAt: iso(),
    elapsedMs: elapsedMs(), completedRuns: completedRuns(), totalRuns: manifest ? manifest.totalSeeds * 3 : null,
    completedBatches: completedBatches.length, currentRun, currentCommandCount: commandCount,
    lastCommand, tracePath, workerPid: child?.pid || null, workerResources,
    resourceBudget: manifest ? {workerTimeoutMs: manifest.workerTimeoutMs, maxRssMiB: manifest.maxRssMiB, maxOldSpaceMiB: 256, maxDiskMiB: manifest.maxDiskMiB ?? null} : null,
    diskBytes, ...extra,
  });
  const persistCheckpoint = () => atomicJson(join(outputDir, 'checkpoint.json'), {
    protocolVersion: 1, campaignId: manifest.campaignId, manifestHash, completedBatches, completedRuns: completedRuns(),
    nextSeedIndex: completedBatches.reduce((end, batch) => end === batch.start ? batch.start + batch.count : end, 0),
    elapsedMs: elapsedMs(), updatedAt: iso(),
  });
  const checkDisk = () => {
    diskBytes = directoryBytes(outputDir);
    requireThat(manifest.maxDiskMiB === undefined || diskBytes <= manifest.maxDiskMiB * 1024 * 1024, 'DISK_LIMIT', `Output size ${(diskBytes / 1024 / 1024).toFixed(3)} MiB exceeds ${manifest.maxDiskMiB} MiB`);
  };
  const closeEvidence = () => { if (evidenceFd !== null) { fsyncSync(evidenceFd); closeSync(evidenceFd); evidenceFd = null; } };
  const closeTrace = () => { if (traceFd !== null) { fsyncSync(traceFd); closeSync(traceFd); traceFd = null; } };
  const onSignal = signal => {
    if (signalError) return;
    signalError = new ScanError('INTERRUPTED', `Supervisor interrupted by ${signal}`);
    if (cancelWorker) cancelWorker(signalError);
  };
  const onTerm = () => onSignal('SIGTERM'), onInt = () => onSignal('SIGINT');
  try {
    releaseLock = await acquireOutputLock(outputDir, error => { signalError = new ScanError('OUTPUT_LOCKED', error.message); cancelWorker?.(signalError); });
    const manifestBytes = readFileSync(manifestPath);
    manifestHash = hash(manifestBytes); manifest = JSON.parse(manifestBytes.toString('utf8')); validateManifest(manifest);
    const savedManifestPath = join(outputDir, 'manifest.json');
    if (existsSync(savedManifestPath)) {
      requireThat(resume, 'RESUME_REQUIRED', 'Output already contains a campaign; use --resume');
      requireThat(hash(readFileSync(savedManifestPath)) === manifestHash, 'MANIFEST_MISMATCH', 'Manifest hash does not match the saved campaign manifest');
    } else {
      requireThat(!readdirSync(outputDir).some(name => name !== '.supervisor.lock'), 'MANIFEST_MISMATCH', 'Nonempty output directory has no saved manifest');
      atomicWrite(savedManifestPath, manifestBytes);
    }
    for (const dir of [pendingDir, batchesDir, interruptedDir]) mkdirSync(dir, {recursive: true});
    if (resume) {
      if (existsSync(join(outputDir, 'checkpoint.json'))) {
        try { const old = parseJson(join(outputDir, 'checkpoint.json')); if (Number.isFinite(old.elapsedMs) && old.elapsedMs >= 0) priorElapsedMs = old.elapsedMs; }
        catch { /* This derived summary is deliberately never authoritative. */ }
      }
      quarantinePending(pendingDir, interruptedDir);
    }
    const expectedNames = new Set();
    for (let start = 0; start < manifest.totalSeeds; start += manifest.batchSize) {
      const count = Math.min(manifest.batchSize, manifest.totalSeeds - start), stem = batchStem(start, count);
      const filename = `${stem}.jsonl`; expectedNames.add(filename); expectedNames.add(`${stem}.receipt.json`); expectedNames.add(`${stem}.stats.json`);
      const path = join(batchesDir, filename), receiptPath = join(batchesDir, `${stem}.receipt.json`);
      if (!existsSync(path)) continue; // A receipt alone never counts as committed.
      requireThat(existsSync(receiptPath), 'BATCH_RECEIPT', `Committed batch has no durable receipt: ${filename}`);
      const receipt = parseJson(receiptPath);
      requireThat(receipt.manifestHash === manifestHash && receipt.start === start && receipt.count === count && receipt.file === filename && receipt.runs === count * 3, 'BATCH_RECEIPT', `Invalid receipt or manifest mismatch: ${filename}`);
      const verified = validateBatch(path, {start, count}, receipt.sha256, manifest);
      if (receipt.statsFile) {
        requireThat(receipt.statsFile === `${stem}.stats.json`, 'BATCH_RECEIPT', 'Invalid stats path in receipt');
        requireThat(fileDigest(join(batchesDir, receipt.statsFile)).sha256 === receipt.statsSha256, 'BATCH_CHECKSUM', 'Batch stats checksum mismatch');
      }
      completedBatches.push({...receipt, ...verified});
    }
    for (const filename of readdirSync(batchesDir)) {
      requireThat(expectedNames.has(filename) || filename.endsWith('.tmp'), 'BATCH_UNEXPECTED', `Unexpected batch file: ${filename}`);
    }
    persistCheckpoint(); checkDisk(); persistProgress('running');
    process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
    for (let start = 0; start < manifest.totalSeeds; start += manifest.batchSize) {
      if (signalError) throw signalError;
      if (completedBatches.some(batch => batch.start === start)) continue;
      checkDisk();
      const count = Math.min(manifest.batchSize, manifest.totalSeeds - start), stem = batchStem(start, count);
      const temporary = join(pendingDir, `${stem}.${randomUUID()}.jsonl.tmp`);
      // Even a worker stuck before opening its output leaves an explicit interrupted artifact.
      writeFileSync(temporary + '.started.json', JSON.stringify({start, count, manifestHash}), {flag: 'wx', mode: 0o600});
      childFailurePath = temporary + '.failure.json';
      tracePath = null;
      const evidencePath = temporary + '.runs.jsonl'; activeEvidencePath = evidencePath; evidenceFd = openSync(evidencePath, 'wx', 0o600);
      let ordinal = 0, running = false, finished = false, batchDone = null, pairedSeed = null;
      let watchdog, monitor, progressTimer, killTimer, drainTimer, protocolBuffer = '', stderr = '', workerError = null;
      commandCount = 0; lastCommand = null; currentRun = null; lastRun = null; protocolEvidence = null;
      workerResources = {rssMiB: 0, peakRssMiB: 0};
      const closeResult = await new Promise(resolveResult => {
        const fail = error => {
          if (workerError) return;
          workerError = error;
          if (child?.pid) {
            child.kill('SIGTERM');
            killTimer = setTimeout(() => { if (!finished) child?.kill('SIGKILL'); }, 250);
          }
        };
        cancelWorker = fail;
        const armWatchdog = () => {
          clearTimeout(watchdog);
          watchdog = setTimeout(() => fail(new ScanError('RUN_TIMEOUT', `Worker exceeded ${manifest.workerTimeoutMs} ms for ${currentRun ? `seedIndex ${currentRun.seedIndex}, strategy ${currentRun.strategy}` : 'startup or inter-run completion'}`)), manifest.workerTimeoutMs);
        };
        const onEvent = event => {
          requireThat(event && typeof event === 'object' && !Array.isArray(event), 'PROTOCOL_ERROR', 'Protocol event must be an object');
          requireThat(!batchDone, 'PROTOCOL_ERROR', 'Protocol event after batchDone');
          if (event.type === 'runStart') {
            requireThat(!running && ordinal < count * 3, 'PROTOCOL_ERROR', 'Unexpected runStart');
            const expected = expectedRun(start, ordinal);
            requireThat(event.seedIndex === expected.seedIndex && event.strategy === expected.strategy, 'PROTOCOL_ERROR', 'runStart is duplicate, missing or out of order');
            requireThat(['seed', 'botSeed', 'upgradeSeed'].every(key => Number.isSafeInteger(event[key])), 'PROTOCOL_ERROR', 'runStart requires integer seed, botSeed and upgradeSeed');
            validateRunSeeds(event, manifest);
            if (ordinal % 3 === 0) pairedSeed = event.seed;
            else requireThat(event.seed === pairedSeed, 'PROTOCOL_ERROR', 'Strategy runs must use the same paired seed');
            closeTrace(); tracePath = join(pendingDir, `${stem}.${event.seedIndex}.${event.strategy}.trace.jsonl`); traceFd = openSync(tracePath, 'wx', 0o600);
            currentRun = {seedIndex: event.seedIndex, seed: event.seed, strategy: event.strategy, botSeed: event.botSeed, upgradeSeed: event.upgradeSeed, startedAt: iso()};
            lastRun = currentRun; commandCount = 0; lastCommand = null; running = true;
            writeSync(traceFd, JSON.stringify(event) + '\n');
            armWatchdog(); persistProgress('running');
          } else if (event.type === 'command') {
            requireThat(running && Number.isSafeInteger(event.commandIndex) && event.commandIndex === commandCount && event.command && typeof event.command === 'object' && !Array.isArray(event.command), 'PROTOCOL_ERROR', 'Invalid or out-of-order command event');
            const entry = {commandIndex: event.commandIndex, command: event.command};
            commandCount++; lastCommand = entry; writeSync(traceFd, JSON.stringify(event) + '\n');
          } else if (event.type === 'runDone') {
            requireThat(running && event.seedIndex === currentRun.seedIndex && event.strategy === currentRun.strategy, 'PROTOCOL_ERROR', 'runDone does not match current run');
            requireThat(event.capped !== true && event.status !== 'capped', 'CAPPED', 'Worker reported capped run');
            writeSync(traceFd, JSON.stringify(event) + '\n'); closeTrace();
            writeSync(evidenceFd, JSON.stringify({...currentRun, commands: commandCount, status: event.status, tracePath}) + '\n');
            ordinal++; running = false; currentRun = null; armWatchdog();
          } else if (event.type === 'batchDone') {
            requireThat(!running && ordinal === count * 3 && event.runs === count * 3 && typeof event.sha256 === 'string' && SHA256.test(event.sha256), 'PROTOCOL_ERROR', 'batchDone has invalid run count or checksum');
            for (const key of ['wallMs', 'cpuUserMs', 'cpuSystemMs', 'maxRssKiB']) if (event[key] !== undefined) requireThat(Number.isFinite(event[key]) && event[key] >= 0, 'PROTOCOL_ERROR', `Invalid batchDone resource ${key}`);
            if (event.maxRssKiB !== undefined) {
              workerResources.peakRssMiB = Math.max(workerResources.peakRssMiB, event.maxRssKiB / 1024);
              requireThat(workerResources.peakRssMiB <= manifest.maxRssMiB, 'MEMORY_LIMIT', 'Worker-reported peak RSS exceeded budget');
            }
            batchDone = event; closeEvidence(); armWatchdog();
          } else throw new ScanError('PROTOCOL_ERROR', `Unknown worker event: ${event.type}`);
        };
        const launcherPath = fileURLToPath(new URL('./worker-launcher.py', import.meta.url));
        child = spawn('python3', [launcherPath, '--parent-pid', String(process.pid), '--', process.execPath, '--max-old-space-size=256', workerPath, '--manifest', savedManifestPath, '--batch-start', String(start), '--batch-count', String(count), '--output', temporary], {stdio: ['ignore', 'pipe', 'pipe']});
        armWatchdog();
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', data => {
          if (workerError) return;
          try {
            protocolBuffer += data;
            let newline;
            while ((newline = protocolBuffer.indexOf('\n')) >= 0) {
              requireThat(Buffer.byteLength(protocolBuffer.slice(0, newline), 'utf8') <= MAX_PROTOCOL_LINE, 'PROTOCOL_ERROR', 'Worker protocol line exceeds 1 MiB');
              const line = protocolBuffer.slice(0, newline); protocolBuffer = protocolBuffer.slice(newline + 1);
              protocolEvidence = {rawLine: line};
              let event; try { event = JSON.parse(line); protocolEvidence.event = event; } catch { throw new ScanError('PROTOCOL_ERROR', 'Worker emitted invalid JSON'); }
              onEvent(event); protocolEvidence = null;
            }
            requireThat(Buffer.byteLength(protocolBuffer, 'utf8') <= MAX_PROTOCOL_LINE, 'PROTOCOL_ERROR', 'Worker protocol buffer exceeds 1 MiB');
          } catch (error) { fail(error); }
        });
        child.stderr.on('data', data => { stderr = (stderr + data).slice(-65536); });
        child.on('error', error => fail(new ScanError('WORKER_SPAWN', error.message)));
        monitor = setInterval(() => {
          if (workerError || !child?.pid) return;
          try {
            checkDisk();
            const sample = sampleChildResources(child.pid);
            workerResources = {...sample, peakRssMiB: Math.max(workerResources.peakRssMiB, sample.peakRssMiB)};
            if (workerResources.peakRssMiB > manifest.maxRssMiB) fail(new ScanError('MEMORY_LIMIT', `Worker peak RSS ${workerResources.peakRssMiB.toFixed(2)} MiB exceeds ${manifest.maxRssMiB} MiB`));
          } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') fail(error instanceof ScanError ? error : new ScanError('RESOURCE_MONITOR', error.message)); }
        }, 1000);
        progressTimer = setInterval(() => { try { persistProgress('running'); } catch (error) { fail(error); } }, 1000);
        child.on('exit', (code, signal) => {
          if (code !== 0 || signal !== null) fail(new ScanError('WORKER_EXIT', `Worker exited with code ${code}, signal ${signal}. ${stderr}`));
          drainTimer = setTimeout(() => {
            fail(new ScanError('PROTOCOL_ERROR', 'Worker exited but its protocol pipes did not close'));
            child?.stdout.destroy(); child?.stderr.destroy();
          }, 250);
        });
        child.on('close', (code, signal) => {
          finished = true;
          for (const timer of [watchdog, monitor, progressTimer, killTimer, drainTimer]) clearTimeout(timer);
          cancelWorker = null;
          resolveResult({code, signal});
        });
      });
      closeTrace(); closeEvidence(); child = null;
      if (workerError) throw workerError;
      requireThat(closeResult.code === 0 && closeResult.signal === null, 'WORKER_EXIT', `Worker exited with code ${closeResult.code}, signal ${closeResult.signal}. ${stderr}`);
      requireThat(protocolBuffer === '' && batchDone && !running && ordinal === count * 3, 'PROTOCOL_ERROR', 'Worker exited before a complete batchDone protocol');
      const verified = validateBatch(temporary, {start, count}, batchDone.sha256, manifest, evidencePath);
      const filename = `${stem}.jsonl`, finalPath = join(batchesDir, filename);
      requireThat(!existsSync(finalPath), 'BATCH_EXISTS', `Refusing to overwrite completed batch: ${filename}`);
      const resourceStats = Object.fromEntries(['wallMs', 'cpuUserMs', 'cpuSystemMs', 'maxRssKiB'].filter(key => batchDone[key] !== undefined).map(key => [key, batchDone[key]]));
      let stats = {};
      if (existsSync(temporary + '.stats.json')) {
        const statsFile = `${stem}.stats.json`, statsSha256 = fileDigest(temporary + '.stats.json').sha256;
        const statsFd = openSync(temporary + '.stats.json', 'r');
        try { fsyncSync(statsFd); } finally { closeSync(statsFd); }
        renameSync(temporary + '.stats.json', join(batchesDir, statsFile));
        stats = {statsFile, statsSha256};
      }
      const receipt = {protocolVersion: 1, manifestHash, start, count, file: filename, ...verified, ...resourceStats, ...stats, completedAt: iso()};
      atomicJson(join(batchesDir, `${stem}.receipt.json`), receipt);
      renameSync(temporary, finalPath); syncDirectory(batchesDir); syncDirectory(pendingDir);
      completedBatches.push(receipt); completedBatches.sort((a, b) => a.start - b.start);
      currentRun = null; commandCount = 0; lastCommand = null; tracePath = null;
      persistCheckpoint(); persistProgress('running');
      for (const name of readdirSync(pendingDir)) rmSync(join(pendingDir, name));
      checkDisk();
    }
    requireThat(completedRuns() === manifest.totalSeeds * 3, 'BATCH_ROWS', 'Final run count is incomplete');
    persistCheckpoint(); persistProgress('completed');
    if (existsSync(join(outputDir, 'failure.json'))) {
      renameSync(join(outputDir, 'failure.json'), join(interruptedDir, `failure-${Date.now()}-${randomUUID()}.json`));
    }
    return {completedRuns: completedRuns(), completedBatches: completedBatches.length, manifestHash};
  } catch (error) {
    closeTrace(); closeEvidence();
    if (error.run && activeEvidencePath && existsSync(activeEvidencePath)) {
      for (const run of jsonLines(activeEvidencePath)) {
        if (run.seedIndex === error.run.seedIndex && run.strategy === error.run.strategy) {
          currentRun = run; commandCount = run.commands; tracePath = run.tracePath; lastCommand = null;
          for (const event of jsonLines(tracePath)) if (event.type === 'command') lastCommand = {commandIndex: event.commandIndex, command: event.command};
          break;
        }
      }
    }
    // A competing invocation must never modify the active supervisor's output.
    if (!releaseLock) throw error;
    let workerFailure = null;
    if (childFailurePath && existsSync(childFailurePath)) {
      try { workerFailure = statSync(childFailurePath).size <= 16 * 1024 * 1024 ? parseJson(childFailurePath) : {externalArtifact: true, ...fileDigest(childFailurePath)}; }
      catch (readError) { workerFailure = {readError: readError.message}; }
    }
    atomicJsonWithCommands(join(outputDir, 'failure.json'), {
      protocolVersion: 1, failedAt: iso(), manifest, manifestHash, error: serializeError(error),
      currentRun: currentRun || lastRun, commandCount, lastCommand, protocolEvidence, tracePath, completedRuns: completedRuns(),
      completedBatches, elapsedMs: elapsedMs(), workerFailurePath: workerFailure ? childFailurePath : null, workerFailure,
      workerResources, diskBytes, resourceBudget: manifest ? {workerTimeoutMs: manifest.workerTimeoutMs, maxRssMiB: manifest.maxRssMiB, maxOldSpaceMiB: 256, maxDiskMiB: manifest.maxDiskMiB ?? null} : null,
    }, tracePath && existsSync(tracePath) ? tracePath : null);
    persistProgress(error.code === 'INTERRUPTED' ? 'interrupted' : 'failed', {error: serializeError(error)});
    throw error;
  } finally {
    process.off('SIGTERM', onTerm); process.off('SIGINT', onInt);
    if (releaseLock) await releaseLock();
  }
}

function parseArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--resume') { options.resume = true; continue; }
    const name = {'--manifest': 'manifestPath', '--output': 'outputDir', '--worker': 'workerPath'}[arg];
    requireThat(name && argv[i + 1] && !argv[i + 1].startsWith('--'), 'USAGE', `Invalid argument: ${arg}. Usage: supervisor.mjs --manifest FILE --output DIR [--resume] [--worker TEST_WORKER]`);
    requireThat(!(name in options), 'USAGE', `Duplicate argument: ${arg}`); options[name] = argv[++i];
  }
  return options;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  supervise(parseArguments(process.argv.slice(2))).then(
    result => process.stdout.write(JSON.stringify({type: 'scanDone', ...result}) + '\n'),
    error => { process.stderr.write(`${error.code || 'SUPERVISOR_ERROR'}: ${error.message}\n`); process.exitCode = error.code === 'INTERRUPTED' ? 130 : 1; },
  );
}
