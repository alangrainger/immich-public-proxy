# Put IPP behind a reverse proxy

IPP listens on plain HTTP on port 3000 and expects a reverse proxy in front of it to terminate TLS and give it a public
hostname. Any proxy will do. This page gives the minimal config for the common ones and the few things IPP needs from
whichever you use.

## What the proxy must do

- **Terminate TLS** and forward every request to the IPP container on port 3000. The gallery uses relative URLs, so
  no path rewriting is needed, and IPP serves from the root of its hostname or from `/share` and `/s` on a domain it
  shares with Immich.
- **Match `PUBLIC_BASE_URL`.** Set [`PUBLIC_BASE_URL`](/config/environment-variables#public_base_url) on the IPP
  container to the public `https://` address the proxy serves it on. IPP uses it for the `og:image` tag that messaging
  apps read for link previews. Without it, IPP builds that URL from the request it receives, which behind a
  TLS-terminating proxy is plain `http://`. If you must leave it unset, make sure the proxy forwards the original
  `Host` header.
- **Allow large uploads** only if you run the [upload service](/visitor-uploads). IPP itself needs no request size
  settings. See [Request size limits](/visitor-uploads#request-size-limits).

In the examples, `ipp-address:port` is the address your reverse proxy reaches the IPP container on: the server's IP
or hostname and the published port, `3000` with the default compose file.

## Caddy

```
photos.example.com {
    reverse_proxy ipp-address:port
}
```

Caddy obtains the certificate and forwards the `Host` header on its own.

## nginx

```nginx
server {
    listen 443 ssl;
    server_name photos.example.com;

    location / {
        proxy_pass http://ipp-address:port;
        proxy_set_header Host $host;
    }
}
```

Add your `ssl_certificate` lines as for any other site.

## Traefik

A dynamic configuration file, in the same style as the [mTLS guide](/securing-immich-with-mtls#using-traefik):

```yaml
http:
  services:
    ipp:
      loadBalancer:
        servers:
          - url: "http://ipp-address:port"

  routers:
    ipp:
      entryPoints:
        - websecure
      service: ipp
      rule: "Host(`photos.example.com`)"
      tls:
        certResolver: letsencrypt
```

## Cloudflare

If Cloudflare proxies the domain, set the `/share/video/*`, `/share/*/download` and `/s/*/download` paths to
**Bypass Cache**, otherwise video playback and zip downloads can fail. Cloudflare also refuses request bodies over
100 MB on the Free and Pro plans, which matters only for the [upload service](/visitor-uploads#request-size-limits).

## Check it

Visit `https://photos.example.com/share/healthcheck`. It returns `ok` when the proxy reaches IPP and IPP reaches
Immich. If link previews in a messaging app show `http://` or a private address, see
[Troubleshooting](/troubleshooting#link-previews-show-http-or-a-private-ip).

## Other recipes

- [Single domain with Immich](/running-on-single-domain): send only `/share/*` and `/s/*` to IPP.
- [Let visitors send photos back](/visitor-uploads#route-it-through-your-reverse-proxy): route the upload service as
  a path or its own hostname.
- [Redirect root domain to a share](/redirect-root-to-share).
- [Custom error pages from the proxy](/config/error-responses#customising-the-response-using-your-reverse-proxy).
- [Securing Immich with mTLS](/securing-immich-with-mtls): lock Immich itself down so only IPP is public.
