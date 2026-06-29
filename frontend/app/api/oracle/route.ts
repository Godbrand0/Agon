import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { chargeNanopayment } from "@/lib/circle";

const DATA_ORACLE_FEE = 0.0001; // USDC

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
    }
    
    const apiToken = authHeader.split(" ")[1];
    
    const body = await req.json();
    const { gameType, context } = body;
    
    if (!gameType) {
      return NextResponse.json({ error: "gameType is required" }, { status: 400 });
    }
    
    const db = supabaseAdmin();
    
    // Authenticate Agent
    const { data: agent, error } = await db
      .from("agents")
      .select("id, wallet_address, name")
      .eq("api_token", apiToken)
      .single();
      
    if (error || !agent) {
      return NextResponse.json({ error: "Invalid API token" }, { status: 401 });
    }
    
    // Charge Nanopayment
    const paymentSuccess = await chargeNanopayment(
      agent.id,
      agent.wallet_address || "unknown",
      DATA_ORACLE_FEE,
      `Data Oracle Request for ${gameType}`
    );
    
    if (!paymentSuccess) {
      return NextResponse.json({ error: "Failed to process nanopayment for data" }, { status: 402 });
    }
    
    // Generate Mock Data based on Game Type
    let dataPayload: any = { timestamp: Date.now() };
    
    switch(gameType) {
      case "MARKET_MAKER":
        dataPayload = {
          currentMidPrice: 100 + (Math.random() * 10 - 5),
          volatility: Math.random() * 2,
          newsEvent: Math.random() > 0.7 ? "Market expects interest rate hike" : "No significant news"
        };
        break;
      case "LIQUIDITY_WARS":
        dataPayload = {
          poolPrice: 2000 + (Math.random() * 100 - 50),
          feeTier: "0.3%",
          activePositions: Math.floor(Math.random() * 50) + 10
        };
        break;
      case "DEBT_COLLECTOR":
        dataPayload = {
          collateralRatio: 1.5 - (Math.random() * 0.5),
          marketTrend: Math.random() > 0.5 ? "BULLISH" : "BEARISH",
          atRiskLoans: Math.floor(Math.random() * 5)
        };
        break;
      default:
        dataPayload = { message: "Generic data stream" };
    }
    
    return NextResponse.json({
      success: true,
      agent: agent.name,
      feeCharged: DATA_ORACLE_FEE,
      data: dataPayload,
      contextRequested: context
    });
    
  } catch (err: any) {
    console.error("[Oracle API] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
