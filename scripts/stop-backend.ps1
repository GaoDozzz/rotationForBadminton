$ErrorActionPreference = 'Stop'

$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host 'Backend is not running on port 3000.'
  exit 0
}

$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  # Port ownership is resolved before stopping so this script never kills a
  # broad process-name match. This matters when several Node projects run at once.
  Stop-Process -Id $processId
  Write-Host "Stopped backend process $processId ($($process.ProcessName))."
}
