#!/usr/bin/env bash
set -euo pipefail

# Glade E2E mission - environment setup (idempotent)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Check prerequisites
check_prereq() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: $1 is required but not found on PATH"
    exit 1
  fi
}

check_prereq "bun"
check_prereq "Rscript"
check_prereq "npx"

# Verify R packages
echo "Checking R packages..."
Rscript -e '
pkgs <- c("bayesgrove", "cmdstanr")
missing <- pkgs[!sapply(pkgs, requireNamespace, quietly = TRUE)]
if (length(missing) > 0) {
  stop(paste("Missing R packages:", paste(missing, collapse = ", ")))
}
cat("All R packages available\n")
'

# Verify CmdStan
echo "Checking CmdStan..."
Rscript -e '
cmdstanr::cmdstan_path()
cat("CmdStan available\n")
'

# Install node dependencies if needed
if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "Installing node dependencies..."
  cd "$REPO_ROOT" && bun install
fi

# Check Playwright
echo "Checking Playwright..."
cd "$REPO_ROOT" && npx playwright --version

echo "Environment setup complete."
