import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const read=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));
const c=json('release.config.json'), pkg=json(c.package), version=pkg.version;
assert.match(version,/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/,'Semantic version required');
const lock=json(c.lock);
for(const actual of [lock.version,lock.packages[''].version])assert.equal(actual,version,'npm lock version mismatch');
if(c.tauri){
 assert.equal(json(c.tauri).version,version,'Tauri version mismatch');
 const manifest=read(c.cargo).split(/\n\[/)[0];
 assert.equal(manifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1],version,'Cargo package version mismatch');
 const entry=read(c.cargoLock).split('[[package]]').find(block=>new RegExp(`^name = "${pkg.name}"$`,'m').test(block));
 assert.equal(entry?.match(/^version = "([^"]+)"/m)?.[1],version,'Cargo lock version mismatch');
 assert.ok(read('app/src/main.tsx').includes(`v${version}</span>`),'UI footer version mismatch');
}
const notes=read(c.notes.replace('{version}',version));
assert.ok(notes.startsWith(`# ${c.product} ${version}\n`),'Release notes title mismatch');
for(const section of ['변경 사항','호환성 및 데이터','다운로드','검증','알려진 제한']){
 const body=notes.split(`## ${section}\n`)[1]?.split('\n## ')[0].trim();
 assert.ok(body&& !/\bTODO\b/.test(body),`Missing release notes section: ${section}`);
}
const ref=process.env.GITHUB_REF||'';
if(ref.startsWith('refs/tags/'))assert.equal(ref,`refs/tags/v${version}`,'Tag and package version mismatch');
if(process.argv.includes('--publish')){
 assert.ok(ref==='refs/heads/main'||ref===`refs/tags/v${version}`,'Publish only from main or the matching version tag');
 execFileSync('git',['fetch','origin','main'],{stdio:'inherit'});
 execFileSync('git',['merge-base','--is-ancestor','HEAD','origin/main'],{stdio:'inherit'});
}
console.log(`${c.product} ${version}: versions, notes${process.argv.includes('--publish')?', main ancestry':''} verified`);
