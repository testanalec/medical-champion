#!/bin/bash
for p in $(pgrep -f "node scripts/dev-server"); do kill $p 2>/dev/null; done
sleep 0.5
nohup node scripts/dev-server.mjs > /tmp/claude-0/-home-claude/c5a311ec-ddc9-59e0-b40b-45d2c22051be/scratchpad/dev.log 2>&1 &
sleep 1.5
curl -s localhost:3000/api/v1/health > /dev/null && echo "server up"
