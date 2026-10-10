// Phase 1.1: single LLM call against OpenCode Go (OpenAI-compatible chat completions).
// No SDK on purpose: see the raw wire format.

const BASE_URL = process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/go/v1";
const MODEL = process.env.MODEL ?? "kimi-k2.7-code";
const API_KEY = process.env.OPENCODE_API_KEY;

if (!API_KEY) {
  console.error("OPENCODE_API_KEY not set");
  process.exit(1);
}

const SESSION_ID = crypto.randomUUID();
const prompt =process.argv.slice(2).join(" ") || "Say hi in 5 words.";

const res = await fetch(`${BASE_URL}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
    // OpenCode Go requires: stable per-conversation session id (routing + prompt caching) and own UA.
    "x-opencode-session": SESSION_ID,
    "User-Agent": "scratch-agent/0.1",
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!res.ok) {
  console.error(res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
const choice = data.choices[0];
console.log(choice.message.content);
console.log("\n---");
console.log("finish_reason:", choice.finish_reason);
console.log("usage:", data.usage);
