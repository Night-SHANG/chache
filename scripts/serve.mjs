import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
const root=resolve('build/browser');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.wav':'audio/wav','.json':'application/json'};
createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const path=resolve(root,`.${relative==='/'?'/index.html':relative}`);if(path!==root&&!path.startsWith(root+'/'))throw Error('Denied');const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(4173,'127.0.0.1',()=>console.log('Local-only browser preview: http://127.0.0.1:4173'));
