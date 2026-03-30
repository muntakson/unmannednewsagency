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
import { DEFAULT_GROQ_BASE_URL, DEFAULT_GROQ_MODEL } from "../index.js";
import { PAPERCLIP_TOOLS, executeTool } from "@paperclipai/adapter-ollama-local/server";
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

  const baseUrl = asString(config.baseUrl, DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");
  const model = asString(config.model, DEFAULT_GROQ_MODEL);
  const apiKey = asString(config.apiKey, "");
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const systemPrompt = asString(config.systemPrompt, "");
  const temperature = asNumber(config.temperature, 0.7);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const enableTools = config.enableTools !== false;

  if (!apiKey) {
    const errLine = JSON.stringify({ type: "error", message: "Groq API key is required. Set apiKey in adapter config." }) + "\n";
    await onLog("stdout", errLine);
    return { exitCode: 1, signal: null, timedOut: false, errorMessage: "Missing Groq API key" };
  }

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
      adapterType: "groq",
      command: `${baseUrl}/chat/completions`,
      cwd: process.cwd(),
      commandNotes: [`model: ${model}`, `temperature: ${temperature}`, `tools: ${enableTools}`],
      env: redactEnvForLogs(env),
      prompt,
      context,
    });
  }

  // Build messages
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

  const toolCtx = {
    apiUrl: env.PAPERCLIP_API_URL,
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
  };

  // Pre-fetch tasks
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
    const initLine = JSON.stringify({ type: "init", model }) + "\n";
    await onLog("stdout", initLine);
    stdout = appendWithCap(stdout, initLine, MAX_CAPTURE);

    // Build OpenAI-format tools
    const openaiTools = enableTools
      ? PAPERCLIP_TOOLS.map((t) => ({
          type: "function" as const,
          function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          },
        }))
      : undefined;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const body: Record<string, unknown> = {
        model,
        messages: messages.map((m) => {
          const msg: Record<string, unknown> = { role: m.role, content: m.content };
          if (m.tool_calls) msg.tool_calls = m.tool_calls;
          if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
          return msg;
        }),
        temperature,
        stream: false,
      };
      if (openaiTools && openaiTools.length > 0) {
        body.tools = openaiTools;
        // Force tool call on first turn to prevent model from outputting tool calls as text
        body.tool_choice = turn === 0 ? "required" : "auto";
      }

      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.status === 429 && attempt < 2) {
          const retryAfter = parseInt(res.headers.get("retry-after") || "", 10);
          const waitMs = (retryAfter > 0 ? retryAfter : (attempt + 1) * 5) * 1000;
          await onLog("stderr", `[paperclip] Rate limited (429), retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/3)\n`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }

      if (!res!.ok) {
        const errBody = await res!.text().catch(() => "");
        const errorMessage = `Groq API returned ${res!.status}: ${errBody}`.trim();
        const errLine = JSON.stringify({ type: "error", message: errorMessage }) + "\n";
        await onLog("stdout", errLine);
        stdout = appendWithCap(stdout, errLine, MAX_CAPTURE);
        return { exitCode: 1, signal: null, timedOut: false, errorMessage };
      }

      const responseJson = await res!.json() as Record<string, unknown>;
      const choices = responseJson.choices as Array<Record<string, unknown>> | undefined;
      const usage = responseJson.usage as Record<string, number> | undefined;
      finalModel = typeof responseJson.model === "string" ? responseJson.model : finalModel;

      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;
      totalInputTokens += promptTokens;
      totalOutputTokens += completionTokens;

      const choice = choices?.[0];
      const msg = choice?.message as Record<string, unknown> | undefined;
      const assistantContent = typeof msg?.content === "string" ? msg.content : "";
      const toolCalls = Array.isArray(msg?.tool_calls) ? msg!.tool_calls as Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }> : [];

      // Fallback: parse tool calls from text content when model outputs them as text
      // e.g. <function(update_issue)>{"issue_id": "..."}
      if (toolCalls.length === 0 && assistantContent) {
        const textToolPattern = /<function(?:=|\()(\w+)\)?>\s*(\{[\s\S]*?\})/g;
        let match: RegExpExecArray | null;
        let callId = 0;
        while ((match = textToolPattern.exec(assistantContent)) !== null) {
          const name = match[1];
          const argsStr = match[2];
          try {
            JSON.parse(argsStr); // validate JSON
            toolCalls.push({
              id: `text_tc_${turn}_${callId++}`,
              type: "function",
              function: { name, arguments: argsStr },
            });
          } catch {
            // invalid JSON, skip
          }
        }
        if (toolCalls.length > 0) {
          await onLog("stderr", `[paperclip] Parsed ${toolCalls.length} tool call(s) from text output (model fallback)\n`);
        }
      }

      if (assistantContent) {
        const contentLine = JSON.stringify({ type: "content", text: assistantContent }) + "\n";
        await onLog("stdout", contentLine);
        stdout = appendWithCap(stdout, contentLine, MAX_CAPTURE);
      }

      const doneLine = JSON.stringify({
        type: "done",
        model: finalModel,
        prompt_eval_count: promptTokens,
        eval_count: completionTokens,
      }) + "\n";
      await onLog("stdout", doneLine);
      stdout = appendWithCap(stdout, doneLine, MAX_CAPTURE);

      if (toolCalls.length === 0) {
        // Nudge logic: if model got tool results but only described, push it to act
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

      // Add assistant message with tool calls
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
      messages.push(assistantMsg);

      // Execute each tool
      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        const toolEventLine = JSON.stringify({
          type: "tool_call",
          name: tc.function.name,
          arguments: args,
        }) + "\n";
        await onLog("stdout", toolEventLine);
        stdout = appendWithCap(stdout, toolEventLine, MAX_CAPTURE);

        const result = await executeTool(tc.function.name, args, toolCtx);

        const toolResultLine = JSON.stringify({
          type: "tool_result",
          name: tc.function.name,
          result: result.slice(0, 2000),
        }) + "\n";
        await onLog("stdout", toolResultLine);
        stdout = appendWithCap(stdout, toolResultLine, MAX_CAPTURE);

        // OpenAI format: tool results have role "tool" and tool_call_id
        messages.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
        });
      }
    }

    // Parse content from stdout for summary
    const contentParts: string[] = [];
    for (const line of stdout.split("\n")) {
      try {
        const p = JSON.parse(line);
        if (p.type === "content" && p.text) contentParts.push(p.text);
      } catch {}
    }

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      errorMessage: null,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      provider: "groq",
      model: finalModel,
      billingType: "subscription" as const,
      costUsd: 0,
      resultJson: { stdout },
      summary: contentParts.join("").trim() || null,
    };
  } catch (err) {
    if (timedOut) {
      return { exitCode: null, signal: "SIGTERM", timedOut: true, errorMessage: `Timed out after ${timeoutSec}s` };
    }
    const message = err instanceof Error ? err.message : String(err);
    const errorMessage = `Groq request failed: ${message}`;
    const errLine = JSON.stringify({ type: "error", message: errorMessage }) + "\n";
    await onLog("stdout", errLine);
    return { exitCode: 1, signal: null, timedOut: false, errorMessage };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
