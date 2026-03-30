import pc from "picocolors";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function printOllamaStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    console.log(line);
    return;
  }

  const type = asString(parsed.type);

  if (type === "init") {
    const model = asString(parsed.model);
    console.log(pc.blue(`Ollama started (model: ${model})`));
    return;
  }

  if (type === "content") {
    const text = asString(parsed.text);
    if (text) process.stdout.write(pc.green(text));
    return;
  }

  if (type === "done") {
    const model = asString(parsed.model);
    const promptTokens = asNumber(parsed.prompt_eval_count);
    const evalTokens = asNumber(parsed.eval_count);
    // Newline after streamed content
    console.log();
    console.log(
      pc.blue(`done (model: ${model}, prompt_tokens: ${promptTokens}, eval_tokens: ${evalTokens})`),
    );
    return;
  }

  if (type === "tool_call") {
    const name = asString(parsed.name);
    console.log(pc.yellow(`\ntool_call: ${name}(${JSON.stringify(parsed.arguments ?? {})})`));
    return;
  }

  if (type === "tool_result") {
    const name = asString(parsed.name);
    const result = asString(parsed.result);
    const preview = result.length > 200 ? result.slice(0, 200) + "..." : result;
    console.log(pc.cyan(`tool_result [${name}]: ${preview}`));
    return;
  }

  if (type === "error") {
    const message = asString(parsed.message, "Unknown error");
    console.log(pc.red(`error: ${message}`));
    return;
  }

  console.log(line);
}
