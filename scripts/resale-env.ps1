# Gemeinsame Helfer fuer setup.ps1 und start.ps1 (Windows PowerShell 5.1+).
# Geheimnisse liegen wie bei Loria AUSSERHALB des Repo-Ordners, damit sie
# nicht in OneDrive/Git landen: %USERPROFILE%\.resale-os-secrets\.env

$ResaleRoot = Split-Path -Parent $PSScriptRoot
$ResaleSecretsDir = Join-Path $HOME '.resale-os-secrets'
$ResaleEnvFile = Join-Path $ResaleSecretsDir '.env'
$ResalePort = 3000

function Import-ResaleEnv {
    if (-not (Test-Path $ResaleEnvFile)) { return $false }
    foreach ($line in [System.IO.File]::ReadAllLines($ResaleEnvFile)) {
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        [Environment]::SetEnvironmentVariable($t.Substring(0, $i).Trim(), $t.Substring($i + 1).Trim(), 'Process')
    }
    return $true
}

function New-ResaleSecret {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Assert-ResaleCommand([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "`n$Name wurde nicht gefunden. $Hint`n" -ForegroundColor Red
        exit 1
    }
}

function Invoke-ResaleStep([string]$Title, [scriptblock]$Action) {
    Write-Host "== $Title" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Fehlgeschlagen: $Title (Exit-Code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

function Start-ResaleDatabases {
    Push-Location $ResaleRoot
    try {
        Invoke-ResaleStep 'Datenbanken starten (Docker)' { docker compose up -d --wait }
    } finally { Pop-Location }
}

# Baut Backend + Frontend und fuehrt Migrationen aus. Merkt sich den
# gebauten Git-Stand, damit start.ps1 nur nach einem `git pull` neu baut.
function Build-Resale {
    Push-Location (Join-Path $ResaleRoot 'backend')
    try {
        Invoke-ResaleStep 'Backend: Pakete' { npm ci --include=dev --no-audit --no-fund }
        Invoke-ResaleStep 'Backend: Build' { npm run build }
        Invoke-ResaleStep 'Datenbank-Migrationen' { npm run migration:run }
    } finally { Pop-Location }
    Push-Location (Join-Path $ResaleRoot 'frontend')
    try {
        Invoke-ResaleStep 'Frontend: Pakete' { npm ci --include=dev --no-audit --no-fund }
        Invoke-ResaleStep 'Frontend: Build' { npm run build }
    } finally { Pop-Location }
    $commit = Get-ResaleCommit
    if ($commit) { Set-Content -Path (Get-ResaleStampFile) -Value $commit -Encoding ASCII }
}

function Get-ResaleCommit {
    $c = git -C $ResaleRoot rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0) { return $c.Trim() }
    return $null
}

function Get-ResaleStampFile { return (Join-Path $ResaleRoot 'backend\dist\.build-commit') }

function Test-ResaleBuildCurrent {
    $stamp = Get-ResaleStampFile
    if (-not (Test-Path (Join-Path $ResaleRoot 'backend\dist\main.js'))) { return $false }
    if (-not (Test-Path (Join-Path $ResaleRoot 'frontend\dist\index.html'))) { return $false }
    if (-not (Test-Path $stamp)) { return $false }
    return ((Get-Content $stamp -Raw).Trim() -eq (Get-ResaleCommit))
}

# Tailscale-Name (wie bei Loria: dell.<tailnet>.ts.net) oder LAN-IP fuers Handy.
function Get-ResalePhoneUrls {
    $urls = @()
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        try {
            $status = tailscale status --json 2>$null | ConvertFrom-Json
            $dns = $status.Self.DNSName
            if ($dns) { $urls += "http://$($dns.TrimEnd('.')):$ResalePort" }
        } catch {}
    }
    $lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '100.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -ExpandProperty IPAddress
    foreach ($ip in $lan) { $urls += "http://${ip}:$ResalePort" }
    return $urls
}
