<#
  OmegaLiberte - your own hub on Windows, in one script.
  What it does (and nothing else):
    1. installs PHP 8.4 via winget, if PHP is missing (needs Windows 10/11 with winget)
    2. creates/edits php.ini next to php.exe: enables curl, openssl, mbstring; downloads the
       certificate list cacert.pem from curl.se and points curl/openssl to it
    3. downloads this repository as ZIP from GitHub and unpacks it into $Ziel
    4. opens http://localhost:$Port/ in your browser and starts PHP's built-in web server
  It needs no admin rights, sends no data anywhere, changes no system settings except the PHP
  install and its php.ini. Stop the hub with Ctrl+C; start it again by running the script again.
  Run:  powershell -ExecutionPolicy Bypass -File windows-setup.ps1   (optional: -Ziel D:\Hub -Port 8080)
#>
param(
  [string]$Ziel = "$HOME\OmegaLiberte",
  [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'
function Schritt($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# 1 - PHP
Schritt 'PHP'
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'winget not found. Install PHP 8.1+ manually from https://windows.php.net/download/ and run this script again.' }
  winget install --id PHP.PHP.8.4 -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command php -ErrorAction SilentlyContinue)) { throw 'PHP was installed but is not found yet. Open a new PowerShell window and run this script again.' }
}
$phpExe = (& php -r 'echo PHP_BINARY;')
$phpDir = Split-Path $phpExe
$ver = (& php -r 'echo PHP_VERSION;')
if ([version]($ver -replace '[^0-9.].*$', '') -lt [version]'8.1') { throw "PHP $ver is too old, 8.1 or newer is needed." }
Write-Host "PHP $ver in $phpDir"

# 2 - php.ini: extensions and certificates
Schritt 'php.ini'
$ini = Join-Path $phpDir 'php.ini'
if (-not (Test-Path $ini)) { Copy-Item (Join-Path $phpDir 'php.ini-development') $ini }
$ca = Join-Path $phpDir 'cacert.pem'
if (-not (Test-Path $ca)) { Invoke-WebRequest 'https://curl.se/ca/cacert.pem' -OutFile $ca -UseBasicParsing }
$t = Get-Content $ini
$t = $t -replace '^;\s*extension_dir\s*=\s*"ext"', 'extension_dir = "ext"'
$t = $t -replace '^;\s*extension=(curl|openssl|mbstring)\s*$', 'extension=$1'
$t = $t -replace '^;?\s*curl\.cainfo\s*=.*', "curl.cainfo = `"$ca`""
$t = $t -replace '^;?\s*openssl\.cafile\s*=.*', "openssl.cafile = `"$ca`""
Set-Content $ini $t
$mods = (& php -m) -join ' '
$fehlt = @('curl', 'openssl', 'mbstring') | Where-Object { $mods -notmatch "\b$_\b" }
if ($fehlt) { throw "Still missing PHP extensions: $($fehlt -join ', '). Check $ini." }
Write-Host 'curl, openssl, mbstring: ok'

# 3 - OmegaLiberte
Schritt 'OmegaLiberte'
$zip = Join-Path $env:TEMP 'omegaliberte.zip'
Invoke-WebRequest 'https://github.com/BFi-AI-247/0L_OmegaLiberte/archive/refs/heads/main.zip' -OutFile $zip -UseBasicParsing
New-Item -ItemType Directory -Force $Ziel | Out-Null
Expand-Archive $zip -DestinationPath $Ziel -Force
Remove-Item $zip
$web = Join-Path $Ziel '0L_OmegaLiberte-main\reference\web'
if (-not (Test-Path (Join-Path $web 'index.html'))) { throw "Unpacking failed - $web not found." }
Write-Host "Unpacked to $web (your settings live in the browser, not here - updating is safe)."

# 4 - start
Schritt "Your hub: http://localhost:$Port/  (Ctrl+C stops it)"
Start-Process "http://localhost:$Port/"
& php -S "localhost:$Port" -t $web
