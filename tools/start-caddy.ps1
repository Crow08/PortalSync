<#
.SYNOPSIS
Starts Caddy, the TLS proxy in front of the server (see Caddyfile in the repository root).

.DESCRIPTION
Caddy serves https://$env:PORTALSYNC_DOMAIN on the ports 80 and 443 and forwards everything to the server. It gets
and renews the certificate itself and keeps it in %APPDATA%\Caddy.

caddy.exe is looked up in this order: the environment variable CADDY_EXE, D:\Programs\caddy\caddy.exe, the PATH.

The script stops when port 80 or 443 is in use, e.g. by the XAMPP Apache (service Apache2.4).

.PARAMETER Detached
Starts Caddy in a hidden window and returns. Its log goes to %TEMP%\caddy.log.

.PARAMETER Stop
Stops the running Caddy instead.

.EXAMPLE
.\start-caddy.ps1
Runs Caddy in this window, Ctrl+C stops it.

.EXAMPLE
.\start-caddy.ps1 -Detached
.\start-caddy.ps1 -Stop
#>
[CmdletBinding()]
param(
    [switch]$Detached,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'

if ($Stop) {
    $running = Get-Process caddy -ErrorAction SilentlyContinue
    if ($running) {
        $running | Stop-Process
        Write-Host 'Caddy stopped.'
    } else {
        Write-Host 'Caddy is not running.'
    }
    return
}

$defaultPath = 'D:\Programs\caddy\caddy.exe'
if ($env:CADDY_EXE) {
    $caddy = $env:CADDY_EXE
} elseif (Test-Path $defaultPath) {
    $caddy = $defaultPath
} else {
    $caddy = (Get-Command caddy -ErrorAction SilentlyContinue).Source
}
if (-not $caddy -or -not (Test-Path $caddy)) {
    throw "caddy.exe not found. Put it in $defaultPath, add it to the PATH or set CADDY_EXE (download: https://github.com/caddyserver/caddy/releases)."
}

if (-not $env:PORTALSYNC_DOMAIN) {
    throw "Set the environment variable PORTALSYNC_DOMAIN to the host name Caddy gets a certificate for."
}

foreach ($port in 80, 443) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $owner = (Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        throw "Port $port is already in use by '$owner'. Stop it first (the XAMPP Apache is the service Apache2.4)."
    }
}

$rootDir = Split-Path $PSScriptRoot -Parent
$config = Join-Path $rootDir 'Caddyfile'
# Windows PowerShell turns the log output of a native command on stderr into errors when they stop the script
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$validation = & $caddy validate --config $config --adapter caddyfile 2>&1 | Out-String
$validated = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previous
if (-not $validated) {
    throw "The Caddyfile is not valid:`n$validation"
}

if ($Detached) {
    $log = Join-Path $env:TEMP 'caddy.log'
    Start-Process -FilePath $caddy -ArgumentList 'run', '--config', $config, '--adapter', 'caddyfile' `
        -WorkingDirectory $rootDir -WindowStyle Hidden -RedirectStandardError $log -RedirectStandardOutput "$log.out"
    Write-Host "Caddy started in the background, log: $log (stop it with: .\start-caddy.ps1 -Stop)"
} else {
    & $caddy run --config $config --adapter caddyfile
}
