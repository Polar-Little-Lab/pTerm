export type ProgramRequest={mode:string;executable?:string;host?:string;port?:number;username?:string;identity?:string;certificate?:string;provider?:string;gssapi?:boolean;agentForwarding?:boolean;x11?:boolean;jump?:string;config?:string;script?:string;args?:string[];localPath?:string;remotePath?:string;upload?:boolean;tls?:boolean;cwd?:string};
export type SerialRequest={path:string;baud:number;dataBits:number;stopBits:number;parity:string;flow:string};
export type NativeLaunch={program:ProgramRequest;serial?:SerialRequest};
export type AuthProfile={id:string;name:string;username:string;identity:string;certificate:string;provider:string;gssapi:boolean};
export type ConnectionPreset={id:string;name:string;launch:NativeLaunch;profileId?:string};
export function applyProfile(launch:NativeLaunch,profile?:AuthProfile):NativeLaunch{return profile?{...launch,program:{...launch.program,username:profile.username,identity:profile.identity,certificate:profile.certificate,provider:profile.provider,gssapi:profile.gssapi}}:launch;}
export function validNativeData(value:{profiles?:AuthProfile[];connections?:ConnectionPreset[]}):boolean{
 const text=(v:unknown)=>typeof v==='string'&&v.length<=4096&&!v.includes('\0');
 if(value.profiles!==undefined&&(!Array.isArray(value.profiles)||value.profiles.length>1000||!value.profiles.every(p=>p&&[p.id,p.name,p.username,p.identity,p.certificate,p.provider].every(text)&&typeof p.gssapi==='boolean')))return false;
 if(value.connections!==undefined&&(!Array.isArray(value.connections)||value.connections.length>5000||!value.connections.every(p=>p&&text(p.id)&&text(p.name)&&p.launch&&p.launch.program&&typeof p.launch.program==='object'&&text(p.launch.program.mode)&&(p.profileId===undefined||text(p.profileId)))))return false;
 return true;
}
