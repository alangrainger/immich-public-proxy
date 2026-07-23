# Upgrading & migration

A few config keys have been renamed across versions. Existing configs continue to work via backward-compatibility shims and a startup deprecation notice.

## Gallery keys moved under `ipp.gallery.*` (v2.0)

The old top-level keys are mapped automatically:

| Legacy key                   | New key                          |
|------------------------------|----------------------------------|
| `ipp.singleImageGallery`     | `ipp.gallery.singleImage`        |
| `ipp.singleItemAutoOpen`     | `ipp.gallery.singleItemAutoOpen` |
| `ipp.showGalleryTitle`       | `ipp.gallery.showTitle`          |
| `ipp.showGalleryDescription` | `ipp.gallery.showDescription`    |
| `ipp.groupGalleryByDate`     | `ipp.gallery.groupByDate`        |

## `showMetadata.description` is now an object

It used to be a single boolean. A legacy `description: true` migrates to `{ caption: true, sidebar: true }` (and `false` to both `false`). Move to the explicit form to silence the deprecation notice and so you can target the caption vs. the sidebar independently.

## `showMetadata.{exif,location}.enabled` was removed (v2.3.1)

Per-field flags are now the only gate, and all default to `false`. The shim preserves behaviour for legacy configs by rewriting them in memory at startup:

- Legacy `enabled: true` defaults every unset per-field flag in the group to `true`, matching the old "everything visible" behaviour. Per-field flags you had explicitly set to `false` (the "all except X" pattern) are kept.
- Legacy `enabled: false` clears any per-field flags that were `true`, matching the old "nothing visible" behaviour and stopping leftover documentation flags from the shipped 2.3 config from becoming live opt-ins.

A deprecation notice is printed at startup. Update your `config.json` to the explicit per-field form to silence it.

## `downloadOriginalPhoto` → `maxDownloadQuality` (v3.0)

The boolean becomes the quality tier: `true` maps to `"original"`, `false` to `"preview"`. The shim will be removed in v4.0.

## `allowDownloadAll` → `allowDownload` (v3.0)

Renamed, same `0` / `1` / `2` values. The shim will be removed in v4.0.
