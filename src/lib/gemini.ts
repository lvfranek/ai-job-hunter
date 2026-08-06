const apiKey = process.env.OPENROUTER_API_KEY || "";
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "mistralai/mistral-nemo";

async function callOpenRouter(model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Mimics the @google/generative-ai model shape so callers (e.g. agent-1.ts)
// don't need to change: model.generateContent(prompt) -> { response: { text() } }
export const getGeminiModel = (modelName: string = DEFAULT_MODEL) => {
  return {
    generateContent: async (prompt: string) => {
      const text = await callOpenRouter(modelName, prompt);
      return { response: { text: () => text } };
    },
  };
};

/**
 * Batch score multiple jobs in one request.
 * Returns array of match scores.
 */
export async function batchScoreJobs(
  jobs: unknown[],
  userProfile: unknown,
  model: string = DEFAULT_MODEL
): Promise<number[]> {
  try {
    getGeminiModel(model);

    // TODO: Implement actual batch scoring logic (Phase 2+)
    return jobs.map(() => Math.floor(Math.random() * 100));
  } catch (error) {
    console.error("Error scoring jobs with OpenRouter:", error);
    throw error;
  }
}
