# Upload service

Settings for the optional upload service, the `immich-public-proxy-upload` container, which lets visitors send photos
and videos back to a share. The setup is in [Let visitors send photos back](/visitor-uploads).

The service reads config the same way as IPP: a `config.json` mounted at `/app/config.json`, the file named by
`IPP_CONFIG`, or the `CONFIG` environment variable. Its own options are under `ipp.upload.*`. IPP never reads those,
and the service reads none of IPP's options except the two under [Shared options](#shared-options), so one
`config.json` can be mounted into both containers.

## Example

Accept files up to 2 GB, and send a notification to a Gotify server for each stored file:

```json
{
  "ipp": {
    "upload": {
      "maxFileSize": 2048,
      "notifyUrl": "https://gotify.example.com/message?token=YOUR_APP_TOKEN"
    }
  }
}
```

## Environment variables

`IMMICH_URL`, `IPP_PORT`, `IPP_CONFIG` and `CONFIG` mean the same as for IPP; see
[Environment variables](/config/environment-variables). `IMMICH_URL` is required. The service has one more:

### `GALLERY_URL`

**Optional**

The public URL of IPP, for example `https://photos.example.com`. When set, the upload page has a back button to the
share's gallery.

The service has no setting for its own public URL. It serves its pages both under `/upload` and at the root, so the
reverse proxy decides where it lives: a path on the IPP hostname (`photos.example.com/upload`) or a hostname of its
own (`upload.example.com`). See [Route it through your reverse proxy](/visitor-uploads#route-it-through-your-reverse-proxy).

## Options

### `maxFileSize`

**Type:** `int` · **Default:** `500`

The largest single file accepted, in MB. The page refuses a larger file before sending it; the service checks the
declared size on arrival and counts the bytes as they stream. The smallest value is `1`.

A reverse proxy or CDN in front of the service can have a lower limit of its own. See
[Request size limits](/visitor-uploads#request-size-limits).

### `rateLimit`

**Type:** `int` · **Default:** `60`

Files accepted per minute from one visitor address to one share. Over the limit, the service answers with the time to
wait, and the page sends the file again after it. `0` turns the limit off.

The address is the one that connects to the service. Behind a reverse proxy every visitor has the proxy's address, so
the limit covers each share as a whole.

### `byteBudget`

**Type:** `int` · **Default:** `10240`

MB accepted per share per hour, from all visitors together. Each file's declared size is reserved when its upload
starts and released if the upload fails. A file that would exceed the budget is refused until the hour ends. `0`
turns the budget off.

### `filenamePrefix`

**Type:** `string` · **Default:** `"ipp_upload_"`

Added to the start of every stored filename: `IMG_0042.jpg` is stored as `ipp_upload_IMG_0042.jpg`. The prefix is
what an Immich workflow can match on; see [Tag uploaded photos](/visitor-uploads#tag-uploaded-photos). Set it to `""`
to store the visitor's filename unchanged.

### `notifyUrl`

**Type:** `string` · **Default:** `""`

A URL that receives one JSON `POST` for each stored file, sent after the visitor has been answered. Empty means no
notifications. Each notification is sent once, with no retry. A failure is logged with the URL's host only, so a
token in the URL never reaches the log.

`title` and `message` are at the top level, so Gotify shows them with no setup. Everything else is under `data`:

```json
{
  "title": "Photo sent to Holiday 2025",
  "message": "ipp_upload_IMG_0042.jpg (3.0 MB) was uploaded to Holiday 2025.",
  "data": {
    "event": "upload",
    "time": "2026-10-05T07:18:00.000Z",
    "share": { "type": "album", "id": "9f1c…", "title": "Holiday 2025" },
    "file": { "name": "ipp_upload_IMG_0042.jpg", "size": 3145728, "type": "image/jpeg" },
    "asset": { "id": "4b2e…", "status": "created" }
  }
}
```

- `share.type` is `album` for an album share and `individual` for a share of selected photos. `share.id` is the
  album ID or the shared link ID.
- `asset.status` is `created`, or `duplicate` when the owner already had the same file. Immich adds a duplicate to the
  share too.
- The body never contains the share key, the custom URL or a password.

ntfy reads the two fields through its inline templates:

```
https://ntfy.sh/your-topic?tpl=yes&t={{.title}}&m={{.message}}
```

### `notifyHeaders`

**Type:** `object` · **Default:** `{}`

Extra headers sent with each notification, for example an `Authorization` header. Values must be strings.

```json
{
  "ipp": {
    "upload": {
      "notifyUrl": "https://hooks.example.com/ipp",
      "notifyHeaders": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

### `notifyTimeout`

**Type:** `int` · **Default:** `10000`

How long to wait for the notification URL to answer, in milliseconds.

## Shared options

The service also reads two IPP options, with the same meaning:

- [`allowSlugLinks`](/config/ipp-options#allowsluglinks). When `false`, the upload page is not served at `/s/<slug>`
  either.
- [`customInvalidResponse`](/config/ipp-options#custominvalidresponse). The status code, redirect, `null` and `false`
  forms all apply. There is no `invalidRequestHandler.js` to replace in the upload image.

`responseHeaders` is not read. Every response from the service carries `Cache-Control: no-store` and no CORS header.

## Refused uploads

A request for an unknown or expired share, or for a share whose "Allow public user to upload" option is off, gets the
same [error response](/config/error-responses) as it would from IPP. Once a share accepts uploads, a refused file gets
one of these codes and a short reason, which the page shows to the visitor:

| Code | Reason                                                                                                           |
|------|------------------------------------------------------------------------------------------------------------------|
| 400  | The filename has no extension, or Immich refused the file, for example because the owner's storage quota is full. |
| 403  | The share no longer accepts uploads.                                                                             |
| 411  | The request has no `Content-Length` header.                                                                      |
| 413  | The file is larger than `maxFileSize`, or the share has used its `byteBudget` for the hour.                      |
| 415  | The file is not a photo or a video. SVG files are refused.                                                       |
| 429  | The visitor is over `rateLimit`. `Retry-After` gives the wait in seconds.                                        |
| 502  | Immich could not be reached, or failed.                                                                          |
