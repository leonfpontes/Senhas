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

### Notificação no celular da Área do Médium (AM-16 — chaves VAPID)

O push (Web Push com VAPID, sem serviço pago) fica **desligado** enquanto as três variáveis estiverem vazias: a
Área esconde "Notificações no celular" e os lembretes saem só por e-mail. Para ligar:

1. **Gerar o par de chaves uma vez** (na sua máquina, nunca no repositório):
   ```bash
   npx web-push generate-vapid-keys
   # Public Key:  BN...  (65 bytes em base64url)
   # Private Key: x5...  (32 bytes em base64url)
   ```
   Alternativa em Python (mesmo formato), com o venv do backend:
   ```bash
   python -c "import base64;from cryptography.hazmat.primitives.asymmetric import ec;from cryptography.hazmat.primitives import serialization as s;k=ec.generate_private_key(ec.SECP256R1());b=lambda r:base64.urlsafe_b64encode(r).rstrip(b'=').decode();print('VAPID_PUBLIC_KEY='+b(k.public_key().public_bytes(s.Encoding.X962,s.PublicFormat.UncompressedPoint)));print('VAPID_PRIVATE_KEY='+b(k.private_numbers().private_value.to_bytes(32,'big')))"
   ```
2. **Gravar no `/opt/senhas/.env` da VPS** (é dele que o `docker-compose.prod.yml` lê as variáveis do backend;
   o `deploy.yml` não passa segredos do backend pelo GitHub):
   ```bash
   ssh root@<vps>
   cd /opt/senhas && nano .env   # ou: cat >> .env
   VAPID_PUBLIC_KEY=BN...
   VAPID_PRIVATE_KEY=x5...
   VAPID_SUBJECT=mailto:contato@girahub.com.br
   chmod 600 .env
   ```
3. **Recriar só o backend** para ler o `.env` (o próximo deploy também aplica):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps backend
   docker compose -f docker-compose.prod.yml exec -T backend python -c "from src.services.web_push import disponivel; print(disponivel())"   # True
   ```
4. **Validar num celular de verdade**: Perfil da Área → "Notificações no celular" → ligar → "Mandar uma notificação
   de teste" (Android/Chrome e iPhone com a Área na tela inicial, iOS 16.4+).

**Estado:** ligado em produção em 2026-10-09 (par gerado direto na VPS e gravado no `.env`, `chmod 600`; backup
`.env.bak-vapid-*`).

Cuidados: a chave privada é segredo (só no `.env` da VPS, `chmod 600`). **Não troque o par depois de ligado** —
as inscrições ficam presas à chave pública e param de receber (o médium precisa ligar de novo). Para desligar o
push, esvazie as três variáveis e recrie o backend.

### Mensalidade com baixa automática pelo Stripe Connect (F-02/AM-22)

Cada casa escolhe onde recebe a mensalidade (decisão de 09/10): **Stripe** (este passo) ou Mercado Pago (passo
abaixo, quando o PR do Mercado Pago entrar). Enquanto `STRIPE_CONNECT_WEBHOOK_SECRET` estiver vazio, a opção
"Stripe" **não aparece** em Financeiro → Configuração → Mensalidade e a Área segue com a chave PIX + comprovante.
O GiraHub não cobra comissão (sem `application_fee`): a taxa do Stripe é descontada da casa.

1. **Ligar o Connect na conta Stripe do GiraHub** (modo live): Dashboard → **Connect** → **Get started** /
   "Começar" → modelo de plataforma ("Platform or marketplace"), país **Brasil**; preencher o **perfil da
   plataforma** (Dashboard → Settings → Connect → **Platform profile**). Em Settings → Connect → **Onboarding
   options/Branding**, pôr nome "GiraHub", ícone e cor (o cadastro da casa mostra isso). Em Settings → Connect →
   **Express** confira que Brasil está liberado para contas conectadas.
2. **PIX e boleto nas contas conectadas**: PIX no Brasil é "por convite" no Stripe — a conta do GiraHub já tem o
   PIX ligado, e o GiraHub pede as capacidades `pix_payments` e `boleto_payments` para cada casa ao conectar. Em
   Settings → Connect → **Payment methods** ("Formas de pagamento das contas conectadas"), deixe **Pix** e
   **Boleto** ligados para as contas conectadas. Testar com uma casa piloto: o card mostra "PIX automático ligado"
   só quando o Stripe ativa a capacidade.
3. **Criar o webhook do Connect** (separado do webhook da assinatura): Dashboard → **Developers → Webhooks** →
   **Add destination/endpoint** → em "Events from" escolha **Connected accounts** ("Contas conectadas") → URL
   `https://girahub.com.br/api/v1/webhooks/stripe-connect` (o mesmo domínio do webhook `/api/v1/webhooks/stripe`
   que já existe) → eventos `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `account.updated`. Copie o **Signing secret** (`whsec_...`) desse endpoint.
4. **Gravar no `/opt/senhas/.env` da VPS** e gerar a chave do segredo em repouso (usada pelo Mercado Pago; gere
   já para ficar pronta):
   ```bash
   ssh root@<vps>
   cd /opt/senhas
   python3 -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"   # chave Fernet
   nano .env
   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...      # do passo 3 (NÃO é o STRIPE_WEBHOOK_SECRET)
   SECRETS_ENCRYPTION_KEY=...                   # a linha gerada acima; nunca troque sem rotação (core/secret_box.py)
   chmod 600 .env
   docker compose -f docker-compose.prod.yml up -d --no-deps backend
   ```
5. **Validar**: com uma casa de teste no Pro, Financeiro → Configuração → Mensalidade → "Conectar Stripe" (pede a
   senha; os admins recebem e-mail) → cadastro no Stripe → volta para a tela, que confere a conta. Na Área, "Pagar
   com PIX" mostra o QR da cobrança; pago, o mês vira "Paga" sozinho (Dashboard → Developers → Webhooks → o
   endpoint do Connect mostra as entregas).

### Mensalidade com baixa automática pelo Mercado Pago (F-02/AM-22)

A opção "Mercado Pago" **só aparece** com as quatro variáveis abaixo **e** `SECRETS_ENCRYPTION_KEY` (os tokens de
cada casa são gravados cifrados). A casa entra na conta Mercado Pago dela e autoriza o GiraHub (OAuth); o GiraHub
cria o PIX na conta da casa, sem comissão.

1. **Criar a aplicação do GiraHub** em https://www.mercadopago.com.br/developers → **Suas integrações** → **Criar
   aplicação** (com a conta Mercado Pago do GiraHub): solução de **pagamentos online / Checkout API (Transparente)**,
   informando que a integração é para **terceiros (plataforma/marketplace)** — é o que libera o OAuth.
2. **Redirect URL**: Suas integrações → a aplicação → **Detalhes da aplicação** → **Editar dados** →
   **Configurações avançadas** → **URLs de redirecionamento**: `https://girahub.com.br/admin/financeiro/mercadopago-retorno`
   (idêntica ao `MERCADOPAGO_REDIRECT_URI`; URL estática, sem parâmetros). Se a opção de **PKCE** estiver ligada na
   aplicação, deixe-a desligada (o GiraHub usa `state` assinado).
3. **Webhook**: Suas integrações → a aplicação → **Webhooks** → **Configurar notificações** → modo **produção**:
   URL `https://girahub.com.br/api/v1/webhooks/mercadopago`, evento **Pagamentos** (`payment`). Copie a
   **assinatura secreta** gerada ali (é o `MERCADOPAGO_WEBHOOK_SECRET`). Cada PIX também é criado com essa
   `notification_url`, então a casa não precisa configurar nada.
4. **Credenciais**: Suas integrações → a aplicação → **Credenciais de produção** → **Client ID** (= número da
   aplicação) e **Client Secret**.
5. **Gravar no `/opt/senhas/.env` da VPS** e recriar o backend:
   ```bash
   ssh root@<vps>
   cd /opt/senhas && nano .env
   MERCADOPAGO_CLIENT_ID=...          # passo 4
   MERCADOPAGO_CLIENT_SECRET=...      # passo 4 (segredo)
   MERCADOPAGO_REDIRECT_URI=https://girahub.com.br/admin/financeiro/mercadopago-retorno
   MERCADOPAGO_WEBHOOK_SECRET=...     # passo 3 (segredo)
   # SECRETS_ENCRYPTION_KEY já deve estar lá (passo do Stripe acima)
   chmod 600 .env
   docker compose -f docker-compose.prod.yml up -d --no-deps backend
   ```
6. **Validar com uma casa piloto no Pro** (o OAuth só gera credenciais de produção): Financeiro → Configuração →
   Mensalidade → "Conectar Mercado Pago" (senha) → login no Mercado Pago da casa → autorizar → volta "conectado"
   (os admins recebem e-mail). Na Área, "Pagar com PIX" de valor baixo; pago, o mês vira "Paga" sozinho
   (Suas integrações → Webhooks mostra as entregas).

Desconectar no GiraHub apaga os tokens da casa. A casa também pode revogar a autorização no Mercado Pago (Seu
perfil → Segurança → Aplicativos conectados); aí o "Pagar com PIX" volta a dar erro até desconectar/reconectar.
O token dura 180 dias e é renovado sozinho quando falta menos de 7 dias.

`SECRETS_ENCRYPTION_KEY` é segredo (só no `.env`, `chmod 600`) e **não pode ser perdida nem trocada sem rotação**:
os tokens do Mercado Pago gravados com ela ficam ilegíveis (as casas teriam de reconectar). Rotação: ponha a
chave nova na frente, separada por vírgula (`nova,antiga`), recifre e depois tire a antiga.

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

### Stripe — assinatura do plano (cartão e boleto)

Variáveis (`.env` de produção): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASIC/PRO/PREMIUM`
e, desde o $-04, `STRIPE_INVOICE_PAYMENT_METHODS` (padrão `boleto`) e `STRIPE_INVOICE_DAYS_UNTIL_DUE`
(padrão `5`). O painel oferece "Cartão de crédito" (Checkout, renovação automática) e "Boleto bancário"
(assinatura `send_invoice`: a Stripe manda a fatura por e-mail todo mês e o painel mostra "Pagar agora").

O que ligar no Dashboard da Stripe (uma vez, pelo dono da conta):

1. **Formas de pagamento** (Settings → Payments → Payment methods): ativar **Boleto** e conferir a validade
   padrão do boleto (3 dias; pode ir até 60). Sem isso, "Boleto bancário" responde "ainda não está
   liberado" e o cartão segue funcionando.
2. **Faturas** (Settings → Billing → Invoice template → formas de pagamento padrão): incluir **Boleto**.
3. **E-mails** (Settings → Billing → Subscriptions and emails / Customer emails): ligar o envio das
   faturas finalizadas ao cliente, os lembretes de fatura vencida e, em Customer emails, as instruções de
   pagamento do Boleto. Em modo de teste a Stripe só manda e-mail para endereços do próprio time.
4. **Pagamentos com falha / fatura vencida** (Settings → Billing → Subscriptions → Manage failed payments
   e Manage invoices sent to customers): decidir o que acontece depois do vencimento (manter `past_due`
   ou cancelar após N dias). O GiraHub suspende na fatura vencida e reativa quando ela é paga; se a
   Stripe cancelar, a conta volta ao gratuito.
5. **Webhook** (Developers → Webhooks → endpoint `https://<api>/api/v1/webhooks/stripe`): além dos eventos
   que já estavam (`checkout.session.completed`, `customer.subscription.created/updated/deleted`,
   `invoice.payment_failed`), assinar `invoice.paid`, `invoice.finalized`, `invoice.overdue`,
   `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed`.

**Pix**: conta Stripe do Brasil aceita Pix só em pagamento avulso (sob convite) e o Pix Automático (Pix
recorrente) não está disponível no Brasil — então Pix não entra na assinatura por enquanto. Se a Stripe
liberar Pix em faturas para a conta, basta `STRIPE_INVOICE_PAYMENT_METHODS=boleto,pix` (e ativar o Pix nos
passos 1–2): o painel passa a escrever "PIX ou boleto" sozinho.

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

### Backups que existem

| Backup | Onde | Quando | Fora da VPS? |
|---|---|---|---|
| Pré-deploy (`.github/workflows/deploy.yml`) | `/opt/senhas/backups/pre-deploy-*.sql.gz` (30 últimos) | a cada push no master | não |
| Diário criptografado (`devops/backup/`) | `/opt/senhas/backups/daily/` (7) + bucket externo (30 diários + 12 mensais) | 03:15 UTC | **sim** |

> Diagnóstico de 2026-10-06 (I-02): até esta data **não havia backup diário nenhum** na VPS. O cron
> descrito antes aqui (`/etc/cron.d/senhas-backup` com `senhas_postgres`) nunca foi instalado, e o do
> `devops/vps_setup.sh` mira um Postgres do host, que não é usado (o banco roda no container `senhas-postgres`).

### Backup diário criptografado (I-02)

O dump sai da VPS **já criptografado** com a chave **pública** gpg. A chave privada fica só com o dono,
então nem quem invadir a VPS nem quem acessar o bucket consegue ler os dados (há PII de consulentes).

**Instalação (uma vez):**

1. **Bucket em free tier**: Cloudflare R2 ou Backblaze B2 (10 GB grátis; o dump comprimido tem ~17 MB).
   Crie uma chave de API restrita a esse bucket.
2. **Par de chaves gpg na máquina do dono** (não na VPS):
   ```bash
   gpg --quick-gen-key "backup@girahub.com.br" default default never
   gpg --armor --export backup@girahub.com.br > girahub-backup.pub.asc
   gpg --armor --export-secret-keys backup@girahub.com.br > girahub-backup.PRIVADA.asc  # guardar no gerenciador de senhas + cópia offline
   ```
3. **Na VPS** (como root):
   ```bash
   gpg --import girahub-backup.pub.asc
   apt-get install -y rclone && rclone config        # remote apontando para o bucket
   cp /opt/senhas/devops/backup/senhas-backup.env.example /etc/senhas-backup.env  # e editar
   /opt/senhas/devops/backup/install.sh              # instala o cron e roda um backup na hora
   ```

   **Remote do R2 no rclone** (as chaves de acesso quem digita é o dono, no `rclone config`):
   `type = s3`, `provider = Cloudflare`, `region = auto`, `endpoint = https://<account-id>.r2.cloudflarestorage.com`
   e **`no_head = true`**. O rclone do apt (1.60) confere cada upload com `HEAD ?versionId=…`, que o R2
   não implementa (501 `NotImplemented`); sem `no_head` o upload só passa na 2ª tentativa. O token do R2
   precisa de **Object Read & Write** restrito ao bucket (só leitura dá `AccessDenied` no upload).

**Em produção desde 2026-10-07:** bucket `girahub-backups` (R2), chave gpg `backup@girahub.com.br`
(fingerprint `069C 2164 066B 3A25 9959  D5BB 7726 E160 726F CDC9`), cron às 03:15 UTC.

**Monitorar:** `tail /var/log/senhas-backup.log` e `cat /opt/senhas/backups/daily/.last-success`
(data do último sucesso). Se a data tiver mais de 26 h, o backup parou.

### Teste de restore (trimestral)

Na máquina do dono, onde está a chave privada, com Docker e rclone configurados:

```bash
RCLONE_REMOTE=r2:girahub-backups devops/backup/restore-test.sh
```

O script baixa o backup mais recente, decripta, restaura num Postgres descartável e conta as linhas de
`tenants`, `tickets`, `mediuns` e `giras`. Registre cada teste na tabela abaixo.

| Data | Arquivo | tenants | tickets | Quem |
|---|---|---|---|---|
| 2026-10-06 | pipeline validado com o banco de dev (chave e bucket de teste) | 5 | 619 | Claude |
| 2026-10-07 | `senhas-daily-20261007-180209.sql.gz.gpg` (produção, R2) | 19 | 3746 | Leonardo (máquina do dono) |

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
- [ ] Backup pré-deploy criado em `/opt/senhas/backups/` e `.last-success` do backup diário com menos de 26 h

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| 502 Bad Gateway | Verificar se backend está rodando: `docker compose ps` |
| Database connection refused | Verificar `DATABASE_URL` no `.env` e status do PostgreSQL |
| SSL certificate error | Executar `sudo certbot renew` |
| Email não enviado | Verificar `BREVO_API_KEY` e `RESEND_API_KEY` no `.env` |
| "Notificações no celular" não aparece na Área | Conferir `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no `.env` e recriar o backend (seção 3) |
| Migration falha | Verificar logs: `docker compose logs backend` |
| Permissão negada | `sudo chown -R $USER:$USER /opt/senhas` |
