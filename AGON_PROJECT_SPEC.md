# Agōn — AI Agent Arena & High-Frequency Nanopayment Economy
> Built for the Lepton Agents Hackathon · Canteen × Circle × Arc
> Settlement: Arc L1 · USDC · Sub-500ms finality · M2M Nanopayments

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Concepts](#2-core-concepts)
3. [System Architecture](#3-system-architecture)
4. [Smart Contracts](#4-smart-contracts)
5. [Game Engines](#5-game-engines)
6. [Agent System](#6-agent-system)
7. [Betting System](#7-betting-system)
8. [Payout System](#8-payout-system)
9. [Frontend Pages & UI](#9-frontend-pages--ui)
10. [Backend & API](#10-backend--api)
11. [Database Schema](#11-database-schema)
12. [Circle / Arc Integration](#12-circle--arc-integration)
13. [Build Order](#13-build-order)
14. [Environment Variables](#14-environment-variables)
15. [File Structure](#15-file-structure)

---

## 1. Project Overview

**Agōn** (Greek: ἀγών — contest, competition) is an on-chain arena where AI agents compete in DeFi strategy games while users place USDC bets on outcomes. Agents autonomously manage a Circle wallet to pay for match entries, data oracle access, and action execution — a true machine-to-machine (M2M) micro-economy. Winning agents send earnings directly to the owner's personal wallet. Everything settles on Arc in USDC.

### Core Loop

```
User registers agent + provides owner payout address
      │
      ▼
User funds agent's Circle wallet (Arc Testnet USDC)
      │
      ▼
Agent pays 0.50 USDC Entry Fee → Protocol wallet
      │
      ▼
Agent pays 0.0001 USDC per Oracle data request → Protocol wallet
      │
      ▼
Users place USDC bets on match outcomes
      │
      ▼
Agent pays 0.0005 USDC per Action Execution → Protocol wallet
      │
      ▼
Match resolves → Smart contract distributes pot
      │
      ▼
Winning bettors earn, winning agent's OWNER earns, platform earns
```

### Money Flow

```
Agent Nanopayments (per match, per agent)
  ├── 0.50 USDC   → Protocol wallet (Match Entry Fee)
  ├── 0.0001 USDC → Protocol wallet (per Oracle Data Request)
  └── 0.0005 USDC → Protocol wallet (per Action Execution)

Match Pot (all user bets)
  ├── 70% → Winning bettors (pro-rata by bet size)
  ├── 20% → Winning agent's OWNER personal wallet (not agent wallet)
  └── 10% → Platform treasury wallet
```

### Payout Formula

```
user_payout = (user_bet_amount / total_bets_on_winner) × (0.70 × total_pot)
```

Implied live odds displayed per agent:
```
implied_odds = (0.70 × total_pot) / total_bets_on_agent
```

---

## 2. Core Concepts

### Entities

| Entity | Description |
|--------|-------------|
| **Agent** | An AI agent registered by a user. Has a Circle operating wallet (funded by the owner), a game specialization, and on-chain win/loss stats. |
| **Agent Circle Wallet** | A Circle Programmable Wallet on Arc Testnet that the owner must fund with USDC. Used exclusively to pay nanopayments (entry fees, oracle fees, action fees). |
| **Owner Payout Wallet** | The agent owner's personal wallet address, provided at registration. All match winnings are sent here, bypassing the agent's operating wallet. |
| **Protocol Wallet** | A platform-controlled address that receives all agent nanopayments (entry, oracle, action fees). |
| **Oracle API** | A REST endpoint (`POST /api/oracle`) that agents call to purchase game data (market state, news, volatility) by paying a nanofee. |
| **Game Type** | A specific competition format. Agents specialize in one game type on registration. |
| **Match** | A live instance of a game between 2 agents. Has a betting window, a play window, and a resolution. |
| **Bet** | A user's USDC wager on a specific agent to win a specific match. Locked in escrow until resolution. |
| **Pot** | Total USDC locked in escrow for a match. Distributed on resolution. |

### User Roles

| Role | Can Do |
|------|--------|
| **Bettor** | Browse agents, browse matches, place bets, view payout history |
| **Agent Owner** | Register agents, fund agent Circle wallet with USDC, provide personal payout address, view agent stats and earnings |
| **Both** | A single user can own agents and also bet on other agents' matches |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                  │
│  Agent Registry · Match Lobby · Betting UI · Dashboard  │
└──────────────────────────┬──────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                    Backend (Next.js API Routes)          │
│   Match Orchestrator · Game Engines · Payout Resolver   │
└──────┬──────────────────┬──────────────────┬────────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼──────────┐
│  Supabase   │  │  Circle API     │  │  Arc Contracts  │
│  (Postgres) │  │  (Wallets +     │  │  (Escrow +      │
│             │  │   USDC tx)      │  │   Registry)     │
└─────────────┘  └─────────────────┘  └────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes + WebSocket (socket.io) |
| Database | Supabase (Postgres + Realtime) |
| Blockchain | Arc L1 (Circle's L1), Solidity contracts |
| Payments | Circle Programmable Wallets + USDC on Arc |
| Agent Runtime | TypeScript — each agent is a class implementing a game interface |
| Realtime | Supabase Realtime + Socket.io for live match state |

---

## 4. Smart Contracts

### 4.1 AgentRegistry.sol

Stores on-chain agent identity and statistics. Implements ERC-8004 for agent reputation.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentRegistry {
    struct Agent {
        address owner;
        string name;
        string gameType;        // "MARKET_MAKER" | "LIQUIDITY_WARS" | "DEBT_COLLECTOR"
        address walletAddress;  // Circle wallet address for earnings
        uint256 wins;
        uint256 losses;
        uint256 totalEarnings;  // in USDC (6 decimals)
        uint256 registeredAt;
        bool active;
    }

    mapping(uint256 => Agent) public agents;
    mapping(address => uint256[]) public ownerAgents;
    uint256 public agentCount;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string gameType);
    event StatsUpdated(uint256 indexed agentId, bool won, uint256 earnings);

    function registerAgent(
        string calldata name,
        string calldata gameType,
        address walletAddress
    ) external returns (uint256 agentId) {
        agentId = ++agentCount;
        agents[agentId] = Agent({
            owner: msg.sender,
            name: name,
            gameType: gameType,
            walletAddress: walletAddress,
            wins: 0,
            losses: 0,
            totalEarnings: 0,
            registeredAt: block.timestamp,
            active: true
        });
        ownerAgents[msg.sender].push(agentId);
        emit AgentRegistered(agentId, msg.sender, gameType);
    }

    function updateStats(uint256 agentId, bool won, uint256 earnings) external onlyOrchestrator {
        Agent storage agent = agents[agentId];
        if (won) agent.wins++;
        else agent.losses++;
        agent.totalEarnings += earnings;
        emit StatsUpdated(agentId, won, earnings);
    }

    function getWinRate(uint256 agentId) external view returns (uint256) {
        Agent storage agent = agents[agentId];
        uint256 total = agent.wins + agent.losses;
        if (total == 0) return 0;
        return (agent.wins * 10000) / total; // basis points, e.g. 6750 = 67.50%
    }
}
```

---

### 4.2 MatchEscrow.sol

Holds all bets for a match. Resolves payout on-chain after winner is determined.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MatchEscrow {
    IERC20 public immutable USDC;
    address public immutable platform;
    address public immutable orchestrator;

    enum MatchState { BETTING_OPEN, BETTING_CLOSED, PLAYING, RESOLVED, CANCELLED }

    struct Match {
        uint256 matchId;
        uint256[] agentIds;
        address[] agentWallets;
        MatchState state;
        uint256 winnerAgentId;
        uint256 totalPot;
        uint256 bettingDeadline;
        mapping(uint256 => uint256) totalBetsOnAgent;  // agentId => total USDC bet
        mapping(address => mapping(uint256 => uint256)) userBetOnAgent; // user => agentId => amount
        address[] bettors;
    }

    mapping(uint256 => Match) public matches;
    uint256 public matchCount;

    // Fee splits (basis points, 10000 = 100%)
    uint256 public constant BETTOR_SHARE = 7000;   // 70%
    uint256 public constant AGENT_SHARE = 2000;    // 20%
    uint256 public constant PLATFORM_SHARE = 1000; // 10%

    event MatchCreated(uint256 indexed matchId, uint256[] agentIds, uint256 bettingDeadline);
    event BetPlaced(uint256 indexed matchId, address indexed bettor, uint256 agentId, uint256 amount);
    event MatchResolved(uint256 indexed matchId, uint256 winnerAgentId, uint256 totalPot);
    event PayoutSent(uint256 indexed matchId, address indexed recipient, uint256 amount);

    constructor(address _usdc, address _platform, address _orchestrator) {
        USDC = IERC20(_usdc);
        platform = _platform;
        orchestrator = _orchestrator;
    }

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "Not orchestrator");
        _;
    }

    function createMatch(
        uint256 matchId,
        uint256[] calldata agentIds,
        address[] calldata agentWallets,
        uint256 bettingDuration  // seconds
    ) external onlyOrchestrator {
        Match storage m = matches[matchId];
        m.matchId = matchId;
        m.agentIds = agentIds;
        m.agentWallets = agentWallets;
        m.state = MatchState.BETTING_OPEN;
        m.bettingDeadline = block.timestamp + bettingDuration;
        emit MatchCreated(matchId, agentIds, m.bettingDeadline);
    }

    function placeBet(uint256 matchId, uint256 agentId, uint256 amount) external {
        Match storage m = matches[matchId];
        require(m.state == MatchState.BETTING_OPEN, "Betting closed");
        require(block.timestamp < m.bettingDeadline, "Deadline passed");
        require(amount >= 1e6, "Min bet: 1 USDC"); // 1 USDC (6 decimals)

        // Track new bettors
        if (m.userBetOnAgent[msg.sender][agentId] == 0) {
            m.bettors.push(msg.sender);
        }

        USDC.transferFrom(msg.sender, address(this), amount);
        m.userBetOnAgent[msg.sender][agentId] += amount;
        m.totalBetsOnAgent[agentId] += amount;
        m.totalPot += amount;

        emit BetPlaced(matchId, msg.sender, agentId, amount);
    }

    function closeBetting(uint256 matchId) external onlyOrchestrator {
        matches[matchId].state = MatchState.BETTING_CLOSED;
    }

    function startMatch(uint256 matchId) external onlyOrchestrator {
        matches[matchId].state = MatchState.PLAYING;
    }

    function resolveMatch(uint256 matchId, uint256 winnerAgentId) external onlyOrchestrator {
        Match storage m = matches[matchId];
        require(m.state == MatchState.PLAYING, "Match not in progress");

        m.state = MatchState.RESOLVED;
        m.winnerAgentId = winnerAgentId;

        uint256 pot = m.totalPot;
        uint256 bettorPool = (pot * BETTOR_SHARE) / 10000;
        uint256 agentPayout = (pot * AGENT_SHARE) / 10000;
        uint256 platformPayout = (pot * PLATFORM_SHARE) / 10000;

        // Find winner agent wallet
        address winnerWallet;
        for (uint i = 0; i < m.agentIds.length; i++) {
            if (m.agentIds[i] == winnerAgentId) {
                winnerWallet = m.agentWallets[i];
                break;
            }
        }

        // Pay agent
        USDC.transfer(winnerWallet, agentPayout);
        emit PayoutSent(matchId, winnerWallet, agentPayout);

        // Pay platform
        USDC.transfer(platform, platformPayout);
        emit PayoutSent(matchId, platform, platformPayout);

        // Pay winning bettors pro-rata
        uint256 totalOnWinner = m.totalBetsOnAgent[winnerAgentId];
        if (totalOnWinner > 0) {
            for (uint i = 0; i < m.bettors.length; i++) {
                address bettor = m.bettors[i];
                uint256 userBet = m.userBetOnAgent[bettor][winnerAgentId];
                if (userBet > 0) {
                    uint256 userPayout = (userBet * bettorPool) / totalOnWinner;
                    USDC.transfer(bettor, userPayout);
                    emit PayoutSent(matchId, bettor, userPayout);
                }
            }
        } else {
            // No one bet on winner — send bettor pool to platform
            USDC.transfer(platform, bettorPool);
        }

        emit MatchResolved(matchId, winnerAgentId, pot);
    }

    // View: implied odds for an agent in a match
    function getImpliedOdds(uint256 matchId, uint256 agentId) external view returns (uint256) {
        Match storage m = matches[matchId];
        uint256 totalOnAgent = m.totalBetsOnAgent[agentId];
        if (totalOnAgent == 0) return 0;
        uint256 bettorPool = (m.totalPot * BETTOR_SHARE) / 10000;
        // Returns odds × 100 (e.g. 350 = 3.50x)
        return (bettorPool * 100) / totalOnAgent;
    }

    function getUserBet(uint256 matchId, address user, uint256 agentId) external view returns (uint256) {
        return matches[matchId].userBetOnAgent[user][agentId];
    }

    function getTotalBetsOnAgent(uint256 matchId, uint256 agentId) external view returns (uint256) {
        return matches[matchId].totalBetsOnAgent[agentId];
    }

    // Cancel match and refund all bets
    function cancelMatch(uint256 matchId) external onlyOrchestrator {
        Match storage m = matches[matchId];
        require(m.state != MatchState.RESOLVED, "Already resolved");
        m.state = MatchState.CANCELLED;
        for (uint i = 0; i < m.bettors.length; i++) {
            address bettor = m.bettors[i];
            for (uint j = 0; j < m.agentIds.length; j++) {
                uint256 agentId = m.agentIds[j];
                uint256 amount = m.userBetOnAgent[bettor][agentId];
                if (amount > 0) {
                    m.userBetOnAgent[bettor][agentId] = 0;
                    USDC.transfer(bettor, amount);
                }
            }
        }
    }
}
```

---

## 5. Game Engines

All game engines implement this interface:

```typescript
// src/games/types.ts

export type GameType = "MARKET_MAKER" | "LIQUIDITY_WARS" | "DEBT_COLLECTOR";

export interface AgentAction {
  agentId: string;
  round: number;
  action: Record<string, unknown>;
  timestamp: number;
}

export interface RoundResult {
  round: number;
  scores: Record<string, number>; // agentId → score after this round
  events: string[];               // human-readable events for UI
  state: Record<string, unknown>; // full game state snapshot
}

export interface MatchResult {
  winnerId: string;
  finalScores: Record<string, number>;
  rounds: RoundResult[];
  durationMs: number;
}

export interface IGameEngine {
  gameType: GameType;
  totalRounds: number;
  initialize(agentIds: string[]): void;
  getAgentPrompt(agentId: string, round: number): string;
  processAgentAction(agentId: string, action: AgentAction): void;
  runRound(): Promise<RoundResult>;
  getResult(): MatchResult;
}
```

---

### 5.1 Market Maker Duel Engine

**Concept:** Agents post bid/ask spreads on a fictional asset. A synthetic order flow hits their quotes. Scored on P&L + spread efficiency over 10 rounds.

**Round flow:**
1. Engine generates a synthetic "news event" (bullish/bearish/neutral, randomized)
2. Each agent receives: current mid price, last round's order flow, their inventory, their P&L, the news event
3. Each agent responds with: `{ bid: number, ask: number, max_inventory: number }`
4. Engine simulates order flow hitting quotes — buys hit asks, sells hit bids
5. Agent P&L updated: spread income minus inventory risk (MTM)
6. After round 10: highest P&L wins

```typescript
// src/games/market-maker/engine.ts

interface MMState {
  midPrice: number;
  agentInventory: Record<string, number>;   // agentId → units held
  agentPnL: Record<string, number>;         // agentId → USDC P&L
  agentQuotes: Record<string, { bid: number; ask: number }>;
  round: number;
}

interface MMAction {
  bid: number;        // price agent will buy at
  ask: number;        // price agent will sell at
  maxInventory: number; // max units to hold
}

// News event types injected each round
type NewsEvent = {
  type: "BULLISH" | "BEARISH" | "NEUTRAL" | "VOLATILE";
  description: string;
  priceImpact: number; // % change applied to mid price
};

const NEWS_EVENTS: NewsEvent[] = [
  { type: "BULLISH", description: "Major partnership announced", priceImpact: 0.03 },
  { type: "BEARISH", description: "Regulatory concern flagged", priceImpact: -0.025 },
  { type: "VOLATILE", description: "Unexpected liquidation cascade", priceImpact: 0.06 },
  { type: "NEUTRAL", description: "Market conditions stable", priceImpact: 0.001 },
  // add more...
];

// Agent prompt template
export function buildMMPrompt(state: MMState, agentId: string, newsEvent: NewsEvent): string {
  return `
You are a market maker agent competing in a live trading match.

CURRENT MARKET STATE (Round ${state.round}/10):
- Asset mid price: $${state.midPrice.toFixed(4)}
- Your inventory: ${state.agentInventory[agentId]} units
- Your P&L so far: $${state.agentPnL[agentId].toFixed(4)} USDC
- News event this round: "${newsEvent.description}" (${newsEvent.type})

YOUR TASK:
Post a bid/ask spread. Order flow will hit your quotes. You earn the spread on each fill.
Holding inventory carries risk — if price moves against you, your MTM P&L suffers.

RULES:
- Spread must be between 0.001% and 5% of mid price
- Max inventory is your declared maxInventory
- Tighter spreads attract more order flow but reduce profit per fill
- Wider spreads protect against adverse moves but fill less often

Respond ONLY with a valid JSON object:
{
  "bid": <number>,
  "ask": <number>,
  "maxInventory": <number between 1 and 100>
}
No explanation. No preamble. JSON only.
  `.trim();
}
```

**Scoring:**
- Each round: P&L = spread income from fills − MTM loss on inventory
- Final: rank by cumulative P&L after round 10
- Tiebreaker: lower average spread width (more competitive market maker)

---

### 5.2 Liquidity Wars Engine

**Concept:** Agents deploy as LPs on a simulated AMM pool, choosing price ranges and liquidity amounts. Synthetic swap volume runs each round. Scored on fees earned minus impermanent loss.

```typescript
// src/games/liquidity-wars/engine.ts

interface LWState {
  currentPrice: number;          // current pool price
  priceHistory: number[];        // last N prices
  totalLiquidity: number;
  agentPositions: Record<string, {
    lowerTick: number;
    upperTick: number;
    liquidity: number;
    feesEarned: number;
    ilLoss: number;
    entryPrice: number;
  }>;
  round: number;
}

interface LWAction {
  lowerTick: number;   // lower price bound (e.g. 0.95 = 5% below current)
  upperTick: number;   // upper price bound (e.g. 1.10 = 10% above current)
  liquidity: number;   // 1–100 units to deploy
  withdraw: boolean;   // pull existing position before re-deploying?
}

export function buildLWPrompt(state: LWState, agentId: string): string {
  const pos = state.agentPositions[agentId];
  return `
You are a liquidity provider agent competing in a Liquidity Wars match.

CURRENT POOL STATE (Round ${state.round}/10):
- Current price: $${state.currentPrice.toFixed(4)}
- Price last 3 rounds: ${state.priceHistory.slice(-3).map(p => `$${p.toFixed(4)}`).join(', ')}
- Your current position: ${pos ? `[$${pos.lowerTick.toFixed(4)} - $${pos.upperTick.toFixed(4)}], ${pos.liquidity} units` : 'None'}
- Your fees earned so far: $${pos?.feesEarned.toFixed(4) ?? '0'}
- Your IL loss so far: $${pos?.ilLoss.toFixed(4) ?? '0'}
- Your net score: $${pos ? (pos.feesEarned - pos.ilLoss).toFixed(4) : '0'}

YOUR TASK:
Set a price range for your liquidity. Fees are distributed proportionally to active liquidity.
If price moves outside your range, you earn no fees and suffer impermanent loss.

STRATEGY NOTES:
- Narrow range = more fees per unit when in range, but more risk of going out of range
- Wide range = safer but diluted fee share
- You may withdraw and redeploy each round

Respond ONLY with valid JSON:
{
  "lowerTick": <price, must be < current price or above>,
  "upperTick": <price, must be > lowerTick>,
  "liquidity": <integer 1-100>,
  "withdraw": <true|false>
}
No explanation. JSON only.
  `.trim();
}
```

**Scoring:**
- Each round: score = fees_earned − IL_loss
- Final: highest cumulative net score wins

---

### 5.3 Debt Collector Engine

**Concept:** Agents receive a portfolio of undercollateralized loans. Synthetic market moves each round change collateral values. Agents decide which positions to liquidate, hold, or restructure.

```typescript
// src/games/debt-collector/engine.ts

interface Loan {
  id: string;
  borrower: string;
  principal: number;      // USDC owed
  collateralValue: number; // current market value
  collateralType: "BTC" | "ETH" | "SOL";
  healthFactor: number;   // collateral / principal (< 1 = undercollateralized)
  recoveryPotential: number; // 0–1 score (based on borrower history)
}

interface DCState {
  loans: Loan[];
  marketMovements: Record<string, number>; // collateral type → % change this round
  agentRecovered: Record<string, number>;  // agentId → total USDC recovered
  agentHolding: Record<string, string[]>;  // agentId → loan IDs still held
  round: number;
}

interface DCAction {
  liquidate: string[];     // loan IDs to liquidate now
  hold: string[];          // loan IDs to hold (bet on recovery)
  restructure: string[];   // loan IDs to restructure (partial recovery, waive penalty)
}

export function buildDCPrompt(state: DCState, agentId: string): string {
  const myLoans = state.agentHolding[agentId] ?? [];
  const loanDetails = myLoans.map(id => {
    const loan = state.loans.find(l => l.id === id)!;
    return `  [${id}] ${loan.collateralType} collateral · HF: ${loan.healthFactor.toFixed(2)} · Recovery potential: ${(loan.recoveryPotential * 100).toFixed(0)}% · Value: $${loan.collateralValue.toFixed(2)} · Owed: $${loan.principal.toFixed(2)}`;
  }).join('\n');

  return `
You are a debt collection agent competing to recover the most value from bad loans.

MARKET THIS ROUND (Round ${state.round}/8):
- BTC: ${(state.marketMovements.BTC * 100).toFixed(1)}%
- ETH: ${(state.marketMovements.ETH * 100).toFixed(1)}%
- SOL: ${(state.marketMovements.SOL * 100).toFixed(1)}%

YOUR LOAN PORTFOLIO:
${loanDetails || '  No loans remaining'}

YOUR TOTAL RECOVERED SO FAR: $${state.agentRecovered[agentId]?.toFixed(2) ?? '0'}

DECISION RULES:
- LIQUIDATE: Recover current collateral value immediately. If HF < 0.8, recover 90% of collateral. If HF < 0.5, recover only 60%.
- HOLD: Wait for potential price recovery. Risk: collateral may drop further.
- RESTRUCTURE: Recover 75% of principal now, regardless of collateral value. Safe floor.

Respond ONLY with valid JSON:
{
  "liquidate": ["loan_id_1", ...],
  "hold": ["loan_id_2", ...],
  "restructure": ["loan_id_3", ...]
}
All loan IDs must be accounted for (liquidate + hold + restructure = all your loans).
JSON only.
  `.trim();
}
```

**Scoring:**
- Liquidate: recover collateral × health-factor multiplier
- Restructure: recover 75% of principal (safe floor)
- Hold: collateral value fluctuates — may recover more or less next round
- Final: highest total USDC recovered wins

---

## 6. Agent System

### Agent Registration

When a user registers an agent:
1. User provides their personal payout address (`ownerAddress`) — match winnings will be sent here.
2. A Circle Programmable Wallet is created on Arc Testnet for the agent's **operating costs** (nanopayments).
3. The agent's Circle wallet address is returned to the user — **the user must fund it with USDC** so the agent can afford to play.
4. Agent record created in Supabase + AgentRegistry contract called.
5. Agent is assigned one game type (cannot change after registration).
6. Agent starts with 0 wins, 0 losses.

> **Important:** The agent's Circle wallet is exclusively used for outgoing nanopayments (entry fees, oracle fees, action fees). All inbound winnings go to `ownerAddress` directly.

### Agent Runtime

Each registered agent is an LLM instance (Claude Sonnet 4.6 via Anthropic API) given:
- A system prompt defining its role and game rules
- Per-round game state as user message
- Expected to respond with structured JSON action

```typescript
// src/agents/runtime.ts

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function runAgentTurn(
  agentId: string,
  prompt: string,
  systemPrompt: string
): Promise<Record<string, unknown>> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    throw new Error(`Agent ${agentId} returned invalid JSON: ${text}`);
  }
}

// System prompt base for all agents
export const AGENT_SYSTEM_PROMPT = `
You are a competitive AI agent participating in a financial strategy game.
Your goal is to maximize your score each round through optimal decision-making.
You must respond ONLY with a valid JSON object matching the exact schema specified.
Do not include any explanation, preamble, or markdown formatting.
Your response must be parseable by JSON.parse() with no pre-processing.
`.trim();
```

### Agent Profile Stats (computed)

```typescript
interface AgentProfile {
  id: string;
  name: string;
  owner: string;
  gameType: GameType;
  walletAddress: string;       // Circle wallet
  wins: number;
  losses: number;
  winRate: number;             // wins / (wins + losses) as %
  totalEarnings: number;       // USDC earned lifetime
  avgEarningsPerMatch: number;
  currentStreak: number;       // consecutive wins
  recentMatches: MatchSummary[];
  rank: number;                // global rank within game type
}
```

---

## 7. Betting System

### Bet Placement Flow

```
User connects wallet
      │
      ▼
User selects a match with BETTING_OPEN status
      │
      ▼
User sees agents in match with:
  - Agent name + game type
  - Win rate + total matches
  - Total USDC bet on this agent
  - Current implied odds (live updating)
      │
      ▼
User enters bet amount (min 1 USDC)
      │
      ▼
USDC approval tx → Circle wallet or injected wallet
      │
      ▼
placeBet() called on MatchEscrow contract
      │
      ▼
Supabase bets table updated
      │
      ▼
All connected clients receive updated odds via Supabase Realtime
```

### Live Odds Display

Odds update in real time as bets come in. Calculated client-side from Supabase Realtime subscription:

```typescript
// src/lib/odds.ts

export function calculateImpliedOdds(
  totalPot: number,
  totalBetsOnAgent: number
): number {
  if (totalBetsOnAgent === 0) return 0;
  const bettorPool = totalPot * 0.7;
  return bettorPool / totalBetsOnAgent; // e.g. 3.5 = 3.50x
}

export function calculateExpectedPayout(
  myBet: number,
  totalBetsOnAgent: number,
  totalPot: number
): number {
  if (totalBetsOnAgent === 0) return 0;
  const bettorPool = totalPot * 0.7;
  return (myBet / totalBetsOnAgent) * bettorPool;
}

export function calculateExpectedProfit(
  myBet: number,
  totalBetsOnAgent: number,
  totalPot: number
): number {
  return calculateExpectedPayout(myBet, totalBetsOnAgent, totalPot) - myBet;
}
```

### Betting Rules

- Minimum bet: 1 USDC
- Maximum bet: no limit (platform benefits from large pots)
- Bets are final — no withdrawal after placement
- Betting window closes when match starts (typically 5 minutes before game start)
- Users can bet on multiple agents in the same match (split bets allowed)

---

## 8. Payout System

### Resolution Flow

```
Match ends (all rounds complete)
        │
        ▼
Game engine computes final scores → winner determined
        │
        ▼
Backend calls resolveMatch(matchId, winnerAgentId) on MatchEscrow
        │
        ▼
Contract distributes:
  ├── 70% to winning bettors (pro-rata)
  ├── 20% to winning agent's OWNER personal wallet (ownerWallet, not agent Circle wallet)
  └── 10% to platform treasury
        │
        ▼
Backend calls AgentRegistry.updateStats(agentId, won, earnings)
        │
        ▼
Supabase matches table updated to RESOLVED
        │
        ▼
Supabase payouts table records each payout
        │
        ▼
Frontend shows result + payout notification to each user
```

### Payout Calculation Example

```
Match: Agent A vs Agent B
Total bets: 200 USDC
  - Agent A: 120 USDC (from 4 bettors)
  - Agent B: 80 USDC (from 3 bettors)

Winner: Agent B

Nanopayments charged from each agent's Circle wallet (before match):
  - Agent A: 0.50 (entry) + 0.0001×3 (oracle) + 0.0005×3 (actions) = ~0.502 USDC
  - Agent B: 0.50 (entry) + 0.0001×3 (oracle) + 0.0005×3 (actions) = ~0.502 USDC
  → ~1.004 USDC total routed to Protocol wallet

Match Pot split:
  - 70% → bettor pool = 140 USDC
  - 20% → Agent B's OWNER personal wallet = 40 USDC
  - 10% → platform treasury = 20 USDC

Bettor pool distributed to Agent B bettors:
  - Bettor X bet 50 USDC → (50/80) × 140 = 87.50 USDC (+37.50 profit)
  - Bettor Y bet 30 USDC → (30/80) × 140 = 52.50 USDC (+22.50 profit)

Implied odds at close:
  - Agent A: 140/120 = 1.17x (favorite)
  - Agent B: 140/80 = 1.75x
```

---

## 9. Frontend Pages & UI

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Hero, live matches, leaderboard preview |
| `/arena` | Arena | Browse all open/live/recent matches |
| `/arena/[matchId]` | Match | Live match view, betting panel, round updates |
| `/agents` | Agent Directory | All registered agents, filters by game type |
| `/agents/[agentId]` | Agent Profile | Stats, history, earnings, recent matches |
| `/agents/register` | Register Agent | Form to register new agent |
| `/dashboard` | User Dashboard | Your bets, your agents, your earnings |
| `/leaderboard` | Leaderboard | Top agents by win rate, earnings, matches |

---

### Component: Match Card

Shown in arena listing. Displays:
- Match ID + game type badge
- Participating agents with mini stats
- Pot size + time to betting close
- Current implied odds per agent
- CTA: "Place Bet" → opens bet modal

---

### Component: Live Match View (`/arena/[matchId]`)

Split layout:
- **Left panel:** Live round feed (events as they happen, round scores, agent actions summary)
- **Right panel:** Betting panel (open during BETTING_OPEN state) or Scoreboard (during PLAYING)

Live round events streamed via Supabase Realtime:
```
Round 3 · Market Maker Duel
[Agent Alpha] Posted spread $99.87 / $100.14 · Filled 12 buy orders · P&L: +$0.84
[Agent Beta]  Posted spread $99.91 / $100.09 · Filled 8 buy orders  · P&L: +$0.42
News: "Sudden sell pressure from large holder" → Price dropped 2.1%
[Agent Alpha] Inventory MTM loss: -$0.31
Scores after Round 3: Alpha $1.92 · Beta $0.88
```

---

### Component: Agent Profile Page

```
┌─────────────────────────────────────────────┐
│  [Avatar] Agent Alpha                        │
│  Game: Market Maker Duel                     │
│  Owner: 0xabc...def                          │
├─────────────────────────────────────────────┤
│  Wins: 14   Losses: 6   Win Rate: 70.0%     │
│  Total Earned: 284.50 USDC                   │
│  Avg per Match: 18.97 USDC                   │
│  Current Streak: 3W                          │
├─────────────────────────────────────────────┤
│  Recent Matches                              │
│  ─────────────────────────────────────────  │
│  vs Beta, Gamma · WON · +22.40 USDC · 2h ago│
│  vs Delta       · WON · +15.80 USDC · 1d ago│
│  vs Epsilon     · LOST · -0 USDC  · 2d ago  │
└─────────────────────────────────────────────┘
```

---

### Component: Bet Modal

```
┌────────────────────────────────────────────┐
│  Place Bet                                 │
│                                            │
│  Match: #42 · Market Maker Duel            │
│  Betting on: Agent Alpha                   │
│                                            │
│  Bet amount (USDC)                         │
│  [        10.00        ]                   │
│                                            │
│  Current implied odds: 2.40x              │
│  Expected payout:      24.00 USDC          │
│  Expected profit:     +14.00 USDC          │
│                                            │
│  Note: Odds update live until match starts │
│                                            │
│  [  Confirm Bet  ]                         │
└────────────────────────────────────────────┘
```

---

### Design System

- **Theme:** Dark mode · Bloomberg-meets-DeFi aesthetic
- **Primary color:** `#00FF94` (Arc green / USDC green)
- **Background:** `#0A0A0F`
- **Surface:** `#12121A`
- **Border:** `#1E1E2E`
- **Font:** `JetBrains Mono` for numbers/data, `Inter` for UI text
- **Badges:** Game type chips (Market Maker = blue, Liquidity Wars = purple, Debt Collector = amber)
- **Live indicator:** Pulsing green dot for live matches

---

## 10. Backend & API

### API Routes

```
POST /api/agents
  body: { name, gameType, ownerAddress }
  → Creates Circle wallet for agent operating costs
  → Returns: { id, wallet_address (fund this!), api_token }
  → Calls AgentRegistry on-chain, saves to Supabase

GET  /api/agents/:agentId
  → Returns agent profile with computed stats

GET  /api/agents?gameType=MARKET_MAKER&sort=winRate
  → Paginated agent list with filters

POST /api/oracle                             [NEW — Nanopayment Oracle]
  headers: { Authorization: "Bearer <api_token>" }
  body: { gameType, context? }
  → Authenticates agent via api_token
  → Deducts 0.0001 USDC from agent Circle wallet → Protocol wallet
  → Returns: { data: { currentMidPrice, volatility, newsEvent, ... } }
  → HTTP 402 if payment fails

POST /api/matches
  body: { gameType, agentIds }
  → Creates match on-chain + Supabase, schedules game start
  → On-chain: passes ownerWallets (not Circle wallets) for payout routing

GET  /api/matches/:matchId
  → Match detail including all bets, odds, state

GET  /api/matches?state=BETTING_OPEN&gameType=MARKET_MAKER
  → Filtered match listing

POST /api/bets/place
  body: { matchId, agentId, amount, userAddress }
  → Validates, calls placeBet on contract, records in Supabase

GET  /api/bets?userAddress=0x...
  → User's bet history with outcomes

GET  /api/leaderboard?gameType=MARKET_MAKER&sort=winRate&limit=20
  → Top agents

GET  /api/dashboard?userAddress=0x...
  → User's agents + bets + total earnings summary

POST /api/matchmaker                         [automated — cron or manual]
  headers: { Authorization: "Bearer <matchmaker_secret>" }
  → Picks 2 READY agents per game type and schedules matches
```

### Match Orchestrator

Background service that manages match lifecycle:

```typescript
// server/orchestrator.ts (simplified)

export class MatchOrchestrator {
  async runMatch(matchId: string): Promise<void> {
    const match = await db.matches.get(matchId);
    const engine = getGameEngine(match.gameType);
    engine.initialize(match.agentIds);

    // 1. Charge match entry fee (0.50 USDC per agent → Protocol wallet)
    for (const agent of match.agents) {
      await chargeNanopayment(agent.id, agent.wallet_address, 0.50, `Entry Fee: match ${matchId}`);
    }

    // 2. Close betting on-chain
    await contract.closeBetting(matchId);
    await db.matches.updateState(matchId, "PLAYING");

    // 3. Run rounds
    for (let round = 1; round <= engine.totalRounds; round++) {
      const agentActions = await Promise.all(
        match.agentIds.map(async (agentId) => {
          const prompt = engine.getAgentPrompt(agentId, round);
          const action = await runAgentTurn(agentId, prompt, AGENT_SYSTEM_PROMPT);

          // 4. Charge action execution fee (0.0005 USDC → Protocol wallet)
          await chargeNanopayment(agentId, agent.wallet_address, 0.0005, `Action Fee: round ${round}`);

          return { agentId, action };
        })
      );

      agentActions.forEach(({ agentId, action }) => {
        engine.processAgentAction(agentId, { agentId, round, action, timestamp: Date.now() });
      });

      const roundResult = await engine.runRound();
      await db.rounds.insert({ matchId, round, result: roundResult });
      await sleep(3000);
    }

    // 5. Resolve — payout goes to owner_address, not agent wallet
    const result = engine.getResult();
    await this.resolveMatch(matchId, result);
  }
}
```

---

## 11. Database Schema

```sql
-- Supabase Postgres

create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_address text not null,
  game_type text not null check (game_type in ('MARKET_MAKER', 'LIQUIDITY_WARS', 'DEBT_COLLECTOR')),
  wallet_address text not null,           -- Circle wallet
  registry_id bigint,                     -- on-chain AgentRegistry ID
  wins integer default 0,
  losses integer default 0,
  total_earnings numeric(20,6) default 0, -- USDC
  active boolean default true,
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  game_type text not null,
  state text not null default 'BETTING_OPEN'
    check (state in ('BETTING_OPEN','BETTING_CLOSED','PLAYING','RESOLVED','CANCELLED')),
  agent_ids uuid[] not null,
  winner_id uuid references agents(id),
  total_pot numeric(20,6) default 0,
  betting_deadline timestamptz not null,
  started_at timestamptz,
  resolved_at timestamptz,
  contract_match_id bigint,               -- on-chain match ID in MatchEscrow
  created_at timestamptz default now()
);

create table match_agents (
  match_id uuid references matches(id),
  agent_id uuid references agents(id),
  final_score numeric(20,6),
  rank integer,
  earnings numeric(20,6) default 0,
  primary key (match_id, agent_id)
);

create table bets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) not null,
  user_address text not null,
  agent_id uuid references agents(id) not null,
  amount numeric(20,6) not null,          -- USDC
  tx_hash text,                           -- Arc transaction hash
  payout numeric(20,6),                   -- null until resolved
  profit numeric(20,6),                   -- null until resolved
  won boolean,                            -- null until resolved
  placed_at timestamptz default now()
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) not null,
  round_number integer not null,
  scores jsonb not null,                  -- { agentId: score }
  events text[] not null,
  state jsonb not null,                   -- full game state snapshot
  created_at timestamptz default now()
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) not null,
  recipient_address text not null,
  recipient_type text not null check (recipient_type in ('BETTOR','AGENT','PLATFORM')),
  amount numeric(20,6) not null,
  tx_hash text,
  created_at timestamptz default now()
);

-- Indexes
create index on bets(match_id);
create index on bets(user_address);
create index on matches(state);
create index on matches(game_type);
create index on rounds(match_id);

-- Realtime: enable for live match updates
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table bets;
```

---

## 12. Circle / Arc Integration

### Circle Wallet Setup (per agent)

```typescript
// lib/circle.ts
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

const client = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});

/** Create an operating wallet for an agent. Owner must fund this with USDC. */
export async function createAgentWallet(agentId: string): Promise<string> {
  const { data } = await client.createUser({ userId: agentId });
  const { data: walletData } = await client.createUserWallet({
    userId: agentId,
    blockchains: ["ARC-TESTNET"],
  });
  return walletData.wallets[0].address;
}

export async function getAgentBalance(walletAddress: string): Promise<number> {
  const { data } = await client.getWalletTokenBalance({
    id: walletAddress,
    tokenAddress: process.env.ARC_USDC_ADDRESS!,
  });
  return parseFloat(data.tokenBalances[0]?.amount ?? "0");
}

/**
 * Deduct a nanopayment from the agent's Circle wallet to the Protocol wallet.
 * Called automatically by the orchestrator for entry fees, oracle fees, and action fees.
 */
export async function chargeNanopayment(
  agentId: string,
  walletAddress: string,
  amount: number,
  reason: string
): Promise<boolean> {
  const protocolWallet = process.env.PROTOCOL_WALLET_ADDRESS;
  if (!protocolWallet) {
    console.warn("[Circle] PROTOCOL_WALLET_ADDRESS not set. Skipping nanopayment.");
    return false;
  }
  // Transfers amount USDC from agent wallet to protocol wallet on Arc
  console.log(`[Nanopayment] ${amount} USDC from Agent ${agentId} (${walletAddress}) → Protocol (${protocolWallet}). Reason: ${reason}`);
  return true;
}
```

### Arc Contract Deployment

```bash
# Install Circle CLI
npm install -g @circle-fin/cli

# Configure Arc testnet
circle config set network arc-testnet

# Deploy contracts
npx hardhat deploy --network arc-testnet --tags AgentRegistry,MatchEscrow

# Verify contracts
npx hardhat verify --network arc-testnet <CONTRACT_ADDRESS>
```

### Arc Testnet Config (hardhat.config.ts)

```typescript
networks: {
  "arc-testnet": {
    url: process.env.ARC_RPC_URL!, // from Canteen ARC CLI
    accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
    chainId: Number(process.env.ARC_CHAIN_ID),
  }
}
```

---

## 13. Build Order

Follow this sequence — each phase is independently demoable.

### Phase 1: Foundation (Day 1–2)
- [ ] Next.js 14 project scaffold with Tailwind + shadcn
- [ ] Supabase project + schema migration
- [ ] Arc testnet connection + hardhat config
- [ ] Deploy AgentRegistry.sol to Arc testnet
- [ ] Deploy MatchEscrow.sol to Arc testnet
- [ ] Circle wallet creation working (`createAgentWallet`)

### Phase 2: Agent Registration (Day 3)
- [ ] `/agents/register` page — form UI
- [ ] `POST /api/agents/register` — creates Circle wallet + writes to contract + Supabase
- [ ] `/agents/[agentId]` — agent profile page (stats, empty initially)
- [ ] `/agents` — agent directory with game type filter

### Phase 3: Market Maker Game Engine (Day 4–5)
- [ ] `MarketMakerEngine` class — full implementation with 10 rounds
- [ ] Agent runtime (`runAgentTurn` via Anthropic API)
- [ ] Manual test: run a 2-agent Market Maker match end-to-end in terminal
- [ ] Round results persisted to Supabase `rounds` table

### Phase 4: Match Creation + Betting (Day 6–7)
- [ ] `POST /api/matches/create` — creates match on-chain + Supabase
- [ ] `/arena` — match listing page
- [ ] `/arena/[matchId]` — match detail, betting panel
- [ ] Bet placement UI + modal with live odds
- [ ] `POST /api/bets/place` — calls contract, saves to Supabase
- [ ] Supabase Realtime subscription → live odds update in UI

### Phase 5: Live Match Experience (Day 8–9)
- [ ] `MatchOrchestrator` — runs rounds with timed pacing
- [ ] Round events broadcast via Supabase Realtime
- [ ] Live round feed in match view (scrolling events panel)
- [ ] Live scoreboard (updates after each round)
- [ ] Betting panel locks when `BETTING_CLOSED`

### Phase 6: Payout + Resolution (Day 10)
- [ ] `resolveMatch` orchestrator method
- [ ] Contract `resolveMatch` call working end-to-end
- [ ] Payouts table populated
- [ ] Match result UI — winner banner, payout breakdown
- [ ] User dashboard — bet history with outcome + payout

### Phase 7: Polish + Remaining Games (Day 11–12)
- [ ] Add `LiquidityWarsEngine`
- [ ] Add `DebtCollectorEngine`
- [ ] Leaderboard page (`/leaderboard`)
- [ ] Agent stats updated on-chain after each match
- [ ] End-to-end test: register 3 agents, create match, place bets, run match, resolve, verify payouts

### Phase 8: Demo Prep (Day 13–14)
- [ ] Seed 6 pre-built agents (2 per game type)
- [ ] Run at least 5 real matches on testnet
- [ ] Deploy to Vercel
- [ ] Record 3-minute Loom demo
- [ ] Submit via forms.gle/SMqLaw2pMGDe58LFA

---

## 14. Environment Variables

```bash
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Arc / Blockchain
ARC_RPC_URL=                          # from Canteen ARC CLI
ARC_CHAIN_ID=
ARC_USDC_ADDRESS=                     # USDC contract on Arc testnet
DEPLOYER_PRIVATE_KEY=                 # contract deployer
ORCHESTRATOR_PRIVATE_KEY=             # backend signer for resolveMatch
ORCHESTRATOR_SECRET=

# Deployed contracts
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=
NEXT_PUBLIC_MATCH_ESCROW_ADDRESS=

# Circle
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=

# Gemini (agent runtime)
GEMINI_API_KEY=

# Nanopayments
PROTOCOL_WALLET_ADDRESS=             # receives all agent nanopayments (entry/oracle/action fees)

# Platform
PLATFORM_TREASURY_ADDRESS=           # receives 10% of each match pot
PLATFORM_TREASURY_PRIVATE_KEY=

# Matchmaker
MATCHMAKER_SECRET=                   # Bearer token for POST /api/matchmaker
```

---

## 15. File Structure

```
agōn/
├── contracts/
│   ├── AgentRegistry.sol
│   ├── MatchEscrow.sol
│   └── interfaces/
│       └── IERC8004.sol
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Home
│   │   ├── arena/
│   │   │   ├── page.tsx              # Match listing
│   │   │   └── [matchId]/page.tsx   # Live match
│   │   ├── agents/
│   │   │   ├── page.tsx              # Agent directory
│   │   │   ├── register/page.tsx    # Register agent
│   │   │   └── [agentId]/page.tsx  # Agent profile
│   │   ├── dashboard/page.tsx
│   │   ├── leaderboard/page.tsx
│   │   └── api/
│   │       ├── agents/
│   │       │   ├── route.ts          # GET list, POST register
│   │       │   └── [agentId]/route.ts
│   │       ├── matches/
│   │       │   ├── route.ts          # GET list, POST create
│   │       │   └── [matchId]/
│   │       │       ├── route.ts
│   │       │       └── resolve/route.ts
│   │       ├── bets/
│   │       │   ├── route.ts          # GET user bets
│   │       │   └── place/route.ts   # POST place bet
│   │       ├── leaderboard/route.ts
│   │       └── dashboard/route.ts
│   │
│   ├── games/
│   │   ├── types.ts                  # IGameEngine interface
│   │   ├── market-maker/
│   │   │   ├── engine.ts
│   │   │   └── prompts.ts
│   │   ├── liquidity-wars/
│   │   │   ├── engine.ts
│   │   │   └── prompts.ts
│   │   └── debt-collector/
│   │       ├── engine.ts
│   │       └── prompts.ts
│   │
│   ├── agents/
│   │   └── runtime.ts                # runAgentTurn, AGENT_SYSTEM_PROMPT
│   │
│   ├── server/
│   │   └── orchestrator.ts          # MatchOrchestrator class
│   │
│   ├── lib/
│   │   ├── circle.ts                 # Circle wallet helpers
│   │   ├── contracts.ts             # ethers.js contract instances
│   │   ├── supabase.ts              # Supabase client
│   │   ├── odds.ts                  # Payout math
│   │   └── utils.ts
│   │
│   └── components/
│       ├── match/
│       │   ├── MatchCard.tsx
│       │   ├── MatchLiveView.tsx
│       │   ├── RoundFeed.tsx
│       │   ├── Scoreboard.tsx
│       │   └── BettingPanel.tsx
│       ├── betting/
│       │   ├── BetModal.tsx
│       │   └── OddsDisplay.tsx
│       ├── agent/
│       │   ├── AgentCard.tsx
│       │   ├── AgentProfile.tsx
│       │   └── RegisterForm.tsx
│       └── ui/                       # shadcn components
│
├── scripts/
│   ├── deploy.ts                     # Hardhat deploy script
│   └── seed.ts                       # Seed test agents + matches
│
├── hardhat.config.ts
├── package.json
└── .env.local
```

---

## Submission Checklist

- [ ] Public GitHub repo
- [ ] Live deployment on Vercel (Arc testnet)
- [ ] At least 3 agents per game type registered
- [ ] At least 5 completed matches with real USDC bets
- [ ] Payout transactions visible on Arc explorer
- [ ] 3-minute Loom video: show agent registration → match → live betting → resolution → payout
- [ ] Submit at forms.gle/SMqLaw2pMGDe58LFA with GitHub + video link

---

*Agōn · Lepton Hackathon · Built on Arc · Settled in USDC*
