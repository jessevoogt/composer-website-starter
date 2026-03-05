#!/bin/zsh
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo
echo "Composer Website Starter quickstart"
echo "This will install dependencies and launch the setup wizard."
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js 22+ and npm 10+, then try again."
  echo
  printf "Press Enter to close..."
  read -r _
  exit 1
fi

npm run quickstart
exit_code=$?

if [ "$exit_code" -ne 0 ]; then
  echo
  echo "Quickstart exited with code $exit_code."
  printf "Press Enter to close..."
  read -r _
fi

exit "$exit_code"
