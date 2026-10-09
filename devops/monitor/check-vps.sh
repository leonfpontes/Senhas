#!/usr/bin/env bash
# Verificação diária da VPS (chamada pelo workflow .github/workflows/monitor.yml via SSH).
# Sai com código != 0 quando algo precisa de atenção — o GitHub avisa por e-mail a falha do workflow.
#   1. backup do dia concluído (log do cron) há menos de 26 h;
#   2. arquivo mais novo no bucket (daily/ ou monthly/) com menos de 26 h;
#   3. disco abaixo de 85%;
#   4. containers principais saudáveis.
# Não altera nada (só leitura). Nada de segredo vai para a saída.
set -uo pipefail

LOG=/var/log/senhas-backup.log
CONFIG_FILE=/etc/senhas-backup.env
MAX_AGE_H=26
DISK_MAX=85
problemas=0
falha() { echo "FALHA: $*"; problemas=$((problemas + 1)); }
ok() { echo "ok: $*"; }
agora=$(date -u +%s)

# 1. Log do backup
ultima=$(grep "backup concluído" "$LOG" 2>/dev/null | tail -1 | sed -E 's/^\[([^]]+)\].*/\1/')
if [ -z "$ultima" ]; then
  falha "nenhum 'backup concluído' em $LOG"
else
  idade_h=$(( (agora - $(date -u -d "$ultima" +%s)) / 3600 ))
  if [ "$idade_h" -ge "$MAX_AGE_H" ]; then falha "último backup concluído há ${idade_h} h ($ultima)"; else ok "backup concluído há ${idade_h} h"; fi
fi

# 2. Bucket externo
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$CONFIG_FILE"; set +a
  novo=$( { rclone lsf "${RCLONE_REMOTE}/daily/" --files-only 2>/dev/null; rclone lsf "${RCLONE_REMOTE}/monthly/" --files-only 2>/dev/null; } \
          | sed -nE 's/^senhas-(daily|monthly)-([0-9]{8})-([0-9]{6}).*/\2\3/p' | sort | tail -1)
  if [ -z "$novo" ]; then
    falha "nenhum backup encontrado no bucket"
  else
    ts=$(date -u -d "${novo:0:8} ${novo:8:2}:${novo:10:2}:${novo:12:2}" +%s)
    idade_h=$(( (agora - ts) / 3600 ))
    if [ "$idade_h" -ge "$MAX_AGE_H" ]; then falha "backup mais novo no bucket tem ${idade_h} h"; else ok "bucket: backup mais novo há ${idade_h} h"; fi
  fi
else
  falha "falta $CONFIG_FILE"
fi

# 3. Disco
uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$uso" -ge "$DISK_MAX" ]; then falha "disco em ${uso}% (limite ${DISK_MAX}%)"; else ok "disco em ${uso}%"; fi
cache=$(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null | awk '/Build Cache/ {print $3}')
[ -n "$cache" ] && echo "info: cache de build do Docker = $cache"

# 4. Containers
for c in senhas-postgres senhas-backend senhas-frontend senhas-nginx; do
  st=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null || echo "ausente")
  if [ "$st" = "healthy" ]; then ok "$c saudável"; else falha "$c: $st"; fi
done

if [ "$problemas" -gt 0 ]; then echo "== $problemas problema(s)"; exit 1; fi
echo "== tudo certo"
