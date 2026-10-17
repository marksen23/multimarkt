# Resale OS - einmaliges Setup auf dem eigenen Rechner (Windows).
# Voraussetzungen: Node.js 20+ (nodejs.org) und Docker Desktop (laeuft).
# Aufruf im Repo-Ordner:  .\setup.ps1     danach:  .\start.ps1
. "$PSScriptRoot\scripts\resale-env.ps1"
Set-Location $ResaleRoot

Write-Host "`n  Resale OS Setup`n" -ForegroundColor Green

Assert-ResaleCommand 'node' 'Node.js 20 oder neuer installieren: https://nodejs.org'
Assert-ResaleCommand 'npm' 'Kommt mit Node.js.'
Assert-ResaleCommand 'docker' 'Docker Desktop installieren und starten: https://www.docker.com/products/docker-desktop'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    Write-Host "Node.js $nodeMajor ist zu alt - bitte Version 20 oder neuer installieren." -ForegroundColor Red
    exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker laeuft nicht - Docker Desktop starten und Setup erneut ausfuehren." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ResaleSecretsDir)) { New-Item -ItemType Directory -Path $ResaleSecretsDir | Out-Null }

if (Test-Path $ResaleEnvFile) {
    Write-Host "Konfiguration vorhanden: $ResaleEnvFile (wird nicht ueberschrieben)" -ForegroundColor DarkGray
} else {
    $gemini = Read-Host 'Gemini API Key fuer die Foto-Analyse (Enter = ohne KI, nur Platzhalterwerte)'
    if (-not $gemini) { $gemini = 'unused-mock-provider-active' }
    $token = New-ResaleSecret
    $uploads = Join-Path $ResaleSecretsDir 'uploads'

    $content = @"
NODE_ENV=production
PORT=$ResalePort
DATABASE_URL=postgres://resale:resale@localhost:5433/resale_os
REDIS_URL=redis://localhost:6380
APP_ACCESS_TOKEN=$token
APP_USER_ID=00000000-0000-0000-0000-000000000000
JWT_SECRET=$(New-ResaleSecret)
INTERNAL_SERVICE_TOKEN=$(New-ResaleSecret)
WEBHOOK_SECRET_KLEINANZEIGEN=$(New-ResaleSecret)
SALE_CONFLICT_DEBOUNCE_MS=15000
UPLOAD_DIR=$uploads
GEMINI_API_KEY=$gemini
PUBLIC_BASE_URL=http://localhost:$ResalePort
"@
    # UTF-8 ohne BOM - ein BOM wuerde den ersten Schluessel verfaelschen (Lehre aus Loria).
    [System.IO.File]::WriteAllText($ResaleEnvFile, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Konfiguration gespeichert: $ResaleEnvFile" -ForegroundColor Green
}

[void](Import-ResaleEnv)
Start-ResaleDatabases
Build-Resale

Write-Host "`nSetup fertig. Starten mit:  .\start.ps1" -ForegroundColor Green
Write-Host "Dein App-Passwort (Zugriffstoken): $env:APP_ACCESS_TOKEN`n" -ForegroundColor Yellow
