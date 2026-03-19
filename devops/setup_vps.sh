#!/bin/bash
# ============================================================
# VPS Bootstrap — Run ONCE on the Hostinger VPS as root
# Usage: bash setup_vps.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/senhas"
REPO_URL="https://github.com/leonfpontes/Senhas.git"
BRANCH="master"

echo "============================================"
echo " Senhas VPS Bootstrap"
echo "============================================"

# --------------------------------------------------
# 1. System packages
# --------------------------------------------------
echo "[1/7] Installing system packages..."
apt-get update -qq
apt-get install -y -qq git curl ufw > /dev/null

# --------------------------------------------------
# 2. Firewall (UFW)
# --------------------------------------------------
echo "[2/7] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable
ufw status

# --------------------------------------------------
# 3. Docker (skip if already installed)
# --------------------------------------------------
if ! command -v docker &> /dev/null; then
    echo "[3/7] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
else
    echo "[3/7] Docker already installed: $(docker --version)"
fi

# Ensure docker compose plugin is available
if ! docker compose version &> /dev/null; then
    echo "  Installing docker-compose-plugin..."
    apt-get install -y -qq docker-compose-plugin > /dev/null
fi

# --------------------------------------------------
# 4. Clone / update repository
# --------------------------------------------------
echo "[4/7] Setting up application directory..."
if [ -d "$APP_DIR/.git" ]; then
    echo "  Repository exists, pulling latest..."
    cd "$APP_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
else
    echo "  Cloning repository..."
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# --------------------------------------------------
# 5. Create .env from template (if not present)
# --------------------------------------------------
echo "[5/7] Checking .env file..."
if [ ! -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env.prod.example" "$APP_DIR/.env"
    echo ""
    echo "  ╔═══════════════════════════════════════════════════╗"
    echo "  ║  IMPORTANTE: Edite /opt/senhas/.env com valores   ║"
    echo "  ║  reais ANTES de subir os containers.              ║"
    echo "  ║                                                   ║"
    echo "  ║  nano /opt/senhas/.env                            ║"
    echo "  ╚═══════════════════════════════════════════════════╝"
    echo ""
else
    echo "  .env already exists, keeping current values."
fi

# --------------------------------------------------
# 6. Create required directories
# --------------------------------------------------
echo "[6/7] Creating directories..."
mkdir -p "$APP_DIR/certs"
mkdir -p "$APP_DIR/nginx/logs"

# --------------------------------------------------
# 7. Summary
# --------------------------------------------------
echo "[7/7] Bootstrap complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit .env:          nano $APP_DIR/.env"
echo "  2. Add SSL certs:      Place fullchain.pem + privkey.pem in $APP_DIR/certs/"
echo "     Or use certbot:     certbot certonly --standalone -d YOUR_DOMAIN -d api.YOUR_DOMAIN"
echo "                         cp /etc/letsencrypt/live/YOUR_DOMAIN/*.pem $APP_DIR/certs/"
echo "  3. Start services:     cd $APP_DIR && docker compose -f docker-compose.prod.yml up -d --build"
echo "  4. Check health:       curl http://localhost:8000/health"
echo ""
