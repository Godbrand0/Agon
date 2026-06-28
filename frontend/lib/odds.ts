/** 70% of the total pot goes to winning bettors */
const BETTOR_SHARE = 0.7;

export function calculateImpliedOdds(totalPot: number, totalBetsOnAgent: number): number {
  if (totalBetsOnAgent === 0) return 0;
  return (totalPot * BETTOR_SHARE) / totalBetsOnAgent;
}

export function calculateExpectedPayout(myBet: number, totalBetsOnAgent: number, totalPot: number): number {
  if (totalBetsOnAgent === 0) return 0;
  return (myBet / totalBetsOnAgent) * (totalPot * BETTOR_SHARE);
}

export function calculateExpectedProfit(myBet: number, totalBetsOnAgent: number, totalPot: number): number {
  return calculateExpectedPayout(myBet, totalBetsOnAgent, totalPot) - myBet;
}

export function formatOdds(odds: number): string {
  return `${odds.toFixed(2)}x`;
}

export function formatUSDC(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
