import type {Snippet} from './types';

// Only a simple, unwrapped shell input line at its end is eligible.
// This deliberately does not infer arbitrary custom prompts or TUI input.
export function shellPrefix(before:string, after:string, wrapped=false):string|null {
 if(wrapped || after.trim() || /[\x00-\x1f\x7f]/.test(before))return null;
 const match=before.match(/^.{0,512}?[$%#❯] (\S[^\r\n]*)$/u);
 return match?.[1] || null;
}
export function suggestCommands(snippets:Snippet[],prefix:string):Snippet[] {
 if(!prefix || prefix.length>512)return [];
 const seen=new Set<string>();
 return snippets.filter(s=>{
  if(!s.command.startsWith(prefix)||s.command===prefix||/[\x00-\x1f\x7f]/.test(s.command)||seen.has(s.command))return false;
  seen.add(s.command);return true;
 }).slice(0,5);
}
