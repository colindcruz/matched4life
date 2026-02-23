$ErrorActionPreference = "Stop"

$envFilePath = Join-Path $PSScriptRoot ".env"
$port = 8788

if (Test-Path $envFilePath) {
  Get-Content $envFilePath | ForEach-Object {
    if ($_ -match "^\s*OTP_SERVER_PORT\s*=\s*(\d+)\s*$") {
      $port = [int]$matches[1]
    }
  }
}

$listenerLines = netstat -ano | Select-String ":$port"
$pids = @()
foreach ($line in $listenerLines) {
  if ($line.ToString() -match "\s+(\d+)\s*$") {
    $pids += [int]$matches[1]
  }
}

$uniquePids = $pids | Sort-Object -Unique
foreach ($processId in $uniquePids) {
  if ($processId -gt 0) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      Write-Host "Could not stop PID ${processId}: $($_.Exception.Message)"
    }
  }
}

Write-Host "Starting OTP server on port $port..."
node (Join-Path $PSScriptRoot "index.mjs")
