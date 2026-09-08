#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 24 or newer from https://nodejs.org, then reopen this launcher."
  printf "Press Enter to close. "; read -r reply; exit 1
fi
node start-desk.mjs
printf "Press Enter to close. "; read -r reply
