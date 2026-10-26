#!/usr/bin/env bash
set -e

echo "=================================================="
echo "🚀 Compiling and Deploying to Base Mainnet..."
echo "=================================================="

# Check if .env exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    touch .env
  fi
fi

# Check if PRIVATE_KEY is still placeholder
if grep -q "0xYourActualRealPrivateKeyHere" .env 2>/dev/null || ! grep -q "PRIVATE_KEY" .env 2>/dev/null; then
  echo ""
  echo "⚠️ Notice: Your .env does not have a real private key yet."
  echo "💡 You can derive your private key directly from your 12 or 24-word Coinbase Wallet recovery phrase."
  echo ""
  read -p "Would you like to derive your private key now? (y/n) > " derive_choice
  if [ "$derive_choice" = "y" ] || [ "$derive_choice" = "Y" ] || [ "$derive_choice" = "yes" ]; then
    node derive.cjs
  else
    echo "You can run 'node derive.cjs' anytime or edit .env manually with 'nano .env'."
    exit 1
  fi
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
