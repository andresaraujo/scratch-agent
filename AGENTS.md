# AGENTS.md

A learning project: a coding agent built from scratch. Keep it small and readable; the code is the explanation.

## Rules
- **No runtime dependencies.** Raw `fetch`, Node built-ins only. Dev deps (`typescript`, `@types/node`) are fine.
- Node 24 runs `.ts` directly via type stripping: use only erasable TS syntax (no enums, no namespaces, no parameter properties).
- Tools never throw into the loop. Return `error: ...` strings so the model can recover.
- Keep the per-file header comments that explain each phase. Add one when you add a concept.
- Never put API keys in files. The key comes from `OPENCODE_API_KEY`.

## Commands
- Typecheck: `npx tsc --noEmit`
- Run: `node src/main.ts` from the project you want the agent to work in
- Non-interactive test: `printf 'prompt\n/exit\n' | node src/main.ts`
