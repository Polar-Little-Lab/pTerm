import test from 'node:test';
import assert from 'node:assert/strict';
import {insertionSlot} from '../../app/src/tab-drop.ts';
test('insert position covers tabs, close-button gaps, and after the last tab',()=>{
 const slots=[{id:'a',left:20,right:120},{id:'b',left:125,right:225}];
 assert.deepEqual(insertionSlot(slots,30),{id:'a',after:false,x:20});
 assert.deepEqual(insertionSlot(slots,90),{id:'b',after:false,x:125});
 assert.deepEqual(insertionSlot(slots,122),{id:'b',after:false,x:125});
 assert.deepEqual(insertionSlot(slots,300),{id:'b',after:true,x:225});
 assert.equal(insertionSlot([],30),null);
});
