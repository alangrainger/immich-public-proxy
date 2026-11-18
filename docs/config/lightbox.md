---
prefix: ipp.lightbox
---

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

## `mobileArrows`

**Type:** `bool` · **Default:** `false`

Show prev/next arrows on mobile (screens under 640px wide). Off by default, as visitors swipe instead.

## `showDownload`

**Type:** `bool` · **Default:** `true`

Show a download button in the lightbox toolbar. Only takes effect when downloads are also allowed by [`allowDownload`](/config/ipp-options#allowdownload).

## `autoPlayVideos`

**Type:** `bool` · **Default:** `false`

Automatically play videos when their slide opens or becomes active. If the browser blocks unmuted autoplay (e.g. when deep-linking straight to a video), playback falls back to muted.

## `panorama`

**Type:** `bool` · **Default:** `true`

Offer a 360 viewer for equirectangular panoramas, as detected by Immich. A 360 button appears in the lightbox toolbar on those photos. The viewer loads the full-size image when [`maxZoomQuality`](/config/ipp-options#maxzoomquality) is `fullsize` and the share allows downloads, and the preview otherwise. Visitors can switch it to a little-planet view.

## `panoramaAutoOpen`

**Type:** `bool` · **Default:** `true`

Open the 360 viewer straight away when a panorama slide is shown, instead of waiting for the 360 button. Only takes effect when [`panorama`](#panorama) is on.

## `options`

**Type:** `object`

Custom [PhotoSwipe options](https://photoswipe.com/options/) to override defaults (e.g. `{"wheelToZoom": true}`).
