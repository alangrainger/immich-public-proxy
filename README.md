# Immich Public Proxy

<p align="center" width="100%">
<img src="docs/public/ipp.svg" width="180" height="180">
</p>

<p align="center" width="100%">
<a href="https://hub.docker.com/r/alangrainger/immich-public-proxy/tags">
    <img alt="Docker pulls" src="https://badgen.net/docker/pulls/alangrainger/immich-public-proxy?icon=docker&label=docker%20pulls&color=green&scale=1.1"></a>
<a href="https://github.com/alangrainger/immich-public-proxy/releases/latest">
    <img alt="Latest release" src="https://badgen.net/github/tag/alangrainger/immich-public-proxy?scale=1.1&label=release"></a>
<a href="https://demo.ipp.nz/s/demo-gallery"><img alt="Open demo gallery" src="https://badgen.net/static/↗🖼️/live%20demo/green?scale=1.1"></a>
</p>

Share your Immich photos and albums in a safe way without exposing your Immich instance to the public. 


**This does not need an API key, or any privileged access to Immich.** Setup takes less than a minute, and you never need to touch it again as all of your sharing stays managed within Immich.

See a [Live demo gallery](https://demo.ipp.nz/s/demo-gallery) serving straight out of my own Immich instance.

<p align="center" width="100%">
<img src="docs/public/screenshot.webp" width="602" height="414" border="1px solid white">
</p>

## About this project

[Immich](https://github.com/immich-app/immich) is a wonderful bit of software, but since it holds all your private photos it's
best to keep it fully locked down. This presents a problem when you want to share a photo or a gallery with someone.

**Immich Public Proxy** provides a barrier of security between the public and Immich, and _only_ allows through requests
which you have publicly shared. It is stateless, needs no API key, and knows nothing about your Immich instance beyond
what you have shared.

Read more in the [Introduction](https://docs.ipp.nz/introduction), including
[why not just expose Immich's `/share/` path](https://docs.ipp.nz/introduction#why-not-expose-immich-directly).

## Quick start

1. Download the [docker-compose.yml](https://github.com/alangrainger/immich-public-proxy/blob/main/docker-compose.yml) file.
2. Set `IMMICH_URL` to the local (not public) URL of your Immich server, and `PUBLIC_BASE_URL` to the public URL of IPP.
3. Run `docker-compose up -d` and check that `https://photos.example.com/share/healthcheck` responds.
4. In Immich's **Server Settings**, set the "External domain" to your IPP URL. Every link Immich generates from now on
   points at the proxy.

If you use Cloudflare, set your `/share/video/*` path to Bypass Cache or videos may not play.

Full instructions, including Kubernetes: **[Installation](https://docs.ipp.nz/installation)**.

### Let visitors send photos back

Visitors can optimally add their own photos and videos to a share, for example guests at a wedding. See
**[Let visitors send photos back](https://docs.ipp.nz/visitor-uploads)**.

## Documentation

Everything is at **[docs.ipp.nz](https://docs.ipp.nz)**:

- [Installation](https://docs.ipp.nz/installation) and [Sharing from Immich](https://docs.ipp.nz/how-to-use)
- [Configuration](https://docs.ipp.nz/config/): downloads, gallery layout, lightbox, metadata privacy, error responses
- Guides: [let visitors send photos back](https://docs.ipp.nz/visitor-uploads),
  [single domain with Immich](https://docs.ipp.nz/running-on-single-domain),
  [redirect your root domain to a share](https://docs.ipp.nz/redirect-root-to-share),
  [securing Immich with mTLS](https://docs.ipp.nz/securing-immich-with-mtls)
- [Troubleshooting](https://docs.ipp.nz/troubleshooting)

## Feature requests

You can [add feature requests here](https://github.com/alangrainger/immich-public-proxy/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop),
however my goal with this project is to keep it as lean as possible.

IPP has **read-only** access to Immich and stores nothing: anything that needs an API key, modifies Immich, or would
require storing a share key won't be considered. Visitor uploads are the one write path, and they live in their own
optional container. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full list.

## Thanks

The gallery lightbox, with its zoom, swipe and keyboard navigation, is **[PhotoSwipe](https://photoswipe.com/)** by
[Dmytro Semenov](https://github.com/dimsemenov). It is a superb piece of work, MIT licensed, and IPP would be a much
poorer viewer without it. If you find it useful, consider [sponsoring the project](https://github.com/sponsors/dimsemenov).
