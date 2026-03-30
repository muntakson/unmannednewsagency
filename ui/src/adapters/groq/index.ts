import type { UIAdapterModule } from "../types";
import { parseGroqStdoutLine } from "@paperclipai/adapter-groq/ui";
import { GroqConfigFields } from "./config-fields";
import { buildGroqConfig } from "@paperclipai/adapter-groq/ui";

export const groqUIAdapter: UIAdapterModule = {
  type: "groq",
  label: "Groq",
  parseStdoutLine: parseGroqStdoutLine,
  ConfigFields: GroqConfigFields,
  buildAdapterConfig: buildGroqConfig,
};
