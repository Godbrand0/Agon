import { getGameEngine } from "../games";
import type { GameType, MatchResult } from "../games/types";
import { runAgentTurn, AGENT_SYSTEM_PROMPT } from "../agents/runtime";
import { supabaseAdmin } from "../lib/supabase";
import { chargeNanopayment } from "../lib/circle";
import { sleep } from "../lib/utils";
import {
  tryGetOrchestratorWallet,
  getPublicClient,
  simTxHash,
  MATCH_ESCROW_ABI,
  MATCH_ESCROW_ADDRESS,
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "../lib/contracts";

type OrchestratorWallet = NonNullable<ReturnType<typeof tryGetOrchestratorWallet>>;

/**
 * Send a contract write and wait for its receipt. Sequential writes from the
 * same wallet MUST wait between sends — firing closeBetting/startMatch
 * back-to-back races the nonce and silently drops one tx, leaving the escrow
 * stuck in the wrong state ("Match not in progress" on resolve).
 */
async function writeAndWait(
  wallet: OrchestratorWallet,
  params: Parameters<OrchestratorWallet["writeContract"]>[0],
  label: string
): Promise<boolean> {
  try {
    const hash = await wallet.writeContract(params);
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") {
      console.error(`[chain] ${label} reverted (${hash})`);
      return false;
    }
    console.log(`[chain] ${label} ✓ https://testnet.arcscan.app/tx/${hash}`);
    return true;
  } catch (e) {
    console.error(`[chain] ${label} failed (continuing):`, e instanceof Error ? e.message : e);
    return false;
  }
}

const ROUND_DELAY_MS = 4000; // pause between rounds for UI drama
const MAX_ROUNDS = 3;        // best of 3

// Nanopayment schedule (USDC)
const ENTRY_FEE = 0.50;
const ORACLE_FEE = 0.0001; // charged when an agent receives round market data
const ACTION_FEE = 0.0005; // charged when an agent's action is executed

// Pot split (must mirror MatchEscrow.sol constants)
const BETTOR_SHARE = 0.6;
const AGENT_SHARE = 0.3;

export class MatchOrchestrator {
  async runMatch(matchId: string): Promise<void> {
    const db = supabaseAdmin();

    // Atomically claim the match before doing anything else. Two orchestrator
    // processes can otherwise both pick up the same match — e.g. a worker
    // restart mid-run leaves the old process's in-memory tracking behind but
    // the DB row still BETTING_OPEN, so a fresh process re-runs the whole
    // match as an independent simulation (duplicate fees, duplicate rounds,
    // and potentially a DIFFERENT winner than the first run already resolved
    // on-chain). This conditional update only succeeds for one caller.
    const { data: claimed, error: claimErr } = await db
      .from("matches")
      .update({ state: "BETTING_CLOSED" })
      .eq("id", matchId)
      .eq("state", "BETTING_OPEN")
      .select("id");

    if (claimErr) throw new Error(`Failed to claim match ${matchId}: ${claimErr.message}`);
    if (!claimed || claimed.length === 0) {
      console.warn(`[orchestrator] match ${matchId} not BETTING_OPEN — already claimed or run, skipping`);
      return;
    }

    const { data: match, error } = await db
      .from("matches")
      .select("*, match_agents(agent_id, agents(wallet_address, registry_id, model))")
      .eq("id", matchId)
      .single();

    if (error || !match) throw new Error(`Match ${matchId} not found`);

    if (match.agent_ids.length !== 2) throw new Error("Matches must have exactly 2 agents");

    const agentIds: string[] = match.agent_ids;
    const engine = getGameEngine(match.game_type as GameType);
    engine.initialize(agentIds);

    // Null when chain env is missing — every contract call below degrades to
    // Supabase-only settlement so the match always completes.
    const wallet = tryGetOrchestratorWallet();

    // Charge match entry fees
    for (const matchAgent of match.match_agents) {
      const agentId = matchAgent.agent_id;
      const walletAddress = matchAgent.agents?.wallet_address;
      if (walletAddress) {
        await chargeNanopayment(agentId, walletAddress, ENTRY_FEE, `Match Entry Fee for match ${matchId}`, {
          matchId,
          kind: "ENTRY_FEE",
        });
      }
    }

    // Close betting on-chain (wait for receipt before startMatch — nonce order matters)
    // DB state is already BETTING_CLOSED from the atomic claim above.
    if (wallet && match.contract_match_id) {
      await writeAndWait(wallet, {
        address: MATCH_ESCROW_ADDRESS,
        abi: MATCH_ESCROW_ABI,
        functionName: "closeBetting",
        args: [BigInt(match.contract_match_id)],
      }, `closeBetting(${match.contract_match_id})`);
    }

    if (wallet && match.contract_match_id) {
      await writeAndWait(wallet, {
        address: MATCH_ESCROW_ADDRESS,
        abi: MATCH_ESCROW_ABI,
        functionName: "startMatch",
        args: [BigInt(match.contract_match_id)],
      }, `startMatch(${match.contract_match_id})`);
    }

    await db.from("matches").update({
      state: "PLAYING",
      started_at: new Date().toISOString(),
    }).eq("id", matchId);

    // Track round wins for best-of-3
    const roundWins: Record<string, number> = Object.fromEntries(agentIds.map((id) => [id, 0]));

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      // Collect agent actions in parallel (with 15s timeout)
      const actionResults = await Promise.allSettled(
        agentIds.map(async (agentId) => {
          // The round prompt carries the market state — the agent buys it
          // from the data oracle, same rate as external agents pay /api/oracle
          const agentWallet = match.match_agents.find((ma: any) => ma.agent_id === agentId)?.agents?.wallet_address;
          if (agentWallet) {
            await chargeNanopayment(agentId, agentWallet, ORACLE_FEE, `Oracle Data Request for round ${round}`, {
              matchId,
              kind: "ORACLE_FEE",
            });
          }

          const prompt = engine.getAgentPrompt(agentId, round);
          const model = match.match_agents.find((ma: any) => ma.agent_id === agentId)?.agents?.model ?? null;
          const action = await runAgentTurn(agentId, prompt, AGENT_SYSTEM_PROMPT, model);
          return { agentId, action };
        })
      );

      for (const result of actionResults) {
        if (result.status === "fulfilled") {
          const { agentId, action } = result.value;

          // Charge action execution fee
          const walletAddress = match.match_agents.find((ma: any) => ma.agent_id === agentId)?.agents?.wallet_address;
          if (walletAddress) {
            await chargeNanopayment(agentId, walletAddress, ACTION_FEE, `Action Execution Fee for round ${round}`, {
              matchId,
              kind: "ACTION_FEE",
            });
          }

          engine.processAgentAction(agentId, { agentId, round, action, timestamp: Date.now() });
        }
      }

      const roundResult = await engine.runRound();

      // Save round to Supabase (reasoning stored in state field)
      await db.from("rounds").insert({
        match_id: matchId,
        round_number: roundResult.round,
        scores: roundResult.scores,
        events: roundResult.events,
        state: roundResult.state,
      });

      // Track round wins
      if (roundResult.roundWinner) {
        roundWins[roundResult.roundWinner] = (roundWins[roundResult.roundWinner] ?? 0) + 1;
      }

      // Early termination: first to 2 round wins
      const maxWins = Math.max(...Object.values(roundWins));
      const canWinEarly = MAX_ROUNDS - round < (2 - maxWins); // impossible to catch up
      if (maxWins >= 2 || canWinEarly) break;

      if (round < MAX_ROUNDS) await sleep(ROUND_DELAY_MS);
    }

    const result = engine.getResult();
    await this.resolveMatch(matchId, match.contract_match_id, result, match.match_agents as never);
  }

  private async resolveMatch(
    matchId: string,
    contractMatchId: number | null,
    result: MatchResult,
    matchAgents: Array<{ agent_id: string; agents: { wallet_address: string; registry_id: number | null } }>
  ): Promise<void> {
    const db = supabaseAdmin();
    const wallet = tryGetOrchestratorWallet();
    const onChain = Boolean(wallet && contractMatchId);

    // Find winner's on-chain registry ID
    const winnerAgent = matchAgents.find((ma) => ma.agent_id === result.winnerId);
    const winnerRegistryId = winnerAgent?.agents?.registry_id ?? 0;

    if (onChain) {
      await writeAndWait(wallet!, {
        address: MATCH_ESCROW_ADDRESS,
        abi: MATCH_ESCROW_ABI,
        functionName: "resolveMatch",
        args: [BigInt(contractMatchId!), BigInt(winnerRegistryId)],
      }, `resolveMatch(${contractMatchId}, winner=${winnerRegistryId})`);
    }

    await db.from("matches").update({
      state: "RESOLVED",
      winner_id: result.winnerId,
      resolved_at: new Date().toISOString(),
    }).eq("id", matchId);

    for (const [agentId, score] of Object.entries(result.finalScores)) {
      const won = agentId === result.winnerId;
      await db.from("match_agents").update({
        final_score: score,
        rank: won ? 1 : 2,
        earnings: won ? score : 0,
      }).eq("match_id", matchId).eq("agent_id", agentId);
    }

    // Settle the pot in the DB: compute every bettor's payout, the winning
    // owner's cut, and the platform cut. This is the source of truth when
    // the escrow contract isn't live, and mirrors it when it is.
    await this.settlePot(matchId, result.winnerId);

    // Update Supabase agent stats (wins/losses/lifetime earnings)
    for (const ma of matchAgents) {
      const won = ma.agent_id === result.winnerId;
      const { data: agentRow } = await db
        .from("agents")
        .select("wins, losses")
        .eq("id", ma.agent_id)
        .single();
      if (agentRow) {
        await db.from("agents").update({
          wins: agentRow.wins + (won ? 1 : 0),
          losses: agentRow.losses + (won ? 0 : 1),
        }).eq("id", ma.agent_id);
      }
    }

    // Update AgentRegistry on-chain stats (sequential — same nonce ordering rule)
    if (onChain) {
      for (const ma of matchAgents) {
        const regId = ma.agents?.registry_id;
        if (!regId) continue;
        const won = ma.agent_id === result.winnerId;
        const earnings = won ? BigInt(Math.round(Math.max(result.finalScores[ma.agent_id] ?? 0, 0) * 1e6)) : 0n;
        await writeAndWait(wallet!, {
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: "updateStats",
          args: [BigInt(regId), won, earnings],
        }, `updateStats(agent=${regId}, won=${won})`);
      }
    }
  }

  /**
   * Distribute the pot 70/20/10 across bets, winning owner, and platform.
   * Writes payout/profit onto each bet row and inserts `payouts` records
   * (with sim tx hashes when settlement is simulated) so the dashboard and
   * match result UI have real numbers.
   */
  private async settlePot(matchId: string, winnerId: string): Promise<void> {
    const db = supabaseAdmin();

    const { data: bets } = await db
      .from("bets")
      .select("id, user_address, agent_id, amount")
      .eq("match_id", matchId);

    const allBets = bets ?? [];
    const totalPot = allBets.reduce((s, b) => s + Number(b.amount), 0);
    const bettorPool = totalPot * BETTOR_SHARE;
    const ownerPayout = totalPot * AGENT_SHARE;
    const platformPayout = totalPot - bettorPool - ownerPayout;
    const totalOnWinner = allBets
      .filter((b) => b.agent_id === winnerId)
      .reduce((s, b) => s + Number(b.amount), 0);

    const payoutRows: Array<Record<string, unknown>> = [];

    for (const bet of allBets) {
      const won = bet.agent_id === winnerId;
      const payout = won && totalOnWinner > 0 ? (Number(bet.amount) / totalOnWinner) * bettorPool : 0;
      const profit = payout - Number(bet.amount);

      await db.from("bets").update({
        won,
        claimed: false,
        payout: Number(payout.toFixed(6)),
        profit: Number(profit.toFixed(6)),
      }).eq("id", bet.id);

      if (won && payout > 0) {
        payoutRows.push({
          match_id: matchId,
          recipient_address: bet.user_address,
          recipient_type: "BETTOR",
          amount: Number(payout.toFixed(6)),
          tx_hash: simTxHash(),
        });
      }
    }

    if (totalPot > 0) {
      const { data: winner } = await db
        .from("agents")
        .select("owner_address")
        .eq("id", winnerId)
        .single();

      if (winner?.owner_address) {
        payoutRows.push({
          match_id: matchId,
          recipient_address: winner.owner_address,
          recipient_type: "AGENT",
          amount: Number(ownerPayout.toFixed(6)),
          tx_hash: simTxHash(),
        });
      }

      payoutRows.push({
        match_id: matchId,
        recipient_address: process.env.PLATFORM_TREASURY_ADDRESS ?? "platform-treasury",
        recipient_type: "PLATFORM",
        amount: Number(platformPayout.toFixed(6)),
        tx_hash: simTxHash(),
      });
    }

    if (payoutRows.length > 0) {
      const { error } = await db.from("payouts").insert(payoutRows);
      if (error) console.warn("[settlePot] payout insert failed:", error.message);
    }
  }
}
