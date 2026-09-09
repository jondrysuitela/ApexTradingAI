$ErrorActionPreference = "Stop"

Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*uvicorn server:app*" -or $_.CommandLine -like "*next*dev*3000*" -or $_.CommandLine -like "*npm-cli.js run dev*3000*" } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }

Write-Host "Stopped launcher-managed processes."
