# Introduction

[Immich](https://github.com/immich-app/immich) is a wonderful bit of software, but since it holds all your private
photos it's best to keep it fully locked down. This presents a problem when you want to share a photo or a gallery
with someone.

**Immich Public Proxy** provides a barrier of security between the public and Immich, and _only_ allows through
requests which you have publicly shared.

It is stateless and does not know anything about your Immich instance. It does not require an API key which reduces
the attack surface even further. The only things that the proxy can access are photos that you have made publicly
available in Immich.

## How it works

When the proxy receives a request, it will come as a link like this:

```
https://your-proxy-url.com/share/ffSw63qnIYMtpmg0RNvOui0Dpio7BbxsObjvH8YZaobIjIAzl5n7zTX5d6EDHdOYEvo
```

The part after `/share/` is Immich's shared link public ID (called the `key` [in the docs](https://api.immich.app/endpoints/shared-links/getMySharedLink)).

**Immich Public Proxy** takes that key and makes an API call to your Immich instance over your local network, to ask
what photos or videos are shared in that share URL.

If it is a valid share URL, the proxy fetches just those assets via local API and returns them to the visitor as an
individual image or gallery.

If the shared link has expired or any of the assets have been put in the Immich trash, it will not return those.

All incoming data is validated and sanitised, and anything unexpected is simply dropped with a 404.

Ready to set it up? Head to [Installation](/installation).
