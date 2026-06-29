import { getGameEngine } from "../games";
import type { GameType, MatchResult } from "../games/types";
import { runAgentTurn, AGENT_SYSTEM_PROMPT } from "../agents/runtime";
import { supabaseAdmin } from "../lib/supabase";
import { chargeNanopayment } from "../lib/circle";
import { sleep } from "../lib/utils";
import {
  getOrchestratorWallet,
  MATCH_ESCROW_ABI,
  MATCH_ESCROW_ADDRESS,
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
} from "../lib/contracts";

const ROUND_DELAY_MS = 4000; // pause between rounds for UI drama
const MAX_ROUNDS = 3;        // best of 3

export class MatchOrchestrator {
  async runMatch(matchId: string): Promise<void> {
    const db = supabaseAdmin();

    const { data: match, error } = await db
      .from("matches")
      .select("*, match_agents(agent_id, agents(wallet_address, registry_id))")
      .eq("id", matchId)
      .single();

    if (error || !match) throw new Error(`Match ${matchId} not found`);

    if (match.agent_ids.length !== 2) throw new Error("Matches must have exactly 2 agents");

    const agentIds: string[] = match.agent_ids;
    const engine = getGameEngine(match.game_type as GameType);
    engine.initialize(agentIds);

    const wallet = getOrchestratorWallet();
    
    // Charge match entry fees
    for (const matchAgent of match.match_agents) {
      const agentId = matchAgent.agent_id;
      const walletAddress = matchAgent.agents?.wallet_address;
      if (walletAddress) {
        await chargeNanopayment(agentId, walletAddress, 0.50, `Match Entry Fee for match ${matchId}`);
      }
    }

    // Close betting on-chain
    try {
      await wallet.writeContract({
        address: MATCH_ESCROW_ADDRESS,
        abi: MATCH_ESCROW_ABI,
        functionName: "closeBetting",
        args: [BigInt(match.contract_match_id!)],
      });
    } catch (e) {
      console.error("closeBetting failed (continuing):", e);
    }

    await db.from("matches").update({ state: "BETTING_CLOSED" }).eq("id", matchId);

    try {
      await wallet.writeContract({
        address: MATCH_ESCROW_ADDRESS,
        abi: MATCH_ESCROW_ABI,
        functionName: "startMatch",
        args: [BigInt(match.contract_match_id!)],
      });
    } catch (e) {
      console.error("startMatch failed (continuing):", e);
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
          const prompt = engine.getAgentPrompt(agentId, round);
          const action = await runAgentTurn(agentId, prompt, AGENT_SYSTEM_PROMPT);
          return { agentId, action };
        })
      );

      for (const result of actionResults) {
        if (result.status === "fulfilled") {
          const { agentId, action } = result.value;
          
          // Charge action execution fee
          const walletAddress = match.match_agents.find((ma: any) => ma.agent_id === agentId)?.agents?.wallet_address;
          if (walletAddress) {
            await chargeNanopayment(agentId, walletAddress, 0.0005, `Action Execution Fee for round ${round}`);
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
    await this.resolveMatch(matchId, match.contract_match_id!, result, match.match_agents as never);
  }

  private async resolveMatch(
    matchId: string,
    contractMatchId: number,
    result: MatchResult,
    matchAgents: Array<{ agent_id: string; agents: { wallet_address: string; registry_id: number | null } }>
  ): Promise<void> {
    const db = supabaseAdmin();
    const wallet = getOrchestratorWallet();

    // Find winner's on-chain registry ID
    const winnerAgent = matchAgents.find((ma) => ma.agent_id === result.winnerId);
    const winnerRegistryId = winnerAgent?.agents?.registry_id ?? 0;

    try {
      await wallet.writeContract({
        address: MATCH_ESCROW_ADDRESS,
        abi: MATCH_ESCROW_ABI,
        functionName: "resolveMatch",
        args: [BigInt(contractMatchId), BigInt(winnerRegistryId)],
      });
    } catch (e) {
      console.error("resolveMatch contract call failed (continuing):", e);
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

    // Mark winning bets as won + unclaimed (users must claim manually)
    await db.from("bets")
      .update({ won: true, claimed: false })
      .eq("match_id", matchId)
      .eq("agent_id", result.winnerId);

    await db.from("bets")
      .update({ won: false, claimed: false })
      .eq("match_id", matchId)
      .neq("agent_id", result.winnerId);

    // Update AgentRegistry on-chain stats
    for (const ma of matchAgents) {
      const regId = ma.agents?.registry_id;
      if (!regId) continue;
      const won = ma.agent_id === result.winnerId;
      const earnings = won ? BigInt(Math.round((result.finalScores[ma.agent_id] ?? 0) * 1e6)) : 0n;
      try {
        await wallet.writeContract({
          address: AGENT_REGISTRY_ADDRESS,
          abi: AGENT_REGISTRY_ABI,
          functionName: "updateStats",
          args: [BigInt(regId), won, earnings],
        });
      } catch (e) {
        console.error("updateStats failed for", ma.agent_id, e);
      }
    }
  }
}
