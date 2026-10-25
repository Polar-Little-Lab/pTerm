import test from 'node:test';
import assert from 'node:assert/strict';
import {shellPrefix,suggestCommands} from '../../app/src/command-suggestions.ts';
const snippets=['df -h','df -i','ls -al','df -h','df -h\necho unsafe','df\x1b[31m'].map((command,i)=>({id:String(i),name:String(i),command}));
test('df proposes saved suffixes, deduplicates, excludes control and multiline input',()=>{
 assert.deepEqual(suggestCommands(snippets,'df').map(s=>s.command),['df -h','df -i']);
 assert.deepEqual(suggestCommands(snippets,'df -h'),[]);
 assert.deepEqual(suggestCommands(snippets,''),[]);
});
test('shell prompt prefixes are exact and case sensitive',()=>{
 assert.equal(shellPrefix('user@mac ~ % df',''),'df');
 assert.equal(shellPrefix('user@host:~$ df',''),'df');
 assert.equal(shellPrefix('# df',''),'df');
 assert.deepEqual(suggestCommands(snippets,'DF'),[]);
});
test('password prompts, mid-line cursor, wrapped lines and empty prompts are ineligible',()=>{
 for(const text of ['Password: df','Enter passphrase: df','df','% '])assert.equal(shellPrefix(text,''),null);
 assert.equal(shellPrefix('$ df',' -h'),null);
 assert.equal(shellPrefix('$ df','',true),null);
});
test('no unlocked commands means no suggestions; results are bounded',()=>{
 assert.deepEqual(suggestCommands([],'df'),[]);
 assert.equal(suggestCommands(Array.from({length:20},(_,i)=>({id:String(i),name:'',command:'df '+i})),'df').length,5);
});
