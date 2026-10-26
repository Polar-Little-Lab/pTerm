import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureFor,receiveOutput,clearCapture,findMatches} from '../src/terminal-tools.ts';
import type {Session} from '../src/types.ts';
const session=()=>({}) as Session;
test('recording is opt-in, UTF8 survives packet boundaries, clear removes retained data',()=>{
 const s=session();receiveOutput(s,new TextEncoder().encode('private'));assert.equal(captureFor(s).chunks.length,0);captureFor(s).recording=true;
 const bytes=new TextEncoder().encode('한글');receiveOutput(s,bytes.slice(0,2));receiveOutput(s,bytes.slice(2));assert.equal(captureFor(s).chunks.map(c=>c.text).join(''),'한글');clearCapture(s);assert.equal(captureFor(s).size,0);assert.equal(captureFor(s).chunks.length,0);
});
test('recording is bounded and indicates dropped data',()=>{const s=session();captureFor(s).recording=true;for(let i=0;i<70;i++)receiveOutput(s,new Uint8Array(16384));assert.ok(captureFor(s).size<=1024*1024);assert.equal(captureFor(s).truncated,true);});
test('triggers span packets, suppress duplicate firing and remain session scoped',()=>{const s=session(),other=session();captureFor(s).triggers=[{id:'1',pattern:'ERROR',message:'failed',enabled:true}];receiveOutput(s,new TextEncoder().encode('ER'));receiveOutput(s,new TextEncoder().encode('ROR'));receiveOutput(s,new TextEncoder().encode(' ERROR'));assert.equal(captureFor(s).alerts.length,1);assert.equal(captureFor(other).alerts.length,0);});
test('literal search escapes regex, case and regex modes work, empty matches terminate',()=>{assert.equal(findMatches(['a.b axb'],'a.b').length,1);assert.equal(findMatches(['Error ERROR'],'error').length,2);assert.equal(findMatches(['Error ERROR'],'error',false,true).length,0);assert.equal(findMatches(['abc'],'^|$',true).length,2);assert.throws(()=>findMatches(['abc'],'[',true));assert.equal(findMatches(['a'.repeat(5000)],'a').length,2000);});
