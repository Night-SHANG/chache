import {appendFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, statfs, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const MARKER = '.android-ci-cache-owner.json';
const uid = () => process.getuid?.();
const within = (parent, path) => { const part = relative(parent, path); return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); };
function required(env, name) {
 const value = env[name];
 if (typeof value !== 'string' || !value || /[\r\n\0]/.test(value)) throw Error(`Missing or invalid ${name} for current-job-owned caches`);
 return value;
}
function jobIdentity(env) {
 return {runId: required(env, 'GITHUB_RUN_ID'), attempt: required(env, 'GITHUB_RUN_ATTEMPT'), job: required(env, 'GITHUB_JOB')};
}
async function canonicalDirectory(path, label) {
 if (!isAbsolute(path) || resolve(path) !== path) throw Error(`${label} must be an absolute canonical directory`);
 const info = await lstat(path).catch(() => { throw Error(`${label} directory is missing`); });
 if (info.isSymbolicLink() || !info.isDirectory() || await realpath(path) !== path) throw Error(`${label} directory must be canonical, with no symlink`);
 return path;
}
function protectPath(path, env) {
 const home = resolve(required(env, 'HOME'));
 const protectedRoots = [join(home, '.android'), join(home, '.gradle'), join(home, '.npm'), env.ANDROID_HOME, env.ANDROID_SDK_ROOT].filter(Boolean).map(path => resolve(path));
 if (path === home || path === sep || protectedRoots.some(root => path === root || within(root, path) || within(path, root))) {
  throw Error('Refusing default-home, signing, or SDK cache destination');
 }
}
async function runnerDirectory(env) {
 const path = required(env, 'RUNNER_TEMP');
 protectPath(path, env);
 return canonicalDirectory(path, 'RUNNER_TEMP');
}
async function inspectTree(path, optional = false) {
 const info = await lstat(path).catch(error => { if (optional && error.code === 'ENOENT') return null; throw error; });
 if (!info) return 0;
 if (/\.(?:keystore|jks|p12|pfx)$/i.test(basename(path)) || basename(path) === '.android') throw Error(`Refusing signing material in owned caches: ${path}`);
 if (info.isSymbolicLink()) throw Error(`Refusing symlink in owned caches: ${path}`);
 if (uid() === undefined || info.uid !== uid()) throw Error(`Cache path is not owned by current user: ${path}`);
 if (!info.isDirectory() && !info.isFile()) throw Error(`Refusing unexpected cache file type: ${path}`);
 let bytes = info.blocks * 512;
 if (info.isDirectory()) {
  for (const entry of await readdir(path)) bytes += await inspectTree(join(path, entry));
 }
 return bytes;
}
async function ownedCaches(env) {
 const runnerTemp = await runnerDirectory(env), job = jobIdentity(env);
 const root = await canonicalDirectory(required(env, 'ANDROID_CI_CACHE_ROOT'), 'Cache owner root');
 protectPath(root, env);
 if (dirname(root) !== runnerTemp || !/^android-ci-cache-[A-Za-z0-9]{6}$/.test(basename(root))) throw Error('Cache owner root is outside the unique RUNNER_TEMP scope');
 const markerPath = join(root, MARKER);
 const markerInfo = await lstat(markerPath).catch(() => { throw Error('Cache owner marker is missing'); });
 if (markerInfo.isSymbolicLink() || !markerInfo.isFile()) throw Error('Cache owner marker must be a regular file, never a symlink');
 if (uid() === undefined || markerInfo.uid !== uid()) throw Error('Cache owner marker is unowned');
 const marker = JSON.parse(await readFile(markerPath, 'utf8'));
 if (marker.schema !== 1 || marker.root !== root || marker.runnerTemp !== runnerTemp || marker.uid !== uid() || marker.token !== required(env, 'ANDROID_CI_CACHE_TOKEN') || JSON.stringify(marker.job) !== JSON.stringify(job)) {
  throw Error('Cache owner marker/token does not match the current job');
 }
 const gradle = join(root, 'gradle'), npm = join(root, 'npm');
 if (env.GRADLE_USER_HOME !== gradle || env.npm_config_cache !== npm || env.NPM_CONFIG_CACHE !== npm) throw Error('Dedicated owned Gradle/npm environment paths do not match the owner marker');
 for (const option of ['GRADLE_OPTS', 'JAVA_OPTS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS']) {
  if (/-Dgradle\.user\.home(?:=|\s|$)/.test(env[option] ?? '')) throw Error(`Refusing ${option} override of the dedicated Gradle home`);
 }
 await canonicalDirectory(gradle, 'Owned Gradle home'); await canonicalDirectory(npm, 'Owned npm cache');
 // Validate every entry before running Gradle or deleting even the first cache.
 // Never descend into a symlink. Producers must be idle during release.
 await inspectTree(root);
 return {root, runnerTemp, gradle, npm, job};
}
async function freeBytes(path) {
 const fs = await statfs(path, {bigint: true}), value = fs.bavail * fs.bsize;
 if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Available disk byte count is outside safe integer range');
 return Number(value);
}
async function reportPath(projectRoot, name) {
 await canonicalDirectory(projectRoot, 'Repository root');
 for (const part of [join(projectRoot, 'build'), join(projectRoot, 'build', 'android-ci')]) {
  await mkdir(part).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await canonicalDirectory(part, 'CI report directory');
 }
 const path = join(projectRoot, 'build', 'android-ci', name);
 const existing = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
 if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw Error('CI report target must be a regular file, never a symlink');
 return path;
}
async function writeReport(path, report) { await writeFile(path, JSON.stringify(report, null, 2) + '\n'); }
const cacheTargets = owned => [join(owned.gradle, 'caches'), join(owned.gradle, 'wrapper', 'dists'), owned.npm];
async function allocatedBytes(owned) {
 let bytes = 0;
 for (const path of cacheTargets(owned)) bytes += await inspectTree(path, true);
 return bytes;
}
async function liveDaemonPids(gradle) {
 const daemon = join(gradle, 'daemon'), pids = [];
 if (!(await lstat(daemon).catch(() => null))) return pids;
 for (const version of await readdir(daemon, {withFileTypes: true})) {
  if (!version.isDirectory()) continue;
  for (const entry of await readdir(join(daemon, version.name))) {
   const match = /^daemon-([1-9]\d*)\.out\.log$/.exec(entry);
   if (!match) continue;
   const pid = Number(match[1]);
   try { process.kill(pid, 0); pids.push(pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
 }
 return pids;
}

export async function initCiCaches(env = process.env) {
 const runnerTemp = await runnerDirectory(env), job = jobIdentity(env);
 const freeBeforeBytes = await freeBytes(runnerTemp);
 const root = await mkdtemp(join(runnerTemp, 'android-ci-cache-'));
 const token = randomUUID();
 await Promise.all([mkdir(join(root, 'gradle')), mkdir(join(root, 'npm'))]);
 await writeFile(join(root, MARKER), JSON.stringify({schema: 1, root, runnerTemp, uid: uid(), token, job}) + '\n', {flag: 'wx'});
 const homes = {ANDROID_CI_CACHE_ROOT: root, ANDROID_CI_CACHE_TOKEN: token, GRADLE_USER_HOME: join(root, 'gradle'), npm_config_cache: join(root, 'npm'), NPM_CONFIG_CACHE: join(root, 'npm')};
 const report = {schema: 1, stage: 'init', measuredAt: new Date().toISOString(), job, root, runnerTemp, gradleUserHome: homes.GRADLE_USER_HOME, npmCache: homes.npm_config_cache, freeBeforeBytes, freeAfterBytes: await freeBytes(runnerTemp), allocatedCacheBytes: await allocatedBytes({gradle: homes.GRADLE_USER_HOME, npm: homes.npm_config_cache})};
 return {root, env: homes, report};
}

export async function releaseCiCaches({env = process.env, projectRoot = process.cwd()} = {}) {
 const owned = await ownedCaches(env), output = await reportPath(projectRoot, 'cache-report.json');
 const android = await canonicalDirectory(join(projectRoot, 'android'), 'Android Gradle project');
 const wrapper = join(android, 'gradlew'), wrapperInfo = await lstat(wrapper);
 if (!wrapperInfo.isFile() || wrapperInfo.isSymbolicLink()) throw Error('Gradle wrapper must be a regular repository file, never a symlink');
 const report = {schema: 1, stage: 'release', measuredAt: new Date().toISOString(), job: owned.job, root: owned.root,
  targets: cacheTargets(owned), freeBeforeBytes: await freeBytes(owned.runnerTemp), freeAfterBytes: 0,
  allocatedBeforeBytes: await allocatedBytes(owned), allocatedAfterBytes: 0, releasedAllocatedBytes: 0, gradleStop: null};
 const stop = spawnSync('/bin/sh', [wrapper, '--gradle-user-home', owned.gradle, '--stop'], {
  cwd: android, env: {...env, GRADLE_USER_HOME: owned.gradle}, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024
 });
 report.gradleStop = {exitCode: stop.status, signal: stop.signal, timedOut: stop.error?.code === 'ETIMEDOUT', error: stop.error?.message ?? null, stdout: stop.stdout ?? '', stderr: stop.stderr ?? '', liveDaemonPids: []};
 if (!stop.error && stop.status === 0) {
  // Revalidate after the wrapper command, then require every PID recorded in
  // this home's daemon logs to be gone. No signal is sent to terminate a PID.
  await ownedCaches(env);
  report.gradleStop.liveDaemonPids = await liveDaemonPids(owned.gradle);
  const deadline = Date.now() + 10000;
  while (report.gradleStop.liveDaemonPids.length && Date.now() < deadline) {
   await delay(200); report.gradleStop.liveDaemonPids = await liveDaemonPids(owned.gradle);
  }
 }
 if (stop.error || stop.status !== 0 || report.gradleStop.liveDaemonPids.length) {
  report.freeAfterBytes = await freeBytes(owned.runnerTemp); report.allocatedAfterBytes = await allocatedBytes(owned);
  await writeReport(output, report);
  throw Error('Gradle daemon stop failed or an owned daemon is still alive; no caches deleted');
 }
 // Only these newly-created, job-owned, re-downloadable directories are
 // removed. npm's empty cache root is recreated for subsequent commands.
 await ownedCaches(env);
 for (const path of cacheTargets(owned)) await rm(path, {recursive: true, force: true});
 await mkdir(owned.npm);
 report.freeAfterBytes = await freeBytes(owned.runnerTemp); report.allocatedAfterBytes = await allocatedBytes(owned);
 report.releasedAllocatedBytes = report.allocatedBeforeBytes - report.allocatedAfterBytes;
 await writeReport(output, report);
 return report;
}

export async function measureCiSpace({env = process.env, projectRoot = process.cwd(), stage} = {}) {
 if (typeof stage !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(stage)) throw Error('Invalid CI space report stage');
 const owned = await ownedCaches(env), output = await reportPath(projectRoot, `space-${stage}.json`);
 const availableBytes = await freeBytes(owned.runnerTemp);
 const report = {schema: 1, stage, measuredAt: new Date().toISOString(), path: owned.runnerTemp, freeBytes: availableBytes, availableBytes, allocatedCacheBytes: await allocatedBytes(owned)};
 await writeReport(output, report); return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'init' && args.length === 2 && args[0] === '--github-env') {
   const runnerTemp = await runnerDirectory(process.env), envPath = args[1];
   if (!isAbsolute(envPath) || resolve(envPath) !== envPath || !within(runnerTemp, envPath) || await realpath(envPath) !== envPath) throw Error('GitHub environment file must already exist canonically under RUNNER_TEMP');
   const info = await lstat(envPath);
   if (!info.isFile() || info.isSymbolicLink() || info.uid !== uid()) throw Error('GitHub environment file must be an owned regular file');
   const output = await reportPath(process.cwd(), 'cache-init-report.json');
   const owned = await initCiCaches();
   await appendFile(envPath, Object.entries(owned.env).map(([name, value]) => `${name}=${value}\n`).join(''));
   await writeReport(output, owned.report); console.log(JSON.stringify(owned.report));
  } else if (command === 'release' && args.length === 0) console.log(JSON.stringify(await releaseCiCaches()));
  else if (command === 'space' && args.length === 1) console.log(JSON.stringify(await measureCiSpace({stage: args[0]})));
  else throw Error('Usage: android-ci-cache.mjs init --github-env "$GITHUB_ENV" | release | space <stage> (from repository root)');
 } catch (error) { console.error(error.message); process.exitCode = 1; }
}
