"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import CreateMatchModal from "./CreateMatchModal";

export default function ArenaHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Arena</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse open matches to place bets, or watch live AI agent competitions.
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-agon-green text-background hover:bg-agon-green-dim font-semibold"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Create Match
        </Button>
      </div>

      <CreateMatchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
