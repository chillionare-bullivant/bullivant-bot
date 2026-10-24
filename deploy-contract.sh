#!/usr/bin/env bash
set -e

echo "=================================================="
echo "🚀 Compiling and Deploying to Base Mainnet..."
echo "=================================================="

# Check if PRIVATE_KEY is set in .env
if ! grep -q "PRIVATE_KEY" .env 2>/dev/null; then
  echo "⚠️ Error: PRIVATE_KEY not found in .env."
  echo "Please edit your .env file and set your private key with your $6 ETH:"
  echo "nano .env"
  exit 1
fi

npx hardhat compile
npx hardhat run scripts/deploy.js --network base

echo "=================================================="
echo "✅ Deployment finished!"
echo "=================================================="
