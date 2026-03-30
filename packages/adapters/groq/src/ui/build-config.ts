import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_GROQ_MODEL, DEFAULT_GROQ_BASE_URL } from "../index.js";

export function buildGroqConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.cwd) ac.cwd = v.cwd;
  if (v.instructionsFilePath) ac.instructionsFilePath = v.instructionsFilePath;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  ac.model = v.model || DEFAULT_GROQ_MODEL;
  ac.baseUrl = (v.url || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");
  if (v.bootstrapPrompt) ac.systemPrompt = v.bootstrapPrompt;
  if (v.apiKey) ac.apiKey = v.apiKey;
  ac.timeoutSec = 0;
  return ac;
}
