# Troubleshooting

## Video playback

If you're using Cloudflare and videos do not play well, set your `/share/video/*` paths to bypass cache. See
[this Cloudflare community thread](https://community.cloudflare.com/t/mp4-wont-load-in-safari-using-cloudflare/10587/48)
for the background.

<a href="/cloudflare-video-cache.webp"><img src="/cloudflare-video-cache.webp" style="width:70%" alt="Cloudflare cache bypass rule for video paths"></a>

## "Download all" fails partway through

If you use Cloudflare with a "cache everything" rule and large zip downloads stop with a browser error after a few
seconds, add a cache rule that bypasses cache for `/share/*/download` and `/s/*/download`, the same as for
`/share/video/*` above. The zip is streamed as it is fetched from Immich, and Cloudflare's cache cuts those downloads
short.

IPP sends the zip with `Cache-Control: no-store`, which is enough on its own if your cache rule's Edge TTL is set to
respect the origin. If the rule overrides the Edge TTL, Cloudflare ignores that header and you need the bypass rule.

## Uploads fail with "Too large for this server"

Something in front of the upload service refused the file before it arrived. The upload service's own limit gives a
different message that names the size.

- **Cloudflare** refuses requests over 100 MB on the Free and Pro plans, Cloudflare Tunnel included. Set
  [`upload.maxFileSize`](/config/upload-service#maxfilesize) to `100` so the upload page turns away larger files
  before sending them, with a message that says the limit.
- **nginx** allows 1 MB by default. Set `client_max_body_size` to at least `upload.maxFileSize`.

See [Request size limits](/visitor-uploads#request-size-limits).

## The "Add photos" button does not appear

The upload service runs and its `/healthcheck` answers `ok`, but a share with **Allow public user to upload** turned
on shows no button in the gallery. View the gallery page's source and look for `id="upload-link"`:

- **The page source has no `upload-link`, and the script URL is `/share/static/3.x.x/...`.** IPP is still 3.x, which
  has no upload button. Restarting a container does not update it. Run `docker compose pull` and then
  `docker compose up -d` (in Dockge, use **Update**, not **Restart**). See [Updating IPP](/upgrading#updating-ipp).
- **No `upload-link`, and the version is 4.0 or newer.** IPP sees no upload service to link to: either the share's
  upload option is off in Immich, or [`uploadUrl`](/config/ipp-options#uploadurl) is set to an empty string or
  something other than a path or an absolute URL. A changed `config.json` or `CONFIG` needs a restart.
- **`upload-link` is there with a `hidden` attribute.** IPP assumed the service at `/upload` on its own hostname and
  the browser's check of `/upload/healthcheck` there did not answer `ok`. Open that URL on the **gallery** hostname,
  for example `https://photos.example.com/upload/healthcheck`. An empty page means the reverse proxy sent the
  request to IPP rather than to the upload service, so add or fix the `/upload` route. If the upload service has its
  own hostname, set [`uploadUrl`](/config/ipp-options#uploadurl) to it in IPP's config; a setting elsewhere in the
  compose file does nothing.

See [Let visitors send photos back](/visitor-uploads#check-the-route) and
[issue #300](https://github.com/alangrainger/immich-public-proxy/issues/300).

## The upload page asks for the password again, or its script is a 404

The upload page opens from the gallery's **Add photos** button, but a password-protected share asks for its
password again and refuses the right one, or the browser's network tab shows a 404 for
`/share/static/<version>/js/client/upload.js` on the gallery hostname.

The reverse proxy is stripping `/upload` from the path before it reaches the upload service. The service then writes
its links without that prefix, so the page's script and its password form go to IPP instead of back to the upload
service. The password is accepted by IPP, which the gallery had already unlocked, and the upload service never
sees it.

In nginx the cause is a trailing slash on the upload `proxy_pass`: `proxy_pass http://ipp-upload:3000/;` replaces
the matched `/upload/` with that `/`. Remove the slash so the path is passed as is:

```nginx
location /upload/ {
    proxy_pass http://ipp-upload:3000;
}
```

In Caddy, use `handle /upload/*`, not `handle_path`, which strips the prefix. See
[Route it through your reverse proxy](/visitor-uploads#route-it-through-your-reverse-proxy) and
[issue #301](https://github.com/alangrainger/immich-public-proxy/issues/301).

## Link previews show `http://` or a private IP

The gallery itself uses relative URLs, so it works behind any reverse proxy. The one place IPP needs a fully qualified
URL is the `og:image` tag that messaging apps use for link previews. Without `PUBLIC_BASE_URL`, IPP builds it from the
incoming request, and behind a TLS-terminating reverse proxy that request arrives as plain `http://` on whatever
hostname or IP the proxy used.

Set `PUBLIC_BASE_URL` in your `docker-compose.yml` to the public address of IPP, without a trailing slash:

```yaml
environment:
  PUBLIC_BASE_URL: https://your-proxy-url.com
```

If you serve IPP from several domains, leave it unset and make sure your reverse proxy forwards the original `Host`
header. See [Running on a single domain](/running-on-single-domain).

## Container won't start after mounting `config.json`

Docker refuses to start the container, with an error that ends:

```
Are you trying to mount a directory onto a file (or vice-versa)? Check if the specified host path exists and is the expected type
```

The file on the left of the volume line doesn't exist. When the source of a bind mount is missing, Docker creates an
empty directory in its place, and a directory can't be mounted over the `config.json` file inside the image.

Check that your `config.json` is at that path. A relative path such as `./config.json` resolves from the folder that
holds `docker-compose.yml`. A Portainer stack resolves it inside Portainer's own data folder instead, so use an
absolute path there:

```yaml
    volumes:
      - /opt/immich-public-proxy/config.json:/app/config.json:ro
```

Delete the empty directory Docker created, then recreate the container. See
[#83](https://github.com/alangrainger/immich-public-proxy/issues/83).

## Can't reach Immich using `localhost:2283`

This is a normal Docker thing, nothing to do with IPP.

From inside a Docker container, you can't reach another container using `localhost`. You need to use a Docker network
IP or your server's IP address.

[Here's a guide on connecting Docker containers](https://dionarodrigues.dev/blog/docker-networking-how-to-connect-different-containers).

## IPP logs "Unable to reach Immich", but `curl` inside the container works

If IPP can't connect to Immich even though the container clearly can, you'll see this in the logs:

```
Unable to reach Immich on http://immich_server:2283
From the container IPP is running in, run this and check you receive a JSON result: node -e "fetch('http://immich_server:2283/api/server/ping').then(r => r.text()).then(console.log).catch(console.error)"
Avoid testing with curl - curl uses its own DNS resolver and can succeed even when the resolver Node/IPP uses (musl getaddrinfo) fails.
```

yet `curl` from a shell inside the container succeeds:

```
/app $ curl http://immich_server:2283/api/server/ping
{"res":"pong"}
```

This happens with both Docker Compose service names (like `immich_server`) and hostnames from a local DNS resolver
(for example an AdGuard Home or dnsmasq CNAME rewrite). The cause is the DNS lookup, not IPP: Node asks for the IPv4
and IPv6 addresses at once, and if your resolver answers the IPv6 query with `NXDOMAIN` instead of an empty `NOERROR`,
the Alpine base image fails the whole lookup even though the IPv4 address is fine. `curl` tolerates this, which is why
it works from a shell and why the log suggests the `node -e` command instead: it uses the same resolver as IPP, so it
fails the same way. The underlying error is `getaddrinfo ENOTFOUND`.

The reliable fix is to disable IPv6 for the container, so only the IPv4 lookup happens. Add the `sysctls` block to
your service in `docker-compose.yml`:

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
