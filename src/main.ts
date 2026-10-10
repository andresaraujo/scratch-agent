// Phase 1.2: REPL chat loop. The model is stateless: we resend the full history every turn.

import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
import { complete, MODEL, type Message, type Usage } from "./llm.ts";

const SYSTEM = "You are a concise assistant.";

let sessionId = crypto.randomUUID();
let history: Message[] = [{ role: "system", content: SYSTEM }];

function formatUsage(u: Usage): string {
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoning = u.completion_tokens_details?.reasoning_tokens ?? 0;
  return `in=${u.prompt_tokens} (cached=${cached}) out=${u.completion_tokens} (reasoning=${reasoning})`;
}

const rl = readline.createInterface({ input: stdin, output: stdout });
console.log(`model=${MODEL} session=${sessionId}\n/reset new conversation, /history dump messages, /exit quit\n`);

let closed = false;
rl.on("close", () => (closed = true));
// Piped stdin closes at EOF while buffered lines are still being processed.
const prompt = () => !closed && rl.prompt();

rl.setPrompt("> ");
prompt();
// Async line iterator (not rl.question): also works with piped stdin.
for await (const line of rl) {
  const input = line.trim();
  if (!input) {
    prompt();
    continue;
  }
  if (input === "/exit") break;
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

  history.push({ role: "user", content: input });
  try {
    const { message, finish_reason, usage } = await complete(history, sessionId);
    history.push({ role: "assistant", content: message.content });
    console.log(`\n${message.content}\n`);
    console.log(`[${finish_reason}] ${formatUsage(usage)} msgs=${history.length}\n`);
  } catch (err) {
    history.pop(); // drop the user turn so history stays valid
    console.error(`error: ${(err as Error).message}\n`);
  }
  prompt();
}

rl.close();
