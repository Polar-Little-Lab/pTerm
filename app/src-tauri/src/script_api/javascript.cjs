const readline = require('node:readline');
const {pathToFileURL} = require('node:url');
const lines = readline.createInterface({input: process.stdin});
let sequence = 0, pending;
lines.on('line', line => {
  if (!pending) return;
  const next = pending; pending = undefined;
  try {
    const value = JSON.parse(line);
    if (value.seq !== next.seq || value.error) throw new Error(value.error || 'Invalid pTerm response');
    next.resolve(value.value);
  } catch (error) {next.reject(error);}
});
function request(operation, value, timeout = 10000) {
  if (pending) return Promise.reject(new Error('Await each pTerm operation before starting another.'));
  return new Promise((resolve, reject) => {
    pending = {seq: ++sequence, resolve, reject};
    process.stdout.write('\n\x1ePTERM '+JSON.stringify({seq:sequence,operation,value,timeout})+'\n');
  });
}
globalThis.pterm = Object.freeze({send: text=>request('send',text),expect:(text,timeout)=>request('expect',text,timeout),sleep:ms=>request('sleep',ms)});
process.argv = [process.argv[0],...process.argv.slice(1)];
import(pathToFileURL(process.argv[1]).href).then(async module=>{if(typeof module.default==='function')await module.default(globalThis.pterm);lines.close();}).catch(error=>{console.error(error);process.exitCode=1;lines.close();});
