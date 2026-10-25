import type {Host,Workspace} from './types';
// Bind each secret to its destination, account and authentication method. Changing
// a host must never send the old credential to a different destination.
export function credentialScope(host:Host):string {
 return JSON.stringify([host.host.trim(),host.port,host.username.trim(),host.authMethod||'password',host.authMethod==='key'?host.keyPath||'':'',host.bastionHostId||'']);
}
export function savedSecret(data:Workspace,host:Host):string|undefined {
 if(host.authMethod==='agent')return undefined;
 return data.credentials?.find(c=>c.hostId===host.id&&c.scope===credentialScope(host))?.secret;
}
export function pruneCredentials(data:Workspace):Workspace {
 if(!data.credentials)return data;
 return {...data,credentials:data.credentials.filter(c=>data.hosts.some(h=>h.id===c.hostId&&h.authMethod!=='agent'&&credentialScope(h)===c.scope))};
}
export function storeCredential(data:Workspace,host:Host,remember:boolean,secret:string):Workspace {
 const previous=savedSecret(data,host);
 const credentials=(data.credentials||[]).filter(c=>c.hostId!==host.id);
 const value=secret||previous;
 if(remember&&host.authMethod!=='agent'&&value!==undefined&&value!=='')credentials.push({hostId:host.id,scope:credentialScope(host),secret:value});
 return {...data,credentials};
}
export function validCredentials(value:unknown):boolean {
 return value===undefined||(Array.isArray(value)&&value.every(c=>c&&typeof c.hostId==='string'&&typeof c.scope==='string'&&typeof c.secret==='string'&&c.secret.length<=16384));
}
