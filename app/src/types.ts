import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
export type Host = {id:string;name:string;host:string;port:number;username:string;fingerprint?:string;group?:string;tags?:string[];favorite?:boolean;authMethod?:'password'|'key'|'agent';keyPath?:string;bastionHostId?:string};
export type Snippet = {id:string;name:string;command:string};
export type SavedCredential = {hostId:string;scope:string;secret:string};
export type Workspace = {version:1;hosts:Host[];snippets:Snippet[];credentials?:SavedCredential[]};
export type Session = {id:string;kind?:'local'|'ssh';localCwd?:string;localShell?:string;host:Host;reconnecting?:boolean;bastionSessionId?:string;routeLabel?:string;terminal:Terminal;fit:FitAddon;status:'connecting'|'connected'|'closed';closed:boolean;inputQueue:Promise<unknown>;queuedInputBytes:number};
