import "server-only";

/*
 * One entry point for model calls. Tries Gemini Flash first, then Groq, and
 * always asks for JSON. Model ids change often, so each provider takes a
 * comma-separated list in env and falls through it when a model is gone.
 */

const TIMEOUT_MS = 15_000;

const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash").split(",").map((m) => m.trim());
const GROQ_MODELS = (process.env.GROQ_MODEL ?? "openai/gpt-oss-20b,openai/gpt-oss-120b").split(",").map((m) => m.trim());
const GEMINI_BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
const GROQ_BASE = process.env.GROQ_BASE_URL ?? "https://api.groq.com";

export class AIUnavailableError extends Error {}

type Call = { system: string; prompt: string; temperature?: number };

class ModelGoneError extends Error {}

/** Models that returned 404, skipped for the life of this server instance. */
const goneModels = new Set<string>();

async function gemini(model: string, { system, prompt, temperature = 0.4 }: Call) {
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) throw new ModelGoneError(model);
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini ${model}: empty response (${data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "unknown"})`);
  return text;
}

async function groq(model: string, { system, prompt, temperature = 0.4 }: Call) {
  const res = await fetch(`${GROQ_BASE}/openai/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) throw new ModelGoneError(model);
  if (!res.ok) throw new Error(`Groq ${model} ${res.status}`);
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Groq ${model}: empty response`);
  return text;
}

function parseJSON(text: string): unknown {
  // Some models wrap JSON in a code fence despite being asked not to.
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(clean);
}

/**
 * Calls the first available model and returns the parsed, validated JSON.
 * `validate` returns null when the shape is wrong, which counts as a failure.
 */
export async function callAI<T>(call: Call, validate: (raw: unknown) => T | null): Promise<T> {
  const providers: [string, string[], typeof gemini][] = [];
  if (process.env.GEMINI_API_KEY) providers.push(["gemini", GEMINI_MODELS, gemini]);
  if (process.env.GROQ_API_KEY) providers.push(["groq", GROQ_MODELS, groq]);
  if (providers.length === 0) throw new AIUnavailableError("No AI provider key is configured");

  const errors: string[] = [];
  for (const [name, models, run] of providers) {
    for (const model of models) {
      if (goneModels.has(`${name}/${model}`)) continue;
      try {
        const result = validate(parseJSON(await run(model, call)));
        if (result) return result;
        errors.push(`${name}/${model}: unexpected shape`);
        break; // The model answered; a different model of the same provider won't do better.
      } catch (err) {
        errors.push(`${name}/${model}: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof ModelGoneError) goneModels.add(`${name}/${model}`);
        if (!(err instanceof ModelGoneError)) break; // Quota or outage: move to the next provider.
      }
    }
  }
  console.error("AI unavailable", errors);
  throw new AIUnavailableError(errors.join("; "));
}
