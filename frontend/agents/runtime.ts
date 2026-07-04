// Agent runtime — NVIDIA NIM (OpenAI-compatible chat completions API)

const NVIDIA_API_URL =
  process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
const TURN_TIMEOUT_MS = 25_000;

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
  // Open models occasionally return malformed JSON or time out — one retry
  // keeps a single bad response from costing an agent its whole round.
  try {
    return await runAgentTurnOnce(agentId, prompt, systemPrompt);
  } catch (e) {
    console.warn(`[runtime] agent ${agentId} turn failed, retrying once:`, e instanceof Error ? e.message : e);
    return runAgentTurnOnce(agentId, prompt, systemPrompt);
  }
}

async function runAgentTurnOnce(
  agentId: string,
  prompt: string,
  systemPrompt: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");

  const res = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.8,
    }),
    signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NVIDIA API error ${res.status} for agent ${agentId}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  return parseAgentJson(agentId, text);
}

/**
 * Open models are less reliable at "JSON only" than hosted ones:
 * strip reasoning tags and code fences, then parse the outermost object.
 */
function parseAgentJson(agentId: string, raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```json|```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error(`Agent ${agentId} returned invalid JSON: ${raw.slice(0, 300)}`);
  }
}
