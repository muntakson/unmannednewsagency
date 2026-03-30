import type { UIAdapterModule } from "./types";
import { claudeLocalUIAdapter } from "./claude-local";
import { codexLocalUIAdapter } from "./codex-local";
import { cursorLocalUIAdapter } from "./cursor";
import { openCodeLocalUIAdapter } from "./opencode-local";
import { openClawUIAdapter } from "./openclaw";
import { ollamaLocalUIAdapter } from "./ollama-local";
import { groqUIAdapter } from "./groq";
import { processUIAdapter } from "./process";
import { httpUIAdapter } from "./http";

const adaptersByType = new Map<string, UIAdapterModule>(
  [claudeLocalUIAdapter, codexLocalUIAdapter, openCodeLocalUIAdapter, cursorLocalUIAdapter, openClawUIAdapter, ollamaLocalUIAdapter, groqUIAdapter, processUIAdapter, httpUIAdapter].map((a) => [a.type, a]),
);

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? processUIAdapter;
}
