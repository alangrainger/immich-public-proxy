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
bug in the code that answers before you log in. Immich's maintainers leave protection at the network edge to you,
and that is what this section covers.

## What not to do

- **Forward port 2283** to the internet. Immich is then one bug away from anyone.
- **Rely on Immich's login page alone.** It is the last line of defence, not the first.
- **Put a login page in front of the whole hostname**, such as Cloudflare Access with an identity provider, or
  Authelia or Authentik forward-auth. The Immich app cannot log in through it and reports "Server not reachable". Use
  your identity provider as an [OAuth provider inside Immich](https://docs.immich.app/administration/oauth/) instead.
- **Use basic auth as a substitute.** The app's support for it is experimental and breaks the same features as a
  client certificate does.
- **Hide behind an unusual port or hostname.** Scanners find both.
- **Leave a Cloudflare Tunnel or proxy hostname open** with nothing checking who is calling. It is a public hostname
  like any other.

## Choose a route

| | A: Cloudflare | B: Your own reverse proxy | C: VPN |
|---|---|---|---|
| Unauthenticated traffic stops at | Cloudflare's edge, before your connection | Your reverse proxy, on your connection | Nothing is listening |
| Needs a public IP address | No: Cloudflare Tunnel works behind CGNAT | Yes | No |
| Your home IP address | Hidden | Published in DNS | Not published |
| Largest upload from the app | 100 MB on the Free and Pro plans | Whatever your proxy allows | No limit |
| Third party in the path | Cloudflare terminates TLS and sees the traffic | None | Only the coordination server; traffic is end to end |
| On each device | A certificate or a secret header in the Immich app | Same | The VPN app, kept running |
| Video playback in the app from outside | Not with a certificate in the app | Same | Works |
| Sharing with non-members | Through IPP | Through IPP | Through IPP |

### A: Cloudflare

The simplest route for most people. Cloudflare refuses unauthenticated traffic at its edge, absorbs attacks, hides
your home IP address, and Cloudflare Tunnel works without a public IP. On the free plan,
[Cloudflare client certificates](https://developers.cloudflare.com/ssl/client-certificates/) check a certificate at
the edge, and [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/)
stop requests that skipped the edge from reaching your proxy.

The costs: Cloudflare sits in the middle of your traffic, and its 100 MB request limit on the Free and Pro plans
blocks large video uploads from the app. A step-by-step guide for this route is coming.

### B: Your own reverse proxy

Your reverse proxy serves Immich on a public hostname and refuses any connection that does not present a client
certificate you issued. Nothing reaches Immich without one. No third party, no size limit, but your IP address is in
DNS and your connection absorbs whatever arrives. Needs a public IP.

Guide: [Your own reverse proxy](/securing-immich/reverse-proxy).

### C: VPN

Immich is not on the internet at all. Each device joins a private network, such as Tailscale, WireGuard or Cloudflare
WARP, and reaches Immich as if it were at home. The app works completely, video included, with no certificates.

The costs: every device needs the VPN app running, phones may suspend background upload while it is off, and nobody
outside the network can reach Immich, which is what IPP is for. IPP still needs a public route, through a reverse
proxy or Cloudflare. The vendors' own docs cover the setup.

## How your devices prove who they are

Routes A and B need each device to identify itself before it reaches Immich. There are two ways:

- **A client certificate.** One per person or device, so any one can be revoked on its own. Browsers use the
  operating system's certificate store; the Immich app imports its own copy. Immich calls the app's support
  experimental: video playback in the app does not present the certificate, so videos play only on the web or over a
  VPN. See [Client certificates](/securing-immich/client-certificates).
- **A secret header.** The app can send a header of your choosing on every request, and the proxy or Cloudflare
  refuses requests without it. It is a shared secret rather than an identity, so changing it means changing it on
  every device, and a browser cannot send it.

## Where IPP sits

IPP is the only public surface. It has no API key, keeps no state and serves only what you have shared. Give it its
own hostname on the same proxy, with no certificate requirement, as in
[Put IPP behind a reverse proxy](/reverse-proxy). If you run the upload service, see
[Tag and review visitor uploads](/tag-and-review-uploads) for what that adds.
