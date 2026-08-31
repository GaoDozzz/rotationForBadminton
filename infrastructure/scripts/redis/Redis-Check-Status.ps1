$ErrorActionPreference = 'Stop'
$docker = 'E:\Develop\Infrastructure\Docker\resources\bin\docker.exe'
try {
  if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI was not found.' }
  $status = & $docker inspect --format '{{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{end}}' zzjl-redis 2>$null
  $commandCode = $LASTEXITCODE
  if ($commandCode -ne 0) { Write-Host 'Check completed: Redis container is unavailable or not created.' -ForegroundColor Yellow; exit 0 }
  Write-Host "Check succeeded: Redis status is $status." -ForegroundColor Green
} catch {
  $failureCode = if ($commandCode) { $commandCode } else { 1 }
  Write-Error "Execution failed: $($_.Exception.Message); exit code: $failureCode"
  exit $failureCode
}
