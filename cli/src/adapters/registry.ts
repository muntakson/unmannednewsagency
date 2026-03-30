import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printClaudeStreamEvent } from "@paperclipai/adapter-claude-local/cli";
import { printCodexStreamEvent } from "@paperclipai/adapter-codex-local/cli";
import { printCursorStreamEvent } from "@paperclipai/adapter-cursor-local/cli";
import { printOpenCodeStreamEvent } from "@paperclipai/adapter-opencode-local/cli";
import { printOpenClawStreamEvent } from "@paperclipai/adapter-openclaw/cli";
import { printOllamaStreamEvent } from "@paperclipai/adapter-ollama-local/cli";
import { printGroqStreamEvent } from "@paperclipai/adapter-groq/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const claudeLocalCLIAdapter: CLIAdapterModule = {
  type: "claude_local",
  formatStdoutEvent: printClaudeStreamEvent,
};

const codexLocalCLIAdapter: CLIAdapterModule = {
  type: "codex_local",
  formatStdoutEvent: printCodexStreamEvent,
};

const opencodeLocalCLIAdapter: CLIAdapterModule = {
  type: "opencode_local",
  formatStdoutEvent: printOpenCodeStreamEvent,
};

const cursorLocalCLIAdapter: CLIAdapterModule = {
  type: "cursor",
  formatStdoutEvent: printCursorStreamEvent,
};

const openclawCLIAdapter: CLIAdapterModule = {
  type: "openclaw",
  formatStdoutEvent: printOpenClawStreamEvent,
};

const ollamaLocalCLIAdapter: CLIAdapterModule = {
  type: "ollama_local",
  formatStdoutEvent: printOllamaStreamEvent,
};

const groqCLIAdapter: CLIAdapterModule = {
  type: "groq",
  formatStdoutEvent: printGroqStreamEvent,
};

const adaptersByType = new Map<string, CLIAdapterModule>(
  [claudeLocalCLIAdapter, codexLocalCLIAdapter, opencodeLocalCLIAdapter, cursorLocalCLIAdapter, openclawCLIAdapter, ollamaLocalCLIAdapter, groqCLIAdapter, processCLIAdapter, httpCLIAdapter].map((a) => [a.type, a]),
);

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? processCLIAdapter;
}
