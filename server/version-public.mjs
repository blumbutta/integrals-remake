import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Every entry point and nested module uses one release token. This prevents a
// cached stylesheet or dependency from being paired with a newer game page.
export function versionPublic(directory){
  const root=resolve(directory);
  const modules=[...readdirSync(root).filter(f=>f.endsWith('.mjs')),...readdirSync(resolve(root,'shared')).filter(f=>f.endsWith('.mjs')).map(f=>`shared/${f}`)].sort();
  const styles=readdirSync(root).filter(file=>file.endsWith('.css')).sort();
  const files=['index.html',...styles,...modules];
  const original=new Map(files.map(file=>[file,readFileSync(resolve(root,file),'utf8')]));
  const hash=createHash('sha256');
  for(const [file,content]of original)hash.update(file+'\0'+content+'\0');
  const version=hash.digest('hex').slice(0,16);
  for(const file of modules){
    const source=original.get(file).replace(/(\bfrom\s*['"])(\.{1,2}\/[^'"?]+\.mjs)(['"])/g,`$1$2?v=${version}$3`);
    writeFileSync(resolve(root,file),source);
  }
  const html=original.get('index.html').replace(/(href=['"]\.\/[^'"?]+\.css)(['"])/g,`$1?v=${version}$2`).replace(/(src=['"]\.\/app\.mjs)(['"])/,`$1?v=${version}$2`);
  writeFileSync(resolve(root,'index.html'),html);
  return version;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  console.log(`Public release: ${versionPublic(process.argv[2]||'public')}`);
}
