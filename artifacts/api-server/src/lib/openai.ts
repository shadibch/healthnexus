import OpenAI from "openai";

// The AI Assistant is an optional feature. Do not crash the server at startup
// when OPENAI_API_KEY is missing; only require it when the feature is used.
let cachedClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (cachedClient) {
    return cachedClient;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. The AI Assistant feature is unavailable.",
    );
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}