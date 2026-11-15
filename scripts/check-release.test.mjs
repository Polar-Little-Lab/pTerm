import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const c=JSON.parse(readFileSync('release.config.json'));
const version=JSON.parse(readFileSync(c.package)).version;
const notes=c.notes.replace('{version}',version);
const fixture=mkdtempSync(join(tmpdir(),'polar-release-contract-'));
try{
 for(const file of ['release.config.json',c.package,c.lock,notes,...(c.tauri?[c.tauri,c.cargo,c.cargoLock,'app/src/main.tsx']:[])]){
  mkdirSync(dirname(join(fixture,file)),{recursive:true});copyFileSync(file,join(fixture,file));
 }
 const run=(ref='',args=[])=>spawnSync(process.execPath,[resolve('scripts/check-release.mjs'),...args],{cwd:fixture,env:{...process.env,GITHUB_REF:ref},encoding:'utf8'});
 assert.equal(run().status,0,'valid release fixture should pass');
 assert.notEqual(run('refs/tags/v999.0.0').status,0,'mismatched tag must fail');
 assert.notEqual(run('refs/heads/feature',['--publish']).status,0,'feature branch must not publish');
 const lockPath=join(fixture,c.lock),original=readFileSync(lockPath,'utf8'),lock=JSON.parse(original);
 lock.packages[''].version='999.0.0';writeFileSync(lockPath,JSON.stringify(lock));
 assert.notEqual(run().status,0,'stale lock metadata must fail');writeFileSync(lockPath,original);
 writeFileSync(join(fixture,notes),`# ${c.product} ${version}\n`);
 assert.notEqual(run().status,0,'incomplete notes must fail');
 console.log('Release contract rejects mismatched tags/locks, feature publishing, and incomplete notes.');
}finally{rmSync(fixture,{recursive:true,force:true})}
