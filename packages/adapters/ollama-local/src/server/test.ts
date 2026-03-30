import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, asNumber, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from "../index.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);

  // Check 1: Ollama reachability
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      checks.push({
        code: "ollama_reachable",
        level: "info",
        message: `Ollama is reachable at ${baseUrl}`,
      });

      // Check if the configured model is available
      const data = await res.json() as { models?: Array<{ name?: string }> };
      const availableModels = (data.models ?? [])
        .map((m) => typeof m.name === "string" ? m.name.replace(/:latest$/, "") : "")
        .filter(Boolean);

      const modelBase = model.replace(/:latest$/, "");
      const modelFound = availableModels.some(
        (m) => m === modelBase || m.startsWith(modelBase + ":"),
      );

      if (modelFound) {
        checks.push({
          code: "ollama_model_available",
          level: "info",
          message: `Model "${model}" is available locally.`,
        });
      } else {
        checks.push({
          code: "ollama_model_missing",
          level: "warn",
          message: `Model "${model}" is not pulled yet.`,
          hint: `Run \`ollama pull ${model}\` to download it.`,
          detail: availableModels.length > 0
            ? `Available models: ${availableModels.slice(0, 10).join(", ")}`
            : "No models found. Pull a model first.",
        });
      }
    } else {
      checks.push({
        code: "ollama_unreachable",
        level: "error",
        message: `Ollama returned HTTP ${res.status} at ${baseUrl}`,
        hint: "Ensure Ollama is running: `ollama serve`",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "ollama_unreachable",
      level: "error",
      message: `Cannot connect to Ollama at ${baseUrl}`,
      detail: message,
      hint: "Ensure Ollama is running (`ollama serve`) and the base URL is correct.",
    });
  }

  // Check 2: Hello probe (only if Ollama is reachable and model exists)
  const canProbe =
    checks.every((c) => c.code !== "ollama_unreachable") &&
    checks.every((c) => c.code !== "ollama_model_missing");

  if (canProbe) {
    try {
      const probeRes = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Respond with hello." }],
          stream: false,
          options: { num_predict: 32 },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (probeRes.ok) {
        const probeData = await probeRes.json() as { message?: { content?: string } };
        const reply = (probeData.message?.content ?? "").trim();
        const hasHello = /\bhello\b/i.test(reply);
        checks.push({
          code: hasHello ? "ollama_hello_probe_passed" : "ollama_hello_probe_unexpected",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "Ollama hello probe succeeded."
            : "Ollama probe ran but did not return `hello` as expected.",
          ...(reply ? { detail: reply.slice(0, 240) } : {}),
        });
      } else {
        const errBody = await probeRes.text().catch(() => "");
        checks.push({
          code: "ollama_hello_probe_failed",
          level: "error",
          message: `Ollama hello probe returned HTTP ${probeRes.status}`,
          detail: errBody.slice(0, 240) || undefined,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = /timeout|abort/i.test(message);
      checks.push({
        code: isTimeout ? "ollama_hello_probe_timed_out" : "ollama_hello_probe_failed",
        level: isTimeout ? "warn" : "error",
        message: isTimeout
          ? "Ollama hello probe timed out (60s). The model may be loading."
          : `Ollama hello probe failed: ${message}`,
        hint: isTimeout
          ? "Retry after the model finishes loading, or try a smaller model."
          : undefined,
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
