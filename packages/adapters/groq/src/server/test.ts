import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_GROQ_BASE_URL, DEFAULT_GROQ_MODEL } from "../index.js";

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
  const baseUrl = asString(config.baseUrl, DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");
  const apiKey = asString(config.apiKey, "");
  const model = asString(config.model, DEFAULT_GROQ_MODEL);

  if (!apiKey) {
    checks.push({
      code: "groq_no_api_key",
      level: "error",
      message: "No Groq API key configured.",
      hint: "Set apiKey in the adapter config (starts with gsk_).",
    });
    return { adapterType: ctx.adapterType, status: "fail", checks, testedAt: new Date().toISOString() };
  }

  // Check API reachability
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      checks.push({
        code: "groq_reachable",
        level: "info",
        message: `Groq API is reachable at ${baseUrl}`,
      });
    } else {
      checks.push({
        code: "groq_auth_failed",
        level: "error",
        message: `Groq API returned HTTP ${res.status}`,
        hint: res.status === 401 ? "Check your API key." : "Check the base URL.",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "groq_unreachable",
      level: "error",
      message: `Cannot connect to Groq API at ${baseUrl}`,
      detail: message,
    });
  }

  // Hello probe
  if (checks.every((c) => c.level !== "error")) {
    try {
      const probeRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Respond with hello." }],
          max_tokens: 32,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (probeRes.ok) {
        const data = await probeRes.json() as any;
        const reply = (data.choices?.[0]?.message?.content ?? "").trim();
        const hasHello = /\bhello\b/i.test(reply);
        checks.push({
          code: hasHello ? "groq_hello_probe_passed" : "groq_hello_probe_unexpected",
          level: hasHello ? "info" : "warn",
          message: hasHello ? "Groq hello probe succeeded." : "Probe ran but did not return `hello`.",
          ...(reply ? { detail: reply.slice(0, 240) } : {}),
        });
      } else {
        const errBody = await probeRes.text().catch(() => "");
        checks.push({
          code: "groq_hello_probe_failed",
          level: "error",
          message: `Groq probe returned HTTP ${probeRes.status}`,
          detail: errBody.slice(0, 240) || undefined,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.push({
        code: "groq_hello_probe_failed",
        level: "warn",
        message: `Groq hello probe failed: ${message}`,
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
