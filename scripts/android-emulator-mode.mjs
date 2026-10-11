import {constants} from 'node:fs';
import {access,lstat,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function selectEmulatorMode(probe){
 const accelerated=probe.kvmPresent===true&&probe.kvmReadable===true&&probe.kvmWritable===true&&probe.accelCheckExitCode===0&&probe.accelCheckTimedOut!==true;
 const mode=accelerated?'hardware-accelerated':'software-tcg';
 const reason=accelerated?'Existing KVM access and official acceleration probe succeeded':!probe.kvmPresent?'KVM device absent; permissions unchanged':!probe.kvmReadable||!probe.kvmWritable?'KVM device is not readable/writable; permissions unchanged':probe.accelCheckTimedOut?'Official acceleration probe timed out':'Official acceleration probe unavailable or unsuccessful';
 return {schema:1,mode,accelerationMode:accelerated?'on':'off',bootTimeoutSeconds:accelerated?360:900,maxLaunchAttempts:1,softwareModeUnsupported:!accelerated,softwareModeVerySlow:!accelerated,phonePerformanceRepresentative:false,reason,probe,performanceContext:{executionTarget:'disposable-emulator',emulationMode:mode,unsupportedSoftwareMode:!accelerated,phonePerformanceRepresentative:false,scope:'Functional, storage recovery and upgrade evidence only; measured emulator timings retain original gates and do not establish phone performance'},officialReference:'https://developer.android.com/studio/run/emulator-commandline'};
}
export async function probeEmulatorMode(emulator,logPath,reportPath){
 const permitted=async mask=>access('/dev/kvm',mask).then(()=>true,()=>false);
 const probe={kvmPresent:await lstat('/dev/kvm').then(()=>true,()=>false),kvmReadable:await permitted(constants.R_OK),kvmWritable:await permitted(constants.W_OK),accelCheckExitCode:null,accelCheckTimedOut:false};
 let log='Official acceleration probe not run: KVM is absent or inaccessible; no permission change attempted.\n';
 if(probe.kvmPresent&&probe.kvmReadable&&probe.kvmWritable){
  const result=spawnSync(emulator,['-accel-check'],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
  probe.accelCheckExitCode=result.status;probe.accelCheckTimedOut=result.error?.code==='ETIMEDOUT';log=(result.stdout??'')+(result.stderr??'')+(result.error?`\n${result.error.message}\n`:'');
 }
 const mode=selectEmulatorMode(probe);await writeFile(logPath,log);await writeFile(reportPath,JSON.stringify(mode,null,2)+'\n');return mode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [emulator,logPath,reportPath]=process.argv.slice(2);if(!emulator||!logPath||!reportPath)throw Error('Usage: android-emulator-mode.mjs <official-emulator> <probe-log> <mode-report>');
 const mode=await probeEmulatorMode(emulator,logPath,reportPath);console.log(mode.mode);console.log(mode.bootTimeoutSeconds);
}
