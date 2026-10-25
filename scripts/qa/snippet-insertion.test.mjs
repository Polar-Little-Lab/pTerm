import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSnippet} from '../../app/src/snippet-insertion.ts';
test('single-line insert never appends an execution newline',()=>{
 for(const text of ['docker ps -a','docker ps -a\n','docker ps -a\r\n'])assert.deepEqual(prepareSnippet(text),{kind:'insert',command:'docker ps -a'});
});
test('multi-line commands require explicit review',()=>{
 for(const text of ['pwd\nls','pwd\r\nls','pwd\rls'])assert.equal(prepareSnippet(text).kind,'review');
});
test('terminal control sequences cannot be inserted',()=>{
 for(const text of ['echo ok\x03','\x1b[201~pwd','\x00pwd','pwd\x7f'])assert.equal(prepareSnippet(text).kind,'reject');
});
test('empty commands are rejected and unicode remains intact',()=>{
 assert.equal(prepareSnippet(' \r\n').kind,'reject');
 assert.deepEqual(prepareSnippet('echo 안녕하세요'),{kind:'insert',command:'echo 안녕하세요'});
});
