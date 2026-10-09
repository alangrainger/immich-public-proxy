# Authenticating the Immich app

With Cloudflare or your own reverse proxy in front of Immich, the app has to get past the certificate check or the
header rule before it can log in. The app has two ways to do that, both under **Settings**, **Advanced**.
This page compares them; [Install the certificate on your devices](/securing-immich/devices) has the steps.

## Client certificate

The app presents a client certificate on every request, video playback included. On Android it uses a certificate
installed in the phone's own store, the same one the browser uses, and you pick it in the app. On iOS the app imports
the `.pfx` file itself. Either way the certificate can only be added or removed before you log in.

## Secret header

Under **Custom proxy headers** the app sends a header of your choosing with every request, and the proxy or
Cloudflare refuses requests without the right value.

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

A certificate, unless you have a reason not to issue one per device. It is the same file for the app and the
browser, and one device can be revoked without touching the others. The header is simpler to hand out, and the proxy
can accept either; the config for that is under
[Certificate or header](/securing-immich/reverse-proxy#certificate-or-header).
