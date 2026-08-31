$ErrorActionPreference = 'Stop'
$docker = 'E:\Develop\Infrastructure\Docker\resources\bin\docker.exe'
$project = 'E:\Develop\Program\WeChatProjects\badminton'
try {
  if (-not (Test-Path -LiteralPath $docker)) { throw 'Docker CLI was not found.' }
  & $docker compose --project-directory $project --env-file "$project\infrastructure\.env.local" up -d postgres
  $commandCode = $LASTEXITCODE
  if ($commandCode -ne 0) { throw "docker compose returned exit code $commandCode" }
  Write-Host 'Start succeeded: PostgreSQL is available at 127.0.0.1:55432.' -ForegroundColor Green
} catch {
  $failureCode = if ($commandCode) { $commandCode } else { 1 }
  Write-Error "Execution failed: $($_.Exception.Message); exit code: $failureCode"
  exit $failureCode
}
