import type {Session} from './types';
import {captureFor} from './terminal-tools';
export type Step={send:string}|{wait:number}|{expect:string;timeout?:number};
export function parseSteps(raw:string):Step[]{
 if(raw.length>65536)throw new Error('시나리오는 64 KiB 이하로 입력하세요.');
 const steps:unknown=JSON.parse(raw);if(!Array.isArray(steps)||steps.length>200)throw new Error('최대 200개 단계의 JSON 배열을 입력하세요.');
 let total=0;
 for(const s of steps){if(!s||typeof s!=='object')throw new Error('단계 형식을 확인하세요.');
  if('send'in s){if(typeof s.send!=='string'||s.send.length>16384||Object.keys(s).length!==1)throw new Error('send 형식 오류');total+=s.send.length;}
  else if('wait'in s){if(!Number.isInteger(s.wait)||s.wait<0||s.wait>30000||Object.keys(s).length!==1)throw new Error('wait는 0–30000 밀리초입니다.');}
  else if('expect'in s){if(typeof s.expect!=='string'||!s.expect||s.expect.length>256||(s.timeout!==undefined&&(!Number.isInteger(s.timeout)||s.timeout<1||s.timeout>60000))||Object.keys(s).some(k=>!['expect','timeout'].includes(k)))throw new Error('expect 형식 오류');}
  else throw new Error('send, wait, expect 단계만 지원합니다.');
 }
 if(total>65536)throw new Error('전체 전송 크기가 64 KiB를 초과합니다.');return steps;
}
function check(session:Session,signal:AbortSignal){if(signal.aborted)throw new Error('실행을 중지했습니다.');if(session.closed||session.status!=='connected')throw new Error('연결이 종료되어 실행을 중지했습니다.');}
async function pause(session:Session,ms:number,signal:AbortSignal){const end=Date.now()+ms;do{check(session,signal);if(Date.now()>=end)return;await new Promise(r=>setTimeout(r,Math.min(50,end-Date.now())));}while(true);}
export async function runSteps(session:Session,steps:Step[],signal:AbortSignal,onStep:(index:number)=>void){
 let since=captureFor(session).received;
 for(let index=0;index<steps.length;index++){check(session,signal);onStep(index);const step=steps[index];
  if('send'in step){since=captureFor(session).received;const failures=session.inputFailures||0;session.terminal.paste(step.send);await session.inputQueue;check(session,signal);if((session.inputFailures||0)!==failures)throw new Error('입력 전송 실패로 실행을 중지했습니다.');}
  else if('wait'in step)await pause(session,step.wait,signal);
  else{const end=Date.now()+(step.timeout||10000);while(true){check(session,signal);const state=captureFor(session);const fresh=state.recent.slice(Math.max(0,since-(state.received-state.recent.length)));if(fresh.includes(step.expect))break;if(Date.now()>=end)throw new Error(`${index+1}단계: 출력 대기 시간 초과`);await pause(session,50,signal);}}
 }
}
