import { getCredential } from "./credentials";

// The one model every AI call in the app uses (CV parsing, scoring, cover
// letters). Deliberately not configurable: scoring prompts and the parser are
// tuned against it. It must stay a fast INSTRUCT model — see DEFAULT_MAX_TOKENS.
export const AI_MODEL = "qwen/qwen3-next-80b-a3b-instruct";

// A stalled connection with no timeout is what lets a single hung request freeze
// a whole scoring run (Promise.all never settles, the run stays "running"
// forever). Abort well before any platform function timeout so the caller can
// treat it as a normal chunk failure and move on.
const REQUEST_TIMEOUT_MS = 90_000;

// Without an explicit cap some models stop at their own small default and cut
// the JSON array mid-object. The scorer's salvage parser can recover from that,
// but it's cheaper to just not truncate in the first place.
//
// CAREFUL with reasoning models: their internal reasoning is billed against this
// same budget, so a cap sized for the answer alone gets consumed before a single
// character of content is emitted (finish_reason "length", empty content, full
// charge). Scoring is rubric application, not a puzzle — use a fast instruct
// model. `assertUsableContent` below turns that failure mode into a readable
// error instead of a silently empty chunk.
const DEFAULT_MAX_TOKENS = 4000;

/**
 * A non-2xx response from OpenRouter, carrying the status so callers can tell a
 * permanent config problem (401 bad key, 404 unknown model slug) apart from a
 * transient one (429, 5xx) and stop hammering a wall they can't get through.
 */
export class OpenRouterError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`OpenRouter API error: ${status} ${body}`);
    this.name = "OpenRouterError";
    this.status = status;
  }

  /** 4xx other than rate limiting — retrying will fail exactly the same way. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

export interface GenerateOptions {
  maxTokens?: number;
  /** Low values keep scoring reproducible; leave unset for creative tasks. */
  temperature?: number;
}

async function callOpenRouter(
  model: string,
  prompt: string,
  apiKey: string,
  options: GenerateOptions,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`OpenRouter request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  }

  if (!res.ok) {
    throw new OpenRouterError(res.status, await res.text());
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content: string = choice?.message?.content ?? "";

  if (!content.trim()) {
    const finish = choice?.finish_reason ?? "unknown";
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const detail =
      reasoningTokens > 0
        ? `the model spent all ${reasoningTokens} completion tokens on internal reasoning. ` +
          `Raise max_tokens or switch to a non-reasoning instruct model.`
        : `finish_reason=${finish}.`;
    throw new Error(`Model "${model}" returned no content — ${detail}`);
  }

  return content;
}

/** Send one prompt to {@link AI_MODEL} and return the text of its reply. */
export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const apiKey = await getCredential("openrouter_api_key");
  return callOpenRouter(AI_MODEL, prompt, apiKey, options);
}
