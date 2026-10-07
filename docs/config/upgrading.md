# Renamed config keys

IPP 4.0 no longer reads the old config keys below, so an option set under an old name falls back to its default.
Check your `config.json` for each key in the left column and move its value to the right column. For how to update
IPP itself, see [Upgrading](/upgrading).

## Gallery keys

| Old key                      | Current key                      |
|------------------------------|----------------------------------|
| `ipp.singleImageGallery`     | `ipp.gallery.singleImage`        |
| `ipp.singleItemAutoOpen`     | `ipp.gallery.singleItemAutoOpen` |
| `ipp.showGalleryTitle`       | `ipp.gallery.showTitle`          |
| `ipp.showGalleryDescription` | `ipp.gallery.showDescription`    |
| `ipp.groupGalleryByDate`     | `ipp.gallery.groupByDate`        |

## Lightbox keys

The `lightGallery` section from IPP 1.x became `ipp.lightbox`.

| Old key                                | Current key                 |
|----------------------------------------|-----------------------------|
| `lightGallery.controls`                | `ipp.lightbox.showArrows`   |
| `lightGallery.download`                | `ipp.lightbox.showDownload` |
| `lightGallery.mobileSettings.controls` | `ipp.lightbox.mobileArrows` |

## Downloads

| Old key                     | Current key                                                     |
|-----------------------------|-----------------------------------------------------------------|
| `ipp.allowDownloadAll`      | `ipp.allowDownload`, same `0` / `1` / `2` values                |
| `ipp.downloadOriginalPhoto` | `ipp.maxDownloadQuality`: `true` is `"original"`, `false` is `"preview"` |

## Metadata

`ipp.showMetadata.description` is an object, `{ "caption": <bool>, "sidebar": <bool> }`. A plain `true` or `false` is
ignored, so the description is hidden in both places until you change it.

`ipp.showMetadata.exif.enabled` and `ipp.showMetadata.location.enabled` are gone. The per-field flags are the only
gate, and each one defaults to `false`.

> [!WARNING]
> IPP will not start while either `enabled` key is in your config. Remove the key, then check every per-field flag:
> 4.0 shows every field set to `true`, GPS coordinates included, even where `enabled` used to be `false`. Set to
> `true` only the fields you want visitors to see.
