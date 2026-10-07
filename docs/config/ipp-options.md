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

Change the headers sent with your web responses. The default is a 30-day `Cache-Control` and a permissive CORS header.
These apply to photos, videos and static files. The "download all" zip is always sent with `Cache-Control: no-store`
to prevent CDN issues, and the gallery page uses its own [`gallery.cacheTime`](/config/gallery#cachetime).

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
- `"fullsize"` - upgrade to the full-resolution browser-displayable image on zoom, à la the Immich web viewer.

`"original"` is intentionally not an option (it could be an unviewable RAW/DNG or a huge file).

**Independent of [`allowDownload`](#allowdownload)** - your download UI can be off while zoom is on. It only does anything where Immich can serve full resolution: the share's **own** "allow downloads" toggle in Immich must be on (the full-res image comes from the original file, which Immich gates on that toggle), and the format must be **web-displayable** (JPEG/PNG/WebP). Otherwise (RAW/HEIF, or a share with Immich downloads off) the lightbox stays on the preview. To enable zoom-up, leave the Immich share's download permission on and use [`allowDownload`](#allowdownload) to control whether the download buttons appear.

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

> [!NOTE]
> With `2`, IPP shows the download UI even on shares whose **own** download toggle in Immich is off - but Immich still refuses to serve those shares' original files, so IPP works around it where it can:
>
> - **Videos** are downloaded as the transcoded playback file instead of the original (the same stream the visitor can already watch). The filename extension follows the transcoded format, typically `.mp4`.
> - **Photos** download normally as long as [`maxDownloadQuality`](#maxdownloadquality) is below `original`; with `maxDownloadQuality: original` they fail, because the original file is exactly what Immich is refusing to serve.
> - **Gifs** always download as the original file (their preview is a static frame), so they fail on these shares.
>
> To guarantee full-quality downloads of everything, leave the share's download permission on in Immich.

## `uploadUrl`

**Type:** `string` · **Default:** `"/upload"`

Where the optional upload service (the `immich-public-proxy-upload` container) is served. A share whose "Allow public user to upload" option is on in Immich then shows an "Add photos" button in the gallery header, which opens that share's page on the upload service. To set up the service, see [Let visitors send photos back](/visitor-uploads).

- **A path**, such as the default `/upload`, means the service is on IPP's own hostname under that path. Before showing the button, the gallery page checks that something answers at `<path>/healthcheck`, so an install without the upload container never shows a dead button.
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
