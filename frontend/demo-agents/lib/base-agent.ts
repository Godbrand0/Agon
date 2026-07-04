/**
 * Base Agent Runner
 *
 * Shared logic for all 4 demo agents:
 *  - Marks the agent READY in Supabase
 *  - Subscribes to Realtime for match assignments
 *  - Calls NVIDIA NIM with a strategy-specific system prompt
 *  - Submits the JSON action back and logs results
 */

import "dotenv/config";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NVIDIA_API_KEY    = process.env.NVIDIA_API_KEY!;
const NVIDIA_API_URL    = process.env.NVIDIA_API_URL || "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL      = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";

if (!SUPABASE_URL || !SUPABASE_ROLE_KEY || !NVIDIA_API_KEY) {
  console.error("❌ Missing env vars. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ROLE_KEY);

const SHARED_SYSTEM_SUFFIX = `
STRICT RESPONSE FORMAT:
- Respond ONLY with a valid JSON object. No markdown, no code fences, no preamble.
- Include a "reasoning" key: 2-3 sentences explaining your analysis.
- All other keys are game-specific and defined in the prompt.
- Your response must be parseable by JSON.parse() with zero pre-processing.

Make your reasoning vivid — reference actual numbers and market conditions.
`.trim();

export interface AgentConfig {
  agentId:      string;
  agentName:    string;
  apiToken:     string;
  gameType:     "MARKET_MAKER" | "LIQUIDITY_WARS";
  systemPrompt: string;          // strategy-specific personality
  model?:       string;          // defaults to NVIDIA_MODEL env / llama-3.3-70b
  temperature?: number;
}

export class DemoAgent {
  private readonly cfg: AgentConfig;
  private channel: RealtimeChannel | null = null;
  private activeMatchIds = new Set<string>();

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async start() {
    const { agentId, agentName, gameType } = this.cfg;
    this.log(`Starting up (${gameType})…`);

    // Mark READY
    await this.setStatus("READY");
    this.log("Status → READY ✅");

    // Subscribe to match_agents changes to detect new match assignments
    this.channel = supabase
      .channel(`agent-${agentId}-matches`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "match_agents",
          filter: `agent_id=eq.${agentId}`,
        },
        async (payload) => {
          const matchId = payload.new.match_id as string;
          this.log(`Assigned to match ${matchId}`);
          await this.watchMatch(matchId);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.log("Realtime subscription active — waiting for matches…");
        }
      });

    // Also pick up any already-assigned PLAYING/BETTING_OPEN matches
    await this.reconnectExistingMatches();

    // Graceful shutdown
    process.on("SIGINT",  () => this.stop());
    process.on("SIGTERM", () => this.stop());
  }

  async stop() {
    this.log("Shutting down…");
    await this.setStatus("OFFLINE");
    if (this.channel) await supabase.removeChannel(this.channel);
    process.exit(0);
  }

  // ── Match lifecycle ───────────────────────────────────────────────────────

  private async watchMatch(matchId: string) {
    if (this.activeMatchIds.has(matchId)) return;
    this.activeMatchIds.add(matchId);

    this.log(`Watching match ${matchId}…`);
    
    // Simulate purchasing oracle data for the match
    try {
      const res = await fetch("http://localhost:3000/api/oracle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.cfg.apiToken}`
        },
        body: JSON.stringify({ gameType: this.cfg.gameType, context: `Match ${matchId} Data` })
      });
      const data = await res.json();
      if (res.ok) {
        this.log(`Paid ${data.feeCharged} USDC for oracle data: ${JSON.stringify(data.data)}`);
      } else {
        this.log(`Failed to buy oracle data: ${data.error}`);
      }
    } catch (err) {
      this.log(`Error hitting oracle API: ${err}`);
    }

    // Subscribe to round insertions for this match
    const roundChannel = supabase
      .channel(`agent-${this.cfg.agentId}-match-${matchId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "rounds",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const round = payload.new as { round_number: number; scores: Record<string, number> };
          const myScore = round.scores[this.cfg.agentId];
          this.log(`Match ${matchId} · Round ${round.round_number} complete · Score: ${myScore?.toFixed(4) ?? "?"}`);
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "matches",
          filter: `id=eq.${matchId}`,
        },
        async (payload) => {
          const state = payload.new.state as string;
          if (state === "RESOLVED") {
            const winner = payload.new.winner_id;
            if (winner === this.cfg.agentId) {
              this.log(`🏆 WON match ${matchId}!`);
            } else {
              this.log(`Match ${matchId} resolved — opponent won.`);
            }
            await supabase.removeChannel(roundChannel);
            this.activeMatchIds.delete(matchId);
          }
        }
      )
      .subscribe();
  }

  private async reconnectExistingMatches() {
    const { data } = await supabase
      .from("match_agents")
      .select("match_id, matches(state)")
      .eq("agent_id", this.cfg.agentId);

    const active = (data ?? []).filter(
      (row: any) => row.matches?.state === "PLAYING" || row.matches?.state === "BETTING_OPEN"
    );

    for (const row of active) {
      this.log(`Reconnecting to existing match ${row.match_id}`);
      await this.watchMatch(row.match_id);
    }
  }

  // ── LLM action (NVIDIA NIM) ───────────────────────────────────────────────

  /**
   * Called by the orchestrator via runAgentTurn.
   * This can also be called directly for testing.
   */
  async generateAction(prompt: string): Promise<Record<string, unknown>> {
    const systemPrompt = [this.cfg.systemPrompt, SHARED_SYSTEM_SUFFIX].join("\n\n");

    const res = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.cfg.model ?? NVIDIA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
        temperature: this.cfg.temperature ?? 0.75,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`NVIDIA API error ${res.status} for ${this.cfg.agentName}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";

    const cleaned = text
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
        } catch { /* fall through */ }
      }
      throw new Error(`${this.cfg.agentName} returned invalid JSON: ${text.slice(0, 300)}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async setStatus(status: "READY" | "OFFLINE" | "IN_MATCH") {
    await supabase
      .from("agents")
      .update({ status })
      .eq("id", this.cfg.agentId);
  }

  private log(msg: string) {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [${this.cfg.agentName}] ${msg}`);
  }
}
