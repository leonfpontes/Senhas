# Guia de Deploy

Deploy do Senhas em servidor VPS com Ubuntu 22.04 LTS.

---

## Pré-requisitos

### Servidor
- Ubuntu 22.04 LTS
- 2+ CPU cores
- 4+ GB RAM
- 40+ GB SSD
- IP público com DNS configurado

### Serviços Externos
- **Brevo** account com API key (email primário)
- **Resend** account com API key (email fallback)
- Domínio com DNS apontando para o VPS

### Checklist pré-deploy
- [ ] Todos os testes passando (`pytest`, `npm test`, `cypress`)
- [ ] Sem vulnerabilidades (`npm audit --audit-level=high`, `pip-audit`)
- [ ] `.env` de produção preparado (incluindo `SENTRY_DSN` e `REDIS_URL`)
- [ ] Backup do banco (feito automaticamente pelo workflow — verificar `/opt/senhas/backups/`)
- [ ] DNS configurado (A record → IP do VPS)

---

## 1. Setup do VPS

### Automatizado

```bash
ssh ubuntu@seu-vps-ip
curl -O https://raw.githubusercontent.com/leonfpontes/Senhas/main/devops/vps_setup.sh
bash vps_setup.sh
```

O script instala:
- Docker & Docker Compose
- PostgreSQL 15
- Nginx
- Certbot (Let's Encrypt SSL)
- UFW (firewall)
- Prometheus + Grafana

### Manual (se necessário)

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose
sudo apt install docker-compose-plugin -y

# Nginx
sudo apt install nginx -y
sudo systemctl enable nginx

# Certbot
sudo apt install certbot python3-certbot-nginx -y

# Firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 2. Configurar DNS

Adicionar registros DNS:

```
A     senhas.seudominio.com     →  IP_DO_VPS
A     api.senhas.seudominio.com →  IP_DO_VPS
```

Verificar propagação:

```bash
nslookup senhas.seudominio.com
```

---

## 3. Clonar e Configurar

```bash
# Criar diretório
sudo mkdir -p /opt/senhas
sudo chown $USER:$USER /opt/senhas
cd /opt/senhas

# Clonar repositório
git clone https://github.com/leonfpontes/Senhas.git .
git checkout 001-multi-tenant-senhas

# Configurar ambiente
cp .env.example .env
nano .env
```

### Variáveis críticas (.env de produção)

> Para o template completo ver `.env.prod.example` na raiz do repositório.

```env
# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=senhas_prod
POSTGRES_USER=senhas_user
POSTGRES_PASSWORD=<senha-forte-gerada>
DATABASE_URL=postgresql+asyncpg://senhas_user:<senha>@postgres:5432/senhas_prod

# JWT (gerar com: openssl rand -hex 32)
JWT_SECRET_KEY=<chave-secreta-32-chars-minimo>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# Email
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=noreply@senhas.seudominio.com
BREVO_SENDER_NAME=Sistema de Senhas
RESEND_API_KEY=re_...

# App
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
LOG_LEVEL=WARNING
DEBUG=false
ENVIRONMENT=production

# Frontend
NEXT_PUBLIC_API_URL=https://api.senhas.seudominio.com/api/v1
NEXT_PUBLIC_APP_NAME=Senhas

# CORS
CORS_ORIGINS=https://senhas.seudominio.com
ALLOWED_HOSTS=senhas.seudominio.com,api.senhas.seudominio.com

# LGPD
DEFAULT_DATA_RETENTION_DAYS=365
DEFAULT_TIMEZONE=America/Sao_Paulo
```

**Proteger o .env:**
```bash
chmod 600 .env
```

---

## 4. Deploy com Docker Compose

> **Deploy automatizado**: push para `master` dispara o GitHub Actions workflow (`.github/workflows/deploy.yml`), que executa backup, build zero-downtime, migração e health check automaticamente.

### Deploy manual zero-downtime

NUNCA usar `up --build` diretamente — isso causa 503 enquanto o build ocorre.

```bash
cd /opt/senhas

# 1. Backup do banco ANTES de qualquer mudança
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec senhas_postgres pg_dump -U senhas_user senhas_prod \
  > /opt/senhas/backups/senhas_prod_${TIMESTAMP}.sql
# Manter apenas 10 mais recentes:
ls -t /opt/senhas/backups/senhas_prod_*.sql | tail -n +11 | xargs -r rm

# 2. Atualizar código
git pull origin master

# 3. Build com containers antigos AINDA rodando (zero-downtime)
docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml build backend frontend

# 4. Rodar migrações em container temporário
docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml \
  run --rm backend alembic upgrade head

# 5. Swap dos containers
docker compose -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d backend frontend

# 6. Health check
curl -f https://girahub.com.br/api/v1/health || echo "FALHOU"
```

### Verificar serviços

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

### Executar migrations

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### Criar super admin

```bash
docker compose -f docker-compose.prod.yml exec backend python seed_superadmin.py
```

---

## 5. Configurar Nginx + SSL

### Nginx config

```nginx
# /etc/nginx/sites-available/senhas
server {
    listen 80;
    server_name senhas.seudominio.com api.senhas.seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name senhas.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/senhas.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/senhas.seudominio.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.senhas.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/senhas.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/senhas.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Habilitar e obter SSL

```bash
sudo ln -s /etc/nginx/sites-available/senhas /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d senhas.seudominio.com -d api.senhas.seudominio.com
sudo systemctl reload nginx
```

---

## 6. Monitoramento

### Sentry (erros em produção)

DSNs já configurados no VPS em `/opt/senhas/.env`. Acesse os projetos em sentry.io:
- **Backend (FastAPI)**: projeto `senhas-backend` — captura exceções, traces e erros não tratados.
- **Frontend (Next.js)**: projeto `senhas-frontend` — captura erros client-side, server-side e edge.

Variáveis obrigatórias no `.env` de produção:
```env
SENTRY_DSN=<dsn-do-projeto-fastapi>
NEXT_PUBLIC_SENTRY_DSN=<dsn-do-projeto-nextjs>
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### Redis (rate limiter distribuído)

Redis já incluso no `docker-compose.prod.yml`. A variável `REDIS_URL` é repassada automaticamente ao container backend. O rate limiter (`slowapi`) usa `RedisStorage` quando `REDIS_URL` está definido — distribuído entre todos os workers.

```env
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
```

### Prometheus + Grafana

Já incluídos no `docker-compose.prod.yml`:

- **Prometheus**: `http://VPS_IP:9090` — coleta métricas
- **Grafana**: `http://VPS_IP:3001` — dashboards visuais

### Health Check

```bash
curl https://api.senhas.seudominio.com/health
# {"status": "ok"}

curl -H "Authorization: Bearer <token>" \
  https://api.senhas.seudominio.com/api/v1/admin/health
# {"status": "healthy", "services": {"database": "ok", "brevo": "ok", "resend": "ok"}}
```

---

## 7. Backup

### Backup manual do banco

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U senhas_user senhas_prod > backup_$(date +%Y%m%d).sql
```

### Backup automático (cron)

```bash
# /etc/cron.d/senhas-backup
0 3 * * * root docker exec senhas_postgres pg_dump -U senhas_user senhas_prod | gzip > /opt/backups/senhas_$(date +\%Y\%m\%d).sql.gz
```

---

## 8. Rollback

Em caso de problema após deploy:

```bash
# Voltar para versão anterior
cd /opt/senhas
git checkout <commit-anterior>
docker compose -f docker-compose.prod.yml up -d --build

# Reverter migration (se necessário)
docker compose -f docker-compose.prod.yml exec backend alembic downgrade -1
```

---

## 9. Verificação Pós-Deploy

- [ ] `curl https://girahub.com.br/api/v1/health` — Backend responde
- [ ] `curl https://girahub.com.br` — Frontend responde
- [ ] Login admin funciona (cookie `auth_state=1` setado após login)
- [ ] Emissão pública de senha funciona
- [ ] Email é enviado corretamente
- [ ] Nginx logs sem erros (`/var/log/nginx/error.log`)
- [ ] Sentry recebendo eventos (fazer login e verificar no dashboard)
- [ ] Backup criado em `/opt/senhas/backups/` com timestamp correto

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| 502 Bad Gateway | Verificar se backend está rodando: `docker compose ps` |
| Database connection refused | Verificar `DATABASE_URL` no `.env` e status do PostgreSQL |
| SSL certificate error | Executar `sudo certbot renew` |
| Email não enviado | Verificar `BREVO_API_KEY` e `RESEND_API_KEY` no `.env` |
| Migration falha | Verificar logs: `docker compose logs backend` |
| Permissão negada | `sudo chown -R $USER:$USER /opt/senhas` |
