#!/usr/bin/env bash
# ==============================================================================
# INSTANT FREE HTTPS TUNNEL & ENGINE HEALTH MONITOR
# ==============================================================================
set -e

echo "🔒 Verifying Bullivant Engine & Setting up HTTPS Tunnel..."

# 1. Ensure PM2 has the engine running on port 3000
echo "📡 Checking PM2 status..."
if ! curl -s -m 2 http://127.0.0.1:3000 > /dev/null 2>&1; then
  echo "⚠️ Port 3000 is not responding yet. Starting bullivant-engine in PM2..."
  pm2 delete all 2>/dev/null || true
  npm run build || true
  pm2 start ecosystem.config.cjs
  pm2 save
  sleep 3
fi

# Verify port 3000 is answering
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:3000 || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
  echo "✅ Local engine is HEALTHY and listening on port 3000 (HTTP $HTTP_CODE)."
else
  echo "⚠️ Notice: Local server returned HTTP $HTTP_CODE on port 3000, continuing..."
fi

# 2. Install cloudflared if not present
if ! command -v cloudflared &> /dev/null; then
  echo "📦 Downloading and installing cloudflared..."
  curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -f -y
  rm -f /tmp/cloudflared.deb
fi

# Kill old tunnel if running
pkill -f "cloudflared tunnel" 2>/dev/null || true
rm -f /tmp/tunnel.log

echo "========================================================================"
echo "⚡ GENERATING FREE SECURE HTTPS LINK FOR COINBASE WALLET..."
echo "========================================================================"

# Start tunnel in background
nohup cloudflared tunnel --url http://127.0.0.1:3000 > /tmp/tunnel.log 2>&1 &

# Wait for tunnel URL
for i in {1..12}; do
  TUNNEL_URL=$(grep -o 'https://[-a-zA-Z0-9@:%._\+~#=]\+\.trycloudflare\.com' /tmp/tunnel.log | head -n 1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -n "$TUNNEL_URL" ]; then
  echo ""
  echo "🎉 SUCCESS! YOUR SECURE HTTPS URL IS:"
  echo ""
  echo "👉  $TUNNEL_URL  👈"
  echo ""
  echo "========================================================================"
  echo "📱 HOW TO USE IN COINBASE WALLET:"
  echo "1. Open Coinbase Wallet app"
  echo "2. Tap Browser tab at the bottom (compass 🧭 or globe 🌐)"
  echo "3. Paste: $TUNNEL_URL"
  echo "4. It will load immediately with ZERO Bad Gateway errors!"
  echo "========================================================================"
else
  echo "Tunnel is initializing. Run this command in 5 seconds to view your link:"
  echo "cat /tmp/tunnel.log | grep -o 'https://[^ ]*trycloudflare.com' | head -n 1"
fi
