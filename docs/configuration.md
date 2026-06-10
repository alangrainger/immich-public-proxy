# Configuration

**Note:** You can see all of the configurable options by [looking at the default config.json](https://github.com/alangrainger/immich-public-proxy/blob/main/app/config.json). A description of each of these options is below.

## Contents

- [How to provide a config override](#how-to-provide-a-config-override)
- [How options are organised](#how-options-are-organised)
- [IPP options](#ipp-options)
- [Gallery](#gallery)
- [Lightbox](#lightbox)
- [Metadata](#metadata)
  - [Description](#description)
  - [EXIF group](#exif-group)
  - [Location group](#location-group)
- [Customising your error response pages](#customising-your-error-response-pages)
- [Migration notes for upgraders](#migration-notes-for-upgraders)

## How to provide a config override

**Note 👉** You only need to include the keys you're changing. Anything you omit keeps its default. The defaults in IPP are always the most privacy-respecting option.

There are two ways to supply custom config:

### Mount a file

Recommended for anything non-trivial. Make a copy of [config.json](https://github.com/alangrainger/immich-public-proxy/blob/main/app/config.json) next to your `docker-compose.yml`, edit, then add a volume:

```yaml
    volumes:
      - ./config.json:/app/config.json
```

Restart the container and your custom configuration becomes active.

### Or inline via env var

For one-off or single-key overrides. See [inline configuration](inline-configuration.md).

## How options are organised

All options live under `ipp.*`. The metadata groups (`ipp.showMetadata.exif`, `ipp.showMetadata.location`) are per-field opt-in: every field is off until you explicitly set its flag to `true`. Nothing is automatically exposed - including fields IPP adds in future versions.

You only need to include the keys you're changing. Anything you omit keeps its default.

## IPP options

Top-level options under `ipp.*`.

| Option                                | Type     | Description                                                                                                                                                                                                                                                                                   |
|---------------------------------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `responseHeaders`                     | `object` | Change the headers sent with your web responses. By default there is `cache-control` and CORS added.                                                                                                                                                                                          |
| `downloadOriginalPhoto`               | `bool`   | Set to `false` if you only want people to be able to download the 'preview' quality photo, rather than your original photo.                                                                                                                                                                   |
| `downloadedFilename`                  | `int`    | The filename of the downloaded image.<br>`0` for the original filename if available, falling back to the Immich asset ID<br>`1` for the Immich asset ID number<br>`2` for a shortened version of the asset ID: `img_` plus the first 8 characters of the asset ID                             |
| `allowDownloadAll`                    | `int`    | Allow visitors to download all files as a zip, including the selective-download flow in multi-select mode.<br>`0` disable downloads<br>`1` follow Immich setting per share ([example](https://github.com/user-attachments/assets/79ea8c08-71ce-42ab-b025-10aec384938a))<br>`2` always allowed |
| `downloadFromImmichConcurrencyLimit`  | `int`    | Maximum number of assets IPP will fetch from your Immich server in parallel when building a "download all" zip. Defaults to `8`. Lower this if your Immich server is slow or you see download timeouts on large albums; raise it for faster downloads if your server can handle the load.     |
| `allowSlugLinks`                      | `bool`   | Enable/disable the custom URL links.                                                                                                                                                                                                                                                          |
| `showHomePage`                        | `bool`   | Set to `false` to remove the IPP shield page at `/` and at `/share`.                                                                                                                                                                                                                          |
| `gallery`                             | `object` | Gallery-page options. See [Gallery](#gallery).                                                                                                                                                                                                                                                |
| `lightbox`                            | `object` | Lightbox options. See [Lightbox](#lightbox).                                                                                                                                                                                                                                                  |
| `showMetadata`                        | `object` | Description / EXIF / location reveal controls. See [Metadata](#metadata).                                                                                                                                                                                                                     |
| `customInvalidResponse`               | various  | Send a custom response instead of the default 404. See [Custom responses](custom-responses.md).                                                                                                                                                                                               |

For example, to disable the home page at `/` and at `/share`:

```json
{
  "ipp": {
    "showHomePage": false
  }
}
```

## Gallery

Options that control how the gallery page is rendered. Configured under `ipp.gallery`.

| Option               | Type   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|----------------------|--------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `singleImage`        | `bool` | By default a link to a single image will directly open the image file. Set to `true` if you want to show a gallery page instead for a single item.                                                                                                                                                                                                                                                                                                                |
| `singleItemAutoOpen` | `bool` | When a share contains a single item and is opened on its gallery page, automatically open the lightbox on the asset. Default `true`.                                                                                                                                                                                                                                                                                                                              |
| `showTitle`          | `bool` | Show a title on the gallery page. This is taken from the album title if it is an album being shared, otherwise the "Description" from the shared link will be used.                                                                                                                                                                                                                                                                                               |
| `showDescription`    | `bool` | Show the album description below the title. This only applies if it is an album which is being shared.                                                                                                                                                                                                                                                                                                                                                            |
| `groupByDate`        | `bool` | Group the gallery's thumbnails by month, with headers like "December 2024" above each group. Sorts photos newest-first. Items missing a creation date end up under an "Undated" bucket at the end (or render without any header when the whole gallery is undated). **Requires "Show metadata" to be enabled on the share in Immich** - when that's off, Immich strips creation dates from the assets it returns to IPP, so grouping won't work. Default `false`. |

Example: show the gallery title and group photos by month.

```json
{
  "ipp": {
    "gallery": {
      "showTitle": true,
      "groupByDate": true
    }
  }
}
```

## Lightbox

The gallery's lightbox is powered by [PhotoSwipe](https://photoswipe.com/). Configured under `ipp.lightbox`.

| Option         | Type     | Description                                                                                                                              |
|----------------|----------|------------------------------------------------------------------------------------------------------------------------------------------|
| `showArrows`   | `bool`   | Show the prev/next arrows on desktop. They appear when the user hovers the lightbox. Default `true`.                                     |
| `showDownload` | `bool`   | Show a download button in the lightbox toolbar. Only takes effect when downloads are also allowed by `allowDownloadAll`. Default `true`. |
| `mobileArrows` | `bool`   | Show prev/next arrows on mobile (under 640px viewport). Off by default since swipe is the natural mobile navigation.                     |
| `options`      | `object` | Custom [PhotoSwipe options](https://photoswipe.com/options/) to override defaults (e.g. `{"wheelToZoom": true}`).                        |

Example: hide the download button inside the lightbox even though zip downloads are otherwise allowed.

```json
{
  "ipp": {
    "lightbox": {
      "showDownload": false
    }
  }
}
```

## Metadata

Configured under `ipp.showMetadata`. The lightbox includes a slide-in info sidebar (toggle with the **i** key or the info button in the toolbar) that surfaces whatever metadata you opt into here.

| Option        | Type     | Description                                                                                                                                       |
|---------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| `description` | `object` | Where to show the description. `{ "caption": bool, "sidebar": bool }`. Both default `false`. See [Description](#description). |
| `exif`        | `object` | Camera / file EXIF group. Per-field opt-in flags, all default `false`. See [EXIF group](#exif-group).                          |
| `location`    | `object` | Location group (city / state / country / GPS). Per-field opt-in flags, all default `false`. See [Location group](#location-group). |

Every per-field flag defaults to `false`. A field is sent to the client only when its flag is explicitly `true`. There is no master switch - this is deliberate, so that fields IPP adds in future releases don't auto-expose without your action.

The share owner's **"Show metadata"** toggle in Immich takes precedence over everything here: when it's off, 
IPP suppresses all description / EXIF / location output and hides the info sidebar (and its toolbar toggle) 
entirely, regardless of these settings. Note that with "Show metadata" off Immich also strips file creation 
dates from non-album shares, so [date grouping](#gallery) won't work for those shares.

The info sidebar (and its toolbar toggle button) only appear when there is at least one section the operator has opted into - i.e. `description.sidebar` is true, or `exif` / `location` has at least one flag set to `true`. With all three off, the sidebar UI is suppressed.

### Description

Under `ipp.showMetadata.description`.

| Option    | Type   | Description                                                              |
|-----------|--------|--------------------------------------------------------------------------|
| `caption` | `bool` | Show the description below the photo as a lightbox caption.              |
| `sidebar` | `bool` | Show the description at the top of the info sidebar.                     |

Set both to show in both places; set neither and the description is not included at all.

### EXIF group

Under `ipp.showMetadata.exif`.

| Option              | Type   | Description                                                              |
|---------------------|--------|--------------------------------------------------------------------------|
| `dateTimeOriginal`  | `bool` | Show the date the photo was taken (per EXIF).                            |
| `fileName`          | `bool` | Show the original filename.                                              |
| `dimensions`        | `bool` | Show width x height and megapixel count.                                 |
| `fileSize`          | `bool` | Show the file size.                                                      |
| `make`              | `bool` | Camera manufacturer (e.g. "Canon").                                      |
| `model`             | `bool` | Camera model (e.g. "EOS R5").                                            |
| `lensModel`         | `bool` | Lens model.                                                              |
| `exposureTime`      | `bool` | Shutter speed (e.g. "1/200").                                            |
| `iso`               | `bool` | ISO sensitivity.                                                         |
| `fNumber`           | `bool` | Aperture f-number.                                                       |
| `focalLength`       | `bool` | Focal length in millimetres.                                             |

### Location group

Under `ipp.showMetadata.location`.

| Option     | Type   | Description                                                          |
|------------|--------|----------------------------------------------------------------------|
| `city`     | `bool` | Show city.                                                           |
| `state`    | `bool` | Show state / region.                                                 |
| `country`  | `bool` | Show country.                                                        |
| `gps`      | `bool` | Show GPS coordinates.                                                |
| `webLink`  | `bool` | Show an "Open in OpenStreetMap" link below the coordinates. The link is rendered with `rel="noreferrer"` so the share URL is not leaked to the map provider when a viewer clicks it. Has no effect unless `gps` is also true. Default `true`. |

A full example showing the description in the sidebar only (not as a lightbox caption), exposing camera EXIF, and revealing place names but not the GPS coordinates:

```json
{
  "ipp": {
    "showMetadata": {
      "description": { "caption": false, "sidebar": true },
      "exif": {
        "dateTimeOriginal": true,
        "make": true,
        "model": true,
        "lensModel": true,
        "exposureTime": true,
        "iso": true,
        "fNumber": true,
        "focalLength": true
      },
      "location": { "city": true, "state": true, "country": true }
    }
  }
}
```

## Customising your error response pages

You can customise the responses that IPP sends for invalid requests. For example you could:

- Drop the connection entirely (no response).
- Redirect to a new website.
- Send a different status code.
- Send a custom 404 page.

See [Custom responses](custom-responses.md) for the full reference.

## Migration notes for upgraders

A few config keys have been renamed across versions. Existing configs continue to work via backward-compatibility shims and a startup deprecation notice. The shims will be removed in v3.0.

**Gallery keys moved under `ipp.gallery.*` (v2.0).** The old top-level keys are mapped automatically:

| Legacy key                | New key                       |
|---------------------------|-------------------------------|
| `ipp.singleImageGallery`  | `ipp.gallery.singleImage`     |
| `ipp.singleItemAutoOpen`  | `ipp.gallery.singleItemAutoOpen` |
| `ipp.showGalleryTitle`    | `ipp.gallery.showTitle`       |
| `ipp.showGalleryDescription` | `ipp.gallery.showDescription` |
| `ipp.groupGalleryByDate`  | `ipp.gallery.groupByDate`     |

**`showMetadata.description` is now an object.** It used to be a single boolean. A legacy `description: true` migrates to `{ caption: true, sidebar: true }` (and `false` to both `false`). Move to the explicit form to silence the deprecation notice and so you can target the caption vs. the sidebar independently.

**`showMetadata.{exif,location}.enabled` was removed (v2.3.1).** Per-field flags are now the only gate, and all default to `false`. The shim preserves behaviour for legacy configs by rewriting them in memory at startup:

- Legacy `enabled: true` defaults every unset per-field flag in the group to `true`, matching the old "everything visible" behaviour. Per-field flags you had explicitly set to `false` (the "all except X" pattern) are kept.
- Legacy `enabled: false` clears any per-field flags that were `true`, matching the old "nothing visible" behaviour and stopping leftover documentation flags from the shipped 2.3 config from becoming live opt-ins.

A deprecation notice is printed at startup. Update your `config.json` to the explicit per-field form to silence it. The shim will be removed in v3.0, and at that point any field IPP has added since v2.3 will need a fresh opt-in.
