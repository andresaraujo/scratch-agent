// Phase 1.3: tools. Each tool = JSON schema the model sees + a function we run.
// Errors are returned as strings: the model reads them and can retry. Never throw into the loop.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ToolSchema } from "./llm.ts";

type Tool = {
  schema: ToolSchema;
  run: (args: Record<string, string>) => Promise<string>;
};

const ROOT = process.cwd();
const MAX_READ_CHARS = 50_000;

// Keep the model inside the working directory.
function resolveInRoot(p: string): string {
  const abs = path.resolve(ROOT, p);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw new Error(`path outside working dir: ${p}`);
  return abs;
}

function tool(
  name: string,
  description: string,
  properties: Record<string, { type: string; description: string }>,
  required: string[],
  run: Tool["run"],
): Tool {
  return {
    schema: { type: "function", function: { name, description, parameters: { type: "object", properties, required } } },
    run,
  };
}

const tools: Tool[] = [
  tool(
    "list_files",
    "List files and directories at a path (non-recursive). Directories end with '/'.",
    { path: { type: "string", description: "Directory path relative to the working dir. Use '.' for root." } },
    ["path"],
    async ({ path: p }) => {
      const entries = await fs.readdir(resolveInRoot(p), { withFileTypes: true });
      return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).sort().join("\n") || "(empty)";
    },
  ),
  tool(
    "read_file",
    "Read a text file's full contents.",
    { path: { type: "string", description: "File path relative to the working dir." } },
    ["path"],
    async ({ path: p }) => {
      const text = await fs.readFile(resolveInRoot(p), "utf8");
      return text.length > MAX_READ_CHARS
        ? `${text.slice(0, MAX_READ_CHARS)}\n...[truncated, ${text.length} chars total]`
        : text;
    },
  ),
  tool(
    "edit_file",
    "Replace old_str with new_str in a file. old_str must match exactly once. " +
      "To create a new file, pass an empty old_str and the full content as new_str.",
    {
      path: { type: "string", description: "File path relative to the working dir." },
      old_str: { type: "string", description: "Exact text to replace (unique in file). Empty to create a file." },
      new_str: { type: "string", description: "Replacement text." },
    },
    ["path", "old_str", "new_str"],
    async ({ path: p, old_str, new_str }) => {
      const abs = resolveInRoot(p);
      if (old_str === "") {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, new_str, { flag: "wx" }); // fail if exists
        return `created ${p}`;
      }
      const text = await fs.readFile(abs, "utf8");
      const count = text.split(old_str).length - 1;
      if (count === 0) return `error: old_str not found in ${p}`;
      if (count > 1) return `error: old_str matches ${count} times in ${p}; add surrounding context`;
      await fs.writeFile(abs, text.replace(old_str, () => new_str));
      return `edited ${p}`;
    },
  ),
];

export const toolSchemas = tools.map((t) => t.schema);

export async function runTool(name: string, rawArgs: string): Promise<string> {
  const t = tools.find((t) => t.schema.function.name === name);
  if (!t) return `error: unknown tool ${name}`;
  let args: Record<string, string>;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return `error: arguments are not valid JSON: ${rawArgs}`;
  }
  try {
    return await t.run(args);
  } catch (err) {
    return `error: ${(err as Error).message}`;
  }
}
