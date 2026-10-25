// Development-only components fixture: never connects to servers or reads the Vault.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HostCard} from './src/HostCard';
import {SnippetCompletion} from './src/SnippetCompletion';
import {demoHosts} from './src/demo-hosts';
import './src/style.css';
import './src/terminal-layout.css';
function QA(){
 const [locked,setLocked]=useState(new URLSearchParams(location.search).has('locked'));
 const [selecting,setSelecting]=useState(false);const [checked,setChecked]=useState<string[]>([]);const [completion,setCompletion]=useState(false);const [result,setResult]=useState('');
 return <div style={{padding:24,maxWidth:1200}}><h2>컴포넌트 검증 · 실제 연결 없음</h2><div style={{display:'flex',gap:14,marginBottom:20}}><button className="secondary" onClick={()=>{setSelecting(!selecting);setChecked([]);}}>{selecting?'선택 완료':'선택'}</button><span role="status">{checked.length}개 선택</span><button className="secondary" onClick={()=>setCompletion(true)}>자동완성 검증</button></div><div className="host-grid">{demoHosts.slice(0,4).map(host=><HostCard key={host.id} host={host} selecting={selecting} selected={checked.includes(host.id)} busy={false} connected={false} onToggle={()=>setChecked(ids=>ids.includes(host.id)?ids.filter(id=>id!==host.id):[...ids,host.id])} onFavorite={()=>setResult('favorite')} onEdit={()=>setResult('edit')} onOpen={()=>setResult('open')}/>)}</div><pre aria-label="검증 결과">{result}</pre><div style={{position:'relative',height:350,marginTop:20,background:'#101d30',padding:16,color:'#9db4cf'}}><code>fixture ~ %</code>{completion&&<SnippetCompletion locked={locked} onUnlock={()=>setLocked(false)} onManage={()=>{setResult('manage');setCompletion(false);}} snippets={[{id:'git',name:'Git 상태',command:'git status'},{id:'docker',name:'컨테이너 목록',command:'docker ps -a'},{id:'disk',name:'디스크 사용량',command:'df -h'},{id:'multi',name:'여러 줄 명령',command:'pwd\nls'}]} left={16} top={42} onClose={()=>setCompletion(false)} onChoose={s=>{setResult(JSON.stringify({selected:s.command,executed:false}));setCompletion(false);}}/>}</div></div>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
