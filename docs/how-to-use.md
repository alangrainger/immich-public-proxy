# Sharing from Immich

Other than the initial configuration during [installation](/installation), everything is managed through Immich.
IPP has no admin interface of its own.

Share your photos, videos and albums as normal through Immich. Because you set the **External domain** in Immich's
settings to the URL of IPP, the links Immich generates already point at the proxy:

<img src="/share-link.webp" width="751" height="524" alt="Sharing a link from Immich">

## Share links

A standard link looks like `https://your-proxy-url.com/share/<key>`, where the key is the shared link's public ID
in Immich. If you give the shared link a custom URL in Immich, IPP serves it at `https://your-proxy-url.com/s/<slug>`
instead. Slug links can be turned off with [`allowSlugLinks`](/config/ipp-options#allowsluglinks).

The settings on the shared link in Immich are respected:

- **Password.** Visitors must enter the password before IPP serves anything from the share. It is remembered in an
  encrypted cookie for an hour, after which they are asked again.
- **Expiry.** An expired link returns a 404, the same as an unknown one. The expiry date can be shown on the gallery
  with [`gallery.showExpiryDate`](/config/gallery#showexpirydate).
- **Allow downloads.** Decides whether Immich will serve the original files. See
  [`allowDownload`](/config/ipp-options#allowdownload) for how IPP's own download buttons interact with it.
- **Show metadata.** When it is off, IPP hides the description, EXIF and location data regardless of its own
  [metadata settings](/config/metadata).
- **Allow public user to upload.** When it is on and you run the optional upload service, the gallery shows an
  **Add photos** button. See [Let visitors send photos back](/visitor-uploads).

## What visitors see

- A share containing a single image opens the image file directly, so you can embed the link anywhere you would a
  normal image. Set [`gallery.singleImage`](/config/gallery#singleimage) to show a gallery page instead. A single video
  opens a gallery page by default ([`gallery.singleVideo`](/config/gallery#singlevideo)).
- Everything else opens as a gallery styled to match Immich, in light or dark mode following the visitor's system
  preference, with a lightbox for viewing each photo or video.
- Very large shares stay smooth, however many photos they contain.
- When downloads are allowed, visitors can download a single item, select several to download together as a zip, or
  download the whole share.
- Photos can be grouped under month or day headers with [`gallery.groupByDate`](/config/gallery#groupbydate).
- An info sidebar in the lightbox shows whatever [metadata](/config/metadata) you have chosen to reveal. Nothing is
  revealed by default.
- When the share accepts uploads, visitors can send their own photos and videos into it with the **Add photos**
  button.

Try it on the [live demo](https://demo.ipp.nz/s/demo-gallery).

Next: [Upgrading](/upgrading), or head to [Configuration](/config/) to tune the gallery.
