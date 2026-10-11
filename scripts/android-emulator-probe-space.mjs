import {constants} from 'node:fs';
import {access,lstat,statfs,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const requiredAvailableBytes=Math.ceil(6*1024**3*1.2)+512*1024**2;
export function selectProbeVolume(volumes){
 return volumes.filter(v=>v.writable===true&&Number.isFinite(v.availableBytes)&&v.availableBytes>=requiredAvailableBytes).sort((a,b)=>b.availableBytes-a.availableBytes)[0]??null;
}
export async function measureProbeVolumes(workspace,runnerTemp){
 const paths=[...new Set([workspace,runnerTemp,'/mnt'].filter(Boolean))];
 return Promise.all(paths.map(async path=>{
  try{
   const metadata=await lstat(path);if(!metadata.isDirectory()||metadata.isSymbolicLink())throw Error('Not an existing plain directory');
   const filesystem=await statfs(path,{bigint:true});const availableBytes=Number(filesystem.bavail*filesystem.bsize);
   const writable=await access(path,constants.W_OK|constants.X_OK).then(()=>true,()=>false);
   return {path,writable,availableBytes,filesystemDevice:metadata.dev,reason:writable?'Existing directory is writable; no permissions changed':'Existing directory is not writable; permissions unchanged'};
  }catch(error){return {path,writable:false,availableBytes:0,reason:error.message};}
 }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=process.argv[2];if(!report)throw Error('Usage: android-emulator-probe-space.mjs <space-report>');
 const volumes=await measureProbeVolumes(process.cwd(),process.env.RUNNER_TEMP),selected=selectProbeVolume(volumes);
 await writeFile(report,JSON.stringify({schema:1,measuredAt:new Date().toISOString(),minimumUserdataBytes:6*1024**3,officialSafetyFactor:1.2,additionalHeadroomBytes:512*1024**2,requiredAvailableBytes,volumes,selected:selected?.path??null,permissionChanges:false},null,2)+'\n');
 if(selected)console.log(selected.path);
}
