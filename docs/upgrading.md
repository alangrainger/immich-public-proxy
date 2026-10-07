# Upgrading

## Updating IPP

IPP keeps no state, so updating is a matter of pulling the new image and recreating the container:

```bash
docker-compose pull
docker-compose up -d
```

If you pin a version tag rather than `latest`, bump it in your `docker-compose.yml` first (see
[Docker images](/installation#docker-images) for the tag scheme).

Check the [release notes](https://github.com/alangrainger/immich-public-proxy/releases) before moving to a new major
version. Breaking changes and renamed config keys land in major versions and are listed there.

## Upgrading to 4.0

- **Immich 3.0.0 or newer is required.** Upgrade Immich first.
- **Old config keys are no longer read.** Check your `config.json` against [Renamed config keys](/config/upgrading).
- **IPP will not start while the config has `showMetadata.exif.enabled` or `showMetadata.location.enabled`.** Remove
  the key, and keep only the per-field flags for what visitors may see. See [Metadata](/config/upgrading#metadata).
- **`allowDownload` takes only `0`, `1` or `2`.** Any other value, such as `true`, now turns downloads off. See
  [`allowDownload`](/config/ipp-options#allowdownload).
- **A custom `invalidRequestHandler.js` must be copied again from the 4.0 image.** A copy taken from 3.x fails to
  load. See [Custom function](/config/error-responses#custom-function).

Visitor uploads are new in 4.0. An existing install is not affected until you add the upload service: IPP looks for
it at `/upload` on its own hostname and shows the "Add photos" button only when something answers there. See
[Let visitors send photos back](/visitor-uploads).

### Compose file

No change is needed to your `docker-compose.yml`. The image name, ports, environment variables and mount paths
(`/app/config.json`, `/app/dist/invalidRequestHandler.js`) are the same as in 3.x.

If you want visitor uploads, add the second service. A complete 4.0 compose file looks like this:

```yaml
services:
  immich-public-proxy:
    image: alangrainger/immich-public-proxy:latest
    container_name: immich-public-proxy
    restart: always
    ports:
      - "3000:3000"
    environment:
      PUBLIC_BASE_URL: https://your-proxy-url.com
      IMMICH_URL: http://your-internal-immich-server:2283
    healthcheck:
      test: curl -sf -m 4 http://localhost:3000/share/healthcheck -o /dev/null || exit 1
      start_period: 10s
      timeout: 5s

  ipp-upload:
    image: alangrainger/immich-public-proxy-upload:latest
    container_name: ipp-upload
    restart: always
    ports:
      - "3001:3000"
    environment:
      IMMICH_URL: http://your-internal-immich-server:2283
      GALLERY_URL: https://your-proxy-url.com
    healthcheck:
      test: curl -sf -m 4 http://localhost:3000/healthcheck -o /dev/null || exit 1
      start_period: 10s
      timeout: 5s
```

See [Let visitors send photos back](/visitor-uploads) for the reverse proxy setup and the Immich share key.

## Immich version

IPP requires **Immich 3.0.0 or newer** and checks the server version at startup. Against an older Immich it logs a
fatal error and exits; if it can't determine the version at all (Immich unreachable), it logs a warning and carries on.

When you upgrade Immich, check the IPP release notes for a matching release, as changes to Immich's API are picked up
there.

## Config keys

Config keys are renamed only in major versions, and the old name stops working then. [Renamed config
keys](/config/upgrading) maps each old key to its current name.
