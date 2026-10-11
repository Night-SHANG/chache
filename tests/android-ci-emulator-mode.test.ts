import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const modes=await import(new URL('../scripts/android-emulator-mode.mjs',import.meta.url).href).catch(()=>null) as null|{selectEmulatorMode:(probe:{kvmPresent:boolean;kvmReadable:boolean;kvmWritable:boolean;accelCheckExitCode:number|null;accelCheckTimedOut?:boolean})=>{mode:string;accelerationMode:string;bootTimeoutSeconds:number;softwareModeUnsupported:boolean;phonePerformanceRepresentative:boolean;maxLaunchAttempts:number;reason:string}};
test('usable KVM and successful official acceleration probe preserve the accelerated route',()=>{
 assert.ok(modes,'Emulator mode policy is missing');
 const mode=modes.selectEmulatorMode({kvmPresent:true,kvmReadable:true,kvmWritable:true,accelCheckExitCode:0});
 assert.equal(mode.mode,'hardware-accelerated');assert.equal(mode.accelerationMode,'on');assert.equal(mode.bootTimeoutSeconds,360);assert.equal(mode.softwareModeUnsupported,false);assert.equal(mode.maxLaunchAttempts,1);
});
test('missing inaccessible or unusable KVM permits exactly one explicit unsupported software attempt',()=>{
 assert.ok(modes);
 for(const probe of [
  {kvmPresent:false,kvmReadable:false,kvmWritable:false,accelCheckExitCode:null},
  {kvmPresent:true,kvmReadable:true,kvmWritable:false,accelCheckExitCode:null},
  {kvmPresent:true,kvmReadable:true,kvmWritable:true,accelCheckExitCode:1},
  {kvmPresent:true,kvmReadable:true,kvmWritable:true,accelCheckExitCode:null,accelCheckTimedOut:true}
 ]){
  const mode=modes.selectEmulatorMode(probe);assert.equal(mode.mode,'software-tcg');assert.equal(mode.accelerationMode,'off');assert.equal(mode.bootTimeoutSeconds,900);assert.equal(mode.softwareModeUnsupported,true);assert.equal(mode.phonePerformanceRepresentative,false);assert.equal(mode.maxLaunchAttempts,1);assert.ok(mode.reason);
 }
});
test('software launch opts into official TCG without security or license mutations and retains original gates',async()=>{
 const script=await readFile(new URL('../scripts/android-emulator-test.sh',import.meta.url),'utf8');
 assert.match(script,/android-emulator-mode\.mjs/);assert.match(script,/ANDROID_I_WANT_MY_TCG=yes/);assert.match(script,/-accel off/);assert.match(script,/-accel on/);
 assert.match(script,/boot_timeout/);assert.doesNotMatch(script,/sudo|chmod|chown|usermod|udev|--licenses|-selinux|yes\s*\|/);
 const workflow=await readFile(new URL('../.github/workflows/android.yml',import.meta.url),'utf8');assert.match(workflow,/timeout-minutes: 120/);assert.match(workflow,/build\/android-ci\/emulator-mode\.json/);
 const driver=await readFile(new URL('../scripts/android-device-check.sh',import.meta.url),'utf8');assert.match(driver,/timeout 1500/);
 const validator=await readFile(new URL('../scripts/android-acceptance-report.mjs',import.meta.url),'utf8');assert.match(validator,/r\.gate\.p95Ms === 100 && r\.gate\.maxMs === 500/);
 const receipt=await readFile(new URL('../scripts/verify-android-build.mjs',import.meta.url),'utf8');assert.match(receipt,/performanceContext/);
});
