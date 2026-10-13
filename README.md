# scratch-agent

A coding agent built from scratch in ~380 lines of TypeScript. No SDK and no framework: raw HTTP calls, hand-written tool schemas, and a macOS kernel sandbox.

I'm building it to understand exactly what happens inside tools like Claude Code and Pi, and I'm writing up each step as I go.

A real run, condensed:

```
$ node src/main.ts
> Run the tests with `node --test`, fix whatever fails, and confirm they pass.
[step 1 tool_calls]   -> bash({"command": "node --test"})          <- exit code 1
[step 2 tool_calls]   -> read_file({"path": "stats.js"})
[step 3 tool_calls]   -> edit_file({"path": "stats.js", ...})      <- edited stats.js
[step 4 tool_calls]   -> bash({"command": "node --test"})          <- exit code 0

Fixed both tests: `mean` divided by length - 1, and `max` started at 0 so negatives failed.
```

## What it does

- **Agent loop:** call the model, run the tools it asks for, send the results back, and repeat until it answers (capped at 20 steps per turn).
- **Tools:** `list_files`, `read_file`, `edit_file` (exact-match replace, or create a file), `bash`.
- **Sandboxed shell:** on macOS, commands run under Seatbelt (`sandbox-exec`): writes only inside the project and temp dirs, and no network. Elsewhere, every command needs your approval.
- **Safe failures:** tool errors go back to the model as text so it can correct itself; paths can't escape the working directory; timeouts kill the whole process tree.

## Run it

Requires Node 24+ (runs `.ts` directly, no build step) and an [OpenCode Go](https://opencode.ai/docs/go/) API key. Any OpenAI-compatible endpoint should work.

```sh
export OPENCODE_API_KEY=...
cd /path/to/some/project
node /path/to/scratch-agent/src/main.ts
```

| Env var | Default | Purpose |
|---|---|---|
| `MODEL` | `kimi-k2.7-code` | Model id |
| `SANDBOX` | `seatbelt` on macOS, `host` elsewhere | `host` asks before each command |
| `OPENCODE_BASE_URL` | `https://opencode.ai/zen/go/v1` | Any OpenAI-compatible base URL |

REPL commands: `/reset` (new conversation), `/history` (dump the messages sent to the model), `/exit`.

## How it works

```
user ─▶ history ─▶ POST /chat/completions ─▶ assistant message
            ▲                                      │
            │                        tool_calls? ──┤── no ─▶ print answer
            │                                      │ yes
            └──── role:"tool" results ◀── run each tool (sandboxed)
```

| File | What's in it |
|---|---|
| `src/llm.ts` | Raw `fetch` client and message types |
| `src/tools.ts` | Tool schemas + implementations, path guard |
| `src/shell.ts` | `host` and `seatbelt` shell backends, timeout, output cap |
| `src/main.ts` | REPL and the per-turn agent loop |

## What I learned so far

- **The model has no memory.** The whole history is resent every turn, so input tokens grow with every step. That's why context management matters.
- **A tool call isn't valid until its result is in the history.** That's why tool support and the loop arrive together.
- **Tool arguments are a JSON string** the model writes, and it can be malformed. Parse defensively.
- **Prompt caching rewards append-only history.** The cached prefix grew in 256-token blocks across steps. Editing old messages would break it.
- **Thinking models return `reasoning_content`.** Send the assistant message back unchanged.
- **Kernel sandboxing beats approval prompts.** Seatbelt applies to every child process, so real `node`/`npm`/`git` work while writes and network are blocked.

## Status

| Step | |
|---|---|
| Single call, chat loop, tools, agent loop | ✅ |
| `bash` with approval + Seatbelt sandbox | ✅ |
| Loop hardening (retries, length cut-offs, Ctrl-C) | next |
| Streaming, context accounting, compaction, saved sessions | planned |

## License

MIT
