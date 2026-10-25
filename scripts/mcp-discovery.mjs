import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
const root=new URL('../',import.meta.url).pathname;
const child=spawn(root+'scripts/rea',['mcp'],{stdio:['pipe','pipe','pipe']});
const pending=new Map();let id=0;
createInterface({input:child.stdout}).on('line',line=>{try {const r=JSON.parse(line);if(pending.has(r.id)){pending.get(r.id)(r);pending.delete(r.id);}}catch{}});
const request=(method,params)=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});
const timer=setTimeout(()=>{child.kill();console.error('discovery timeout');process.exitCode=1},30000);
try {
 const init=await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'rea-readiness-discovery',version:'1.0'}});
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const list=await request('tools/list',{});
 const report={initialize:init,toolCount:list.result?.tools?.length,tools:list.result?.tools, error:list.error};
 writeFileSync(root+'logs/mcp-discovery.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({server:init.result?.serverInfo,toolCount:report.toolCount,inspectArtifactAnnotations:report.tools?.find(t=>t.name==='inspect_artifact')?.annotations},null,2));
}finally{clearTimeout(timer);child.stdin.end();child.kill();}
