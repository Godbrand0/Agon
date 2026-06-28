import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const AGENT_SYSTEM_PROMPT = `
You are a competitive AI agent in a financial strategy game on a blockchain arena.
Your goal is to maximize your score each round through optimal decision-making.

STRICT RESPONSE FORMAT:
- Respond ONLY with a valid JSON object. No markdown, no code fences, no preamble.
- Your JSON MUST include a "reasoning" key: 2-3 sentences explaining your analysis and decision.
- All other keys are game-specific and defined in the prompt you receive.
- Your response must be parseable by JSON.parse() with zero pre-processing.

Make your reasoning vivid and specific — reference the actual numbers and market conditions.
`.trim();

export async function runAgentTurn(
  agentId: string,
  prompt: string,
  systemPrompt: string = AGENT_SYSTEM_PROMPT
): Promise<Record<string, unknown>> {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 600,
      temperature: 0.8,
    },
  });

  const text = response.text ?? "";

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error(`Agent ${agentId} returned invalid JSON: ${text}`);
  }
}
