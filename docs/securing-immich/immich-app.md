# Authenticating the Immich app

With Cloudflare or your own reverse proxy in front of Immich, the app has to get past the certificate check or the
header rule before it can log in. The app has two ways to do that, both under **Settings**, **Advanced**, and both
marked [experimental](https://docs.immich.app/FAQ/) by Immich. This page compares them; [Install the certificate on your devices](/securing-immich/devices)
has the steps.

## Client certificate

The app imports the same `.pfx` file a browser would use. It keeps its own copy: it does not read the phone's
certificate store, so installing the certificate on Android or iOS does nothing for the app.

What works: logging in, browsing, backup and the photo viewer.

What does not:

- **Video playback.** The app's video player does not present the certificate, so videos fail to play from outside
  while photos work.
- **iOS widgets** cannot use it.
- **App updates** sometimes drop it. Import it again from the login screen.

## Secret header

Under **Custom proxy headers** the app sends a header of your choosing with every request, video playback included,
and the proxy or Cloudflare refuses requests without the right value.

Its limits:

- It does not identify a device. Every device sends the same value, so cutting one device off means changing the
  value on all of them.
- A browser cannot send it, so web access from outside still needs a certificate or a VPN.
- It is sent inside TLS, so it cannot be read in transit, but it is visible in the app's settings.

Use a long random value, for example from:

```bash
openssl rand -hex 32
```

## Which to use

| | Certificate | Secret header |
|---|---|---|
| Revoke one device | Yes, on its own | Change it everywhere |
| Video in the app from outside | No | Yes |
| Works in a browser | Yes | No |
| iOS widgets | No | Yes |

The common setup is both: the header on phones, a certificate in browsers, and the proxy accepting either. The
config for that is under [Certificate or header](/securing-immich/reverse-proxy#certificate-or-header).
