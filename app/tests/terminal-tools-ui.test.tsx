import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { TerminalTools } from "../src/TerminalTools";
import type { Session } from "../src/types";
test("compose requires review and sends only to connected checked sessions", async () => {
  const dom = new JSDOM('<div id="mount"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const sends: string[] = [];
  const make = (id: string) =>
    ({
      id,
      host: { name: id },
      status: "connected",
      closed: false,
      terminal: { paste: (text: string) => sends.push(id + ":" + text) },
    }) as unknown as Session;
  const one = make("one"),
    two = make("two");
  const root = createRoot(document.getElementById("mount")!);
  const render = () =>
    act(() =>
      root.render(
        <TerminalTools
          sessions={[one, two]}
          current={one}
          page="compose"
          onPage={() => {}}
          onClose={() => {}}
          onError={(e) => {
            throw new Error(e);
          }}
        />,
      ),
    );
  await render();
  const textarea = document.querySelector("textarea")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, "echo hello\n");
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const button = () =>
    [...document.querySelectorAll("button")].find(
      (e) =>
        e.textContent?.includes("전송 대상 확인") ||
        e.textContent?.includes("확인한 대상에 전송"),
    )!;
  await act(() => button().click());
  assert.deepEqual(sends, []);
  await act(() => button().click());
  assert.deepEqual(sends, ["one:echo hello\n"]);
  await act(() => button().click());
  one.status = "closed";
  await render();
  assert.equal((button() as HTMLButtonElement).disabled, true);
  assert.equal(sends.length, 1);
  await act(() => root.unmount());
  dom.window.close();
});
