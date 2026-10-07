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
        "timeZone": true,
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

Every field defaults to `false` and is sent to visitors only when its flag is `true`. There is no master switch, so a field IPP adds in a future release stays hidden until you turn it on.

The share's **"Show metadata"** toggle in Immich overrides everything here. When it is off, IPP hides the description, EXIF and location data and the info sidebar, whatever these settings say.

The info sidebar and its toolbar button only appear when at least one field is turned on: `description.sidebar`, or any displayable `exif` or `location` field. `exif.timeZone` on its own does not count, as it only changes how the date is shown.

## Description

Under `ipp.showMetadata.description`.

| Option    | Type   | Description                                                 |
|-----------|--------|-------------------------------------------------------------|
| `caption` | `bool` | Show the description below the photo as a lightbox caption. |
| `sidebar` | `bool` | Show the description at the top of the info sidebar.        |

Set both to show in both places; set neither and the description is not included at all.

## EXIF group

Under `ipp.showMetadata.exif`. Every flag defaults to `false`.

| Option             | Type   | Description                                                                                                      |
|--------------------|--------|------------------------------------------------------------------------------------------------------------------|
| `dateTimeOriginal` | `bool` | Show the date the photo was taken (per EXIF), in the photographer's local time - matching Immich's own sidebar. |
| `timeZone`         | `bool` | Show and use the photo's timezone when formatting the date. Only applies when `dateTimeOriginal` is also enabled. |
| `fileName`         | `bool` | Show the original filename.                                                                                      |
| `dimensions`       | `bool` | Show width x height and megapixel count.                                                                         |
| `fileSize`         | `bool` | Show the file size.                                                                                              |
| `make`             | `bool` | Camera manufacturer (e.g. "Canon").                                                                              |
| `model`            | `bool` | Camera model (e.g. "EOS R5").                                                                                    |
| `lensModel`        | `bool` | Lens model.                                                                                                      |
| `exposureTime`     | `bool` | Shutter speed (e.g. "1/200").                                                                                    |
| `iso`              | `bool` | ISO sensitivity.                                                                                                 |
| `fNumber`          | `bool` | Aperture f-number.                                                                                               |
| `focalLength`      | `bool` | Focal length in millimetres.                                                                                     |

## Location group

Under `ipp.showMetadata.location`. Every flag defaults to `false`, except `webLink` which defaults to `true`.

| Option    | Type   | Description                                                                                                                                                                                                                          |
|-----------|--------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `city`    | `bool` | Show city.                                                                                                                                                                                                                          |
| `state`   | `bool` | Show state / region.                                                                                                                                                                                                                |
| `country` | `bool` | Show country.                                                                                                                                                                                                                        |
| `gps`     | `bool` | Show GPS coordinates.                                                                                                                                                                                                                |
| `webLink` | `bool` | Show an "Open in OpenStreetMap" link below the coordinates. The link does not pass the share URL on to the map provider. Has no effect unless `gps` is also `true`. Default `true`. |
