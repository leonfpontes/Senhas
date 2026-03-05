#!/bin/bash

# T125: VPS Setup Script for Ubuntu 22.04 LTS
#
# Provisions production environment:
# 1. System dependencies
# 2. PostgreSQL 15 database
# 3. Docker & Docker Compose
# 4. Nginx reverse proxy
# 5. SSL certificates (Let's Encrypt)
# 6. GitHub Actions runner
# 7. Monitoring (Prometheus + Grafana)
# 8. Backups and maintenance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN="${DOMAIN:-senhas.example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
DB_USER="${DB_USER:-postgres}"
APP_USER="${APP_USER:-senhas}"
APP_GROUP="${APP_GROUP:-senhas}"
APP_HOME="/opt/senhas"
BACKUP_DIR="/backups/senhas"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Senhas VPS Setup - Ubuntu 22.04 LTS${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# ============================================
# 1. SYSTEM UPDATES & DEPENDENCIES
# ============================================

echo -e "${YELLOW}Step 1: System Updates & Prerequisites${NC}"

# Update package lists
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y \
  curl \
  wget \
  git \
  build-essential \
  libssl-dev \
  libffi-dev \
  python3-dev \
  python3-pip \
  python3-venv \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release \
  unzip \
  htop \
  net-tools \
  vim \
  nano \
  jq

# Create application user
if ! id "$APP_USER" &>/dev/null; then
  sudo useradd -r -s /bin/bash -d "$APP_HOME" "$APP_USER" || true
  sudo mkdir -p "$APP_HOME"
  sudo chown -R "$APP_USER:$APP_GROUP" "$APP_HOME"
fi

echo -e "${GREEN}✓ System updated${NC}"
echo

# ============================================
# 2. SSH KEY AUTHENTICATION
# ============================================

echo -e "${YELLOW}Step 2: SSH Security${NC}"

# Disable root login
sudo sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config

# Disable password authentication (use SSH keys)
sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config

# Enable public key authentication
sudo sed -i 's/^#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# Restart SSH
sudo systemctl restart sshd

echo -e "${GREEN}✓ SSH security hardened${NC}"
echo

# ============================================
# 3. POSTGRESQL INSTALLATION
# ============================================

echo -e "${YELLOW}Step 3: PostgreSQL 15 Installation${NC}"

# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Install PostgreSQL
sudo apt-get update
sudo apt-get install -y \
  postgresql-15 \
  postgresql-contrib-15 \
  postgresql-client-15

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
DB_PASSWORD=$(openssl rand -base64 32)
sudo -u postgres psql <<EOF
CREATE DATABASE senhas_prod;
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE senhas_prod TO $DB_USER;
ALTER ROLE $DB_USER WITH CREATEDB;
EOF

# Configure backups directory
sudo mkdir -p "$BACKUP_DIR"
sudo chown postgres:postgres "$BACKUP_DIR"
sudo chmod 755 "$BACKUP_DIR"

# Create backup script
sudo tee /usr/local/bin/backup-senhas-db.sh > /dev/null <<'EOF'
#!/bin/bash
BACKUP_DIR="/backups/senhas"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/senhas_prod_$TIMESTAMP.sql.gz"

sudo -u postgres pg_dump senhas_prod | gzip > "$BACKUP_FILE"
chown postgres:postgres "$BACKUP_FILE"

# Keep only 30 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
EOF

sudo chmod +x /usr/local/bin/backup-senhas-db.sh

# Add daily backup to crontab
echo "0 2 * * * /usr/local/bin/backup-senhas-db.sh >> /var/log/senhas-backup.log 2>&1" | sudo crontab -

# Store credentials
echo "Database credentials:"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo "✓ Store these safely!"

echo -e "${GREEN}✓ PostgreSQL 15 installed and configured${NC}"
echo

# ============================================
# 4. DOCKER & DOCKER COMPOSE
# ============================================

echo -e "${YELLOW}Step 4: Docker Installation${NC}"

# Add Docker repository
sudo apt-get install -y docker.io

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installations
echo "Docker version:"
docker --version
echo "Docker Compose version:"
docker-compose --version

echo -e "${GREEN}✓ Docker & Docker Compose installed${NC}"
echo

# ============================================
# 5. NGINX INSTALLATION & CONFIGURATION
# ============================================

echo -e "${YELLOW}Step 5: Nginx Reverse Proxy${NC}"

sudo apt-get install -y nginx

# Create Nginx configuration
sudo mkdir -p /etc/nginx/conf.d

sudo tee /etc/nginx/conf.d/senhas.conf > /dev/null <<EOF
upstream backend {
    server localhost:8000;
    keepalive 32;
}

upstream frontend {
    server localhost:3000;
    keepalive 32;
}

# Rate limiting
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=login_limit:10m rate=10r/m;

server {
    listen 80;
    server_name $DOMAIN;

    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL certificates (will be set up with Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" always;

    # Logging
    access_log /var/log/nginx/senhas_access.log;
    error_log /var/log/nginx/senhas_error.log;

    # Frontend routes
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # API routes
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # CORS headers (if needed)
        add_header 'Access-Control-Allow-Origin' '\$http_origin' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    }

    # Login rate limiting
    location /api/v1/auth/login {
        limit_req zone=login_limit burst=5 nodelay;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Health check endpoint
    location /nginx-health {
        return 200 "healthy\n";
    }
}
EOF

# Test Nginx configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo -e "${GREEN}✓ Nginx installed and configured${NC}"
echo

# ============================================
# 6. LET'S ENCRYPT SSL CERTIFICATES
# ============================================

echo -e "${YELLOW}Step 6: SSL Certificate Setup (Let's Encrypt)${NC}"

sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL"

# Setup auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test certificate renewal
sudo certbot renew --dry-run

echo -e "${GREEN}✓ SSL certificates installed (Let's Encrypt)${NC}"
echo

# ============================================
# 7. GITHUB ACTIONS RUNNER
# ============================================

echo -e "${YELLOW}Step 7: GitHub Actions Self-Hosted Runner${NC}"

cd "$APP_HOME"

# Create actions-runner directory
sudo mkdir -p actions-runner
sudo chown -R $APP_USER:$APP_GROUP actions-runner
cd actions-runner

# Download latest runner
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')
wget -q https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
tar xzf actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

# Create systemd service
sudo tee /etc/systemd/system/actions.runner@.service > /dev/null <<'EOF'
[Unit]
Description=GitHub Actions Runner %i
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=senhas
Group=senhas
WorkingDirectory=/opt/senhas/actions-runner
ExecStart=/opt/senhas/actions-runner/run.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "To complete GitHub Actions runner setup:"
echo "1. Go to GitHub repository Settings → Actions → Runners"
echo "2. Add new self-hosted runner (Linux)"
echo "3. Copy the configuration command"
echo "4. Run: cd $APP_HOME/actions-runner && ./config.sh"
echo "5. Enable and start: sudo systemctl enable actions.runner@1 && sudo systemctl start actions.runner@1"

echo -e "${GREEN}✓ GitHub Actions runner prepared${NC}"
echo

# ============================================
# 8. MONITORING SETUP
# ============================================

echo -e "${YELLOW}Step 8: Prometheus & Grafana${NC}"

sudo apt-get install -y prometheus grafana-server

# Configure Prometheus
sudo tee /etc/prometheus/prometheus.yml > /dev/null <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'senhas-backend'
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
  - job_name: 'nginx'
    static_configs:
      - targets: ['localhost:9113']
EOF

# Start services
sudo systemctl start prometheus
sudo systemctl start grafana-server
sudo systemctl enable prometheus
sudo systemctl enable grafana-server

echo "Grafana URL: https://$DOMAIN:3001"
echo "Default credentials: admin / admin"
echo "⚠️ Change password immediately!"

echo -e "${GREEN}✓ Prometheus & Grafana installed${NC}"
echo

# ============================================
# 9. FIREWALL CONFIGURATION
# ============================================

echo -e "${YELLOW}Step 9: UFW Firewall${NC}"

sudo apt-get install -y ufw

# Enable firewall
sudo ufw --force enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow monitoring (restricted)
sudo ufw allow from 127.0.0.1 to 127.0.0.1 port 9090
sudo ufw allow from 127.0.0.1 to 127.0.0.1 port 3001

echo -e "${GREEN}✓ Firewall configured${NC}"
echo

# ============================================
# 10. ENVIRONMENT CONFIGURATION
# ============================================

echo -e "${YELLOW}Step 10: Environment Setup${NC}"

# Create .env file for Docker Compose
sudo tee "$APP_HOME/.env" > /dev/null <<EOF
# Application
APP_VERSION=1.0.0
ENVIRONMENT=production
DEBUG=false

# Database
DB_NAME=senhas_prod
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

# Redis
REDIS_PASSWORD=$(openssl rand -base64 32)

# API
SECRET_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)

# Email
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@senhas.com
RESEND_API_KEY=your_resend_api_key
RESEND_SENDER_EMAIL=noreply@senhas.com

# CORS
CORS_ORIGINS=https://$DOMAIN

# SSL/Certbot
DOMAIN=$DOMAIN
CERTBOT_EMAIL=$ADMIN_EMAIL

# Grafana
GRAFANA_PASSWORD=$(openssl rand -base64 32)

# Registry
REGISTRY=docker.io
EOF

sudo chown $APP_USER:$APP_GROUP "$APP_HOME/.env"
sudo chmod 600 "$APP_HOME/.env"

echo "⚠️ Update .env file with actual API keys:"
cat "$APP_HOME/.env"

echo -e "${GREEN}✓ Environment configured${NC}"
echo

# ============================================
# 11. SYSTEMD SERVICE
# ============================================

echo -e "${YELLOW}Step 11: Systemd Service${NC}"

sudo tee /etc/systemd/system/senhas.service > /dev/null <<EOF
[Unit]
Description=Senhas Multi-Tenant API
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_HOME
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable senhas.service

echo -e "${GREEN}✓ Systemd service created${NC}"
echo

# ============================================
# 12. LOG ROTATION
# ============================================

echo -e "${YELLOW}Step 12: Log Rotation${NC}"

sudo tee /etc/logrotate.d/senhas > /dev/null <<EOF
/var/log/senhas-backup.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
}

/var/log/nginx/senhas_*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    sharedscripts
}
EOF

echo -e "${GREEN}✓ Log rotation configured${NC}"
echo

# ============================================
# FINAL SUMMARY
# ============================================

echo
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ VPS Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo
echo "NEXT STEPS:"
echo "1. Update $APP_HOME/.env with API keys"
echo "2. Clone repository:"
echo "   cd $APP_HOME && git clone <repo-url> ."
echo "3. Start services:"
echo "   sudo systemctl start senhas"
echo "4. Verify deployment:"
echo "   curl https://$DOMAIN/api/health"
echo "5. Access dashboard:"
echo "   https://$DOMAIN (frontend)"
echo "   https://$DOMAIN:3001 (Grafana)"
echo
echo "IMPORTANT:"
echo "- Save database credentials"
echo "- Update email API keys"
echo "- Configure GitHub Actions runner"
echo "- Monitor: https://$DOMAIN:3001"
echo
echo "SUPPORT:"
echo "- Logs: docker-compose logs -f"
echo "- Status: sudo systemctl status senhas"
echo "- Database backups: $BACKUP_DIR"
echo

