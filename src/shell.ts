// Phase 1.5: run shell commands for the bash tool.
// Backends: "host" (plain bash, needs user approval) and "seatbelt" (macOS sandbox-exec,
// kernel-enforced: writes only in workdir + tmp, no network -> safe to auto-approve).

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";

export type Sandbox = "host" | "seatbelt";

const MAX_OUTPUT_CHARS = 20_000;

// SBPL profile. Paths must be realpaths (/tmp is a symlink to /private/tmp on macOS).
const SEATBELT_PROFILE = `
(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath (param "WORKDIR")))
(allow file-write* (subpath (param "TMPDIR")))
(allow file-write* (subpath "/private/tmp"))
(allow file-write* (subpath "/dev"))
(deny network*)
`;

export type ShellResult = { exitCode: number | null; output: string; timedOut: boolean };

export function runShell(cmd: string, cwd: string, sandbox: Sandbox, timeoutMs: number): Promise<ShellResult> {
  const [bin, args] =
    sandbox === "seatbelt"
      ? [
          "sandbox-exec",
          [
            "-p", SEATBELT_PROFILE,
            "-D", `WORKDIR=${fs.realpathSync(cwd)}`,
            "-D", `TMPDIR=${fs.realpathSync(os.tmpdir())}`,
            "bash", "-c", cmd,
          ],
        ]
      : ["bash", ["-c", cmd]];

  return new Promise((resolve) => {
    // detached: own process group, so on timeout we kill the whole tree (e.g. `npm test` children).
    const child = spawn(bin, args as string[], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const onData = (d: Buffer) => (output += d.toString());
    child.stdout.on("data", onData);
    child.stderr.on("data", onData); // interleaved, like a terminal

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, timeoutMs);

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output: truncateMiddle(output), timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, output: `spawn error: ${err.message}`, timedOut });
    });
  });
}

// Keep head + tail: errors usually show up at the end, context at the start.
function truncateMiddle(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  const half = MAX_OUTPUT_CHARS / 2;
  return `${s.slice(0, half)}\n...[${s.length - MAX_OUTPUT_CHARS} chars truncated]...\n${s.slice(-half)}`;
}
