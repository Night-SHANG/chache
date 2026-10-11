import {readFile,readdir,lstat,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const driver='io.github.nightshang.chache.DeviceAcceptanceTest#runAcceptanceAction';
const skipMessage='Requires the explicit disposable-emulator acceptance driver';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Replace Java comments and literals with whitespace before looking for declarations.
// This preserves newlines and keeps commented/quoted @Test text out of the inventory.
function declarations(text){
 let out='',state='code';
 for(let i=0;i<text.length;i++){
  const c=text[i],next=text[i+1];
  if(state==='code'){
   if(c==='/'&&next==='/'){state='line';out+='  ';i++;}
   else if(c==='/'&&next==='*'){state='block';out+='  ';i++;}
   else if(c==='"'||c==="'"){state=c;out+=' ';}
   else out+=c;
  }else if(state==='line') {if(c==='\n'){state='code';out+='\n';}else out+=' ';}
  else if(state==='block'){if(c==='*'&&next==='/'){state='code';out+='  ';i++;}else out+=c==='\n'?'\n':' ';}
  else if(c==='\\'){out+='  ';i++;}
  else if(c===state){state='code';out+=' ';}
  else out+=c==='\n'?'\n':' ';
 }
 if(state==='block'||state==='"'||state==="'")throw Error('Unterminated native Java source token');
 return out;
}

export async function nativeInventory(root){
 const tests=[],sourceFiles=[];
 async function scan(path){
  for(const entry of await readdir(join(root,path),{withFileTypes:true})){
   const name=path+'/'+entry.name,info=await lstat(join(root,name));
   if(info.isSymbolicLink())throw Error('Native inventory source symlink');
   if(entry.isDirectory())await scan(name);
   else if(entry.isFile()&&entry.name.endsWith('.java')){
    const bytes=await readFile(join(root,name)),text=declarations(bytes.toString('utf8'));
    const pkg=/\bpackage\s+([\w.]+)\s*;/.exec(text)?.[1],cls=/\bpublic class\s+(\w+)/.exec(text)?.[1];
    if(!pkg||!cls)throw Error('Native inventory class identity missing');
    const found=[...text.matchAll(/@Test(?:\([^)]*\))?\s+public void\s+(\w+)\s*\(/g)].map(m=>`${pkg}.${cls}#${m[1]}`);
    if(found.length!==[...text.matchAll(/@Test\b/g)].length)throw Error('Unsupported native @Test inventory declaration');
    tests.push(...found);sourceFiles.push({path:name,sha256:hash(bytes)});
   }
  }
 }
 await scan('android/app/src/androidTest/java');
 if(!tests.length||new Set(tests).size!==tests.length||!tests.includes(driver))throw Error('Native inventory is empty, duplicate, or driver missing');
 return {tests:tests.sort(),sourceFiles:sourceFiles.sort((a,b)=>a.path.localeCompare(b.path)),knownAssumptionSkip:{test:driver,statusCode:-4,message:skipMessage}};
}

// AndroidX InstrumentationResultPrinter emits a start(1) and one finish for each
// test. 0=pass, -1=error, -2=failure, -3=ignored, -4=assumption failure.
export function parseNativeInstrumentation(raw,{expected,exitCode,timedOut=false,allowDriverSkip=true}){
 const reasons=[],cases={},counts={tests:0,passed:0,failed:0,errors:0,skipped:0};
 let observedFailure=false;
 const reject=(reason,failed=false)=>{reasons.push(reason);observedFailure ||= failed;};
 if(!Array.isArray(expected)||!expected.length||new Set(expected).size!==expected.length||expected.some(k=>!/^\w+(?:\.\w+)+#\w+$/.test(k)))return {status:'blocked',reasons:['Invalid expected native inventory'],counts,cases};
 const wanted=new Set(expected),started=new Set(),currentIds=new Set();
 let packet={},lastKey=null,active=null,finalCode=null,finalSeen=false,completionText='',resultStream=false,resultStreamCount=0;
 for(const line of String(raw).replaceAll('\r','').split('\n')){
  let m=/^INSTRUMENTATION_STATUS: ([^=]+)=(.*)$/.exec(line);
  if(m){
   if(finalSeen)reject('Test status after instrumentation completion');
   if(Object.hasOwn(packet,m[1]))reject('Duplicate status field '+m[1]);
   if(m[1]==='Error')reject('Native instrumentation error status: '+m[2],true);
   packet[m[1]]=m[2];lastKey=m[1];resultStream=false;continue;
  }
  m=/^INSTRUMENTATION_STATUS_CODE: (-?\d+)$/.exec(line);
  if(m){
   const code=Number(m[1]),key=packet.class+'#'+packet.test,current=Number(packet.current);
   if(finalSeen)reject('Status code after completion');
   if(!wanted.has(key))reject('Unexpected native test '+key);
   if(packet.id!=='AndroidJUnitRunner'||packet.numtests!==String(expected.length)||!/^\d+$/.test(packet.current??'')||current<1||current>expected.length)reject('Native count/current/runner mismatch '+key);
   if(code===1){
    if(active||started.has(key)||currentIds.has(current)||current!==started.size+1)reject('Duplicate or out-of-order native start '+key);
    started.add(key);currentIds.add(current);active={key,current};
   }else{
    if(!active||active.key!==key||active.current!==current||Object.hasOwn(cases,key))reject('Missing/duplicate/mismatched native completion '+key);
    let status='blocked';
    if(code===0){status='passed';counts.passed++;if(packet.stack)reject('Passing native result has failure stack '+key);}
    else if(code===-1){status='failed';counts.errors++;reject('Native test error '+key,true);}
    else if(code===-2){status='failed';counts.failed++;reject('Native test failure '+key,true);}
    else if(code===-4&&allowDriverSkip&&key===driver&&/^org[.]junit[.](?:internal[.])?AssumptionViolatedException: Requires the explicit disposable-emulator acceptance driver(?:\n|$)/.test(packet.stack??'')){status='skipped';counts.skipped++;}
    else {if(code===-3||code===-4){status='skipped';counts.skipped++;}reject('Forbidden skip or unknown native outcome '+key+' '+code);}
    counts.tests++;cases[key]={status,statusCode:code,current,stack:packet.stack??null};active=null;
   }
   packet={};lastKey=null;resultStream=false;continue;
  }
  m=/^INSTRUMENTATION_RESULT: ([^=]+)=(.*)$/.exec(line);
  if(m){if(Object.keys(packet).length)reject('Unterminated native status packet');if(m[1]==='stream'){if(++resultStreamCount!==1)reject('Duplicate final result stream');resultStream=true;completionText+=m[2]+'\n';}else{resultStream=false;if(/shortMsg|longMsg/.test(m[1]))reject('Instrumentation process reported '+m[1]+': '+m[2],true);}lastKey=null;continue;}
  m=/^INSTRUMENTATION_CODE: (-?\d+)$/.exec(line);
  if(m){if(finalSeen)reject('Duplicate instrumentation completion');finalCode=Number(m[1]);finalSeen=true;resultStream=false;lastKey=null;continue;}
  if(/^INSTRUMENTATION_(?:FAILED|ABORTED)|FAILURES!!!|Process crashed|INSTRUMENTATION_STATUS: Error=/.test(line))reject('Instrumentation failure marker '+line,true);
  if(lastKey!==null)packet[lastKey]+='\n'+line;
  else if(resultStream)completionText+=line+'\n';
  else if(finalSeen&&line.trim())reject('Unexpected output after instrumentation completion');
 }
 if(allowDriverSkip&&expected.includes(driver)&&cases[driver]?.status!=='skipped')reject('Generic invocation did not report the exact driver-only assumption skip');
 if(active||Object.keys(packet).length)reject('Native invocation has an unfinished test');
 if(started.size!==expected.length||counts.tests!==expected.length||expected.some(key=>!Object.hasOwn(cases,key)))reject('Native expected set was not fully executed');
 if(!finalSeen||finalCode!==-1)reject('Instrumentation completion code missing or unsuccessful');
 const summaries=[...completionText.matchAll(/^OK \((\d+) tests?\)$/gm)];
 if(summaries.length!==1||Number(summaries[0][1])!==expected.length||/FAILURES!!!/.test(completionText))reject('Native final completed test count missing or mismatched');
 if(!Number.isInteger(exitCode)||exitCode!==0||timedOut)reject('adb shell/process did not complete successfully'+(timedOut?' (timeout)':''),Number.isInteger(exitCode)&&exitCode!==0||timedOut===true);
 const status=reasons.length?(observedFailure?'failed':'blocked'):'passed';
 return {schema:1,status,expected:[...expected],counts,cases,reasons,commandExitCode:exitCode,timedOut,completionCode:finalCode,knownDriverSkipDoesNotProveAcceptance:counts.skipped===1};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [rawPath,manifestPath,output,exit]=process.argv.slice(2);
 if(!rawPath||!manifestPath||!output||!/^\d+$/.test(exit??''))throw Error('Usage: android-native-instrumentation.mjs raw-log manifest report command-exit');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8')),raw=await readFile(rawPath,'utf8');
 const report={...parseNativeInstrumentation(raw,{expected:manifest.inventory.tests,exitCode:Number(exit),timedOut:['124','137'].includes(exit)}),rawLog:{path:rawPath.split('/').at(-1),sha256:hash(raw),bytes:Buffer.byteLength(raw)}};
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
 console.log(`Native inventory ${report.status}: ${report.counts.tests}/${manifest.inventory.tests.length} completions`);
 if(report.status!=='passed')process.exitCode=report.status==='blocked'?78:1;
}
