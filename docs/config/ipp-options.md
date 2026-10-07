# General options

Top-level options under `ipp.*` that don't belong to the [Gallery](/config/gallery), [Lightbox](/config/lightbox) or [Metadata](/config/metadata) groups.

## Example

Serve full-resolution images both when zooming in the lightbox and when downloading:

```json
{
  "ipp": {
    "maxDownloadQuality": "fullsize",
    "maxZoomQuality": "fullsize"
  }
}
```

## `responseHeaders`

**Type:** `object`

Change the headers sent with photos, videos and static files. The default is a 30-day `Cache-Control` and a
permissive CORS header. The "download all" zip is always sent with `Cache-Control: no-store`, and the gallery page
uses its own [`gallery.cacheTime`](/config/gallery#cachetime).

```json
{
  "ipp": {
    "responseHeaders": {
      "Cache-Control": "public, max-age=2592000",
      "Access-Control-Allow-Origin": "*"
    }
  }
}
```

## `maxDownloadQuality`

**Type:** `string` · **Default:** `"original"`

Highest quality served for a download (the download button and "download all" zip).

- `"original"` - the full-resolution original file (default).
- `"fullsize"` - full resolution but always browser-displayable: the original for JPEG/PNG/WebP, Immich's converted full-size image for RAW/HEIF, in JPEG or WebP per the server's image settings.
- `"preview"` - only the ~1440px preview, in JPEG or WebP per the server's image settings.

## `maxZoomQuality`

**Type:** `string` · **Default:** `"preview"`

Highest quality the lightbox loads when you zoom in past fit-to-screen.

- `"preview"` - keep the preview (default; zoom is capped to the preview's real pixels).
- `"fullsize"` - load the full-resolution browser-displayable image on zoom, like the Immich web viewer.

`"original"` is not an option here, because an original can be a RAW or DNG file the browser cannot display.

This setting is independent of [`allowDownload`](#allowdownload): the download buttons can be off while zoom is on. The full-resolution image is only available when the share's own "Allow downloads" toggle in Immich is on; with it off, the lightbox stays on the preview. For a JPEG, PNG or WebP the zoom loads the original file. For other formats (RAW, HEIF, ...) it loads Immich's converted full-size image, which exists only if full-size previews are enabled in Immich's image settings; otherwise Immich serves the preview. To get full-resolution zoom without showing download buttons, leave downloads on in Immich and set [`allowDownload`](#allowdownload) to `0`.

## `motionPhotos`

**Type:** `bool` · **Default:** `true`

Show motion photos (Live Photos) - an indicator on the gallery thumbnail, and a toggle in the lightbox that plays the photo's short clip and returns to the still when it ends. The toggle stays on: each motion photo the visitor moves to plays its clip automatically until they switch it off.

Clips are only fetched while the toggle is on, so leaving this on costs no extra bandwidth for visitors who never use it. Set to `false` to serve motion photos as plain stills:

```json
{
  "ipp": {
    "motionPhotos": false
  }
}
```

## `downloadedFilename`

**Type:** `int` · **Default:** `2`

How downloaded files are named, both in the zip and for a single download. The extension always matches the bytes
served, so a preview download of a HEIC photo is `.jpg`.

- `0` - the original filename if available, falling back to the Immich asset ID.
- `1` - the Immich asset ID.
- `2` - an anonymous name made from the share and the item's position in it: the first 8 characters of a hash of
  the share key, then the 1-based position in the order the gallery shows, zero-padded to at least three digits.

```
a3f9c2e1_001.jpg
a3f9c2e1_002.jpg
a3f9c2e1_003.mp4
```

With `2`, the same share always gives the same names, and a few selected items keep their positions in the whole
share. Unzipping a second download over the first replaces it. If the share's content or order changes, positions
shift, so a re-download then replaces files with different photos.

```json
{
  "ipp": {
    "downloadedFilename": 0
  }
}
```

## `allowDownload`

**Type:** `int` · **Default:** `0`

Show the download buttons: the "download all" zip, the multi-select download, and the download button in the lightbox. This only shows or hides the buttons; image quality is set by [`maxDownloadQuality`](#maxdownloadquality) and [`maxZoomQuality`](#maxzoomquality).

- `0` - downloads off.
- `1` - follow the Immich share's own download setting ([example](https://github.com/user-attachments/assets/79ea8c08-71ce-42ab-b025-10aec384938a)).
- `2` - always on.

The bulk-zip and per-asset buttons can be toggled independently once downloads are allowed - see [`gallery.showDownloadZip`](/config/gallery#showdownloadzip) and [`lightbox.showDownload`](/config/lightbox#showdownload).

> [!NOTE]
> With `2`, IPP shows the download buttons even on shares whose own download toggle in Immich is off. Immich still refuses to serve those shares' original files, so on such a share:
>
> - **Videos** download as the playback version, usually an `.mp4`, instead of the original.
> - **Photos** download at [`maxDownloadQuality`](#maxdownloadquality) if it is below `original`. With `original` they fail.
> - **Gifs** always download as the original file, so they fail.
>
> To be sure every download works at full quality, leave the share's download permission on in Immich.

## `uploadUrl`

**Type:** `string` · **Default:** `"/upload"`

Where the optional upload service (the `immich-public-proxy-upload` container) is served. A share whose "Allow public user to upload" option is on in Immich then shows an "Add photos" button in the gallery header, which opens that share's page on the upload service. To set up the service, see [Let visitors send photos back](/visitor-uploads).

- **A path**, such as the default `/upload`, means the service is on IPP's own hostname under that path. Before showing the button, the gallery page checks that the upload service answers `ok` at `<path>/healthcheck`, so an install without the upload container never shows a dead button. When nothing is routed there, IPP answers that path itself with an empty 204.
- **An absolute URL**, such as `https://upload.example.com`, means the service has a hostname of its own. It is trusted without a check. The URL may include a path, such as `https://photos.example.com/upload`, which points at the same place as the default but without the check.
- **An empty string** never shows the button.

## `allowSlugLinks`

**Type:** `bool` · **Default:** `true`

Serve shared links that have a custom URL in Immich at `/s/<slug>` as well as `/share/<key>`. Set to `false` to return a 404 for slug links, so that only the key form works.

## `showHomePage`

**Type:** `bool` · **Default:** `true`

Set to `false` to remove the IPP shield page at `/` and at `/share`.

```json
{
  "ipp": {
    "showHomePage": false
  }
}
```

## `gallery`

**Type:** `object`

Gallery-page options. See [Gallery](/config/gallery).

## `lightbox`

**Type:** `object`

Lightbox options. See [Lightbox](/config/lightbox).

## `showMetadata`

**Type:** `object`

Description / EXIF / location reveal controls. See [Metadata](/config/metadata).

## `customInvalidResponse`

**Type:** various

Send a custom response instead of the default 404. See [Error responses](/config/error-responses).
