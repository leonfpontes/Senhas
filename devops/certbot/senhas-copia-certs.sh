#!/usr/bin/env bash
# Deploy hook do certbot: copia o certificado renovado para /opt/senhas/certs, que o overlay
# docker-compose.ssl.yml monta no container senhas-nginx (./certs:/etc/nginx/certs).
# Instalado em /etc/letsencrypt/renewal-hooks/deploy/ pelo deploy (.github/workflows/deploy.yml, passo 5d).
#
# Ordem do certbot renew (authenticator standalone, ver /etc/letsencrypt/renewal/girahub.com.br.conf):
#   pre_hook  = docker stop senhas-nginx   (libera a porta 80 para o desafio HTTP)
#   deploy    = este script                (só roda quando um certificado foi de fato renovado)
#   post_hook = docker start senhas-nginx  (o nginx sobe já lendo os arquivos novos)
# Antes deste hook, o certificado renovado ficava só em /etc/letsencrypt e o nginx seguia servindo o antigo
# até um cron bimestral copiar (out/2026: renovado em 17/10, o servido vencia em 16/11).
set -euo pipefail

DESTINO=/opt/senhas/certs
ORIGEM=${RENEWED_LINEAGE:-/etc/letsencrypt/live/girahub.com.br}

install -m 0644 "$ORIGEM/fullchain.pem" "$DESTINO/fullchain.pem"
install -m 0600 "$ORIGEM/privkey.pem" "$DESTINO/privkey.pem"
echo "senhas-copia-certs: $(openssl x509 -in "$DESTINO/fullchain.pem" -noout -enddate)"

# Rodando fora do renew (à mão, ou com o nginx de pé): recarrega para servir o novo já.
if [ "$(docker inspect -f '{{.State.Running}}' senhas-nginx 2>/dev/null)" = "true" ]; then
  docker exec senhas-nginx nginx -s reload
fi
