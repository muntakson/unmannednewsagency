import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseOllamaStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const type = asString(parsed.type);

  if (type === "init") {
    return [{
      kind: "init",
      ts,
      model: asString(parsed.model, "ollama"),
      sessionId: "",
    }];
  }

  if (type === "content") {
    const text = asString(parsed.text);
    if (text) {
      return [{ kind: "assistant", ts, text }];
    }
    return [];
  }

  if (type === "done") {
    const inputTokens = asNumber(parsed.prompt_eval_count);
    const outputTokens = asNumber(parsed.eval_count);
    return [{
      kind: "result",
      ts,
      text: "",
      inputTokens,
      outputTokens,
      cachedTokens: 0,
      costUsd: 0,
      subtype: "done",
      isError: false,
      errors: [],
    }];
  }

  if (type === "tool_call") {
    return [{
      kind: "tool_call",
      ts,
      name: asString(parsed.name, "unknown"),
      input: parsed.arguments ?? {},
    }];
  }

  if (type === "tool_result") {
    const resultText = asString(parsed.result, "");
    return [{
      kind: "tool_result",
      ts,
      toolUseId: asString(parsed.name, ""),
      content: resultText,
      isError: false,
    }];
  }

  if (type === "error") {
    const message = asString(parsed.message, "Unknown error");
    return [{
      kind: "result",
      ts,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      subtype: "error",
      isError: true,
      errors: [message],
    }];
  }

  return [{ kind: "stdout", ts, text: line }];
}
