import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep, extname } from 'node:path';
import { createIntegralsHandler } from './router.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const api=createIntegralsHandler({dbPath:process.env.INTEGRALS_DB_PATH||resolve(root,'.data/integrals-dev.sqlite')});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};
const server=createServer((req,res)=>{
  if(api.handle(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/integrals-remake')path='/';else if(path.startsWith('/integrals-remake/'))path=path.slice('/integrals-remake'.length);
    if(path==='/'||path.endsWith('/'))path+='index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root+sep)||path.split('/').some(part=>part.startsWith('.')||part==='server')||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end();}
});
const port=Number(process.env.PORT||4180);
server.listen(port,'127.0.0.1',()=>console.log(`Integrals: Remake — http://127.0.0.1:${port}/`));
let closing=false;function close(){if(closing)return;closing=true;server.close(()=>{api.close();});server.closeIdleConnections();}
process.on('SIGTERM',close);process.on('SIGINT',close);
