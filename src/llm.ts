// Raw OpenAI-compatible chat completions client for OpenCode Go. No SDK on purpose.

const BASE_URL = process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/go/v1";
export const MODEL = process.env.MODEL ?? "kimi-k2.7-code";
const API_KEY = process.env.OPENCODE_API_KEY;

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string }; // arguments is a JSON *string*, may be malformed
};

export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  reasoning_content?: string; // thinking models: send back unchanged, esp. around tool calls
  tool_calls?: ToolCall[];
};

export type Message =
  | { role: "system" | "user"; content: string }
  | AssistantMessage
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSchema = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

export type Completion = {
  message: AssistantMessage;
  finish_reason: string;
  usage: Usage;
};

export async function complete(
  messages: Message[],
  sessionId: string,
  tools: ToolSchema[] = [],
): Promise<Completion> {
  if (!API_KEY) throw new Error("OPENCODE_API_KEY not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      // OpenCode Go requires: stable per-conversation session id (routing + prompt caching) and own UA.
      "x-opencode-session": sessionId,
      "User-Agent": "scratch-agent/0.1",
    },
    body: JSON.stringify({ model: MODEL, messages, ...(tools.length && { tools }) }),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

  const data = await res.json();
  const choice = data.choices[0];
  return { message: choice.message, finish_reason: choice.finish_reason, usage: data.usage };
}
