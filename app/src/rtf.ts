export function plainTerminalText(text: string) {
  return text
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
export function toRtf(text: string) {
  let result = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Menlo;}}\\f0\\fs22\\uc1 ";
  for (const c of plainTerminalText(text).replace(/\r\n?/g, "\n").split("")) {
    const code = c.charCodeAt(0);
    result +=
      c === "\n"
        ? "\\par\n"
        : c === "\t"
          ? "\\tab "
          : ["\\", "{", "}"].includes(c)
            ? "\\" + c
            : code > 127
              ? `\\u${code > 32767 ? code - 65536 : code}?`
              : c;
  }
  return result + "}";
}
