#!/usr/bin/env bash
# Backup diário do Postgres de produção, criptografado ANTES de sair da VPS (I-02).
#
# Fluxo: pg_dump (dentro do container) | gzip | gpg --encrypt (chave PÚBLICA) → arquivo local
#        → rclone copy para o bucket externo (R2/B2) → retenção local e remota.
#
# A chave PRIVADA nunca fica na VPS: sem ela ninguém lê o dump (que tem PII de consulentes),
# nem quem invadir a VPS ou o bucket.
#
# Configuração em /etc/senhas-backup.env (chmod 600), ver devops/backup/senhas-backup.env.example.
# Instalação: devops/backup/install.sh. Restore: docs/deployment.md §7.
set -euo pipefail

CONFIG_FILE="${SENHAS_BACKUP_CONFIG:-/etc/senhas-backup.env}"
# shellcheck source=/dev/null
[ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"

: "${PROJECT_DIR:=/opt/senhas}"
: "${LOCAL_DIR:=/opt/senhas/backups/daily}"
: "${GPG_RECIPIENT:?defina GPG_RECIPIENT (id/e-mail da chave pública importada) em $CONFIG_FILE}"
: "${RCLONE_REMOTE:?defina RCLONE_REMOTE (ex.: r2:girahub-backups) em $CONFIG_FILE}"
: "${KEEP_LOCAL:=7}"          # arquivos diários mantidos na VPS
: "${KEEP_DAILY_DAYS:=30}"    # diários mantidos no bucket
: "${KEEP_MONTHLY:=12}"       # mensais (dia 1) mantidos no bucket

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

dump() {
  # SENHAS_BACKUP_DUMP_CMD só existe para o teste local do pipeline; em produção fica vazio.
  if [ -n "${SENHAS_BACKUP_DUMP_CMD:-}" ]; then eval "$SENHAS_BACKUP_DUMP_CMD"; return; fi
  local db_user db_name
  db_user=$(grep -E '^DB_USER=' "$PROJECT_DIR/.env" | cut -d= -f2)
  db_name=$(grep -E '^DB_NAME=' "$PROJECT_DIR/.env" | cut -d= -f2)
  docker compose -f "$PROJECT_DIR/docker-compose.prod.yml" exec -T postgres \
    pg_dump -U "$db_user" --no-owner "$db_name"
}
STAMP=$(date -u +%Y%m%d-%H%M%S)
KIND=daily
[ "$(date -u +%d)" = "01" ] && KIND=monthly
FILE="$LOCAL_DIR/senhas-${KIND}-${STAMP}.sql.gz.gpg"

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
# Falhou em qualquer etapa → não deixa arquivo parcial contando como backup.
trap '[ "${BACKUP_OK:-0}" = 1 ] || rm -f "$FILE"' EXIT

log "dump → $FILE"
# pipefail garante que falha no pg_dump derruba o script (não sobe arquivo truncado).
dump \
  | gzip -9 \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" --output "$FILE"

SIZE=$(wc -c < "$FILE" | tr -d " ")
if [ "$SIZE" -lt 102400 ]; then
  log "ERRO: backup suspeito (${SIZE} bytes) — abortando sem subir"
  exit 1
fi
log "ok local (${SIZE} bytes)"
BACKUP_OK=1

rclone copy "$FILE" "$RCLONE_REMOTE/$KIND/" --s3-no-check-bucket
log "ok remoto: $RCLONE_REMOTE/$KIND/$(basename "$FILE")"

# Retenção local: só os N mais recentes.
ls -1t "$LOCAL_DIR"/senhas-*.sql.gz.gpg 2>/dev/null | tail -n +"$((KEEP_LOCAL + 1))" | xargs -r rm --
# Retenção remota.
rclone delete "$RCLONE_REMOTE/daily/" --min-age "${KEEP_DAILY_DAYS}d" --s3-no-check-bucket || log "aviso: retenção diária falhou"
prune_monthly() {
  # Pasta monthly/ ainda vazia (primeiros meses) faz o lsf falhar — não é erro do backup.
  local files
  files=$(rclone lsf "$RCLONE_REMOTE/monthly/" --files-only 2>/dev/null) || return 0
  printf '%s\n' "$files" | sort -r | tail -n +"$((KEEP_MONTHLY + 1))" | while read -r old; do
    [ -n "$old" ] && rclone deletefile "$RCLONE_REMOTE/monthly/$old" --s3-no-check-bucket
  done
}
prune_monthly || log "aviso: retenção mensal falhou"

# Batimento para monitoramento: idade deste arquivo = idade do último backup bem-sucedido.
date -u +%Y-%m-%dT%H:%M:%SZ > "$LOCAL_DIR/.last-success"
log "backup concluído"
