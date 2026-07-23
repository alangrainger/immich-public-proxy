# Gallery

Options that control how the gallery page is rendered. Configured under `ipp.gallery`.

## Example

Show the gallery title and group photos by month:

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

## `singleImage`

**Type:** `bool` · **Default:** `false`

By default a link to a single image will directly open the image file. Set to `true` if you want to show a gallery page instead for a single item.

## `singleVideo`

**Type:** `bool` · **Default:** `true`

When a share contains a single video, show a gallery page. Set to `false` to link directly to the video file instead.

## `singleItemAutoOpen`

**Type:** `bool` · **Default:** `true`

When a share contains a single item and is opened on its gallery page, automatically open the lightbox on the asset.

## `showTitle`

**Type:** `bool` · **Default:** `true`

Show a title on the gallery page. This is taken from the album title if it is an album being shared, otherwise the "Description" from the shared link will be used.

## `showDescription`

**Type:** `bool` · **Default:** `false`

Show the album description below the title. This only applies if it is an album which is being shared.

## `showExpiryDate`

**Type:** `bool` · **Default:** `false`

Show the share's expiry date next to the item count in the subtitle, as `45 items · available until 2026-07-10`. Only appears when the share actually has an expiry set in Immich (shares set to "never" show nothing extra).

## `expiryDateFormat`

**Type:** `string` · **Default:** `"YYYY-MM-DD"`

Format for the [`showExpiryDate`](#showexpirydate) date, as a [dayjs format string](https://day.js.org/docs/en/display/format). The default is ISO 8601 (e.g. `2026-07-10`). Example: `"D MMMM YYYY"` renders `10 July 2026`. Name-based tokens (`MMMM`, `dddd`, ...) render in English unless you also set [`expiryDateLocale`](#expirydatelocale).

## `expiryDateLocale`

**Type:** `string` · **Default:** `""`

Locale for [`showExpiryDate`](#showexpirydate) when the format uses name tokens (e.g. `MMMM` for month names), as a [dayjs locale code](https://github.com/iamkun/dayjs/tree/dev/src/locale) such as `"de"`, `"fr"` or `"en-gb"`. The default (`""`) is dayjs's default English. The numeric default format needs no locale. Applies only to this server-rendered date; thumbnail date-group headers ([`groupByDate`](#groupbydate)) already follow each viewer's own browser locale.

## `groupByDate`

**Type:** `bool` or `string` · **Default:** `false`

Group the gallery's thumbnails by date, with a header above each group.

- `false` - no grouping (default).
- `true` / `"month"` - month headers like "December 2024".
- `"day"` - day headers like "25 December 2024".

Grouping uses each photo's local "taken" date (matching Immich's own timeline), and sorts photos newest-first. Items missing a creation date end up under an "Undated" bucket at the end (or render without any header when the whole gallery is undated).

> [!IMPORTANT]
> Requires **"Show metadata"** to be enabled on the share in Immich. When that's off, Immich strips creation dates from the assets it returns to IPP, so grouping won't work.

## `showDownloadZip`

**Type:** `bool` · **Default:** `true`

Show the bulk-zip download UI - the "download all" button in the header and the multi-select download toolbar. Only takes effect when downloads are also allowed by [`allowDownload`](/config/ipp-options#allowdownload). Set to `false` to hide the zip download while still offering per-asset downloads via the lightbox ([`lightbox.showDownload`](/config/lightbox#showdownload)).

## `cacheTime`

**Type:** `int`

How long (in seconds) browsers and any CDN may cache the gallery **page** before revalidating. Set this longer to reduce load on your server, but be aware that if you add new photos to a gallery they won't show up until the cache times out or you manually clear any downstream caches.
