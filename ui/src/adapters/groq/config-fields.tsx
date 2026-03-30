import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function GroqConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="Groq API key" hint="Your Groq API key (starts with gsk_)">
        <DraftInput
          value={
            isCreate
              ? values!.apiKey ?? ""
              : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ apiKey: v })
              : mark("adapterConfig", "apiKey", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="gsk_..."
        />
      </Field>
      <Field label="Agent instructions file" hint="Absolute path to a markdown file that defines this agent's behavior.">
        <div className="flex items-center gap-2">
          <DraftInput
            value={
              isCreate
                ? values!.instructionsFilePath ?? ""
                : eff(
                    "adapterConfig",
                    "instructionsFilePath",
                    String(config.instructionsFilePath ?? ""),
                  )
            }
            onCommit={(v) =>
              isCreate
                ? set!({ instructionsFilePath: v })
                : mark("adapterConfig", "instructionsFilePath", v || undefined)
            }
            immediate
            className={inputClass}
            placeholder="/absolute/path/to/AGENTS.md"
          />
          <ChoosePathButton />
        </div>
      </Field>
      <Field label="System prompt" hint="Optional system message prepended to the conversation.">
        <DraftInput
          value={
            isCreate
              ? values!.bootstrapPrompt ?? ""
              : eff("adapterConfig", "systemPrompt", String(config.systemPrompt ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ bootstrapPrompt: v })
              : mark("adapterConfig", "systemPrompt", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="You are a helpful agent..."
        />
      </Field>
    </>
  );
}
