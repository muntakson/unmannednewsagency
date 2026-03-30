export const type = "ollama_local";
export const label = "Ollama (local)";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.1";

export const models = [
  { id: "llama3.1", label: "Llama 3.1" },
  { id: "llama3.2", label: "Llama 3.2" },
  { id: "llama3.3", label: "Llama 3.3" },
  { id: "codellama", label: "Code Llama" },
  { id: "deepseek-coder-v2", label: "DeepSeek Coder V2" },
  { id: "mistral", label: "Mistral" },
  { id: "mixtral", label: "Mixtral" },
  { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
  { id: "gemma2", label: "Gemma 2" },
  { id: "phi3", label: "Phi-3" },
];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want to run agents against a local Ollama instance (no cloud API keys needed)
- You need full privacy — all inference stays on the local machine
- You have Ollama installed and running with a pulled model

Don't use when:
- You need session persistence across runs (Ollama has no built-in session/thread system)
- You need an autonomous coding agent with file editing capabilities (use claude_local or codex_local instead)

Core fields:
- cwd (string, optional): working directory for context
- baseUrl (string, optional): Ollama API base URL, defaults to "http://localhost:11434"
- model (string, required): Ollama model name (e.g. "llama3.1", "codellama", "mistral")
- promptTemplate (string, optional): run prompt template
- systemPrompt (string, optional): system message prepended to the conversation
- temperature (number, optional): sampling temperature (0.0 - 2.0)
- numCtx (number, optional): context window size in tokens

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (0 = no timeout)
- graceSec (number, optional): SIGTERM grace period in seconds

Tool use fields:
- enableTools (boolean, optional): enable Paperclip API tool calling (default: true). Agents can list/update/create issues, add comments, and list agents.

Notes:
- This adapter calls Ollama's /api/chat endpoint directly via HTTP (no CLI needed).
- Make sure the model is pulled before use: \`ollama pull <model>\`
- Ollama must be running: \`ollama serve\` or via systemd/Docker.
- No session persistence — each run starts a fresh conversation.
- Token usage is reported from Ollama's response metadata when available.
- Tool calling requires a model that supports Ollama's tools API (llama3.1+, qwen2.5+, mistral, etc.).
`;
