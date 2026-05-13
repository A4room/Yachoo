# Yachoo Relay Deployment

This runs the relay as a Docker Compose stack with:

- `yachoo-relay`: Node WebSocket relay on internal port `8080`
- `caddy`: public HTTPS/WSS reverse proxy on ports `80` and `443`
- Docker restart policy: `unless-stopped`
- systemd unit: starts the stack after reboot
- `/health`: relay health endpoint

## Server Requirements

- Linux VPS with public ports `80` and `443` open
- Docker Engine with the Compose plugin
- DNS name pointing to the VPS. `49.50.129.67.nip.io` works if the VPS IP is `49.50.129.67`.

## Deploy From Windows

```powershell
.\deploy\relay\deploy.ps1 -Server 49.50.129.67 -User root -RelayHost 49.50.129.67.nip.io
```

## Verify

```powershell
Invoke-WebRequest -Uri "https://49.50.129.67.nip.io/health" -UseBasicParsing
```

The browser client should use:

```js
const RELAY_URLS = ["wss://49.50.129.67.nip.io", "wss://49.50.129.67.nip.io:8080"];
```
