import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  parseObject,
  buildPaperclipEnv,
  redactEnvForLogs,
  renderTemplate,
  appendWithCap,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from "../index.js";
import { parseOllamaResponse } from "./parse.js";
import { PAPERCLIP_TOOLS, executeTool } from "./tools.js";
import fs from "node:fs/promises";

const MAX_CAPTURE = 4 * 1024 * 1024;
const MAX_TOOL_TURNS = 15;

interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta } = ctx;

  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const systemPrompt = asString(config.systemPrompt, "");
  const temperature = asNumber(config.temperature, 0.7);
  const maxTokens = asNumber(config.maxTokens, 4096);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const cwd = asString(config.cwd, process.cwd());
  const enableTools = config.enableTools !== false;

  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  let instructionsPrefix = "";
  if (instructionsFilePath) {
    try {
      instructionsPrefix = await fs.readFile(instructionsFilePath, "utf8") + "\n\n";
      await onLog("stderr", `[paperclip] Loaded agent instructions file: ${instructionsFilePath}\n`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog("stderr", `[paperclip] Warning: could not read instructions file "${instructionsFilePath}": ${reason}\n`);
    }
  }

  const renderedPrompt = renderTemplate(promptTemplate, {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  });
  const prompt = `${instructionsPrefix}${renderedPrompt}`;

  const env = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  if (onMeta) {
    await onMeta({
      adapterType: "ollama_local",
      command: `${baseUrl}/v1/chat/completions`,
      cwd,
      commandNotes: [`model: ${model}`, `temperature: ${temperature}`, `tools: ${enableTools}`],
      env: redactEnvForLogs(env),
      prompt,
      context,
    });
  }

  // Build initial messages
  const messages: ChatMessage[] = [];
  const toolSystemAddendum = enableTools
    ? "\n\nYou have access to Paperclip API tools. Use them to take REAL actions — do not just describe what you would do." +
      "\n\nIMPORTANT workflow:" +
      "\n1. First, call list_my_issues (without a status filter) to see ALL your assigned tasks across all statuses (todo, in_progress, in_review, done)." +
      "\n2. Pick up a 'todo' task by updating its status to 'in_progress' with update_issue." +
      "\n3. Do the work: write content into the issue description using update_issue." +
      "\n4. When done, update the status to 'in_review' (for articles) or 'done' (for completed tasks)." +
      "\n5. You can create new issues with create_issue to assign work to other agents." +
      "\nAlways start by listing your tasks. Always update issue status and description using the tools."
    : "";
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt + toolSystemAddendum });
  } else if (toolSystemAddendum) {
    messages.push({ role: "system", content: toolSystemAddendum.trim() });
  }
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  if (timeoutSec > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutSec * 1000);
  }

  let stdout = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalModel = model;
  let errorMessage: string | null = null;

  const toolCtx = {
    apiUrl: env.PAPERCLIP_API_URL,
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
  };

  // Pre-fetch the agent's tasks and inject them into the prompt context
  if (enableTools) {
    try {
      const allTasks = await executeTool("list_my_issues", {}, toolCtx);
      const parsed = JSON.parse(allTasks);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const grouped: Record<string, string[]> = {};
        for (const t of parsed) {
          const s = t.status || "unknown";
          if (!grouped[s]) grouped[s] = [];
          grouped[s].push(`  - [${t.id}] "${t.title}" (priority: ${t.priority || "none"})`);
        }
        let taskContext = "\n\nYour current assigned tasks:\n";
        for (const [status, items] of Object.entries(grouped)) {
          taskContext += `\n${status.toUpperCase()}:\n${items.join("\n")}\n`;
        }
        taskContext += "\nUse the update_issue tool with the issue ID to change status and write content.";
        messages[messages.length - 1].content += taskContext;
      } else {
        messages[messages.length - 1].content +=
          "\n\nYou currently have no assigned tasks. Use list_company_issues to find unassigned work, or create new issues.";
      }
      await onLog("stderr", `[paperclip] Pre-fetched ${Array.isArray(parsed) ? parsed.length : 0} tasks for agent\n`);
    } catch (prefetchErr) {
      await onLog("stderr", `[paperclip] Pre-fetch failed: ${prefetchErr instanceof Error ? prefetchErr.message : String(prefetchErr)}\n`);
    }
  }

  try {
    // Emit init event
    const initLine = JSON.stringify({ type: "init", model }) + "\n";
    await onLog("stdout", initLine);
    stdout = appendWithCap(stdout, initLine, MAX_CAPTURE);

    // Conversation loop: call vLLM OpenAI API, handle tool calls, repeat
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
        max_tokens: 2048,
        chat_template_kwargs: { enable_thinking: false },
      };
      if (enableTools) {
        body.tools = PAPERCLIP_TOOLS;
      }

      const bodyJson = JSON.stringify(body);
      await onLog("stderr", `[paperclip] vLLM request: ${bodyJson.length} bytes, ${messages.length} messages, turn ${turn}\n`);

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyJson,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        errorMessage = `vLLM API returned ${res.status}: ${errBody.slice(0, 500)}`.trim();
        const errLine = JSON.stringify({ type: "error", message: errorMessage }) + "\n";
        await onLog("stdout", errLine);
        stdout = appendWithCap(stdout, errLine, MAX_CAPTURE);
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage,
        };
      }

      const responseJson = await res.json() as Record<string, unknown>;
      const choices = responseJson.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      const msg = choice?.message as Record<string, unknown> | undefined;
      const usage = responseJson.usage as Record<string, number> | undefined;

      finalModel = typeof responseJson.model === "string" ? responseJson.model : finalModel;
      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;
      totalInputTokens += promptTokens;
      totalOutputTokens += completionTokens;

      let assistantContent = "";
      if (msg && typeof msg.content === "string" && msg.content) {
        assistantContent = msg.content;
        const contentLine = JSON.stringify({ type: "content", text: msg.content }) + "\n";
        await onLog("stdout", contentLine);
        stdout = appendWithCap(stdout, contentLine, MAX_CAPTURE);
      }

      // Parse tool calls (OpenAI format)
      const toolCalls: Array<{ id: string; function: { name: string; arguments: Record<string, unknown> } }> = [];
      if (msg && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls as Array<any>) {
          if (tc?.function?.name) {
            let args: Record<string, unknown> = {};
            if (typeof tc.function.arguments === "string") {
              try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
            } else if (typeof tc.function.arguments === "object" && tc.function.arguments) {
              args = tc.function.arguments;
            }
            toolCalls.push({
              id: tc.id || `call_${turn}_${toolCalls.length}`,
              function: { name: tc.function.name, arguments: args },
            });
          }
        }
      }

      const doneLine = JSON.stringify({
        type: "done",
        model: finalModel,
        prompt_eval_count: promptTokens,
        eval_count: completionTokens,
      }) + "\n";
      await onLog("stdout", doneLine);
      stdout = appendWithCap(stdout, doneLine, MAX_CAPTURE);

      // If no tool calls, check if we should nudge the model
      if (toolCalls.length === 0) {
        const hasToolResults = messages.some((m) => m.role === "tool");
        const hasActed = messages.filter((m) => m.role === "tool").length >= 2;
        if (hasToolResults && !hasActed && turn < MAX_TOOL_TURNS - 1) {
          messages.push({ role: "assistant", content: assistantContent });
          messages.push({
            role: "user",
            content:
              "Now take action using the tools. Update the issue status to in_progress, then do the work (write content into the description), then set status to in_review or done. Use update_issue to make changes.",
          });
          continue;
        }
        break;
      }

      // Add assistant message with tool_calls to conversation history
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments),
          },
        })),
      };
      messages.push(assistantMsg);

      // Execute each tool call and add results
      for (const tc of toolCalls) {
        const toolEventLine = JSON.stringify({
          type: "tool_call",
          name: tc.function.name,
          arguments: tc.function.arguments,
        }) + "\n";
        await onLog("stdout", toolEventLine);
        stdout = appendWithCap(stdout, toolEventLine, MAX_CAPTURE);

        const result = await executeTool(tc.function.name, tc.function.arguments, toolCtx);

        const toolResultLine = JSON.stringify({
          type: "tool_result",
          name: tc.function.name,
          result: result.slice(0, 2000),
        }) + "\n";
        await onLog("stdout", toolResultLine);
        stdout = appendWithCap(stdout, toolResultLine, MAX_CAPTURE);

        // Truncate tool results to keep context manageable
        const truncatedResult = result.length > 3000 ? result.slice(0, 3000) + "\n...(truncated)" : result;
        messages.push({
          role: "tool",
          content: truncatedResult,
          tool_call_id: tc.id,
        });
      }
    }

    const result = parseOllamaResponse(stdout);

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      errorMessage: result.errorMessage,
      usage: {
        inputTokens: totalInputTokens || result.inputTokens,
        outputTokens: totalOutputTokens || result.outputTokens,
      },
      provider: "vllm",
      model: result.model || model,
      billingType: "subscription" as const,
      costUsd: 0,
      resultJson: { stdout },
      summary: result.content.trim() || null,
    };
  } catch (err) {
    if (timedOut) {
      return {
        exitCode: null,
        signal: "SIGTERM",
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    const isConnectionRefused = /ECONNREFUSED|fetch failed|network/i.test(message);
    errorMessage = isConnectionRefused
      ? `Cannot connect to vLLM at ${baseUrl}. Is the vLLM server running?`
      : `vLLM request failed: ${message}`;

    const errLine = JSON.stringify({ type: "error", message: errorMessage }) + "\n";
    await onLog("stdout", errLine);

    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
