# Gallery

Options that control how the gallery page is rendered. Configured under `ipp.gallery`.

## Example

Show the gallery title and group photos by month:

```json
{
  "ipp": {
    "gallery": {
      "showTitle": true,
      "groupByDate": "month"
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

Language for the [`showExpiryDate`](#showexpirydate) date when the format uses names (e.g. `MMMM` for month names), as a [dayjs locale code](https://github.com/iamkun/dayjs/tree/dev/src/locale) such as `"de"`, `"fr"` or `"en-gb"`. The default is English. The default numeric format needs no locale. The date-group headers from [`groupByDate`](#groupbydate) follow each visitor's own browser language instead.

## `groupByDate`

**Type:** `bool` or `string` · **Default:** `false`

Group the gallery's thumbnails by date, with a header above each group.

- `false` - no grouping (default).
- `"month"` - month headers like "December 2024".
- `"day"` - day headers like "Wed, 25 Dec 2024" (matching Immich's own timeline format).

Grouping uses the date each photo was taken, as in Immich's own timeline. Groups follow the album's sort order in Immich, and newest first for shares without one. Photos with no date go under an "Undated" header at the end.

## `showDownloadZip`

**Type:** `bool` · **Default:** `true`

Show the "download all" button in the header and the multi-select download toolbar. Only takes effect when downloads are allowed by [`allowDownload`](/config/ipp-options#allowdownload). Set to `false` to hide zip downloads while still offering single downloads in the lightbox ([`lightbox.showDownload`](/config/lightbox#showdownload)).

## `cacheTime`

**Type:** `int` · **Default:** `300`

How long, in seconds, browsers and any CDN may cache the gallery page. A longer time means less load on your server, but new photos added to a share will not show for visitors until it runs out.
