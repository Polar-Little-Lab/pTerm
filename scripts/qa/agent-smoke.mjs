// Isolated agent and ephemeral fixture key: never touches the user's agent.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');const temp=await mkdtemp(path.join(root,'.tools/agent-fixture-'));
const env={...process.env,SSH_AUTH_SOCK:path.join(temp,'agent.sock'),HARBOR_AGENT_PUBLIC_KEY:path.join(temp,'id.pub'),HARBOR_AGENT_TEST:'1'};
const run=(cmd,args)=>new Promise((resolve,reject)=>{const child=spawn(cmd,args,{env,stdio:'pipe'});let error='';child.stderr.on('data',c=>error+=c);child.stdout.on('data',c=>process.stdout.write(c));child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${cmd}: ${error}`)));});
let agent;
try{
 await run('/usr/bin/ssh-keygen',['-q','-t','ed25519','-N','','-f',path.join(temp,'id')]);
 agent=spawn('/usr/bin/ssh-agent',['-D','-a',env.SSH_AUTH_SOCK],{env,stdio:'pipe'});
 await new Promise((resolve,reject)=>{agent.once('error',reject);agent.stdout.once('data',resolve);agent.once('exit',()=>reject(Error('agent exited')));});
 await run('/usr/bin/ssh-add',[path.join(temp,'id')]);
 await run(process.execPath,[path.join(root,'scripts/qa/bastion-smoke.mjs')]);
 console.log('PASS: isolated SSH Agent signed target authentication through Bastion');
}finally{if(agent){agent.kill('SIGTERM');await new Promise(r=>agent.once('exit',r));}await rm(temp,{recursive:true,force:true});}
