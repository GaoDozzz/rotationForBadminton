$ErrorActionPreference = 'Stop'
$docker = 'E:\Develop\Infrastructure\Docker\resources\bin\docker.exe'
try {
  if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI was not found.' }
  & $docker desktop stop 2>$null
  $commandCode = $LASTEXITCODE
  if ($commandCode -ne 0) { throw "docker desktop stop returned exit code $commandCode" }
  Write-Host 'Stop succeeded: Docker Desktop is stopped.' -ForegroundColor Green
} catch {
  $failureCode = if ($commandCode) { $commandCode } else { 1 }
  Write-Error "Execution failed: $($_.Exception.Message); exit code: $failureCode"
  exit $failureCode
}
