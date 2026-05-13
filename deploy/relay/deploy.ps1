param(
  [Parameter(Mandatory = $true)]
  [string]$Server,

  [string]$User = "root",
  [string]$RelayHost = "$Server.nip.io",
  [string]$RemoteDir = "/opt/yachoo"
)

$ErrorActionPreference = "Stop"
$target = "$User@$Server"
$healthUrl = "https://$RelayHost/health"

ssh $target "mkdir -p $RemoteDir"
scp -r Dockerfile package.json server deploy $target`:$RemoteDir/
ssh $target "cd $RemoteDir && sh deploy/relay/install-docker.sh && printf 'RELAY_HOST=%s\n' '$RelayHost' > .env && cp deploy/relay/yachoo-relay.service /etc/systemd/system/yachoo-relay.service && systemctl daemon-reload && systemctl enable --now yachoo-relay && systemctl restart yachoo-relay && systemctl status yachoo-relay --no-pager"
Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 20 | Select-Object -ExpandProperty Content
