import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { NativeConnectionDialog } from "../src/NativeConnectionDialog";
import type { Workspace } from "../src/types";
test("native dialog loads current profile, previews before launch and retains launch failures", async () => {
  const dom = new JSDOM('<div id="mount"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    isTauri: true,
  });
  const calls: any[] = [];
  (dom.window as any).__TAURI_INTERNALS__ = {
    invoke: async (command: string, args: any) => {
      calls.push({ command, args });
      if (command === "list_serial_ports") return ["/dev/cu.fixture"];
      if (command === "preview_program")
        return { executable: "/usr/bin/ssh", args: ["--", args.request.host] };
      throw new Error(command);
    },
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("mount")!);
  let workspace: Workspace = {
    version: 1,
    hosts: [],
    snippets: [],
    profiles: [
      {
        id: "profile",
        name: "Team",
        username: "current-user",
        identity: "/key",
        certificate: "",
        provider: "",
        gssapi: false,
      },
    ],
    connections: [
      {
        id: "saved",
        name: "Example",
        profileId: "profile",
        launch: {
          program: {
            mode: "ssh",
            host: "example.test",
            username: "old-user",
            port: 22,
          },
        },
      },
    ],
  };
  let closed = false,
    launched = 0;
  const render = () =>
    root.render(
      <NativeConnectionDialog
        workspace={workspace}
        unlocked
        onUpdate={async (fn) => {
          workspace = fn(workspace);
          render();
          return true;
        }}
        onClose={() => {
          closed = true;
        }}
        onLaunch={async () => {
          launched++;
          throw new Error("fixture connection failed");
        }}
      />,
    );
  await act(async () => {
    render();
    await Promise.resolve();
  });
  const select = (text: string) =>
    [...document.querySelectorAll("label")]
      .find((l) => l.textContent?.trim().startsWith(text))!
      .querySelector("select")!;
  const choose = async (label: string, value: string) => {
    await act(() => {
      const el = select(label);
      el.value = value;
      el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  };
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    )!;
  await choose("저장한 연결", "saved");
  const user = [...document.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith("사용자 이름"))!
    .querySelector("input")!;
  assert.equal(user.value, "current-user");
  assert.equal(user.disabled, true);
  await act(async () => {
    button("설정 확인").click();
    await Promise.resolve();
  });
  assert.equal(launched, 0);
  assert.equal(
    calls.find((c) => c.command === "preview_program").args.request.username,
    "current-user",
  );
  await act(async () => {
    button("연결·실행").click();
    await Promise.resolve();
  });
  assert.equal(launched, 1);
  assert.equal(closed, false);
  assert.match(
    document.querySelector("[role=alert]")!.textContent!,
    /fixture connection failed/,
  );
  await choose("방식", "rdp");
  assert.equal(document.querySelector("pre"), null);
  assert.equal(
    (document.querySelector("label input") as HTMLInputElement)?.disabled,
    false,
  );
  await choose("방식", "serial");
  assert.ok(document.body.textContent?.includes("RTS/CTS"));
  await choose("장치", "/dev/cu.fixture");
  assert.equal((button("연결·실행") as HTMLButtonElement).disabled, false);
  await act(() => root.unmount());
  dom.window.close();
  delete (globalThis as any).isTauri;
});
