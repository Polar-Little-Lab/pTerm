import {useCallback,useEffect,useState} from 'react';

// Each emission gets its own timer, including repeated identical messages.
export function useTimedMessage(duration:number,paused=false){
 const [message,setMessage]=useState({text:'',sequence:0});
 const show=useCallback((text:string)=>setMessage(previous=>({text,sequence:previous.sequence+1})),[]);
 useEffect(()=>{
  if(!message.text||paused)return;
  const timer=setTimeout(()=>setMessage(current=>current.sequence===message.sequence?{...current,text:''}:current),duration);
  return()=>clearTimeout(timer);
 },[message,duration,paused]);
 return [message.text,show] as const;
}
