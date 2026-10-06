import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import * as paths from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
/** Portable containment; rejects escapes using the host's actual path separators. */
export function requestFile(root,pathname,path=paths){
 const target=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`),relative=path.relative(root,target);
 if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw Error('Denied');
 return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(paths.resolve(process.argv[1])).href){
 const root=paths.resolve('build/browser'),url='http://127.0.0.1:4173/';
 const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.wav':'audio/wav','.json':'application/json'};
 const server=createServer(async(req,res)=>{try{
  const file=requestFile(root,decodeURIComponent(new URL(req.url,url).pathname)),body=await readFile(file);
  res.writeHead(200,{'Content-Type':types[paths.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}});
 server.on('error',error=>{console.error('Preview could not start:',error.message);console.error('Close the old preview window, then try again.');process.exitCode=1;});
 server.listen(4173,'127.0.0.1',()=>{
  console.log(`Local-only browser preview: ${url}`);
  if(process.platform==='win32'&&process.argv.includes('--open')){
   const browser=spawn('cmd',['/c','start','',url],{stdio:'ignore'});browser.on('error',()=>console.log(`Open ${url} in your browser.`));
  }
 });
}
