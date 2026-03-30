export const type = "groq";
export const label = "Groq";
export const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export const models = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast)" },
  { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  { id: "gemma2-9b-it", label: "Gemma 2 9B" },
  { id: "qwen-qwq-32b", label: "Qwen QwQ 32B" },
];

export const agentConfigurationDoc = `# groq agent configuration

Adapter: groq

Use when:
- You want fast cloud inference via Groq's LPU hardware
- You need better model quality than local Ollama (70B+ models)
- You have a Groq API key

Don't use when:
- You need full privacy (data goes to Groq's cloud)
- You need session persistence across runs

Core fields:
- apiKey (string, required): Groq API key (starts with gsk_)
- model (string, optional): Model name, defaults to "llama-3.3-70b-versatile"
- baseUrl (string, optional): API base URL, defaults to "https://api.groq.com/openai/v1"
- systemPrompt (string, optional): System message prepended to conversation
- promptTemplate (string, optional): Run prompt template
- temperature (number, optional): Sampling temperature (0.0 - 2.0)
- instructionsFilePath (string, optional): Path to instructions markdown file

Operational fields:
- timeoutSec (number, optional): Run timeout in seconds (0 = no timeout)
- enableTools (boolean, optional): Enable Paperclip API tool calling (default: true)

Notes:
- Uses Groq's OpenAI-compatible /chat/completions endpoint
- Tool calling works with streaming disabled (required for structured tool_calls)
- Token usage is reported from Groq's response metadata
`;
