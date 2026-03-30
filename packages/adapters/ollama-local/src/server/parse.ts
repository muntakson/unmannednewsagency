import { asString, asNumber, parseJson } from "@paperclipai/adapter-utils/server-utils";

export interface OllamaParsedResponse {
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  errorMessage: string | null;
}

export function parseOllamaResponse(stdout: string): OllamaParsedResponse {
  let model = "";
  const contentParts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const type = asString(event.type, "");

    if (type === "init") {
      model = asString(event.model, model);
      continue;
    }

    if (type === "content") {
      const text = asString(event.text, "");
      if (text) contentParts.push(text);
      continue;
    }

    if (type === "done") {
      model = asString(event.model, model);
      inputTokens = asNumber(event.prompt_eval_count, inputTokens);
      outputTokens = asNumber(event.eval_count, outputTokens);
      continue;
    }

    if (type === "error") {
      errorMessage = asString(event.message, "Unknown Ollama error");
      continue;
    }
  }

  return {
    model,
    content: contentParts.join(""),
    inputTokens,
    outputTokens,
    errorMessage,
  };
}
