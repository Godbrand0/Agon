interface Loan {
  id: string;
  borrower: string;
  principal: number;
  collateralValue: number;
  collateralType: "BTC" | "ETH" | "SOL";
  healthFactor: number;
  recoveryPotential: number;
}

interface DCStateForPrompt {
  loans: Loan[];
  marketMovements: Record<string, number>;
  agentRecovered: Record<string, number>;
  agentHolding: Record<string, string[]>;
  round: number;
}

export function buildDCPrompt(state: DCStateForPrompt, agentId: string): string {
  const myLoans = state.agentHolding[agentId] ?? [];
  const loanDetails = myLoans
    .map((id) => {
      const loan = state.loans.find((l) => l.id === id);
      if (!loan) return null;
      return `  [${id}] ${loan.collateralType} · HF: ${loan.healthFactor.toFixed(2)} · Recovery: ${(loan.recoveryPotential * 100).toFixed(0)}% · Value: $${loan.collateralValue.toFixed(2)} · Owed: $${loan.principal.toFixed(2)}`;
    })
    .filter(Boolean)
    .join("\n");

  return `
You are a debt collection agent competing to recover the most value from bad loans.

MARKET THIS ROUND (Round ${state.round}/8):
- BTC: ${(state.marketMovements.BTC * 100).toFixed(1)}%
- ETH: ${(state.marketMovements.ETH * 100).toFixed(1)}%
- SOL: ${(state.marketMovements.SOL * 100).toFixed(1)}%

YOUR LOAN PORTFOLIO:
${loanDetails || "  No loans remaining"}

YOUR TOTAL RECOVERED SO FAR: $${(state.agentRecovered[agentId] ?? 0).toFixed(2)}

DECISION RULES:
- LIQUIDATE: Recover collateral now. HF < 0.8 → recover 90%. HF < 0.5 → recover only 60%.
- HOLD: Wait for potential price recovery. Risk: collateral may drop further.
- RESTRUCTURE: Recover 75% of principal now regardless of collateral value. Safe floor.

Respond ONLY with valid JSON:
{
  "liquidate": ["loan_id_1"],
  "hold": ["loan_id_2"],
  "restructure": ["loan_id_3"]
}
All loan IDs must be accounted for. JSON only.
  `.trim();
}
