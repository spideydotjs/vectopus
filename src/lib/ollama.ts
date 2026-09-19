/**
 * Ollama client for local LLM inference (default model: qwen2.5-coder:1.5b)
 */

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export function getOllamaConfig(): OllamaConfig {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const rawModel = (process.env.OLLAMA_MODEL || "qwen2.5-coder:1.5b").trim();
  // Support aliases like qwen-2.5-coder -> qwen2.5-coder
  const model = rawModel === "qwen-2.5-coder" ? "qwen2.5-coder:1.5b" : rawModel;
  return { baseUrl, model };
}

export interface OllamaHealth {
  isOnline: boolean;
  models: string[];
  hasModel: boolean;
  model: string;
  baseUrl: string;
}

/**
 * Check if the Ollama service is reachable and has the target model installed.
 */
export async function checkOllamaHealth(customBaseUrl?: string, customModel?: string): Promise<OllamaHealth> {
  const config = getOllamaConfig();
  const baseUrl = (customBaseUrl || config.baseUrl).replace(/\/$/, "");
  const targetModel = customModel || config.model;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        isOnline: false,
        models: [],
        hasModel: false,
        model: targetModel,
        baseUrl,
      };
    }

    const data = await res.json();
    const models: string[] = (data.models || []).map((m: { name?: string }) => m.name || "");
    const hasModel = models.some(
      (m) => m === targetModel || m.startsWith(`${targetModel}:`) || targetModel.startsWith(m)
    );

    return {
      isOnline: true,
      models,
      hasModel,
      model: targetModel,
      baseUrl,
    };
  } catch {
    return {
      isOnline: false,
      models: [],
      hasModel: false,
      model: targetModel,
      baseUrl,
    };
  }
}

export interface GenerateOllamaOptions {
  prompt: string;
  system?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  format?: "json";
}

export interface GenerateOllamaResult {
  text: string;
  model: string;
  totalDurationMs?: number;
}

/**
 * Generate completion with Ollama local model.
 */
export async function generateWithOllama(
  options: GenerateOllamaOptions
): Promise<GenerateOllamaResult> {
  const config = getOllamaConfig();
  const baseUrl = (options.baseUrl || config.baseUrl).replace(/\/$/, "");
  const model = options.model || config.model;

  const controller = new AbortController();
  // 120s timeout for CPU inferences or complex mindmaps
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const payload: Record<string, unknown> = {
      model,
      prompt: options.prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.2,
      },
    };

    if (options.system) {
      payload.system = options.system;
    }

    if (options.format) {
      payload.format = options.format;
    }

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.response || "";

    return {
      text,
      model: data.model || model,
      totalDurationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : undefined,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Ollama request timed out after 120s for model '${model}' at '${baseUrl}'.`);
    }
    throw err;
  }
}
