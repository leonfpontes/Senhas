# start-dev.ps1 — Inicia o ambiente de desenvolvimento local de forma confiavel.
#
# No Windows, o Docker Desktop reinicia containers com restart:unless-stopped
# SEM passar pelo docker compose, causando race condition onde o postgres sobe
# antes da rede senhas_senhas_network existir e fica desconectado.
# Este script corrige isso a cada inicializacao.

Set-Location $PSScriptRoot

Write-Host "Iniciando ambiente de desenvolvimento..." -ForegroundColor Cyan

# 1) Sobe (ou recria) todos os containers via compose — garante rede correta
docker compose -f docker-compose.dev.yml up -d

# 2) Detecta o nome real da rede criada pelo compose
$network = docker network ls --format "{{.Name}}" | Where-Object { $_ -match "senhas.*network" } | Select-Object -First 1

if (-not $network) {
    Write-Host "AVISO: Rede senhas_*_network nao encontrada. Aguardando..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    $network = docker network ls --format "{{.Name}}" | Where-Object { $_ -match "senhas.*network" } | Select-Object -First 1
}

Write-Host "Rede detectada: $network" -ForegroundColor Gray

# 3) Garante que postgres esta na rede (corrige o race condition do Docker Desktop)
$inNetwork = docker network inspect $network --format "{{range .Containers}}{{.Name}} {{end}}" 2>$null
if ($inNetwork -notmatch "senhas_postgres") {
    Write-Host "Reconectando senhas_postgres a rede $network..." -ForegroundColor Yellow
    docker network connect --alias postgres $network senhas_postgres
} else {
    Write-Host "senhas_postgres ja esta na rede." -ForegroundColor Green
}

# 4) Verifica conectividade DNS dentro do backend
$dns = docker exec senhas_backend python -c "import socket; print(socket.gethostbyname('postgres'))" 2>$null
if ($dns) {
    Write-Host "Backend resolve 'postgres' -> $dns" -ForegroundColor Green
} else {
    Write-Host "AVISO: Backend ainda nao resolve 'postgres'. Tente reiniciar o backend:" -ForegroundColor Red
    Write-Host "  docker compose -f docker-compose.dev.yml restart backend" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Ambiente pronto!" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  API docs: http://localhost:8000/docs" -ForegroundColor White
