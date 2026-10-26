import { validPreferences, resolvePreferences } from "./session-preferences";
import {
  validNativeData,
  portableNative,
  type AuthProfile,
  type ConnectionPreset,
} from "./native-connections";
import type { Host, Snippet, Workspace } from "./types";
export type PortableWorkspace = {
  format: "pterm-connections";
  version: 1;
  hosts: Host[];
  snippets: Snippet[];
  profiles?: AuthProfile[];
  connections?: ConnectionPreset[];
};
function text(value: unknown, max = 1024): value is string {
  return (
    typeof value === "string" && value.length <= max && !value.includes("\0")
  );
}
export function portableWorkspace(workspace: Workspace): PortableWorkspace {
  return {
    ...portableNative(workspace),
    format: "pterm-connections",
    version: 1,
    hosts: workspace.hosts.map((h) => ({
      id: h.id,
      name: h.name,
      host: h.host,
      port: h.port,
      username: h.username,
      group: h.group,
      tags: h.tags,
      favorite: h.favorite,
      authMethod: h.authMethod,
      keyPath: h.keyPath,
      bastionHostId: h.bastionHostId,
      preferences:
        h.preferences ||
        workspace.sessionDefaults ||
        Object.keys(workspace.groupPreferences || {}).length
          ? resolvePreferences(workspace, h)
          : undefined,
    })),
    snippets: workspace.snippets.map((s) => ({
      id: s.id,
      name: s.name,
      command: s.command,
    })),
  };
}
export function parsePortable(raw: string): PortableWorkspace {
  if (new TextEncoder().encode(raw).length > 2 * 1024 * 1024)
    throw new Error("최대 2 MiB 파일을 가져올 수 있습니다.");
  const v = JSON.parse(raw) as PortableWorkspace;
  if (
    !v ||
    v.format !== "pterm-connections" ||
    v.version !== 1 ||
    !Array.isArray(v.hosts) ||
    !Array.isArray(v.snippets) ||
    v.hosts.length > 5000 ||
    v.snippets.length > 5000 ||
    !validNativeData(v)
  )
    throw new Error("지원하는 pTerm 내보내기 파일이 아닙니다.");
  const ids = new Set<string>();
  for (const h of v.hosts) {
    if (
      !h ||
      !text(h.id) ||
      !h.id ||
      ids.has(h.id) ||
      !text(h.name) ||
      !text(h.host, 253) ||
      !h.host ||
      /\s/.test(h.host) ||
      !text(h.username, 256) ||
      !h.username ||
      !Number.isInteger(h.port) ||
      h.port < 1 ||
      h.port > 65535 ||
      (h.group !== undefined && !text(h.group)) ||
      (h.tags !== undefined &&
        (!Array.isArray(h.tags) ||
          h.tags.length > 100 ||
          !h.tags.every((t) => text(t, 256)))) ||
      (h.favorite !== undefined && typeof h.favorite !== "boolean") ||
      (h.authMethod !== undefined &&
        !["password", "key", "agent"].includes(h.authMethod)) ||
      (h.keyPath !== undefined && !text(h.keyPath, 4096)) ||
      (h.bastionHostId !== undefined && !text(h.bastionHostId)) ||
      (h.preferences !== undefined && !validPreferences(h.preferences))
    )
      throw new Error("호스트 형식이 잘못되었습니다.");
    ids.add(h.id);
  }
  for (const h of v.hosts) {
    const seen = new Set([h.id]);
    let parent = h.bastionHostId;
    while (parent) {
      if (seen.has(parent) || !ids.has(parent))
        throw new Error("Bastion 경로가 순환하거나 대상이 없습니다.");
      seen.add(parent);
      parent = v.hosts.find((x) => x.id === parent)?.bastionHostId;
    }
  }
  const snippetIds = new Set<string>();
  for (const s of v.snippets) {
    if (
      !s ||
      !text(s.id) ||
      snippetIds.has(s.id) ||
      !text(s.name) ||
      !text(s.command, 65536)
    )
      throw new Error("저장 명령 형식이 잘못되었습니다.");
    snippetIds.add(s.id);
  }
  // Whitelist fields: never import credentials or pre-trust server fingerprints.
  return portableWorkspace({
    version: 1,
    ...portableNative(v),
    hosts: v.hosts.map((h) => ({
      ...h,
      preferences: h.preferences
        ? { ...h.preferences, startupEnabled: false, logEnabled: false }
        : undefined,
    })),
    snippets: v.snippets,
  });
}
export function mergePortable(
  workspace: Workspace,
  incoming: PortableWorkspace,
  newId = () => crypto.randomUUID(),
): Workspace {
  const ids = new Map(incoming.hosts.map((h) => [h.id, newId()]));
  const profileIds = new Map(
    (incoming.profiles || []).map((p) => [p.id, newId()]),
  );
  return {
    ...workspace,
    profiles: [
      ...(workspace.profiles || []),
      ...(incoming.profiles || []).map((p) => ({
        ...p,
        id: profileIds.get(p.id)!,
      })),
    ],
    connections: [
      ...(workspace.connections || []),
      ...(incoming.connections || []).map((p) => ({
        ...p,
        id: newId(),
        profileId: p.profileId ? profileIds.get(p.profileId) : undefined,
      })),
    ],
    hosts: [
      ...workspace.hosts,
      ...incoming.hosts.map((h) => ({
        ...h,
        id: ids.get(h.id)!,
        bastionHostId: h.bastionHostId ? ids.get(h.bastionHostId) : undefined,
      })),
    ],
    snippets: [
      ...workspace.snippets,
      ...incoming.snippets.map((s) => ({ ...s, id: newId() })),
    ],
  };
}
