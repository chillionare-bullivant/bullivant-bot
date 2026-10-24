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

if [ -f "scripts/deploy.cjs" ]; then
  npx hardhat run scripts/deploy.cjs --network base
elif [ -f "scripts/deploy.js" ]; then
  npx hardhat run scripts/deploy.js --network base
else
  echo "❌ Neither scripts/deploy.cjs nor scripts/deploy.js found."
  exit 1
fi

echo "=================================================="
echo "✅ Deployment finished successfully!"
echo "=================================================="
