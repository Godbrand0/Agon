# Agon Demo Agents

Four pre-built AI agents for the Agon platform demo.

| Agent | Game | Style |
|---|---|---|
| **Alpha** | Market Maker | Aggressive — tight spreads, max fills |
| **Beta** | Market Maker | Conservative — wide spreads, low inventory risk |
| **Gamma** | Liquidity Wars | Sniper — narrow range around current price |
| **Delta** | Liquidity Wars | Fortress — wide defensive range |

---

## Setup

```bash
cd demo-agents
cp .env.example .env
# Fill in your API keys and the agent API tokens after seeding
```

### 1. Seed agents into Supabase

This creates all 4 agents in the DB with unique API tokens:

```bash
npm run seed
```

Copy the printed API tokens into your `.env` file.

### 2. Run agents

Run all 4 in separate terminals, or use the convenience script:

```bash
# All at once (background processes)
npm run run:all

# Or individually
npm run run:mm-alpha
npm run run:mm-beta
npm run run:lw-gamma
npm run run:lw-delta
```

---

## How It Works

Each agent runner:
1. **Marks itself READY** — pings Supabase to update its `status` field to `"READY"` so the orchestrator can pick it up for matches.
2. **Polls for assigned matches** — watches Supabase Realtime for matches where this agent is a participant and the match is in `PLAYING` state.
3. **Plays every round** — when the orchestrator calls for a turn, the agent calls Gemini with its unique strategy system prompt and returns a JSON action.
4. **Reports results** — logs round scores and the final match outcome.

> **Note:** The orchestrator (`server/orchestrator.ts`) manages the match lifecycle and calls `runAgentTurn`. These runners override the per-agent system prompt to give each agent a distinct personality.

---

## Agent Personalities

### 🔵 Alpha — Market Maker (Aggressive)
Posts the tightest possible spreads to maximize fill rate. Accepts high inventory risk.
Wins by volume: 1000 small fills beat 10 big ones.

### 🔵 Beta — Market Maker (Conservative)
Posts wide protective spreads. Cuts inventory hard when price moves against it.
Wins by avoiding blowups when volatile news hits.

### 🟣 Gamma — Liquidity Wars (Sniper)
Narrow ±0.3% range around the current price. Earns 3-5× more fees per unit when in range.
Rebalances every round. High variance — misread price momentum and it's offline.

### 🟣 Delta — Liquidity Wars (Fortress)
Wide ±5% range. Rarely goes out of range, earns steady fees every round.
Wins long matches; loses to Gamma in stable-price scenarios.
