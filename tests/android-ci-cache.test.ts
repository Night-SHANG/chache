import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink, lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

type Env = NodeJS.ProcessEnv;
type CacheApi = {
 initCiCaches: (env: Env) => Promise<{env: Env; root: string}>;
 releaseCiCaches: (options: {env: Env; projectRoot: string}) => Promise<{
  freeBeforeBytes: number; freeAfterBytes: number; allocatedBeforeBytes: number;
  allocatedAfterBytes: number; releasedAllocatedBytes: number; gradleStop: {exitCode: number};
 }>;
 measureCiSpace: (options: {env: Env; projectRoot: string; stage: string}) => Promise<{freeBytes: number; availableBytes: number; stage: string}>;
};
const api = await import(new URL('../scripts/android-ci-cache.mjs', import.meta.url).href).catch(() => null) as CacheApi | null;
const script = new URL('../scripts/android-ci-cache.mjs', import.meta.url).pathname;
const markerName = '.android-ci-cache-owner.json';
async function fixture() {
 const base = await mkdtemp(join(tmpdir(), 'android-ci-cache-test-'));
 const home = join(base, 'home'), runnerTemp = join(base, 'runner-temp'), projectRoot = join(base, 'project');
 await Promise.all([mkdir(join(home, '.android'), {recursive: true}), mkdir(runnerTemp), mkdir(join(projectRoot, 'android'), {recursive: true})]);
 await writeFile(join(home, '.android', 'debug.keystore'), 'untouched debug signing key');
 const stopRecord = join(base, 'stop-record');
 await writeFile(join(projectRoot, 'android', 'gradlew'), '#!/bin/sh\nprintf "%s\\n%s\\n" "$*" "$GRADLE_USER_HOME" > "$ANDROID_CI_STOP_RECORD"\nexit "${ANDROID_CI_STOP_EXIT:-0}"\n');
 const env: Env = {...process.env, HOME: home, RUNNER_TEMP: runnerTemp, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'android', ANDROID_CI_STOP_RECORD: stopRecord};
 delete env.ANDROID_CI_CACHE_ROOT; delete env.ANDROID_CI_CACHE_TOKEN; delete env.GRADLE_USER_HOME; delete env.npm_config_cache; delete env.NPM_CONFIG_CACHE;
 return {base, home, runnerTemp, projectRoot, stopRecord, env, cleanup: () => rm(base, {recursive: true, force: true})};
}
async function exists(path: string) { return lstat(path).then(() => true, () => false); }
async function populated(env: Env) {
 const gradle = env.GRADLE_USER_HOME!, npm = env.npm_config_cache!;
 for (const path of [join(gradle, 'caches', '8.14.3', 'cached.bin'), join(gradle, 'wrapper', 'dists', 'gradle-8.14.3', 'distribution.zip'), join(npm, '_cacache', 'package.bin')]) {
  await mkdir(join(path, '..'), {recursive: true}); await writeFile(path, Buffer.alloc(128 * 1024, 1));
 }
 await writeFile(join(gradle, 'gradle.properties'), 'preserve config');
 return {gradle, npm};
}

test('init makes unique current-job-owned Gradle and npm homes under existing runner temp', async () => {
 assert.ok(api, 'Android CI cache resource helper is missing');
 const f = await fixture();
 try {
  const first = await api.initCiCaches(f.env), second = await api.initCiCaches(f.env);
  assert.notEqual(first.root, second.root);
  assert.ok(first.root.startsWith(f.runnerTemp + '/android-ci-cache-'));
  assert.equal(first.env.GRADLE_USER_HOME, join(first.root, 'gradle'));
  assert.equal(first.env.npm_config_cache, join(first.root, 'npm'));
  assert.equal(first.env.NPM_CONFIG_CACHE, first.env.npm_config_cache);
  assert.ok(first.env.ANDROID_CI_CACHE_TOKEN);
  const marker = JSON.parse(await readFile(join(first.root, markerName), 'utf8'));
  assert.equal(marker.job.runId, '123'); assert.equal(marker.job.attempt, '1'); assert.equal(marker.job.job, 'android');
  assert.equal(await readFile(join(f.home, '.android', 'debug.keystore'), 'utf8'), 'untouched debug signing key');
 } finally { await f.cleanup(); }
});

test('release stops only the dedicated Gradle home and deletes only re-downloadable caches', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  const {gradle, npm} = await populated(env);
  const apk = join(f.projectRoot, 'android', 'app', 'build', 'outputs', 'app-debug.apk');
  await mkdir(join(apk, '..'), {recursive: true}); await writeFile(apk, 'preserve apk');
  const report = await api.releaseCiCaches({env, projectRoot: f.projectRoot});
  assert.equal(report.gradleStop.exitCode, 0);
  assert.equal(await readFile(f.stopRecord, 'utf8'), `--gradle-user-home ${gradle} --stop\n${gradle}\n`);
  assert.equal(await exists(join(gradle, 'caches')), false);
  assert.equal(await exists(join(gradle, 'wrapper', 'dists')), false);
  assert.equal(await exists(join(npm, '_cacache')), false);
  assert.equal(await exists(npm), true);
  assert.equal(await readFile(join(gradle, 'gradle.properties'), 'utf8'), 'preserve config');
  assert.equal(await readFile(apk, 'utf8'), 'preserve apk');
  assert.equal(await readFile(join(f.home, '.android', 'debug.keystore'), 'utf8'), 'untouched debug signing key');
  assert.ok(report.allocatedBeforeBytes >= 3 * 128 * 1024);
  assert.ok(report.allocatedAfterBytes < report.allocatedBeforeBytes);
  assert.equal(report.releasedAllocatedBytes, report.allocatedBeforeBytes - report.allocatedAfterBytes);
  assert.ok(Number.isSafeInteger(report.freeBeforeBytes) && report.freeBeforeBytes > 0);
  assert.ok(Number.isSafeInteger(report.freeAfterBytes) && report.freeAfterBytes > 0);
  assert.deepEqual(JSON.parse(await readFile(join(f.projectRoot, 'build', 'android-ci', 'cache-report.json'), 'utf8')), report);
 } finally { await f.cleanup(); }
});

test('a failed Gradle stop refuses cache deletion and records observed failure', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env, ANDROID_CI_STOP_EXIT: '3'};
  const {gradle, npm} = await populated(env);
  await assert.rejects(api.releaseCiCaches({env, projectRoot: f.projectRoot}), /Gradle.*stop.*failed/i);
  assert.ok(await exists(join(gradle, 'caches'))); assert.ok(await exists(join(npm, '_cacache')));
  const report = JSON.parse(await readFile(join(f.projectRoot, 'build', 'android-ci', 'cache-report.json'), 'utf8'));
  assert.equal(report.gradleStop.exitCode, 3); assert.equal(report.releasedAllocatedBytes, 0);
 } finally { await f.cleanup(); }
});

test('release waits for a daemon PID recorded only in the dedicated home to exit', async () => {
 assert.ok(api); const f = await fixture();
 const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600)'], {stdio: 'ignore'});
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  await populated(env);
  const daemon = join(env.GRADLE_USER_HOME!, 'daemon', '8.14.3'); await mkdir(daemon, {recursive: true});
  await writeFile(join(daemon, `daemon-${child.pid}.out.log`), 'test-owned daemon PID fixture');
  const report = await api.releaseCiCaches({env, projectRoot: f.projectRoot});
  assert.equal(report.gradleStop.exitCode, 0);
  assert.equal(child.exitCode, 0);
 } finally { if (child.exitCode === null) child.kill(); await f.cleanup(); }
});

test('release refuses missing stale or unowned marker credentials before invoking Gradle', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  for (const bad of [{...env, ANDROID_CI_CACHE_TOKEN: undefined}, {...env, ANDROID_CI_CACHE_TOKEN: 'wrong'}, {...env, GITHUB_RUN_ID: 'previous'}, {...env, GITHUB_RUN_ATTEMPT: '2'}, {...env, GITHUB_JOB: 'other'}]) {
   await assert.rejects(api.releaseCiCaches({env: bad, projectRoot: f.projectRoot}), /owner|owned|job|token/i);
  }
  await rm(join(owned.root, markerName));
  await assert.rejects(api.releaseCiCaches({env, projectRoot: f.projectRoot}), /owner|marker/i);
  assert.equal(await exists(f.stopRecord), false);
 } finally { await f.cleanup(); }
});

test('release refuses default home signing outside missing and mismatched cache paths', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  for (const bad of [
   {...env, ANDROID_CI_CACHE_ROOT: f.home}, {...env, ANDROID_CI_CACHE_ROOT: join(f.home, '.android')},
   {...env, ANDROID_CI_CACHE_ROOT: join(f.base, 'outside')}, {...env, ANDROID_CI_CACHE_ROOT: join(f.runnerTemp, 'missing')},
   {...env, GRADLE_USER_HOME: join(f.home, '.gradle')}, {...env, npm_config_cache: join(f.home, '.npm')},
   {...env, NPM_CONFIG_CACHE: join(f.home, '.npm')}
  ]) await assert.rejects(api.releaseCiCaches({env: bad, projectRoot: f.projectRoot}));
  assert.equal(await exists(f.stopRecord), false);
  assert.equal(await readFile(join(f.home, '.android', 'debug.keystore'), 'utf8'), 'untouched debug signing key');
 } finally { await f.cleanup(); }
});

test('release refuses JVM options that override the dedicated Gradle home before invoking Gradle', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  for (const option of ['GRADLE_OPTS', 'JAVA_OPTS', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS']) {
   await assert.rejects(api.releaseCiCaches({env: {...env, [option]: `-Xmx512m -Dgradle.user.home=${f.home}/.gradle`}, projectRoot: f.projectRoot}), /override/i);
  }
  assert.equal(await exists(f.stopRecord), false);
 } finally { await f.cleanup(); }
});

test('release rejects symlinked roots marker and cache descendants without following or partially deleting', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  const {gradle, npm} = await populated(env);
  const alias = join(f.runnerTemp, 'android-ci-cache-alias'); await symlink(owned.root, alias);
  await assert.rejects(api.releaseCiCaches({env: {...env, ANDROID_CI_CACHE_ROOT: alias}, projectRoot: f.projectRoot}), /symlink|canonical/i);
  await symlink(join(f.home, '.android'), join(npm, 'signing-link'));
  await assert.rejects(api.releaseCiCaches({env, projectRoot: f.projectRoot}), /symlink/i);
  assert.ok(await exists(join(gradle, 'caches', '8.14.3', 'cached.bin')));
  assert.equal(await exists(f.stopRecord), false);
  await rm(join(npm, 'signing-link'));
  const marker = join(owned.root, markerName), copy = join(f.base, 'marker-copy');
  await writeFile(copy, await readFile(marker)); await rm(marker); await symlink(copy, marker);
  await assert.rejects(api.releaseCiCaches({env, projectRoot: f.projectRoot}), /symlink/i);
  assert.equal(await readFile(join(f.home, '.android', 'debug.keystore'), 'utf8'), 'untouched debug signing key');
 } finally { await f.cleanup(); }
});

test('release refuses signing-key files even if accidentally placed inside a dedicated cache', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  const {gradle, npm} = await populated(env), key = join(npm, 'accidental-debug.keystore');
  await writeFile(key, 'must never delete signing material');
  await assert.rejects(api.releaseCiCaches({env, projectRoot: f.projectRoot}), /signing/i);
  assert.equal(await readFile(key, 'utf8'), 'must never delete signing material');
  assert.ok(await exists(join(gradle, 'caches', '8.14.3', 'cached.bin')));
  assert.equal(await exists(f.stopRecord), false);
 } finally { await f.cleanup(); }
});

test('init rejects absent job identity runner temp and signing/default-home destinations', async () => {
 assert.ok(api); const f = await fixture();
 try {
  for (const bad of [{...f.env, RUNNER_TEMP: undefined}, {...f.env, RUNNER_TEMP: f.home}, {...f.env, RUNNER_TEMP: join(f.home, '.android')}, {...f.env, RUNNER_TEMP: join(f.base, 'missing')}, {...f.env, GITHUB_RUN_ID: undefined}]) {
   await assert.rejects(api.initCiCaches(bad));
  }
  const alias = join(f.base, 'runner-alias'); await symlink(f.runnerTemp, alias);
  await assert.rejects(api.initCiCaches({...f.env, RUNNER_TEMP: alias}), /symlink|canonical/i);
 } finally { await f.cleanup(); }
});

test('space observes actual available bytes with a bounded stage report and rejects report traversal', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const owned = await api.initCiCaches(f.env), env = {...f.env, ...owned.env};
  const report = await api.measureCiSpace({env, projectRoot: f.projectRoot, stage: 'post-sdk'});
  assert.equal(report.stage, 'post-sdk'); assert.ok(Number.isSafeInteger(report.freeBytes) && report.freeBytes > 0);
  assert.equal(report.availableBytes, report.freeBytes);
  assert.deepEqual(JSON.parse(await readFile(join(f.projectRoot, 'build', 'android-ci', 'space-post-sdk.json'), 'utf8')), report);
  await assert.rejects(api.measureCiSpace({env, projectRoot: f.projectRoot, stage: '../outside'}), /stage/i);
 } finally { await f.cleanup(); }
});

test('CLI init exports GitHub environment before commands and release and space write observed reports', async () => {
 assert.ok(api); const f = await fixture();
 try {
  const githubEnv = join(f.runnerTemp, 'github-env'); await writeFile(githubEnv, '');
  const init = spawnSync(process.execPath, [script, 'init', '--github-env', githubEnv], {cwd: f.projectRoot, env: f.env, encoding: 'utf8'});
  assert.equal(init.status, 0, init.stderr);
  const initReport = JSON.parse(await readFile(join(f.projectRoot, 'build', 'android-ci', 'cache-init-report.json'), 'utf8'));
  assert.equal(initReport.stage, 'init'); assert.equal(initReport.job.runId, '123'); assert.ok(initReport.freeBeforeBytes > 0);
  const exported = Object.fromEntries((await readFile(githubEnv, 'utf8')).trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  const env = {...f.env, ...exported}; assert.ok(env.GRADLE_USER_HOME); assert.ok(env.npm_config_cache);
  await populated(env);
  for (const args of [['release'], ['space', 'postboot']]) {
   const run = spawnSync(process.execPath, [script, ...args], {cwd: f.projectRoot, env, encoding: 'utf8'});
   assert.equal(run.status, 0, run.stderr); assert.ok(run.stdout.includes('Bytes'));
  }
  assert.ok(await exists(join(f.projectRoot, 'build', 'android-ci', 'cache-report.json')));
  assert.deepEqual(JSON.parse(await readFile(join(f.projectRoot, 'build', 'android-ci', 'cache-init-report.json'), 'utf8')), initReport);
  assert.ok(await exists(join(f.projectRoot, 'build', 'android-ci', 'space-postboot.json')));
 } finally { await f.cleanup(); }
});
