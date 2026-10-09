# Your own reverse proxy

Your reverse proxy serves Immich on its own public hostname and refuses any connection that does not present a
client certificate signed by your own certificate authority. Nothing reaches Immich without one. This page has the
certificate check and everything else Immich needs from a reverse proxy.

## Before you start

1. Immich's port is not published to the internet. Only the proxy reaches it, on a Docker network or the LAN. In the
   examples, `immich-address:2283` is that address.
2. Create a certificate authority and a certificate for each device, as in
   [Client certificates](/securing-immich/client-certificates). The proxy needs only `client-ca.crt`. The `.pfx` files are for
   your devices.
3. Give Immich and IPP separate hostnames, for example `immich.example.com` and `photos.example.com`. The certificate
   check applies to a whole hostname, and IPP's visitors have no certificate.

## Caddy

Mount the `certs/` folder into the container:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./certs:/data/certs:ro
      - ./data:/data
      - ./config:/config
```

```
immich.example.com {
    tls {
        client_auth {
            mode require_and_verify
            trusted_ca_cert_file /data/certs/client-ca.crt
        }
    }
    reverse_proxy immich-address:2283
}
```

Caddy obtains the hostname's certificate, forwards WebSockets and the forwarded headers, and sets no request size
limit or timeout, so no further settings are needed.

## nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name immich.example.com;

    ssl_certificate     /etc/nginx/certs/immich.example.com.crt;
    ssl_certificate_key /etc/nginx/certs/immich.example.com.key;

    # Refuse connections without a certificate signed by your CA
    ssl_client_certificate /etc/nginx/certs/client-ca.crt;
    ssl_verify_client on;

    # Large uploads and long video transfers
    client_max_body_size 50000M;
    proxy_request_buffering off;
    client_body_buffer_size 1024k;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    send_timeout 600s;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_redirect off;

    location / {
        proxy_pass http://immich-address:2283;
        # WebSockets, or the web UI shows "Server Status Offline"
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Traefik

Mount the `certs/` folder into the container:

```yaml
services:
  traefik:
    image: traefik:3.5
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config:/etc/traefik
      - ./certs:/etc/traefik/certs:ro
```

Raise the entry point's timeouts in `traefik.yaml`, or video uploads fail after a minute:

```yaml
entryPoints:
  websecure:
    address: :443
    transport:
      respondingTimeouts:
        readTimeout: 600s
        idleTimeout: 600s
```

Then a dynamic configuration file:

```yaml
http:
  services:
    immich:
      loadBalancer:
        servers:
          - url: "http://immich-address:2283"

  routers:
    immich:
      entryPoints:
        - websecure
      service: immich
      rule: "Host(`immich.example.com`)"
      tls:
        certResolver: letsencrypt
        options: immich-mtls

tls:
  options:
    immich-mtls:
      minVersion: VersionTLS12
      clientAuth:
        caFiles:
          - /etc/traefik/certs/client-ca.crt
        clientAuthType: RequireAndVerifyClientCert
```

Traefik forwards WebSockets and the forwarded headers on its own.

## Secret header instead of a certificate

The Immich app can send a header of your choosing on every request, which also covers video playback. See [Authenticating the Immich app](/securing-immich/immich-app) for the trade-offs.
The proxy then refuses any request without the right value. These blocks replace the certificate check above;
`long-random-secret` is the value you put in the app.

**Caddy**

```
immich.example.com {
    @app header X-Immich-Key "long-random-secret"
    handle @app {
        reverse_proxy immich-address:2283
    }
    handle {
        respond 403
    }
}
```

**nginx**, inside the `location /` block, before `proxy_pass`, with the two `ssl_client_certificate` and
`ssl_verify_client` lines removed:

```nginx
        if ($http_x_immich_key != "long-random-secret") {
            return 403;
        }
```

**Traefik**, on the router, with the `options: immich-mtls` line removed:

```yaml
      rule: "Host(`immich.example.com`) && Header(`X-Immich-Key`, `long-random-secret`)"
```

## Certificate or header

The common setup: phones send the header, browsers present a certificate, and the proxy accepts either.

**Caddy**

```
immich.example.com {
    tls {
        client_auth {
            mode verify_if_given
            trusted_ca_cert_file /data/certs/client-ca.crt
        }
    }
    @allowed expression `{tls_client_subject} != "" || {header.X-Immich-Key} == "long-random-secret"`
    handle @allowed {
        reverse_proxy immich-address:2283
    }
    handle {
        respond 403
    }
}
```

`verify_if_given` checks a certificate when one is presented and lets a connection without one through to the
header check.

**nginx**: change `ssl_verify_client on` to `ssl_verify_client optional`, add this `map` outside the `server`
block, and the `if` inside `location /`:

```nginx
map "$ssl_client_verify:$http_x_immich_key" $immich_allowed {
    default                     0;
    "~^SUCCESS:"                1;
    "NONE:long-random-secret"   1;
}
```

```nginx
        if ($immich_allowed = 0) {
            return 403;
        }
```

**Traefik** cannot route on whether a certificate was presented, so use two hostnames: `immich.example.com` with the
certificate check above for browsers, and a second router such as `immich-app.example.com` with the header rule for
the app.

## Check it

Without a certificate, the connection must fail. From any machine:

```bash
curl https://immich.example.com/api/server/ping
```

nginx answers `400 No required SSL certificate was sent`; Caddy and Traefik close the connection during the TLS
handshake. With a certificate, Immich answers:

```bash
curl --cert-type P12 --cert client.pfx:your-password https://immich.example.com/api/server/ping
```

```json
{"res":"pong"}
```

With a header rule, the same check is:

```bash
curl -H "X-Immich-Key: long-random-secret" https://immich.example.com/api/server/ping
```

Then log in on the web with the certificate installed in your browser and check that the server status in the
bottom left reads **Online**. **Offline** means WebSockets are not being forwarded.

## Your devices

Install a certificate or set the header on each device, then point the Immich app at `https://immich.example.com`.
The steps for the app, Android, iPhone and desktop browsers are in
[Install the certificate on your devices](/securing-immich/devices).

## IPP on the same proxy

Add IPP as a second hostname on the same proxy with no certificate check, as in
[Put IPP behind a reverse proxy](/reverse-proxy). IPP reaches Immich on the internal address, not through this
hostname, so it never needs a certificate.
