# Troubleshooting

## Video playback

If you're using Cloudflare and having issues with videos not playing well, make sure your `/share/video/` paths are
set to bypass cache. I ran into this issue myself, and found
[some helpful advice here](https://community.cloudflare.com/t/mp4-wont-load-in-safari-using-cloudflare/10587/48).

<a href="/cloudflare-video-cache.webp"><img src="/cloudflare-video-cache.webp" style="width:70%" alt="Cloudflare cache bypass rule for video paths"></a>

I use Linux/Android, so this project is tested with BrowserStack for Apple/Windows devices.

## Can't reach Immich using `localhost:2283`

This is a normal Docker thing, nothing to do with IPP.

From inside a Docker container, you can't reach another container using `localhost`. You need to use a Docker network
IP or your server's IP address.

[Here's a guide on connecting Docker containers](https://dionarodrigues.dev/blog/docker-networking-how-to-connect-different-containers).

## IPP logs "Unable to reach Immich", but `curl` inside the container works

If IPP can't connect to Immich even though the container clearly can, you'll see this in the logs:

```
Unable to reach Immich on http://immich_server:2283
From the server IPP is running on, see if you can curl to http://immich_server:2283/api/server/ping and receive a JSON result.
```

yet running that same `curl` from a shell inside the container succeeds:

```
/app $ curl http://immich_server:2283/api/server/ping
{"res":"pong"}
```

This happens with both Docker Compose service names (like `immich_server`) and hostnames from a local DNS resolver
(for example an AdGuard Home or dnsmasq CNAME rewrite). It is a quirk of the musl libc used by the `node:alpine` base
image, not IPP itself.

Node's `fetch` asks for the IPv4 (A) and IPv6 (AAAA) records at once. If your resolver answers the AAAA query with
`NXDOMAIN` instead of the correct empty `NOERROR`, musl fails the whole lookup - even though the IPv4 address is valid
- and IPP reports the connection as failed. `curl` and glibc (the non-alpine `node` image) tolerate this, which is why
curl works and this only shows up here. The underlying error, hidden behind the log message above, is
`getaddrinfo ENOTFOUND`.

The reliable fix is to disable IPv6 for the container so only the IPv4 lookup happens. Add the `sysctls` block to your
service in `docker-compose.yml`:

```yaml
services:
  immich-public-proxy:
    image: alangrainger/immich-public-proxy:latest
    # ...your existing config...
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=1
      - net.ipv6.conf.default.disable_ipv6=1
```

Alternatively, point `IMMICH_URL` at Immich's IP address (a numeric address skips DNS resolution entirely), or fix
your resolver to return an empty `NOERROR` (NODATA) rather than `NXDOMAIN` for the missing AAAA record.

See issues [#203](https://github.com/alangrainger/immich-public-proxy/issues/203) and
[#263](https://github.com/alangrainger/immich-public-proxy/issues/263) for the full investigation.
