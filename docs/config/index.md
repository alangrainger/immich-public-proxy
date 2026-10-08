# Configuration

IPP can run with no config at all. Every option has a default, and the defaults are the most private choice: downloads
are off and every metadata field is hidden until you turn it on. A config holds only the keys you change; anything
you leave out keeps its default.

## Start with the Config generator

The [Config generator](/config/generator) is the place to build your config and the place to see what each option
does. It lists every option with a short description, grouped the same way as the pages in this section. Set the ones
you want to change, and it writes the config for you in either of the two forms below, holding only the keys that
differ from the defaults.

It also works the other way: paste the config you already have, and the form fills in from it. Keys that IPP no
longer reads are listed with their current names, so it is the quickest way to update a config after a major
version upgrade.

## How to provide a config override

There are two ways to supply the config. If both are present, `CONFIG` is used and the file is not read.

### Mount a file

Recommended for anything non-trivial. Put a `config.json` next to your `docker-compose.yml` holding only the keys
you change, then mount it into the container:

```yaml
    volumes:
      - ./config.json:/app/config.json
```

```json
{
  "ipp": {
    "allowDownload": 1,
    "gallery": {
      "showTitle": false
    }
  }
}
```

Restart the container and the config is active. To keep the file somewhere other than `/app/config.json`, set
[`IPP_CONFIG`](/config/environment-variables#ipp-config) to its path instead of mounting over the default.

### Inline via env var

For one or two keys, pass the JSON in the `CONFIG` environment variable instead of a file:

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

The upload service reads config the same way, so one `config.json` or `CONFIG` value can be shared by both
containers.

## Full descriptions

The generator shows each option's summary. The pages below hold the full description of every key, with the
details and worked examples that don't fit beside a form field. Each page covers one group of keys and links to it
from the generator's "Details" links.

- [Environment variables](/config/environment-variables) - the Immich URL, public URL, port and config file location.
- [General options](/config/ipp-options) - `ipp.*`: downloads, zoom quality, slug links, the upload link, response headers.
- [Gallery](/config/gallery) - `ipp.gallery.*`: how the gallery page is rendered.
- [Lightbox](/config/lightbox) - `ipp.lightbox.*`: the image viewer.
- [Metadata](/config/metadata) - `ipp.showMetadata.*`: which description, EXIF and location fields visitors can see.
- [Error responses](/config/error-responses) - what an invalid request gets instead of a 404.
- [Upload service](/config/upload-service) - `ipp.upload.*`: the optional container that lets visitors send photos back.
- [Renamed config keys](/config/upgrading) - old key names and their current ones, for a config from an earlier
  major version.

The defaults themselves are in
[`app/config.json`](https://github.com/alangrainger/immich-public-proxy/blob/main/app/config.json) and, for the upload
service, [`upload-app/config.json`](https://github.com/alangrainger/immich-public-proxy/blob/main/upload-app/config.json).
