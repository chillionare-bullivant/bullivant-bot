#!/usr/bin/env bash
# ==============================================================================
# INSTANT FREE HTTPS TUNNEL FOR COINBASE WALLET & WEB3 BROWSERS
# ==============================================================================
set -e

echo "🔒 Setting up instant HTTPS tunnel for Coinbase Wallet..."

if ! command -v cloudflared &> /dev/null; then
  echo "📦 Downloading and installing cloudflared..."
  curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y
  rm -f /tmp/cloudflared.deb
fi

echo "========================================================================"
echo "⚡ GENERATING FREE SECURE HTTPS LINK FOR YOUR BOT..."
echo "========================================================================"

# Start tunnel in background or foreground
nohup cloudflared tunnel --url http://127.0.0.1:3000 > /tmp/tunnel.log 2>&1 &
TUNNEL_PID=$!

sleep 4

TUNNEL_URL=$(grep -o 'https://[-a-zA-Z0-9@:%._\+~#=]\+\.trycloudflare\.com' /tmp/tunnel.log | head -n 1 || true)

if [ -n "$TUNNEL_URL" ]; then
  echo ""
  echo "🎉 SUCCESS! YOUR SECURE HTTPS URL IS:"
  echo ""
  echo "👉  $TUNNEL_URL  👈"
  echo ""
  echo "========================================================================"
  echo "📱 HOW TO USE IN COINBASE WALLET:"
  echo "1. Open Coinbase Wallet on your phone"
  echo "2. Tap the 'Browser' tab at the bottom"
  echo "3. Paste: $TUNNEL_URL"
  echo "4. It will load instantly over HTTPS without any cleartext errors!"
  echo "========================================================================"
else
  echo "Tunnel started. Check live URL with:"
  echo "cat /tmp/tunnel.log | grep trycloudflare"
fi
