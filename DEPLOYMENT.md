# Deploy

Este arquivo ficou só como ponteiro (varredura R-02 de 2026-10-09). O guia de março/2026 que estava aqui
(backup em `/usr/local/bin/backup-senhas-db.sh`, Cypress, Locust, checklist da v1) não vale mais.

- **Guia vigente**: [docs/deployment.md](docs/deployment.md) — VPS, variáveis, Docker Compose, Nginx/SSL, Stripe,
  Mercado Pago, push (VAPID), backup criptografado fora da VPS e rollback.
- **Como o deploy acontece**: push na `master` = deploy (`.github/workflows/deploy.yml`, depois dos testes de
  `.github/workflows/tests.yml`). Pull requests rodam só o CI (`.github/workflows/ci.yml`).
- **Infra e estado atual**: [AGENTS.md](AGENTS.md) §11.9.
