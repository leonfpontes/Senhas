#!/usr/bin/env bash
# Instala o backup diário na VPS (rodar como root, a partir de /opt/senhas). Idempotente.
# Pré-requisitos (feitos pelo dono, ver docs/deployment.md §7):
#   1. /etc/senhas-backup.env preenchido (modelo: devops/backup/senhas-backup.env.example)
#   2. chave pública gpg importada: gpg --import girahub-backup.pub.asc
#   3. remote do rclone configurado: rclone config
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v rclone >/dev/null || { apt-get update -qq && apt-get install -y -qq rclone; }
command -v gpg >/dev/null || apt-get install -y -qq gnupg

[ -f /etc/senhas-backup.env ] || { echo "falta /etc/senhas-backup.env"; exit 1; }
chmod 600 /etc/senhas-backup.env

install -m 755 devops/backup/senhas-backup.sh /usr/local/bin/senhas-backup.sh

# 03:15 UTC (00:15 em Brasília) — fora do horário de gira.
cat > /etc/cron.d/senhas-backup <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * root /usr/local/bin/senhas-backup.sh >> /var/log/senhas-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/senhas-backup

echo "Rodando um backup agora para validar…"
/usr/local/bin/senhas-backup.sh
echo "Instalado. Log: /var/log/senhas-backup.log"
