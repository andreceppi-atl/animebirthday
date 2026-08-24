#!/bin/zsh
# Wrapper so LaunchAgent finds nvm node + .env.local
set -euo pipefail
cd /Users/lilwall-e/animebirthday
export NVM_DIR="$HOME/.nvm"
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
exec node scripts/send-briefing-imessage.mjs "$@"
