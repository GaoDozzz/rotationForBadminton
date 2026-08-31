$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$checks = @(
  @{ Name = 'Node.js'; Path = 'E:\Develop\Nodejs\node.exe' },
  @{ Name = 'pnpm'; Path = 'E:\Develop\Tools\pnpm\pnpm.cmd' },
  @{ Name = 'Git'; Path = 'E:\Develop\Git\Git\cmd\git.exe' },
  @{ Name = 'Docker Desktop'; Path = 'E:\Develop\Infrastructure\Docker\Docker Desktop.exe' },
  @{ Name = 'PostgreSQL data'; Path = 'E:\Develop\Infrastructure\PostgreSQLData' },
  @{ Name = 'Redis data'; Path = 'E:\Develop\Infrastructure\RedisData' },
  @{ Name = 'Local credentials'; Path = Join-Path $projectRoot 'infrastructure\.env.local' },
  @{ Name = 'Dependencies'; Path = Join-Path $projectRoot 'node_modules' }
)
Write-Host 'ZZJL local development environment check' -ForegroundColor Cyan
foreach ($check in $checks) { $exists = Test-Path -LiteralPath $check.Path; Write-Host ('[{0}] {1}: {2}' -f $(if ($exists) {'OK'} else {'MISSING'}), $check.Name, $check.Path) -ForegroundColor $(if ($exists) {'Green'} else {'Red'}) }
foreach ($port in 3000,55432,6379) { $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; Write-Host ('Port {0}: {1}' -f $port, $(if ($listener) {'LISTENING'} else {'STOPPED'})) -ForegroundColor $(if ($listener) {'Green'} else {'Yellow'}) }
