$ErrorActionPreference = 'Stop'
$docker = 'E:\Develop\Infrastructure\Docker\resources\bin\docker.exe'
$desktop = 'E:\Develop\Infrastructure\Docker\Docker Desktop.exe'
try {
  if (-not (Test-Path -LiteralPath $desktop)) { throw 'Docker Desktop is not installed.' }
  if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI was not found.' }
  $version = & $docker --version
  & $docker info 2>$null | Out-Null
  $commandCode = $LASTEXITCODE
  if ($commandCode -eq 0) { Write-Host "Check succeeded: Docker engine is running; $version" -ForegroundColor Green }
  else { Write-Host "Check completed: Docker is installed but the engine is stopped; exit code: $commandCode" -ForegroundColor Yellow }
} catch {
  $failureCode = if ($commandCode) { $commandCode } else { 1 }
  Write-Error "Execution failed: $($_.Exception.Message); exit code: $failureCode"
  exit $failureCode
}
