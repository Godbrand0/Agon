import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { MatchOrchestrator } from "@/server/orchestrator";

// Internal endpoint — should be protected by secret header in production
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const secret = req.headers.get("x-orchestrator-secret");
  if (secret !== process.env.ORCHESTRATOR_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const db = supabaseAdmin();

  const { data: match } = await db.from("matches").select("state").eq("id", matchId).single();
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (match.state !== "PLAYING") {
    return NextResponse.json({ error: "Match not in PLAYING state" }, { status: 400 });
  }

  // Run in background; respond immediately
  setImmediate(async () => {
    try {
      const orch = new MatchOrchestrator();
      await orch.runMatch(matchId);
    } catch (e) {
      console.error("Manual resolve error:", e);
    }
  });

  return NextResponse.json({ status: "resolving", matchId });
}
