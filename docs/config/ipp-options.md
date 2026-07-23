# IPP options

Top-level options under `ipp.*`.

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

Change the headers sent with your web responses. By default there is `cache-control` and CORS added.

## `maxDownloadQuality`

**Type:** `string` · **Default:** `"original"`

Highest quality served for a download (the download button and "download all" zip).

- `"original"` - the full-resolution original file (default).
- `"fullsize"` - full resolution but always browser-displayable: the original for JPEG/PNG/WebP, Immich's converted JPEG for RAW/HEIF.
- `"preview"` - only the ~1440px preview JPEG.

## `maxZoomQuality`

**Type:** `string` · **Default:** `"preview"`

Highest quality the lightbox loads when you zoom in past fit-to-screen.

- `"preview"` - keep the preview (default; zoom is capped to the preview's real pixels).
- `"fullsize"` - upgrade to the full-resolution browser-displayable image on zoom, à la the Immich web viewer.

`"original"` is intentionally not an option (it could be an unviewable RAW/DNG or a huge file).

**Independent of [`allowDownload`](#allowdownload)** - your download UI can be off while zoom is on. It only does anything where Immich can serve full resolution: the share's **own** "allow downloads" toggle in Immich must be on (the full-res image comes from the original file, which Immich gates on that toggle), and the format must be **web-displayable** (JPEG/PNG/WebP). Otherwise (RAW/HEIF, or a share with Immich downloads off) the lightbox stays on the preview. To enable zoom-up, leave the Immich share's download permission on and use [`allowDownload`](#allowdownload) to control whether the download buttons appear.

## `downloadedFilename`

**Type:** `int` · **Default:** `0`

The filename of the downloaded image.

- `0` - the original filename if available, falling back to the Immich asset ID.
- `1` - the Immich asset ID number.
- `2` - a shortened version of the asset ID: `img_` plus the first 8 characters of the asset ID.

## `allowDownload`

**Type:** `int` · **Default:** `0`

Show the download UI - the "download all" zip, the multi-select download, and the per-asset download button in the lightbox. Purely a UI switch; it has no effect on image quality (see [`maxZoomQuality`](#maxzoomquality) / [`maxDownloadQuality`](#maxdownloadquality)).

- `0` - downloads off.
- `1` - follow the Immich share's own download setting ([example](https://github.com/user-attachments/assets/79ea8c08-71ce-42ab-b025-10aec384938a)).
- `2` - always on.

The bulk-zip and per-asset buttons can be toggled independently once downloads are allowed - see [`gallery.showDownloadZip`](/config/gallery#showdownloadzip) and [`lightbox.showDownload`](/config/lightbox#showdownload).

## `downloadFromImmichConcurrencyLimit`

**Type:** `int` · **Default:** `20`

Maximum number of assets IPP will fetch from your Immich server in parallel when building a "download all" zip. Lower this if your Immich server is slow or you see download timeouts on large albums; raise it for faster downloads if your server can handle the load.

## `allowSlugLinks`

**Type:** `bool`

Enable/disable the custom URL links.

## `showHomePage`

**Type:** `bool`

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
