import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scriptSession} from '../src/script-session.ts';
import {captureFor,receiveOutput} from '../src/terminal-tools.ts';
import type {Session} from '../src/types';
const encode=(s:string)=>new TextEncoder().encode(s);
test('script API sends raw input, awaits immediate fresh output and consumes matches',async()=>{
 const sends:string[]=[];const s={status:'connected',closed:false,inputQueue:Promise.resolve(),terminal:{input:(text:string)=>{sends.push(text);receiveOutput(s as Session,encode('ready done'));}}} as unknown as Session;
 receiveOutput(s,encode('old ready'));const run=scriptSession(s,new AbortController().signal);
 await run({seq:1,operation:'send',value:'echo ready\n'});assert.deepEqual(sends,['echo ready\n']);assert.equal(await run({seq:2,operation:'expect',value:'ready'}),'ready');assert.equal(await run({seq:3,operation:'expect',value:'done'}),' done');await assert.rejects(run({seq:4,operation:'expect',value:'ready',timeout:1}),/시간 초과/);assert.ok(captureFor(s).recent.includes('old ready'));
});
test('script API cancellation, disconnect, invalid input and send errors stop operations',async()=>{
 const abort=new AbortController();const s={status:'connected',closed:false,inputQueue:Promise.resolve(),terminal:{input:()=>{s.inputFailures=1;}}} as unknown as Session;const run=scriptSession(s,abort.signal);
 await assert.rejects(run({seq:1,operation:'send',value:'test'}),/전송 실패/);
 await assert.rejects(run({seq:2,operation:'sleep',value:30001}),/범위/);
 const pending=run({seq:3,operation:'expect',value:'never'});abort.abort();await assert.rejects(pending,/종료/);
 s.status='closed';await assert.rejects(scriptSession(s,new AbortController().signal)({seq:4,operation:'send',value:'test'}),/종료/);
});
