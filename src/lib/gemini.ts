import { getCredential } from "./credentials";

async function callOpenRouter(model: string, prompt: string, apiKey: string): Promise<string> {
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
export async function getGeminiModel(modelName?: string) {
  const [apiKey, resolvedModel] = await Promise.all([
    getCredential("openrouter_api_key"),
    modelName ? Promise.resolve(modelName) : getCredential("openrouter_model"),
  ]);
  const model = resolvedModel || "mistralai/mistral-nemo";
  return {
    generateContent: async (prompt: string) => {
      const text = await callOpenRouter(model, prompt, apiKey);
      return { response: { text: () => text } };
    },
  };
}
