# Metadata

Configured under `ipp.showMetadata`. The lightbox includes a slide-in info sidebar (toggle with the **i** key or the info button in the toolbar) that surfaces whatever metadata you opt into here.

## Example

Show the description in the sidebar only (not as a lightbox caption), expose camera EXIF, and reveal place names but not the GPS coordinates:

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

## Overview

| Group         | Type     | Description                                                                                     |
|---------------|----------|-------------------------------------------------------------------------------------------------|
| `description` | `object` | Where to show the description. `{ "caption": bool, "sidebar": bool }`. Both default `false`. See [Description](#description). |
| `exif`        | `object` | Camera / file EXIF group. Per-field opt-in flags, all default `false`. See [EXIF group](#exif-group). |
| `location`    | `object` | Location group (city / state / country / GPS). Per-field opt-in flags, all default `false`. See [Location group](#location-group). |

Every per-field flag defaults to `false`. A field is sent to the client only when its flag is explicitly `true`. There is no master switch - this is deliberate, so that fields IPP adds in future releases don't auto-expose without your action.

The share owner's **"Show metadata"** toggle in Immich takes precedence over everything here: when it's off, IPP suppresses all description / EXIF / location output and hides the info sidebar (and its toolbar toggle) entirely, regardless of these settings. Note that with "Show metadata" off Immich also strips file creation dates from non-album shares, so [date grouping](/config/gallery#groupbydate) won't work for those shares.

The info sidebar (and its toolbar toggle button) only appear when there is at least one section the operator has opted into - i.e. `description.sidebar` is true, or `exif` / `location` has at least one flag set to `true`. With all three off, the sidebar UI is suppressed.

## Description

Under `ipp.showMetadata.description`.

| Option    | Type   | Description                                                 |
|-----------|--------|-------------------------------------------------------------|
| `caption` | `bool` | Show the description below the photo as a lightbox caption. |
| `sidebar` | `bool` | Show the description at the top of the info sidebar.        |

Set both to show in both places; set neither and the description is not included at all.

## EXIF group

Under `ipp.showMetadata.exif`. Every flag defaults to `false`.

| Option             | Type   | Description                                   |
|--------------------|--------|-----------------------------------------------|
| `dateTimeOriginal` | `bool` | Show the date the photo was taken (per EXIF). |
| `fileName`         | `bool` | Show the original filename.                   |
| `dimensions`       | `bool` | Show width x height and megapixel count.      |
| `fileSize`         | `bool` | Show the file size.                           |
| `make`             | `bool` | Camera manufacturer (e.g. "Canon").           |
| `model`            | `bool` | Camera model (e.g. "EOS R5").                 |
| `lensModel`        | `bool` | Lens model.                                   |
| `exposureTime`     | `bool` | Shutter speed (e.g. "1/200").                 |
| `iso`              | `bool` | ISO sensitivity.                              |
| `fNumber`          | `bool` | Aperture f-number.                            |
| `focalLength`      | `bool` | Focal length in millimetres.                  |

## Location group

Under `ipp.showMetadata.location`. Every flag defaults to `false`, except `webLink` which defaults to `true`.

| Option    | Type   | Description                                                                                                                                                                                                                          |
|-----------|--------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `city`    | `bool` | Show city.                                                                                                                                                                                                                          |
| `state`   | `bool` | Show state / region.                                                                                                                                                                                                                |
| `country` | `bool` | Show country.                                                                                                                                                                                                                        |
| `gps`     | `bool` | Show GPS coordinates.                                                                                                                                                                                                                |
| `webLink` | `bool` | Show an "Open in OpenStreetMap" link below the coordinates. The link is rendered with `rel="noreferrer"` so the share URL is not leaked to the map provider when a viewer clicks it. Has no effect unless `gps` is also true. Default `true`. |

## Example

Show the description in the sidebar only (not as a lightbox caption), expose camera EXIF, and reveal place names but not the GPS coordinates:

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
