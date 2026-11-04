#!/usr/bin/env bash
# ==============================================================================
# UPGRADE SOLANA / AGAVE CLI TO MODERN STABLE (RUST EDITION 2024 READY)
# ==============================================================================
set -e

echo "=================================================="
echo "⚡ UPGRADING SOLANA CLI TO STABLE (AGAVE 2.x)"
echo "=================================================="

# Install stable Agave/Solana CLI with modern SBF compiler
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install || curl -sSfL https://release.solana.com/stable/install)"

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

echo "--------------------------------------------------"
echo "✓ Updated Solana CLI: $(solana --version)"
echo "✅ Modern Rust compiler active with native Edition 2024 support!"
echo "=================================================="
