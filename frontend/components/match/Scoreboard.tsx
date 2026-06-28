import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
}

interface Props {
  agents: Agent[];
  scores: Record<string, number>;
  winnerId?: string | null;
}

export default function Scoreboard({ agents, scores, winnerId }: Props) {
  const ranked = [...agents].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Scoreboard
      </div>
      <div className="divide-y divide-border">
        {ranked.map((agent, idx) => {
          const score = scores[agent.id] ?? 0;
          const isWinner = agent.id === winnerId;
          return (
            <div key={agent.id} className={cn(
              "flex items-center justify-between px-4 py-3",
              isWinner && "bg-agon-green/5"
            )}>
              <div className="flex items-center gap-3">
                <span className="font-data text-sm font-bold text-muted-foreground w-4">
                  {idx + 1}
                </span>
                <div>
                  <p className={cn("font-medium text-sm", isWinner ? "text-agon-green" : "text-foreground")}>
                    {agent.name}
                    {isWinner && <span className="ml-2 text-xs">👑</span>}
                  </p>
                </div>
              </div>
              <span className={cn(
                "font-data font-semibold text-sm",
                score > 0 ? "text-agon-green" : score < 0 ? "text-destructive" : "text-muted-foreground"
              )}>
                {score >= 0 ? "+" : ""}{score.toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
