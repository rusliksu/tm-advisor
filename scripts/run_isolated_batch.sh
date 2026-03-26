#!/bin/bash
# Run smartbot batch test on ISOLATED test server (port 8082)
# Usage: bash run_isolated_batch.sh [num_games] [log_suffix]
set -e

GAMES=${1:-15}
SUFFIX=${2:-baseline}
TEST_DIR=/home/openclaw/tm-test
LOG=/tmp/batch_${SUFFIX}.log

echo "=== Isolated batch test: $GAMES games, log: $LOG ==="

# Kill any existing test server/bot
fuser -k 8082/tcp 2>/dev/null || true
pkill -f "tm-test.*smartbot" 2>/dev/null || true
sleep 2

# Clean test DB
rm -rf $TEST_DIR/db/*

# Start test server
cd $TEST_DIR
PORT=8082 node build/src/server/server.js &
SERVER_PID=$!
echo "Test server PID: $SERVER_PID"
sleep 5

# Verify test server
if ! curl -s http://localhost:8082/ > /dev/null; then
    echo "ERROR: Test server failed to start"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi
echo "Test server OK on port 8082"

# Verify prod server untouched
if curl -s http://localhost:8081/ > /dev/null 2>&1; then
    echo "Prod server OK on port 8081"
else
    echo "WARNING: Prod server not responding on 8081"
fi

# Run batch
cd $TEST_DIR/bot
echo "Starting batch of $GAMES games..."
node smartbot.js batch $GAMES 2>&1 | tee $LOG

echo ""
echo "=== DONE. Results in $LOG ==="

# Cleanup: kill test server
kill $SERVER_PID 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true
echo "Test server stopped"
