import {findMatches} from './terminal-tools';
self.onmessage=(event:MessageEvent<{lines:string[];query:string;regex:boolean;caseSensitive:boolean}>)=>{try{self.postMessage({hits:findMatches(event.data.lines,event.data.query,event.data.regex,event.data.caseSensitive)});}catch(e){self.postMessage({error:String(e)});}};
