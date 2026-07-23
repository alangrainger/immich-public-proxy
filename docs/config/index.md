# Configuration

> [!TIP]
> You can see all of the configurable options by [looking at the default config.json](https://github.com/alangrainger/immich-public-proxy/blob/main/app/config.json). A description of each option is on the pages in this section.

All options live under `ipp.*`, grouped into:

- [IPP options](/config/ipp-options) - top-level proxy behaviour.
- [Gallery](/config/gallery) - how the gallery page is rendered.
- [Lightbox](/config/lightbox) - the PhotoSwipe image viewer.
- [Metadata](/config/metadata) - description / EXIF / location reveal controls.
- [Error responses](/config/error-responses) - customise what invalid requests return.
- [Upgrading & migration](/config/upgrading) - renamed keys and compatibility shims.

## How to provide a config override

> [!NOTE]
> You only need to include the keys you're changing. Anything you omit keeps its default. The defaults in IPP are always the most privacy-respecting option.

There are two ways to supply custom config.

### Mount a file

Recommended for anything non-trivial. Make a copy of [config.json](https://github.com/alangrainger/immich-public-proxy/blob/main/app/config.json) next to your `docker-compose.yml`, edit it, then add a volume:

```yaml
    volumes:
      - ./config.json:/app/config.json
```

Restart the container and your custom configuration becomes active.

### Inline via env var

For one-off or single-key overrides, pass the configuration inline from your `docker-compose.yml` using the `CONFIG` environment variable:

```yaml
  environment:
    PUBLIC_BASE_URL: https://your-proxy-url.com
    IMMICH_URL: http://your-internal-immich-server:2283
    CONFIG: |
      {
        "ipp": {
          "showHomePage": false
        }
      }
```

## How options are organised

All options live under `ipp.*`. The metadata groups (`ipp.showMetadata.exif`, `ipp.showMetadata.location`) are per-field opt-in: every field is off until you explicitly set its flag to `true`. Nothing is automatically exposed - including fields IPP adds in future versions.

You only need to include the keys you're changing. Anything you omit keeps its default.
