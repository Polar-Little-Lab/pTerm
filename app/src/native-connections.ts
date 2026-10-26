export type ProgramRequest = {
  mode: string;
  executable?: string;
  host?: string;
  port?: number;
  username?: string;
  identity?: string;
  certificate?: string;
  provider?: string;
  gssapi?: boolean;
  agentForwarding?: boolean;
  x11?: boolean;
  jump?: string;
  config?: string;
  script?: string;
  args?: string[];
  localPath?: string;
  remotePath?: string;
  upload?: boolean;
  tls?: boolean;
  cwd?: string;
};
export type SerialRequest = {
  path: string;
  baud: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  flow: string;
};
export type NativeLaunch = { program: ProgramRequest; serial?: SerialRequest };
export type AuthProfile = {
  id: string;
  name: string;
  username: string;
  identity: string;
  certificate: string;
  provider: string;
  gssapi: boolean;
};
export type ConnectionPreset = {
  id: string;
  name: string;
  launch: NativeLaunch;
  profileId?: string;
};
export function applyProfile(
  launch: NativeLaunch,
  profile?: AuthProfile,
): NativeLaunch {
  return profile
    ? {
        ...launch,
        program: {
          ...launch.program,
          username: profile.username,
          identity: profile.identity,
          certificate: profile.certificate,
          provider: profile.provider,
          gssapi: profile.gssapi,
        },
      }
    : launch;
}
const modes = [
  "ssh",
  "rdp",
  "serial",
  "python",
  "javascript",
  "jxa",
  "scp",
  "ftp",
  "telnet",
  "rlogin",
];
const stringFields = [
  "executable",
  "host",
  "username",
  "identity",
  "certificate",
  "provider",
  "jump",
  "config",
  "script",
  "localPath",
  "remotePath",
  "cwd",
] as const;
const booleanFields = [
  "gssapi",
  "agentForwarding",
  "x11",
  "upload",
  "tls",
] as const;
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 4096 && !/[\0\r\n]/.test(v);
export function validNativeData(value: {
  profiles?: AuthProfile[];
  connections?: ConnectionPreset[];
}): boolean {
  const profiles = value.profiles || [],
    connections = value.connections || [];
  if (
    !Array.isArray(profiles) ||
    profiles.length > 1000 ||
    !profiles.every(
      (p) =>
        p &&
        [p.id, p.name, p.username, p.identity, p.certificate, p.provider].every(
          text,
        ) &&
        p.id &&
        p.name &&
        typeof p.gssapi === "boolean",
    )
  )
    return false;
  const ids = new Set(profiles.map((p) => p.id));
  if (ids.size !== profiles.length) return false;
  if (!Array.isArray(connections) || connections.length > 5000) return false;
  const connectionIds = new Set<string>();
  for (const p of connections) {
    if (
      !p ||
      !text(p.id) ||
      !p.id ||
      connectionIds.has(p.id) ||
      !text(p.name) ||
      !p.name ||
      !p.launch ||
      !p.launch.program
    )
      return false;
    connectionIds.add(p.id);
    if (
      p.profileId !== undefined &&
      (!text(p.profileId) || !ids.has(p.profileId))
    )
      return false;
    const r = p.launch.program;
    if (
      !modes.includes(r.mode) ||
      stringFields.some((k) => r[k] !== undefined && !text(r[k])) ||
      booleanFields.some((k) => r[k] !== undefined && typeof r[k] !== "boolean")
    )
      return false;
    if (
      r.port !== undefined &&
      (!Number.isInteger(r.port) || r.port < 1 || r.port > 65535)
    )
      return false;
    if (
      r.args !== undefined &&
      (!Array.isArray(r.args) || r.args.length > 128 || !r.args.every(text))
    )
      return false;
    const serial = p.launch.serial;
    if (
      r.mode === "serial" &&
      (!serial ||
        !text(serial.path) ||
        !serial.path.startsWith("/dev/cu.") ||
        ![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400].includes(
          serial.baud,
        ) ||
        ![7, 8].includes(serial.dataBits) ||
        ![1, 2].includes(serial.stopBits) ||
        !["none", "odd", "even"].includes(serial.parity) ||
        !["none", "software", "hardware"].includes(serial.flow))
    )
      return false;
  }
  return true;
}
export function portableNative(value: {
  profiles?: AuthProfile[];
  connections?: ConnectionPreset[];
}) {
  return {
    profiles: value.profiles?.map(
      ({ id, name, username, identity, certificate, provider, gssapi }) => ({
        id,
        name,
        username,
        identity,
        certificate,
        provider,
        gssapi,
      }),
    ),
    connections: value.connections?.map(({ id, name, profileId, launch }) => {
      const r = launch.program;
      const program: ProgramRequest = {
        mode: r.mode,
        port: r.port,
        args: r.args?.slice(),
      };
      for (const k of stringFields) if (r[k] !== undefined) program[k] = r[k];
      for (const k of booleanFields) if (r[k] !== undefined) program[k] = r[k];
      const s = launch.serial;
      return {
        id,
        name,
        profileId,
        launch: {
          program,
          serial: s
            ? {
                path: s.path,
                baud: s.baud,
                dataBits: s.dataBits,
                stopBits: s.stopBits,
                parity: s.parity,
                flow: s.flow,
              }
            : undefined,
        },
      };
    }),
  };
}
