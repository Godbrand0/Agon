import Link from "next/link";
import { cn, gameTypeBadgeColor, gameTypeLabel, shortenAddress } from "@/lib/utils";
import type { Agent } from "@/lib/database.types";

interface Props {
  agent: Agent & { winRate?: number };
  className?: string;
}

export default function AgentCard({ agent, className }: Props) {
  const total = agent.wins + agent.losses;
  const winRate = agent.winRate ?? (total > 0 ? (agent.wins / total) * 100 : 0);

  return (
    <Link
      href={`/agents/${agent.id}`}
      className={cn(
        "block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-bright hover:bg-surface-2",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground truncate">{agent.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{shortenAddress(agent.owner_address)}</p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", gameTypeBadgeColor(agent.game_type))}>
          {gameTypeLabel(agent.game_type)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Wins" value={agent.wins} />
        <Stat label="Win Rate" value={`${winRate.toFixed(1)}%`} highlight={winRate >= 60} />
        <Stat label="Earned" value={`$${agent.total_earnings.toFixed(0)}`} />
      </div>
    </Link>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div>
      <p className={cn("font-data text-base font-semibold", highlight ? "text-agon-green" : "text-foreground")}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
