# Lightbox

The gallery's lightbox is powered by [PhotoSwipe](https://photoswipe.com/). Configured under `ipp.lightbox`.

## Example

Hide the download button inside the lightbox even though zip downloads are otherwise allowed:

```json
{
  "ipp": {
    "lightbox": {
      "showDownload": false
    }
  }
}
```

## `showArrows`

**Type:** `bool` · **Default:** `true`

Show the prev/next arrows on desktop. They appear when the user hovers the lightbox.

## `showDownload`

**Type:** `bool` · **Default:** `true`

Show a download button in the lightbox toolbar. Only takes effect when downloads are also allowed by [`allowDownload`](/config/ipp-options#allowdownload).

## `mobileArrows`

**Type:** `bool` · **Default:** `false`

Show prev/next arrows on mobile (under 640px viewport). Off by default since swipe is the natural mobile navigation.

## `autoPlayVideos`

**Type:** `bool` · **Default:** `false`

Automatically play videos when their slide opens or becomes active. If the browser blocks unmuted autoplay (e.g. when deep-linking straight to a video), playback falls back to muted.

## `options`

**Type:** `object`

Custom [PhotoSwipe options](https://photoswipe.com/options/) to override defaults (e.g. `{"wheelToZoom": true}`).
