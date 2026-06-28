#!/usr/bin/env bash
# run-all.sh — Starts all 4 demo agents + the matchmaker in background

set -e

LOG_DIR="logs"
mkdir -p "$LOG_DIR"

echo "🚀 Starting Agon demo agents + matchmaker..."
echo ""

start_agent() {
  local name="$1"
  local script="$2"
  npx tsx "$script" >> "$LOG_DIR/${name}.log" 2>&1 &
  echo "  ✅ ${name} started (PID $!), logging → $LOG_DIR/${name}.log"
}

# Start all 4 agents
start_agent "alpha"       "runners/market-maker/alpha.ts"
start_agent "beta"        "runners/market-maker/beta.ts"
start_agent "gamma"       "runners/liquidity-wars/gamma.ts"
start_agent "delta"       "runners/liquidity-wars/delta.ts"

echo ""

# Give agents 3s to mark themselves READY before matchmaker runs
sleep 3

# Start the matchmaker loop
start_agent "matchmaker"  "matchmaker.ts"

echo ""
echo "All processes running. Tail logs with:"
echo "  tail -f logs/alpha.log logs/beta.log logs/gamma.log logs/delta.log logs/matchmaker.log"
echo ""
echo "Press Ctrl+C to stop all."

# Wait for all background jobs
wait
