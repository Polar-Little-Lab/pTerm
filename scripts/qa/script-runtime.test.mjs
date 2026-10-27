import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
for (const language of ["python", "javascript"])
  test(
    `${language} runtime bridges arguments and ordered RPC without network`,
    { timeout: 10000 },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "pterm-script-"));
      try {
        const python = language === "python";
        const file = join(directory, python ? "fixture.py" : "fixture.mjs");
        writeFileSync(
          file,
          python
            ? 'import pterm,sys\nassert sys.argv[1] == "hello world"\npterm.send("echo ready\\n")\nassert pterm.expect("ready") == "ready"\nprint("finished")\n'
            : 'export default async pterm=>{if(process.argv[2]!=="hello world")throw Error("args");await pterm.send("echo ready\\n");if(await pterm.expect("ready")!=="ready")throw Error("response");console.log("finished");};',
        );
        const wrapper = readFileSync(
          new URL(
            `../../app/src-tauri/src/script_api/${python ? "python.py" : "javascript.cjs"}`,
            import.meta.url,
          ),
          "utf8",
        );
        const child = spawn(python ? "python3" : process.execPath, [
          ...(python ? ["-u", "-c"] : ["-e"]),
          wrapper,
          file,
          "hello world",
        ]);
        let buffer = "",
          logs = "",
          errors = "";
        const operations = [];
        child.stdout.on("data", (data) => {
          buffer += data.toString();
          let index;
          while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (line.startsWith("\x1ePTERM ")) {
              const request = JSON.parse(line.slice(7));
              operations.push(request);
              child.stdin.write(
                JSON.stringify({
                  seq: request.seq,
                  value: request.operation === "expect" ? "ready" : null,
                }) + "\n",
              );
            } else logs += line;
          }
        });
        child.stderr.on("data", (data) => (errors += data.toString()));
        const code = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("script timeout"));
          }, 8000);
          child.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            resolve(code);
          });
        });
        assert.equal(code, 0, errors);
        assert.deepEqual(
          operations.map((x) => x.operation),
          ["send", "expect"],
        );
        assert.equal(operations[0].value, "echo ready\n");
        assert.match(logs, /finished/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
