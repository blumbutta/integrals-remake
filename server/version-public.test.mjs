import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {versionPublic} from './version-public.mjs';

test('a release versions CSS, the entry point and nested imports together; CSS-only updates invalidate all of them',()=>{
  const root=mkdtempSync(join(tmpdir(),'integrals-public-'));
  const prepare=css=>{
    writeFileSync(join(root,'index.html'),'<link href="./style.css"><link href="./layout-refresh.css"><link href="./world-events.css"><script type="module" src="./app.mjs"></script>');
    writeFileSync(join(root,'style.css'),css);
    writeFileSync(join(root,'layout-refresh.css'),'main{height:100vh}');
    writeFileSync(join(root,'world-events.css'),'dialog{color:gold}');
    writeFileSync(join(root,'app.mjs'),"import {value} from './shared/economy.mjs'; console.log(value);");
    writeFileSync(join(root,'shared/economy.mjs'),"import {value} from './events.mjs'; export {value};");
    writeFileSync(join(root,'shared/events.mjs'),'export const value=1;');
  };
  try{
    mkdirSync(join(root,'shared'));prepare('body{color:white}');const first=versionPublic(root);
    assert.ok(readFileSync(join(root,'index.html'),'utf8').includes(`style.css?v=${first}`));
    assert.ok(readFileSync(join(root,'index.html'),'utf8').includes(`layout-refresh.css?v=${first}`));
    assert.ok(readFileSync(join(root,'index.html'),'utf8').includes(`world-events.css?v=${first}`));
    assert.ok(readFileSync(join(root,'index.html'),'utf8').includes(`app.mjs?v=${first}`));
    assert.ok(readFileSync(join(root,'app.mjs'),'utf8').includes(`shared/economy.mjs?v=${first}`));
    assert.ok(readFileSync(join(root,'shared/economy.mjs'),'utf8').includes(`./events.mjs?v=${first}`));
    prepare('body{color:gold}');assert.notEqual(versionPublic(root),first);
    prepare('body{color:white}');writeFileSync(join(root,'layout-refresh.css'),'main{height:90vh}');assert.notEqual(versionPublic(root),first);
  }finally{rmSync(root,{recursive:true,force:true});}
});
