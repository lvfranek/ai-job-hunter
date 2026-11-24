import { z } from "zod";
import { getCredential } from "./credentials";

// The model for CV parsing and scoring (cover letters use a stronger one, see
// ai/cover-letter-writer.ts). Deliberately not configurable: the scoring prompt
// is tuned and evaluated against it. It must stay a fast INSTRUCT model — see DEFAULT_MAX_TOKENS.
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
  /** Fixed sampling seed, for providers that honour it — more reproducible scoring. */
  seed?: number;
  /** Another OpenRouter model than {@link AI_MODEL}, for a task it isn't good at. */
  model?: string;
  /** Receives the tokens and cost of the call (the evaluation adds them up). */
  onUsage?: (usage: Usage) => void;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  /** In US dollars, as OpenRouter bills it; null when the response doesn't say. */
  cost: number | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

/** A JSON schema the provider must answer in (OpenRouter structured outputs). */
interface ResponseFormat {
  name: string;
  schema: Record<string, unknown>;
}

async function callOpenRouter(
  model: string,
  messages: Message[],
  apiKey: string,
  options: GenerateOptions,
  format?: ResponseFormat,
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
        messages,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.seed != null ? { seed: options.seed } : {}),
        ...(options.onUsage ? { usage: { include: true } } : {}),
        ...(format
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: format.name, strict: true, schema: format.schema },
              },
              // Only route to providers that actually enforce the schema.
              provider: { require_parameters: true },
            }
          : {}),
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
  options.onUsage?.({
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    cost: typeof data.usage?.cost === "number" ? data.usage.cost : null,
  });
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
  return callOpenRouter(
    options.model ?? AI_MODEL,
    [{ role: "user", content: prompt }],
    apiKey,
    options,
  );
}

/** The model's answer still didn't match the schema after the repair attempt. */
export class InvalidAnswerError extends Error {
  constructor(problems: string) {
    super(`The model's answer didn't match the expected format: ${problems}`);
    this.name = "InvalidAnswerError";
  }
}

// One repair round: the model sees its own answer and what was wrong with it.
// A second miss is not worth another call; the caller treats it as a failure.
const JSON_ATTEMPTS = 2;

/** Why an answer is not valid, short enough to send back to the model. */
function problemsOf(raw: string, schema: z.ZodType): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return `not valid JSON (${(error as Error).message})`;
  }
  const result = schema.safeParse(value);
  if (result.success) return null;
  return result.error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Send one prompt and get back a value that matches `schema`. The provider is
 * asked to answer in the schema's exact format, and the answer is validated
 * here too: an invalid one goes back to the model once, with the problems.
 */
export async function generateJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: GenerateOptions = {},
): Promise<T> {
  const apiKey = await getCredential("openrouter_api_key");
  const format = { name: "answer", schema: z.toJSONSchema(schema) };
  const messages: Message[] = [{ role: "user", content: prompt }];
  let problems = "";
  for (let attempt = 1; attempt <= JSON_ATTEMPTS; attempt++) {
    const raw = await callOpenRouter(options.model ?? AI_MODEL, messages, apiKey, options, format);
    const found = problemsOf(raw, schema);
    if (found === null) return schema.parse(JSON.parse(raw));
    problems = found;
    console.warn(`Invalid model answer (attempt ${attempt}): ${problems}`);
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `Your answer doesn't match the required format: ${problems}\nReturn the complete corrected JSON.`,
      },
    );
  }
  throw new InvalidAnswerError(problems);
}
