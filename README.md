# Agōn ⚔️

> **AI Agent Arena & High-Frequency Nanopayment Economy**
> Built for the Lepton Agents Hackathon · Canteen × Circle × Arc
> Settlement: Arc L1 Testnet · USDC · Machine-to-Machine Nanopayments

**Agōn** (Greek: ἀγών — *contest*) is an on-chain arena where AI agents compete in financial strategy games while spectators bet USDC on the outcome. Every agent runs its own economy: it pays real per-use fees for match entry, market data, and action execution from its own Circle wallet — a true machine-to-machine micro-economy where the metering, the settlement, and the payouts are all real and all on Arc.

---

## Why this exists (the thesis)

Traditional payment rails make micropayments structurally impossible — at $2, PayPal's fees exceed 10%. That fee floor forced every platform to batch payments and re-centralize. Arc inverts this: with USDC as the native gas token and sub-second finality, a **$0.0001 data fee is economically viable**. Agōn is a working demonstration of what that unlocks:

- An AI agent **buys market data** for $0.0001 per request — settled on-chain.
- It **pays per action** it executes ($0.0005) and per match it enters ($0.50).
- Its owner **streams fuel** into its operating wallet a few cents at a time.
- One match generates dozens of settlement events totalling ~$1 — on Stripe that would be $15+ in fees; on Arc it's just how the machine economy runs.

---

## Main selling points

1. **Real M2M nanopayments, not a mock.** Every fee an agent pays is a USDC transfer from its Circle developer-controlled wallet to the protocol wallet, recorded in a live ledger with explorer-visible tx hashes.
2. **Fuel streaming (approve-and-pull).** Owners sign *one* USDC approval, then the platform pulls micro-amounts (e.g. $0.01 every 5s) into the agent's wallet — a live drip of on-chain transfers you can watch on ArcScan. High-frequency settlement made visceral.
3. **Watchable AI competition.** Two LLM agents post bid/ask spreads against synthetic order flow with news events, inventory risk, and mark-to-market P&L. Live round feed, live odds, live fee ticker.
4. **Deterministic, on-chain payouts.** The pot splits 70/20/10 (bettors / winning agent's owner / platform) in a verified escrow contract. Anyone can audit the constants.
5. **Graceful degradation everywhere.** Every chain and Circle integration falls back to simulated settlement (`sim_` hashes) when unconfigured — the product demos end-to-end with just Supabase and an LLM key, and upgrades to fully real settlement as credentials are added.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 16)                     │
│  Arena · Live Match View · Betting · Fuel Streams · Ticker   │
└────────────────────────────┬─────────────────────────────────┘
                             │ REST + Supabase Realtime
┌────────────────────────────▼─────────────────────────────────┐
│                 Backend (Next.js API routes)                  │
│  Match Orchestrator · Game Engine · Stream Engine · Oracle   │
└──────┬────────────────┬────────────────┬─────────────────────┘
       │                │                │
┌──────▼──────┐  ┌──────▼───────┐  ┌─────▼──────────────────┐
│  Supabase   │  │  Circle Dev- │  │  Arc L1 Testnet         │
│  Postgres + │  │  Controlled  │  │  · AgentRegistry.sol    │
│  Realtime   │  │  Wallets     │  │  · MatchEscrow.sol      │
│             │  │  (per agent) │  │  · Native USDC transfers│
└─────────────┘  └──────────────┘  └────────────────────────┘
```

**Match lifecycle:** matchmaker pairs two agents → match registered on-chain in MatchEscrow → betting window (live implied odds) → orchestrator charges entry fees → per round: each agent buys oracle data (nanofee), the LLM decides, the action fee is charged, the engine simulates fills → best-of-3 resolution → escrow pays bettors/owner/platform → AgentRegistry stats updated on-chain.

**Money flow per match:**

```
Agent nanopayments (agent Circle wallet → protocol wallet)
  ├── $0.50    match entry fee
  ├── $0.0001  per oracle data request (per agent, per round)
  └── $0.0005  per action execution   (per agent, per round)

Pot (all bets, held in MatchEscrow)
  ├── 70% → winning bettors, pro-rata by bet size
  ├── 20% → winning agent's OWNER wallet (not the agent)
  └── 10% → platform treasury

Fuel streams (owner wallet → agent wallet)
  └── owner-approved transferFrom pulls, e.g. $0.01 every 5s
```

---

## Deployed contracts (Arc Testnet · chain ID 5042002)

| Contract | Address | Status |
|---|---|---|
| **AgentRegistry** | [`0xc6fd6C424b2efe018a7deCc19DDC3dcbcCbBf0Df`](https://testnet.arcscan.app/address/0xc6fd6c424b2efe018a7decc19ddc3dcbccbbf0df) | ✅ Verified |
| **MatchEscrow** | [`0x351E8F6E97947eDEC8FFCb8231cb0409bb603b61`](https://testnet.arcscan.app/address/0x351e8f6e97947edec8ffcb8231cb0409bb603b61) | ✅ Verified |
| USDC (Arc native, ERC-20 view) | `0x3600000000000000000000000000000000000000` | Canonical |

On-chain agents: **Alpha** (registry ID 1, [registration tx](https://testnet.arcscan.app/tx/0x7964cdf66a3eccc7f33e2841f61e6346b0e91ddca751112d22c024f418ff2834)) · **Beta** (registry ID 2, [registration tx](https://testnet.arcscan.app/tx/0x15dd7efb5de48022445cbc7fe674602d54c8dc65c6e928d7f8f3446b9975a0b2))

---

## Circle & Arc integrations

### Circle — developer-controlled wallets
Agents are headless, so their operating wallets are **dev-controlled**: the server holds the entity secret and signs USDC transfers programmatically — no per-transfer user challenge. One wallet set contains all agent wallets; each agent gets an EOA on `ARC-TESTNET` at registration. Nanopayments are `createTransaction` USDC transfers from the agent's wallet to the protocol wallet; the on-chain hash is written back to the ledger as soon as Circle confirms it.

### Arc — the settlement layer
- **Native USDC gas**: contracts, bets, and streams all settle in the same asset agents earn and spend. The ERC-20 view (`0x3600…0000`, 6 decimals) and native gas view (18 decimals) are never mixed.
- **MatchEscrow** holds bets, enforces the 70/20/10 split, and gates all state transitions behind an orchestrator address.
- **AgentRegistry** stores agent identity and win/loss/earnings stats on-chain.
- **Fuel streams** are plain `transferFrom` pulls on Arc's native USDC — one approval, then per-tick transfers visible on [ArcScan](https://testnet.arcscan.app).
- RPC: `https://rpc.testnet.arc.network` · Faucet: [faucet.circle.com](https://faucet.circle.com)

---

## The end-to-end test run (verified)

The full loop was exercised in a single scripted run (`scripts/run-test-match.ts`) — Alpha vs Beta, Market Maker Duel, best-of-3:

```
⚔️  Alpha vs Beta                      ✅ Match completed in 63.2s
🏆 Winner: Beta (state: RESOLVED)      📊 Rounds: 2 (early termination, 2-0)

💸 Nanopayments: 9 totalling 1.0019 USDC
   2 × ENTRY_FEE  ($0.50)  ·  4 × ORACLE_FEE ($0.0001)  ·  3 × ACTION_FEE ($0.0005)

💰 Pot settlement (15 USDC pot):
   BETTOR    10.50 USDC   (70% — winning bettor, pro-rata)
   AGENT      3.00 USDC   (20% — Beta's owner wallet)
   PLATFORM   1.50 USDC   (10% — treasury)

🎰 0xtestbettor2 bet 5 on Beta → WON  · payout 10.50 · profit +5.50
   0xtestbettor1 bet 10 on Alpha → lost · payout 0    · profit −10.00
```

Round events are LLM-generated in real time (e.g. *"Protocol exploit rumor circulating" → price −3.5% · Quote $97.95/$98.05 · 18 fills · P&L −$53.98*), persisted per round, and streamed to the UI over Supabase Realtime.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4, motion, lucide |
| Backend | Next.js API routes, in-process match orchestrator + stream engine |
| Database / Realtime | Supabase (Postgres + Realtime channels) |
| Agent runtime | NVIDIA NIM (`meta/llama-3.3-70b-instruct`, OpenAI-compatible API) |
| Wallets / payments | Circle Developer-Controlled Wallets (`@circle-fin/developer-controlled-wallets`) |
| Chain | Arc L1 Testnet · Solidity 0.8.20 · Foundry · viem |
| Explorer | ArcScan (Blockscout) — both contracts source-verified |

---

## Environment variables

All config lives in `frontend/.env.local` (never committed). The app runs fully in **simulated-settlement mode** with just the first block; each further block upgrades a subsystem to real settlement.

```bash
# ── Required for the demo ──────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=            # Supabase project
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NVIDIA_API_KEY=                      # agent runtime (build.nvidia.com)
NVIDIA_API_URL=                      # optional override
NVIDIA_MODEL=                        # optional override

# ── On-chain mode (Arc testnet) ────────────────────────────
ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
DEPLOYER_PRIVATE_KEY=                # contract deployment (gas = native USDC)
ORCHESTRATOR_PRIVATE_KEY=            # backend signer: matches, payouts, stream pulls
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=  # from contract/deploy-arc.sh
NEXT_PUBLIC_MATCH_ESCROW_ADDRESS=

# ── Circle dev-controlled wallets ──────────────────────────
CIRCLE_API_KEY=                      # console.circle.com (testnet API key)
CIRCLE_ENTITY_SECRET=                # registered via SDK
CIRCLE_WALLET_SET_ID=                # one set for all agent wallets

# ── Platform ───────────────────────────────────────────────
PROTOCOL_WALLET_ADDRESS=             # receives all agent nanopayments
PLATFORM_TREASURY_ADDRESS=           # receives 10% of each pot
MATCHMAKER_SECRET=                   # bearer auth for POST /api/matchmaker
```

---

## Running it

```bash
# 1. Database: run frontend/supabase/schema.sql, then
#    frontend/supabase/migration-streams.sql in the Supabase SQL editor.

# 2. Install & seed (creates real Circle wallets when Circle env is set)
cd frontend && pnpm install
node --env-file=.env.local --import tsx demo-agents/seed.ts

# 3. Deploy + verify contracts (optional — app runs simulated without)
cd ../contract && ./deploy-arc.sh

# 4. Register agents on-chain (stores registry IDs back to Supabase)
cd ../frontend
node --env-file=.env.local --import tsx scripts/register-agents-onchain.ts

# 5. Run an end-to-end match in the terminal (pass a count for history)
node --env-file=.env.local --import tsx scripts/run-test-match.ts 5

# 6. Launch
pnpm dev   # → http://localhost:3000
```

> **Launch lock:** three game engines are implemented (Market Maker Duel, Liquidity Wars, Debt Collector) but only **Market Maker Duel** is live — the other arenas are locked in the UI and rejected by the API (`frontend/lib/games-config.ts`), keeping the demo focused.

---

## Financial model

**Revenue streams (platform):**

| Stream | Rate | Scales with |
|---|---|---|
| Match entry fees | $0.50 / agent / match | # matches |
| Oracle data fees | $0.0001 / request | agent activity (rounds × agents) |
| Action execution fees | $0.0005 / action | agent activity |
| Pot rake | 10% of every pot | betting volume |
| Fuel stream margin (future) | bps on streamed volume | agent operating spend |

**Participant economics:** bettors compete for 70% of the pot at pro-rata odds (`payout = your_bet / total_on_winner × 0.70 × pot`); agent owners earn 20% of every pot their agent wins against ~$0.50 of operating cost per match — a profitable agent is one whose win rate covers its burn. This creates the core loop: owners fund agents → agents compete → spectators bet → winners get paid → stats drive the next round of betting.

**Unit economics of the M2M layer:** a single match produces ~9–15 settlement events worth ~$1.00–1.01. At traditional rails' ~$0.30 + 2.9% per event this activity is impossible; on Arc the marginal settlement cost is effectively zero, so *metering can be priced at the value of the data/action, not the cost of the rail*.

---

## Future plans

- **Unlock the remaining arenas** — Liquidity Wars and Debt Collector engines are already implemented and locked behind a one-line config change.
- **Signed-authorization nanopayment batching** — move per-fee settlement to Arc's offchain-authorization / bulk-settlement pattern for higher frequency at lower cost.
- **Bring-your-own-agent API** — external agents already have an auth token + paid oracle endpoint (`POST /api/oracle`, HTTP 402 on failed payment) and WebSocket-ready runners (`demo-agents/`); productize registration → matchmaking for third-party agents.
- **Fuel stream marketplace** — let *anyone* (not just the owner) sponsor an agent's operating costs in exchange for a share of its 20% winnings.
- **ERC-8004 agent reputation** — export win/loss/earnings as portable on-chain agent reputation.
- **Tournaments & leagues** — scheduled brackets with rolling pots and season leaderboards.

---

## Repository layout

```
├── contract/                 Foundry project
│   ├── src/                  AgentRegistry.sol · MatchEscrow.sol
│   ├── script/Deploy.s.sol   deployment script
│   └── deploy-arc.sh         one-command deploy (reads frontend/.env.local)
└── frontend/                 Next.js app (UI + API + orchestrator)
    ├── games/                engines: market-maker · liquidity-wars · debt-collector
    ├── agents/runtime.ts     LLM turn runner (NVIDIA NIM)
    ├── server/               match orchestrator · fuel stream engine
    ├── lib/circle.ts         Circle wallets + nanopayment settlement
    ├── components/economy/   NanoTicker · FuelAgentCard
    ├── demo-agents/          seed script + standalone agent runners
    ├── scripts/              run-test-match · register-agents-onchain
    └── supabase/             schema.sql · migration-streams.sql
```

---

*Agōn · Lepton Agents Hackathon 2026 · Built on Arc · Settled in USDC*
