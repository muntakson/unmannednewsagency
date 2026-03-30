// Reuse ollama's stdout parser — same event format
export { parseOllamaStdoutLine as parseGroqStdoutLine } from "@paperclipai/adapter-ollama-local/ui";
export { buildGroqConfig } from "./build-config.js";
