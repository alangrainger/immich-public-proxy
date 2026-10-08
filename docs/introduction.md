# Introduction

[Immich](https://github.com/immich-app/immich) is a wonderful bit of software, but since it holds all your private
photos it's best to keep it fully locked down. This presents a problem when you want to share a photo or a gallery
with someone.

**Immich Public Proxy** (IPP) provides a barrier of security between the public and Immich, and _only_ allows through
requests which you have publicly shared.

It is stateless and does not know anything about your Immich instance. It does not require an API key which reduces
the attack surface even further. The only things that the proxy can access are photos that you have made publicly
available in Immich.

## How it works

When the proxy receives a request, it will come as a link like this:

```
https://photos.example.com/share/ffSw63qnIYMtpmg0RNvOui0Dpio7BbxsObjvH8YZaobIjIAzl5n7zTX5d6EDHdOYEvo
```

The part after `/share/` is the shared link's key in Immich. A shared link with a custom URL in Immich uses that
instead, e.g. `https://photos.example.com/s/my-album`.

**Immich Public Proxy** takes that key and makes an API call to your Immich instance over your local network, to ask
what photos or videos are shared in that share URL.

If it is a valid share URL, the proxy fetches just those assets via local API and returns them to the visitor as an
individual image or gallery.

If the shared link has expired, or any of the assets have been put in the Immich trash or the locked folder, it will not return those.

All incoming data is validated and sanitised, and anything unexpected is simply dropped with a 404.

## Why not expose Immich directly?

A common alternative is to put Immich behind a reverse proxy and only expose its `/share/` path to the public. The
catch is that viewing a shared album in Immich also needs access to the `/api/` path, so that has to be public too,
and any existing or future vulnerability in it has the potential to compromise your whole Immich instance.

IPP removes that exposure: Immich stays private, and the only thing on the internet is a small read-only proxy that
can't do anything except serve what you have already shared. The ideal setup is Immich secured behind mTLS or a VPN,
with public access only to IPP. See [Securing Immich with mTLS](/securing-immich-with-mtls) for an example.

## Design principles

IPP holds to three rules, which also decide which feature requests are accepted:

- **Read-only.** IPP never modifies Immich or its files, and it needs no API key or privileged access. Anything that
  would require either will not be added. The one exception, visitor uploads, is a separate container that you add
  only if you want it (see [Visitor uploads](#visitor-uploads)).
- **Stateless.** No database, no accounts, and no stored share keys. The key in a share URL is what grants access to
  that share, so anything that would require IPP to remember one is unlikely to be added.
- **Small enough to audit.** Because IPP fronts a private photo library, the code stays small enough for someone
  with coding experience to review its security-relevant behaviour.

Feature requests are welcome in [GitHub Discussions](https://github.com/alangrainger/immich-public-proxy/discussions/categories/feature-requests),
with the goal of keeping IPP as lean as possible. [CONTRIBUTING.md](https://github.com/alangrainger/immich-public-proxy/blob/main/CONTRIBUTING.md)
lists what will not be accepted.

## Visitor uploads

Visitors to a share can send photos back to it, but only through a second container, `immich-public-proxy-upload`.
The IPP container has no code that accepts a file or writes to Immich. If you do not run the upload service, no part
of IPP can write to Immich.

The upload service follows the same rules as IPP in every other way. It needs no API key and keeps no state. It
uploads with the visitor's share key, so Immich itself checks the share's "Allow public user to upload" option on
every file. It never shows anything from your library, and it streams each file to Immich without storing it.

The setup is in [Let visitors send photos back](/visitor-uploads), which also explains
[why uploading is a separate container](/visitor-uploads#why-is-uploading-a-separate-container).

Ready to set it up? Head to [Installation](/installation).
