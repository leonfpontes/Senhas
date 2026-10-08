#!/usr/bin/env bash
# Teste de restore (trimestral) — roda NA MÁQUINA DO DONO, onde está a chave privada gpg.
# Baixa o backup mais recente do bucket, decripta, restaura num Postgres descartável e conta linhas.
#
# Uso: RCLONE_REMOTE=r2:girahub-backups devops/backup/restore-test.sh [arquivo-local.sql.gz.gpg]
set -euo pipefail
: "${RCLONE_REMOTE:?defina RCLONE_REMOTE}"
WORK=$(mktemp -d)
trap 'docker rm -f senhas-restore-test >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

if [ $# -ge 1 ]; then
  SRC="$1"
else
  LATEST=$(rclone lsf "$RCLONE_REMOTE/daily/" --files-only | sort | tail -1)
  echo "Baixando $LATEST"
  rclone copy "$RCLONE_REMOTE/daily/$LATEST" "$WORK/"
  SRC="$WORK/$LATEST"
fi

docker run -d --name senhas-restore-test -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore postgres:15-alpine >/dev/null
# A imagem sobe primeiro um servidor provisório (só socket, sem o banco "restore") e reinicia depois
# de criá-lo: esperar por TCP + o banco existir, senão o restore começa no servidor errado.
ready=0
for _ in $(seq 1 60); do
  docker exec senhas-restore-test psql -h 127.0.0.1 -U postgres -d restore -tAc 'select 1' >/dev/null 2>&1 && { ready=1; break; }
  sleep 1
done
[ "$ready" = 1 ] || { echo "Postgres descartável não ficou pronto"; docker logs senhas-restore-test | tail -20; exit 1; }

echo "Decriptando e restaurando…"
gpg --batch --decrypt "$SRC" | gunzip | docker exec -i senhas-restore-test psql -q -h 127.0.0.1 -U postgres -d restore -v ON_ERROR_STOP=0 >/dev/null

for t in tenants tickets mediuns giras alembic_version; do
  n=$(docker exec senhas-restore-test psql -tA -h 127.0.0.1 -U postgres -d restore -c "select count(*) from $t")
  echo "  $t: $n"
done
echo "Restore OK — anote a data e as contagens em docs/deployment.md §7 (histórico de testes)."
