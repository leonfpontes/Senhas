# T127: Deployment Guide - Local to VPS

## Complete Step-by-Step Deployment Process

This guide covers deploying Senhas from development to production on Ubuntu 22.04 LTS VPS.

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Local Build & Testing](#local-build--testing)
3. [VPS Preparation](#vps-preparation)
4. [Database Migration](#database-migration)
5. [Application Deployment](#application-deployment)
6. [SSL/HTTPS Configuration](#sslhttps-configuration)
7. [Monitoring Setup](#monitoring-setup)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Rollback Procedure](#rollback-procedure)

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (backend, frontend, E2E)
- [ ] Code coverage > 80%
- [ ] No security vulnerabilities (trivy, npm audit, pip audit)
- [ ] All linting checks pass (black, ruff, eslint)
- [ ] Type checking passes (MyPy, TypeScript)

### Documentation
- [ ] API documentation updated
- [ ] Deployment guide reviewed
- [ ] Security audit completed
- [ ] Release notes prepared

### Infrastructure
- [ ] VPS provisioned (Ubuntu 22.04 LTS, 2+ CPU, 4+ GB RAM)
- [ ] Domain registered and DNS configured
- [ ] SSH keys generated and deployed
- [ ] Database backups tested

### Configuration
- [ ] Environment variables prepared (.env)
- [ ] API keys obtained (Brevo, Resend, etc.)
- [ ] SSL certificate strategy determined
- [ ] Monitoring setup planned

---

## Local Build & Testing

### 1. Build Docker Images Locally

```bash
# Backend
cd backend
docker build -t senhas-backend:1.0.0 .

# Frontend
cd frontend
docker build -t senhas-frontend:1.0.0 .
```

### 2. Run Full Stack Locally

```bash
# Start services with docker-compose
docker-compose up -d

# Verify all services are healthy
docker-compose ps

# Check logs
docker-compose logs -f

# Run smoke tests
bash e2e/smoke_tests.sh
```

### 3. Run E2E Tests

```bash
# Start Cypress tests against local environment
cd e2e
npm install
npx cypress run --spec "scenarios/complete_workflow.spec.ts"
```

### 4. Run Load Tests

```bash
# Install Locust
pip install locust

# Run load test against local
locust -f load_tests/locust_scenarios.py \
  --host=http://localhost:8000 \
  --users=50 \
  --spawn-rate=10 \
  --run-time=60s \
  --headless

# Check results
cat load_tests/results_requests.csv
```

---

## VPS Preparation

### 1. Run VPS Setup Script

```bash
# SSH into VPS
ssh -i your_ssh_key.pem ubuntu@your_vps_ip

# Download setup script
curl https://raw.githubusercontent.com/your-org/senhas/main/devops/vps_setup.sh \
  -o /tmp/vps_setup.sh

# Run setup script
bash /tmp/vps_setup.sh

# Script will:
# - Install system dependencies
# - Set up PostgreSQL 15
# - Install Docker & Docker Compose
# - Configure Nginx
# - Issue SSL certificates (Let's Encrypt)
# - Set up GitHub Actions runner
```

### 2. Configure DNS

```bash
# Add DNS records
# A record: senhas.example.com → VPS_IP
# CNAME: api.senhas.example.com → senhas.example.com
# CNAME: www.senhas.example.com → senhas.example.com

# Verify DNS resolution
nslookup senhas.example.com
```

### 3. Verify VPS Setup

```bash
# SSH back in
ssh -i your_ssh_key.pem ubuntu@your_vps_ip

# Check services
sudo systemctl status postgresql  # Should be running
sudo systemctl status docker      # Should be running
sudo systemctl status nginx       # Should be running

# Check Docker
docker --version
docker-compose --version

# Check certificate
sudo certbot certificates
ls -la /etc/letsencrypt/live/senhas.example.com/
```

---

## Database Migration

### 1. Create Database Backup

```bash
# Local backup before migration
cd backend
python -m pytest tests/ -v

# Production database initialization
```

### 2. Initialize Production Database

```bash
ssh -i your_ssh_key.pem ubuntu@your_vps_ip

cd /opt/senhas

# Create initial schema
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d senhas_prod -f /docker-entrypoint-initdb.d/init.sql

# Run Alembic migrations
docker-compose -f docker-compose.prod.yml run --rm backend \
  alembic upgrade head

# Verify schema
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d senhas_prod -c "\dt"
```

### 3. Seed Initial Data (Optional)

```bash
# Create initial tenants, users, etc.
docker-compose -f docker-compose.prod.yml run --rm backend \
  python -m scripts.seed_initial_data
```

---

## Application Deployment

### 1. Clone Repository to VPS

```bash
ssh -i your_ssh_key.pem ubuntu@your_vps_ip

# Clone repository
cd /opt/senhas
sudo -u senhas git clone https://github.com/your-org/senhas.git .
sudo -u senhas git checkout main
```

### 2. Configure Environment

```bash
# Update .env file with production values
sudo vim /opt/senhas/.env

# Required variables:
# BREVO_API_KEY=sk-br-...
# RESEND_API_KEY=re_...
# SECRET_KEY=... (must be secure random)
# JWT_SECRET=... (must be secure random)
# CORS_ORIGINS=https://senhas.example.com
# DOMAIN=senhas.example.com

# Verify permissions
sudo chown senhas:senhas /opt/senhas/.env
sudo chmod 600 /opt/senhas/.env
```

### 3. Pull Docker Images

```bash
# Login to Docker Hub
docker login

# Pull images
docker pull docker.io/your-org/senhas-backend:1.0.0
docker pull docker.io/your-org/senhas-frontend:1.0.0

# Or build on VPS
cd /opt/senhas
docker-compose -f docker-compose.prod.yml build
```

### 4. Start Services

```bash
# Start with systemd
sudo systemctl start senhas
sudo systemctl status senhas

# Or manually start
cd /opt/senhas
docker-compose -f docker-compose.prod.yml up -d

# Verify services
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

### 5. Verify Services Are Running

```bash
# Backend health check
curl -k https://senhas.example.com/api/v1/health

# Frontend
curl -k https://senhas.example.com/

# Nginx
sudo systemctl status nginx
sudo nginx -t

# PostgreSQL
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_isready -U postgres

# Redis
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli -a $REDIS_PASSWORD ping
```

---

## SSL/HTTPS Configuration

### 1. Verify Let's Encrypt Certificate

```bash
# Check certificate
sudo certbot certificates

# Should show:
# Certificate Name: senhas.example.com
# Expiry Date: 2024-06-05
```

### 2. Test SSL/TLS

```bash
# Test SSL configuration
curl -I https://senhas.example.com

# Check certificate validity
openssl s_client -connect senhas.example.com:443

# Test SSL rating
curl https://api.ssllabs.com/api/v3/analyze?host=senhas.example.com
```

### 3. Enable Auto-Renewal

```bash
# Check renewal timer
sudo systemctl status certbot.timer

# Test dry run
sudo certbot renew --dry-run

# Verify renewal configuration
sudo systemctl enable certbot.timer
```

---

## Monitoring Setup

### 1. Sentry (erros + traces)

Observabilidade de produção é feita via Sentry — backend (`sentry-sdk[fastapi]`) e
frontend (`@sentry/nextjs`), ativados quando `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
estão definidos no `.env`.

### 2. Configure Log Monitoring

```bash
# View live logs
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose logs -f backend

# Get logs from container
docker logs senhas-backend --tail 100
```

---

## Post-Deployment Verification

### 1. Smoke Tests

```bash
# Run automated smoke tests
bash /opt/senhas/e2e/smoke_tests.sh

# Manual verification
# Public page: https://senhas.example.com/public/demo/emitir
# Admin login: https://senhas.example.com/admin/login
```

### 2. API Testing

```bash
# Test public endpoint
curl -X GET https://senhas.example.com/api/v1/public/demo/next-gira

# Test admin endpoint (requires auth)
curl -X POST https://senhas.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@senhas.local","password":"..."}'

# Test health endpoint
curl https://senhas.example.com/api/v1/health
```

### 3. Database Verification

```bash
# Connect to database
psql -h senhas.example.com -U postgres -d senhas_prod

# Check tables
\dt

# Check record count
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM giras;
SELECT COUNT(*) FROM tickets;
```

### 4. Log Review

```bash
# Check application logs for errors
docker-compose -f docker-compose.prod.yml logs backend | grep ERROR

# Check access logs
tail -f /var/log/nginx/senhas_access.log

# Check SSL logs
tail -f /var/log/letsencrypt/letsencrypt.log
```

### 5. Performance Testing

```bash
# Run Lighthouse audit
npm install -g lighthouse
lighthouse https://senhas.example.com --output-path=reports/lighthouse.html

# Run load test
locust -f load_tests/locust_scenarios.py \
  --host=https://senhas.example.com \
  --users=100 \
  --spawn-rate=10 \
  --run-time=60s \
  --headless
```

---

## Backup & Recovery

### 1. Automated Backups

```bash
# Verify backup script is running
sudo crontab -l | grep backup

# Manual backup
/usr/local/bin/backup-senhas-db.sh

# Check backup files
ls -lh /backups/senhas/
```

### 2. Backup Verification

```bash
# Test restore from backup
sudo -u postgres pg_restore -d senhas_test /backups/senhas/latest_backup.sql.gz

# Verify data integrity
psql -d senhas_test -c "SELECT COUNT(*) FROM tickets;"
```

### 3. Off-site Backups

```bash
# Setup S3 or cloud storage
aws s3 cp /backups/senhas/ s3://my-backups/senhas/ --recursive

# Or use rsync to another server
rsync -avz /backups/senhas/ backup-server:/backups/senhas/
```

---

## Rollback Procedure

### 1. If Deployment Fails

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Restore previous version
git checkout previous-tag
docker-compose -f docker-compose.prod.yml pull

# Start previous version
docker-compose -f docker-compose.prod.yml up -d

# Verify
curl https://senhas.example.com/api/health
```

### 2. If Database Migration Fails

```bash
# Rollback migration
docker-compose -f docker-compose.prod.yml run --rm backend \
  alembic downgrade -1

# Or full database restore
sudo pg_restore -d senhas_prod /backups/senhas/senhas_prod_20260301_120000.sql.gz
```

### 3. Post-Rollback Verification

```bash
# Verify version
curl https://senhas.example.com/api/v1/health

# Check logs
docker-compose logs -f

# Notify stakeholders
# Send rollback notification
```

---

## Troubleshooting

### Common Issues & Solutions

#### Issue: Nginx 502 Bad Gateway
```bash
# Check backend status
docker-compose ps backend

# Check backend logs
docker-compose logs backend

# Restart backend
docker-compose restart backend
```

#### Issue: Database Connection Error
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check connection string in .env
grep DATABASE_URL /opt/senhas/.env

# Test connection
docker-compose exec postgres pg_isready
```

#### Issue: Email Not Sending
```bash
# Check Brevo API key
grep BREVO_API_KEY /opt/senhas/.env

# Check email logs
docker-compose logs backend | grep -i "email\|brevo\|resend"

# Test email service
curl -X POST https://senhas.example.com/api/v1/test-email \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### Issue: SSL Certificate Expired
```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal

# Restart Nginx
sudo systemctl restart nginx
```

---

## Maintenance Tasks

### Daily
- [ ] Check application logs for errors
- [ ] Monitor CPU/memory usage
- [ ] Verify database backups completed
- [ ] Check SSL certificate expiry

### Weekly
- [ ] Review security logs
- [ ] Update dependencies
- [ ] Performance review

### Monthly
- [ ] Security audit
- [ ] Performance analysis
- [ ] Database optimization
- [ ] Infrastructure review

---

## Support & Escalation

**For Deployment Issues:**
1. Check logs: `docker-compose logs -f`
2. Review error codes in API responses
3. Contact DevOps team: devops@example.com

**For Production Incidents:**
1. Declare incident in Slack #incidents
2. Follow runbook for issue type
3. Page on-call engineer: +1-555-0100
4. Post-mortem within 24 hours

---

**Last Updated**: 2026-03-05  
**Version**: 1.0.0  
**Deployment Guide Version**: 1.0

