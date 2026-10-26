import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { TerminalTools } from "../src/TerminalTools";
import { captureFor, receiveOutput } from "../src/terminal-tools";
import type { Session } from "../src/types";
test("automatic command registration requires review and Stop All prevents subsequent sends", async () => {
  const dom = new JSDOM('<div id="mount"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("mount")!);
  const sends: string[] = [];
  const session = {
    id: "one",
    host: { name: "test" },
    status: "connected",
    closed: false,
    inputQueue: Promise.resolve(),
    terminal: { input: (s: string) => sends.push(s) },
  } as unknown as Session;
  await act(() =>
    root.render(
      <TerminalTools
        sessions={[session]}
        current={session}
        page="triggers"
        onPage={() => {}}
        onClose={() => {}}
        onError={(e) => {
          throw Error(e);
        }}
      />,
    ),
  );
  const input = async (
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ) => {
    await act(() => {
      const proto =
        element.tagName === "TEXTAREA"
          ? dom.window.HTMLTextAreaElement.prototype
          : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(
        element,
        value,
      );
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  const pattern = [...document.querySelectorAll("label")]
    .find((l) => l.textContent?.includes("감지 문자열"))!
    .querySelector("input")!;
  await input(pattern, "READY");
  const action = document.querySelector("select")!;
  await act(() => {
    action.value = "send";
    action.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await input(document.querySelector("textarea")!, "echo next");
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    )!;
  await act(() => button("자동 명령 검토").click());
  assert.equal(captureFor(session).triggers.length, 0);
  assert.deepEqual(sends, []);
  await act(() => button("확인한 자동 명령 등록").click());
  assert.equal(captureFor(session).triggers[0].command, "echo next\r");
  assert.deepEqual(sends, []);
  await act(async () => {
    receiveOutput(session, new TextEncoder().encode("READY"));
    await Promise.resolve();
  });
  assert.deepEqual(sends, ["echo next\r"]);
  await act(() => button("자동 전송 모두 중지").click());
  assert.equal(captureFor(session).triggers[0].enabled, false);
  await act(() => root.unmount());
  dom.window.close();
});
