$ErrorActionPreference = 'Stop'
$desktop = 'E:\Develop\Infrastructure\Docker\Docker Desktop.exe'
try {
  if (-not (Test-Path -LiteralPath $desktop)) { throw 'Docker Desktop is not installed.' }
  if (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue) {
    Write-Host 'Start succeeded: Docker Desktop is already running.' -ForegroundColor Green
  } else {
    Start-Process -FilePath $desktop
    Write-Host 'Start succeeded: Docker Desktop launch was requested. First launch may still require license or WSL confirmation.' -ForegroundColor Green
  }
} catch {
  Write-Error "Execution failed: $($_.Exception.Message); exit code: 1"
  exit 1
}
