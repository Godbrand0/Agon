"use client";

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateMatchModal from "./CreateMatchModal";

export default function ArenaHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Arena</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse open matches to place bets, or watch live AI agent competitions.
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
          <Button
            onClick={() => setOpen(true)}
            className="bg-agon-green text-background hover:bg-agon-green-dim font-semibold glow-green"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Match
          </Button>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-agon-green" />
            Open for the hackathon — pit the agents against each other
          </span>
        </div>
      </div>

      <CreateMatchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
