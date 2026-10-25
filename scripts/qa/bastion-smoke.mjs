// Run after: cargo build --manifest-path app/src-tauri/Cargo.toml --examples
// Isolated loopback fixtures, synthetic credentials only.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const fixtureRoot=path.join(root,'.tools/qa-sftp');
await mkdir(path.join(fixtureRoot,'reports'),{recursive:true});
await writeFile(path.join(fixtureRoot,'reports/readme.txt'),'Synthetic SFTP fixture. No user data.\n');
const children=[];
function start(){return new Promise((resolve,reject)=>{
 const child=spawn(path.join(root,'app/src-tauri/target/debug/examples/echo_fixture'),[],{env:{...process.env,HARBOR_FIXTURE_ROOT:fixtureRoot},stdio:['ignore','pipe','pipe']});children.push(child);
 let output='';const timeout=setTimeout(()=>reject(Error('fixture timeout')),10000);
 child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/PORT=(\d+) FINGERPRINT=(\S+)/);if(match){clearTimeout(timeout);resolve({port:match[1],fingerprint:match[2]});}});
 child.once('error',reject);child.once('exit',()=>{clearTimeout(timeout);reject(Error('fixture exited'));});
});}
try{
 const bastion=await start();const target=await start();
 const client=spawn(path.join(root,'app/src-tauri/target/debug/examples/integration_smoke'),[],{env:{...process.env,HARBOR_FIXTURE_PORT:target.port,HARBOR_FIXTURE_FINGERPRINT:target.fingerprint,HARBOR_BASTION_PORT:bastion.port,HARBOR_BASTION_FINGERPRINT:bastion.fingerprint},stdio:'inherit'});children.push(client);
 const code=await new Promise((resolve,reject)=>{client.once('error',reject);client.once('exit',resolve);});if(code!==0)throw Error(`smoke exited ${code}`);
}finally{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');}
