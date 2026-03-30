import type { AdapterModel } from "./types.js";
import { models as ollamaFallbackModels } from "@paperclipai/adapter-ollama-local";

const OLLAMA_TAGS_TIMEOUT_MS = 5000;
const OLLAMA_TAGS_CACHE_TTL_MS = 30_000;
const DEFAULT_BASE_URL = "http://localhost:11434";

let cached: { baseUrl: string; expiresAt: number; models: AdapterModel[] } | null = null;

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

async function fetchOllamaModels(baseUrl: string): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TAGS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { models?: unknown };
    const models = Array.isArray(payload.models) ? payload.models : [];
    const result: AdapterModel[] = [];
    for (const item of models) {
      if (typeof item !== "object" || item === null) continue;
      const name = (item as { name?: unknown }).name;
      if (typeof name !== "string" || name.trim().length === 0) continue;
      const id = name.replace(/:latest$/, "");
      result.push({ id, label: id });
    }
    return dedupeModels(result);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOllamaModels(): Promise<AdapterModel[]> {
  const baseUrl = DEFAULT_BASE_URL;
  const fallback = dedupeModels(ollamaFallbackModels);
  const now = Date.now();

  if (cached && cached.baseUrl === baseUrl && cached.expiresAt > now) {
    return cached.models;
  }

  const fetched = await fetchOllamaModels(baseUrl);
  if (fetched.length > 0) {
    const merged = dedupeModels([...fetched, ...fallback])
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }));
    cached = { baseUrl, expiresAt: now + OLLAMA_TAGS_CACHE_TTL_MS, models: merged };
    return merged;
  }

  if (cached && cached.baseUrl === baseUrl && cached.models.length > 0) {
    return cached.models;
  }

  return fallback;
}
