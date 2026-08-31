$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeDirectory = 'E:\Develop\Nodejs'
$pnpmPath = 'E:\Develop\Tools\pnpm\pnpm.cmd'
$environmentFile = Join-Path $projectRoot 'infrastructure\.env.local'

if (-not (Test-Path -LiteralPath (Join-Path $nodeDirectory 'node.exe'))) { throw 'Missing E:\Develop\Nodejs\node.exe.' }
if (-not (Test-Path -LiteralPath $pnpmPath)) { throw 'Missing E:\Develop\Tools\pnpm\pnpm.cmd.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) { throw 'Dependencies are missing. Run pnpm install first.' }
if (-not (Test-Path -LiteralPath $environmentFile)) { throw 'Missing infrastructure\.env.local.' }

$port = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($port) { throw ('Port 3000 is already owned by process {0}.' -f $port.OwningProcess) }

# Load only this project's local environment file into the child backend process.
foreach ($line in Get-Content -LiteralPath $environmentFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $parts = $trimmed.Split('=', 2)
  if ($parts.Count -eq 2) { Set-Item -Path ('Env:' + $parts[0]) -Value $parts[1] }
}

$env:Path = "$nodeDirectory;$env:Path"
$env:NODE_ENV = 'development'
Set-Location -LiteralPath $projectRoot
Write-Host 'Starting backend at http://127.0.0.1:3000/api/v1' -ForegroundColor Cyan
Write-Host 'PostgreSQL and Redis must be healthy for event operations. Press Ctrl+C to stop.' -ForegroundColor DarkGray
& $pnpmPath dev:server
