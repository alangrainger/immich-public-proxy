# Securing Immich

This section is about Immich itself, not IPP. It shows how to set Immich up so that your own or your family's devices can reach it
from anywhere, anyone can see what you share through IPP, and nothing else is on the internet. It is the setup the
rest of this site assumes.

## The goal

Three surfaces, and only the first one is public:

- **IPP** is on the internet. It serves only what you have shared and nothing else.
- **Immich** is reachable only by your own or your family's devices, from anywhere, after they prove who they are.
- **Nothing else** is listening.

Immich's login page protects your library from someone who has already reached it. It does not protect you from a
bug in the code that answers before you log in. Immich's maintainers leave protection at the network edge to you.

## What not to do

- **Forward port 2283** to the internet. Any bug in Immich is then reachable by anyone.
- **Rely on Immich's login page alone.** It only applies once a request has reached Immich.
- **Put a login page in front of the whole hostname**, such as Cloudflare Access with an identity provider, or
  Authelia or Authentik forward-auth. The Immich app cannot log in through it and reports "Could not connect to
  server". Use
  your identity provider as an [OAuth provider inside Immich](https://docs.immich.app/administration/oauth/) instead.
- **Use basic auth as a substitute.** It is one shared password for every device, with the same limits as the
  secret header.
- **Hide behind an unusual port or hostname.** Port scanners and certificate transparency logs find both.
- **Leave a Cloudflare Tunnel or proxy hostname open** with nothing checking who is calling. It is still reachable
  by anyone.

## Choose a route

| | A: Cloudflare | B: Your own reverse proxy | C: VPN |
|---|---|---|---|
| Unauthenticated traffic stops at | Cloudflare's edge, before your connection | Your reverse proxy, on your connection | Nothing is listening |
| Needs a public IP address | No: Cloudflare Tunnel works behind CGNAT | Yes | No |
| Your home IP address | Hidden | Published in DNS | Not published |
| Largest upload from the app | 100 MB on the Free and Pro plans | Whatever your proxy allows | No limit |
| Third party in the path | Cloudflare terminates TLS and sees the traffic | None | Only the coordination server; traffic is end to end |
| On each device | A certificate or a secret header in the Immich app | Same | The VPN app, kept running |
| Sharing with non-members | Through IPP | Through IPP | Through IPP |

### A: Cloudflare

The recommended route for most setups. Cloudflare refuses unauthenticated traffic at its edge, absorbs attacks, hides
your home IP address, and Cloudflare Tunnel works without a public IP. On the free plan,
[Cloudflare client certificates](https://developers.cloudflare.com/ssl/client-certificates/) check a certificate at
the edge, and [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)
stop requests that skipped the edge from reaching your proxy.

Cloudflare sits in the middle of your traffic, and its 100 MB request limit on the Free and Pro plans blocks large
video uploads from the app.

Guide: [Cloudflare](/securing-immich/cloudflare).

### B: Your own reverse proxy

Your reverse proxy serves Immich on a public hostname and refuses any connection that does not present a client
certificate you issued. Nothing reaches Immich without one. No third party, no size limit, but your IP address is in
DNS and your connection absorbs whatever arrives. Needs a public IP.

Guide: [Your own reverse proxy](/securing-immich/reverse-proxy).

### C: VPN

Immich is not on the internet at all. Each device joins a private network and reaches Immich as if it were at home:
[Tailscale](https://tailscale.com/kb/1017/install), [WireGuard](https://www.wireguard.com/quickstart/), or
[Cloudflare WARP with a private network route](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/)
if you are already on Cloudflare. No port to open, works behind CGNAT, nothing per device beyond the VPN app, and
the Immich app needs no certificate.

Every device needs the VPN app running, phones may suspend background upload while it is off, and nobody outside
the network can reach Immich, so sharing goes through IPP. IPP still needs a public route, through a reverse proxy
or Cloudflare. The vendors' own docs cover the setup.

## How your devices prove who they are

Routes A and B need each device to identify itself before it reaches Immich. There are two ways:

- **A client certificate.** One per person or device, so any one can be revoked on its own. Browsers and the
  Immich app both use it. See [Client certificates](/securing-immich/client-certificates) and
  [Install the certificate on your devices](/securing-immich/devices).
- **A secret header.** The app sends a header of your choosing on every request, and the proxy or Cloudflare
  refuses requests without it. It is a shared secret rather than an identity, and a browser cannot send it.

The trade-offs are on [Authenticating the Immich app](/securing-immich/immich-app).

## Hardening checklist

Whichever route you take:

- **Immich's port is published to nobody.** Only the proxy and IPP reach it, on an internal Docker network or the
  LAN. Never forward 2283.
- **The proxy forwards everything Immich needs**: WebSockets, large request bodies, long timeouts, the forwarded
  headers, and the whole hostname rather than a path. The settings are in
  [Immich's reverse proxy page](https://docs.immich.app/administration/reverse-proxy) and included in
  [Your own reverse proxy](/securing-immich/reverse-proxy).
- **IPP runs locked down**, with `read_only`, `cap_drop: ALL` and `no-new-privileges` as in the compose file on
  [Installation](/installation).
- **IPP and Immich have separate hostnames**, or follow [Single domain with Immich](/running-on-single-domain)
  if they must share one.
- **[`PUBLIC_BASE_URL`](/config/environment-variables#public_base_url) is set**, so link previews never show a
  private address.
- **IPP is rate limited at the proxy**, with the proxy's own limiter or fail2ban. If you run the upload service,
  limit its hostname or path separately. On Cloudflare, a country block is one rule if your visitors are all in one
  place.
- **Immich and IPP are kept updated.** See [Upgrading](/upgrading).
- **The CA key and the `.pfx` files are backed up** somewhere other than the server, if you issue your own
  certificates.

## Where IPP sits

IPP is the only public surface. It has no API key, keeps no state and serves only what you have shared. Give it its
own hostname on the same proxy, with no certificate requirement, as in
[Put IPP behind a reverse proxy](/reverse-proxy). If you run the upload service, see
[Tag and review visitor uploads](/tag-and-review-uploads) for what that adds.
