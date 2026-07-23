# Installation

## Install with Docker / Podman

1. Download the [docker-compose.yml](https://github.com/alangrainger/immich-public-proxy/blob/main/docker-compose.yml)
   file.

2. Update the value for `IMMICH_URL` in your docker-compose file to point to your local URL for Immich. **This should
   not be a public URL.** Most likely this will be a local IP and port; whatever your Immich container runs on.

3. Update or remove the value for `PUBLIC_BASE_URL`. This should be the public base URL for IPP, without a trailing
   slash (example `https://your-proxy-url.com`). If you remove this value, it will dynamically generate it based on
   the request hostname. This can be useful if you are [serving from multiple domains](/running-on-single-domain).

4. Start the docker container. You can test that it is working by visiting
   `https://your-proxy-url.com/share/healthcheck`. Check the container console output for any error messages.

```bash
docker-compose up -d
```

5. Set the "External domain" in your Immich **Server Settings** to be whatever domain you use to publicly serve
   Immich Public Proxy:

<img src="/server-settings.png" width="400" height="182" alt="Immich server settings - external domain">

Now whenever you share an image or gallery through Immich, it will automatically create the correct public path for
you.

> [!WARNING]
> If you're using Cloudflare, please make sure to set your `/share/video/*` path to Bypass Cache, otherwise you may
> run into video playback issues. See [Troubleshooting](#troubleshooting) for more information.

### Running alongside Immich on a single domain

Because all IPP paths are under `/share/...`, you can run Immich Public Proxy and Immich on the same domain. See
[Running on a single domain](/running-on-single-domain).

## Install with Kubernetes

See the [Kubernetes install docs](/kubernetes).
