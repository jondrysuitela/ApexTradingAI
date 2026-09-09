$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot "launcher.config.json"

if (-not (Test-Path -LiteralPath $configPath)) {
  $template = @{
    mt5Path = "C:\\Program Files\\MetaTrader 5\\terminal64.exe"
    mt5BridgeDir = ".\\mt5-bridge"
    mt5BridgeHost = "127.0.0.1"
    mt5BridgePort = 8787
    appHost = "0.0.0.0"
    appPort = 3000
  } | ConvertTo-Json -Depth 4
  Set-Content -LiteralPath $configPath -Value $template -Encoding UTF8
  Write-Host "Created launcher config at $configPath"
  Write-Host "Edit mt5Path if your MT5 terminal is installed elsewhere, then rerun this script."
  exit 1
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$mt5Path = [string]$config.mt5Path
$mt5BridgeDir = Join-Path $root ([string]$config.mt5BridgeDir)
$bridgeHost = [string]$config.mt5BridgeHost
$bridgePort = [int]$config.mt5BridgePort
$appHost = [string]$config.appHost
$appPort = [int]$config.appPort
$venvPython = Join-Path $mt5BridgeDir ".venv\Scripts\python.exe"

function Start-HiddenProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Command
  )

  Start-Process -FilePath powershell -WindowStyle Hidden -ArgumentList @("-NoProfile", "-Command", $Command) | Out-Null
}

function Start-Browser {
  param(
    [Parameter(Mandatory = $true)][string]$Url
  )

  $chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
  )

  foreach ($chromePath in $chromePaths) {
    if (Test-Path -LiteralPath $chromePath) {
      Start-Process -FilePath $chromePath -ArgumentList @("--new-window", $Url) | Out-Null
      return
    }
  }

  Start-Process $Url | Out-Null
}

if (-not (Test-Path -LiteralPath $mt5BridgeDir)) {
  throw "MT5 bridge directory not found: $mt5BridgeDir"
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  Write-Host "Creating MT5 bridge virtual environment..."
  Push-Location $mt5BridgeDir
  try {
    python -m venv .venv
  } finally {
    Pop-Location
  }
}

Write-Host "Installing MT5 bridge dependencies if needed..."
& $venvPython -m pip install -r (Join-Path $mt5BridgeDir "requirements.txt")

if (Test-Path -LiteralPath $mt5Path) {
  Start-Process -FilePath $mt5Path
  Write-Host "Started MT5: $mt5Path"
} else {
  Write-Host "MT5 terminal not found at $mt5Path. Update scripts/launcher.config.json."
}

$bridgeCommand = "Set-Location -LiteralPath '$mt5BridgeDir'; & '$venvPython' -m uvicorn server:app --host $bridgeHost --port $bridgePort"
Start-HiddenProcess -Command $bridgeCommand
Write-Host "Started MT5 bridge on http://$bridgeHost`:$bridgePort"

if (-not (Test-Path -LiteralPath (Join-Path $root ".next\BUILD_ID"))) {
  Write-Host "Building the app (production)..."
  Push-Location $root
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed. See output above. If only a warning blocked the build, ensure all TS errors are fixed."
    }
  } finally {
    Pop-Location
  }
}

$appCommand = "Set-Location -LiteralPath '$root'; npm run start -- --hostname $appHost --port $appPort"
Start-HiddenProcess -Command $appCommand
Write-Host "Started app (production) on http://localhost:$appPort"

$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if ($null -ne $tailscale) {
  $tsIp = try { ((& tailscale ip -4 2>$null) | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1) } catch { $null }
  if ($tsIp) {
    Write-Host "Access remotely via Tailscale: http://$tsIp`:$appPort/ai-analyst"
  }
}

Start-Sleep -Seconds 8
Start-Browser "http://localhost:$appPort/ai-analyst"
