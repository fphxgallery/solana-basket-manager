#!/usr/bin/env bash
set -e

# ── Basket Manager Install Script ─────────────────────────────────────────────
# Usage: bash install.sh
# Installs basket-manager as a systemd service on Linux.
# Run from the directory containing this script.

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$INSTALL_DIR/basket-manager.service"
SERVICE_DEST="/etc/systemd/system/basket-manager.service"
USER="$(whoami)"
NODE_BIN="$(command -v node 2>/dev/null || true)"

echo "==> Arb Agent Installer"
echo "    Install dir : $INSTALL_DIR"
echo "    Running as  : $USER"
echo ""

# ── Node.js check ─────────────────────────────────────────────────────────────
if [ -z "$NODE_BIN" ]; then
  echo "==> Node.js not found. Installing via nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  NODE_BIN="$(command -v node)"
  echo "    Node        : $NODE_BIN ($(node --version))"
else
  echo "    Node        : $NODE_BIN ($(node --version))"
fi

# ── .env check ────────────────────────────────────────────────────────────────
if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo ""
  echo "==> No .env file found. Creating one now."
  echo "    You'll need your API keys handy."
  echo ""
  read -rp "    HELIUS_API_KEY: " helius_key
  read -rp "    JUPITER_API_KEY (leave blank if none): " jupiter_key
  api_token="$(openssl rand -hex 32)"
  cat > "$INSTALL_DIR/.env" <<EOF
HELIUS_API_KEY=$helius_key
JUPITER_API_KEY=$jupiter_key
API_TOKEN=$api_token
PORT=3420
EOF
  echo "    .env created."
  echo ""
  echo "    Dashboard sign-in token (save this):"
  echo "    $api_token"
fi

# Upgrade path: existing .env without API_TOKEN (added in v1.1.0)
if ! grep -q "^API_TOKEN=" "$INSTALL_DIR/.env"; then
  api_token="$(openssl rand -hex 32)"
  printf '\n# Web UI / API auth token (added by installer)\nAPI_TOKEN=%s\n' "$api_token" >> "$INSTALL_DIR/.env"
  echo ""
  echo "==> Generated API_TOKEN and added it to .env."
  echo "    Dashboard sign-in token (save this):"
  echo "    $api_token"
fi

# ── Install dependencies ───────────────────────────────────────────────────────
echo ""
echo "==> Installing server dependencies..."
cd "$INSTALL_DIR"
npm install

echo ""
echo "==> Installing client dependencies..."
cd "$INSTALL_DIR/client"
npm install
cd "$INSTALL_DIR"

# ── Build ─────────────────────────────────────────────────────────────────────
echo ""
echo "==> Building server..."
npm run build:server

echo ""
echo "==> Building client..."
npm run build:client

# ── Systemd service ───────────────────────────────────────────────────────────
echo ""
echo "==> Configuring systemd service..."

# Remove the old arb-agent unit (renamed to basket-manager in v2.0.0) so two
# units don't run the same bot against the same wallet.
if [ -f /etc/systemd/system/arb-agent.service ]; then
  echo "    Removing old arb-agent.service unit..."
  sudo systemctl disable --now arb-agent 2>/dev/null || true
  sudo rm -f /etc/systemd/system/arb-agent.service
  sudo systemctl daemon-reload
fi

# Patch service file with real paths and user
sed \
  -e "s|User=.*|User=$USER|" \
  -e "s|WorkingDirectory=.*|WorkingDirectory=$INSTALL_DIR|" \
  -e "s|EnvironmentFile=.*|EnvironmentFile=$INSTALL_DIR/.env|" \
  -e "s|ExecStart=.*|ExecStart=$NODE_BIN $INSTALL_DIR/dist/index.js|" \
  -e "s|ReadWritePaths=.*|ReadWritePaths=$INSTALL_DIR|" \
  "$SERVICE_FILE" > /tmp/basket-manager.service

sudo cp /tmp/basket-manager.service "$SERVICE_DEST"
sudo systemctl daemon-reload
sudo systemctl enable basket-manager
sudo systemctl restart basket-manager

echo ""
echo "==> Done!"
echo ""
echo "    Status : sudo systemctl status basket-manager"
echo "    Logs   : journalctl -u basket-manager -f"
echo "    URL    : http://$(hostname -I | awk '{print $1}'):$(grep PORT "$INSTALL_DIR/.env" | cut -d= -f2 || echo 3420)"
