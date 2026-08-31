$ErrorActionPreference = 'Stop'
$ruleName = 'ZZJL Dev API TCP 3000'

try {
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Allow -Profile Any
    Set-NetFirewallAddressFilter -AssociatedNetFirewallRule $existing -RemoteAddress LocalSubnet
    Set-NetFirewallPortFilter -AssociatedNetFirewallRule $existing -Protocol TCP -LocalPort 3000
  } else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Any -RemoteAddress LocalSubnet | Out-Null
  }
  Write-Host 'Configuration succeeded: LocalSubnet can access TCP port 3000.' -ForegroundColor Green
  exit 0
} catch {
  Write-Error "Configuration failed: $($_.Exception.Message); exit code: 1"
  exit 1
}
