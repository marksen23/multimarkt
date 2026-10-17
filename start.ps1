# Resale OS lokal starten (Windows). Erst einmalig .\setup.ps1 ausfuehren.
#   .\start.ps1          startet; baut automatisch neu, wenn sich der Code (git pull) geaendert hat
#   .\start.ps1 -Https   zusaetzlich HTTPS ueber Tailscale Serve (fuer "App installieren" am Handy)
param([switch]$Https)

. "$PSScriptRoot\scripts\resale-env.ps1"
Set-Location $ResaleRoot

if (-not (Import-ResaleEnv)) {
    Write-Host "`nKeine Konfiguration gefunden. Bitte zuerst ausfuehren: .\setup.ps1`n" -ForegroundColor Yellow
    exit 1
}

Start-ResaleDatabases

if (-not (Test-ResaleBuildCurrent)) {
    Write-Host 'Code hat sich geaendert oder wurde noch nicht gebaut - baue neu...' -ForegroundColor Yellow
    Build-Resale
} else {
    Push-Location (Join-Path $ResaleRoot 'backend')
    try { Invoke-ResaleStep 'Datenbank-Migrationen' { npm run migration:run --silent } } finally { Pop-Location }
}

# Alten Server auf dem Port beenden (wie bei Loria).
$old = Get-NetTCPConnection -LocalPort $ResalePort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $old) { if ($procId -gt 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } }

if ($Https) {
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        # Benoetigt aktivierte HTTPS-Zertifikate im Tailscale-Admin (DNS -> HTTPS Certificates).
        tailscale serve --bg $ResalePort
        if ($LASTEXITCODE -ne 0) { Write-Host 'Tailscale Serve konnte nicht gestartet werden - weiter ohne HTTPS.' -ForegroundColor Yellow }
    } else {
        Write-Host 'Tailscale nicht gefunden - weiter ohne HTTPS.' -ForegroundColor Yellow
    }
}

Write-Host "`n  Resale OS laeuft gleich unter:" -ForegroundColor Green
Write-Host "    Dieser Rechner:  http://127.0.0.1:$ResalePort"
foreach ($u in Get-ResalePhoneUrls) { Write-Host "    Handy:           $u" }
if ($Https) {
    $ts = Get-ResalePhoneUrls | Where-Object { $_ -like '*.ts.net*' } | Select-Object -First 1
    if ($ts) { Write-Host "    Handy (HTTPS):   $(($ts -replace '^http://', 'https://') -replace ":$ResalePort$", '')" }
}
Write-Host "  App-Passwort: $env:APP_ACCESS_TOKEN`n" -ForegroundColor Yellow

# Browser oeffnen, sobald der Server antwortet (blockiert den Start nicht).
Start-Job -ArgumentList $ResalePort -ScriptBlock {
    param($port)
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/healthz" -UseBasicParsing -TimeoutSec 1
            if ($r.StatusCode -eq 200) { Start-Process "http://127.0.0.1:$port"; break }
        } catch {}
    }
} | Out-Null

Set-Location (Join-Path $ResaleRoot 'backend')
node dist/main
