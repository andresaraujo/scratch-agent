// Phase 1.2: REPL chat loop. The model is stateless: we resend the full history every turn.
// Phase 1.3: tools. A tool call is only valid once its result is in history, so each user
// turn runs an inner loop: call model -> run requested tools -> append results -> repeat.
// Phase 1.5: bash tool. SANDBOX=host asks before each command; SANDBOX=seatbelt (macOS default)
// runs under sandbox-exec without asking.

import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
import { complete, MODEL, type Message, type Usage } from "./llm.ts";
import { runTool, toolSchemas, type ToolContext } from "./tools.ts";
import type { Sandbox } from "./shell.ts";

const SANDBOX: Sandbox = (process.env.SANDBOX as Sandbox) ?? (process.platform === "darwin" ? "seatbelt" : "host");
const SYSTEM = `You are a concise coding assistant working in ${process.cwd()}.
Use the tools to inspect and edit files and run commands. Read a file before editing it.
After changing code, verify it (run it or its tests) with bash.`;
const MAX_STEPS = 20; // safety cap on model calls per user turn (tuned in 1.4)

let sessionId = crypto.randomUUID();
let history: Message[] = [{ role: "system", content: SYSTEM }];

function formatUsage(u: Usage): string {
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoning = u.completion_tokens_details?.reasoning_tokens ?? 0;
  return `in=${u.prompt_tokens} (cached=${cached}) out=${u.completion_tokens} (reasoning=${reasoning})`;
}

const rl = readline.createInterface({ input: stdin, output: stdout });
let closed = false;
rl.on("close", () => (closed = true));
// Piped stdin closes at EOF while buffered lines are still being processed.
const prompt = () => !closed && rl.prompt();

// One shared line iterator (not rl.question): works with piped stdin, and lets tool
// approval read the next line in the middle of a turn.
const lines = rl[Symbol.asyncIterator]();
async function nextLine(): Promise<string | null> {
  const { value, done } = await lines.next();
  return done ? null : value.trim();
}

const toolCtx: ToolContext = {
  sandbox: SANDBOX,
  async approve(description) {
    stdout.write(`  ? allow ${description}  [y/N] `);
    const answer = await nextLine();
    if (answer === null) console.log("(eof: denied)");
    return answer?.toLowerCase() === "y";
  },
};

async function runTurn() {
  for (let step = 1; step <= MAX_STEPS; step++) {
    const { message, finish_reason, usage } = await complete(history, sessionId, toolSchemas);
    history.push(message); // keep tool_calls + reasoning_content intact
    if (message.content) console.log(`\n${message.content}\n`);
    console.log(`[step ${step} ${finish_reason}] ${formatUsage(usage)} msgs=${history.length}`);

    if (!message.tool_calls?.length) {
      console.log();
      return;
    }
    for (const call of message.tool_calls) {
      console.log(`  -> ${call.function.name}(${call.function.arguments})`);
      const result = await runTool(call.function.name, call.function.arguments, toolCtx);
      console.log(`  <- ${result.split("\n")[0].slice(0, 100)}${result.includes("\n") ? " ..." : ""}`);
      history.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  console.log(`(stopped: hit MAX_STEPS=${MAX_STEPS})\n`);
}

console.log(
  `model=${MODEL} sandbox=${SANDBOX} session=${sessionId}\n/reset new conversation, /history dump messages, /exit quit\n`,
);
rl.setPrompt("> ");
prompt();

while (true) {
  const input = await nextLine();
  if (input === null || input === "/exit") break;
  if (!input) {
    prompt();
    continue;
  }
  if (input === "/reset") {
    sessionId = crypto.randomUUID();
    history = [{ role: "system", content: SYSTEM }];
    console.log(`(new session ${sessionId})\n`);
    prompt();
    continue;
  }
  if (input === "/history") {
    console.log(JSON.stringify(history, null, 2), "\n");
    prompt();
    continue;
  }

  const turnStart = history.length;
  history.push({ role: "user", content: input });
  try {
    await runTurn();
  } catch (err) {
    history.length = turnStart; // roll back the whole turn so history stays valid
    console.error(`error: ${(err as Error).message}\n`);
  }
  prompt();
}

rl.close();
