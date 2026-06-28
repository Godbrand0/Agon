import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function timeUntil(deadline: string | Date): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function gameTypeBadgeColor(gameType: string): string {
  switch (gameType) {
    case "MARKET_MAKER":   return "text-blue-400 bg-blue-400/10 border-blue-400/20";
    case "LIQUIDITY_WARS": return "text-purple-400 bg-purple-400/10 border-purple-400/20";
    case "DEBT_COLLECTOR": return "text-amber-400 bg-amber-400/10 border-amber-400/20";
    default:               return "text-muted-foreground bg-muted";
  }
}

export function gameTypeLabel(gameType: string): string {
  switch (gameType) {
    case "MARKET_MAKER":   return "Market Maker";
    case "LIQUIDITY_WARS": return "Liquidity Wars";
    case "DEBT_COLLECTOR": return "Debt Collector";
    default:               return gameType;
  }
}

export function formatUSDC(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
