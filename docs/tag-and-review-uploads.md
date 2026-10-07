# Tag and review visitor uploads

Immich workflows can act on each photo a visitor sends: tag it, copy it into a second album, or hold it back from the
gallery until you approve it.

This guide assumes visitor uploads are already [set up](/visitor-uploads).

## Tag uploaded photos

Every uploaded file is stored with `ipp_upload_` at the start of its name
([`upload.filenamePrefix`](/config/upload-service#filenameprefix)). An Immich workflow can match the prefix to tag
uploads, or to copy them into a second album. In Immich, open **Workflows** and create a workflow with:

1. Trigger: **Asset Upload**.
2. Filter: **Filter by filename**, match type `startsWith`, pattern `ipp_upload_`.
3. Action: **Add Tags** with a tag such as `Sent by visitors`, or **Add to Album(s)**.

## Review uploads before they appear

Immich has no approval queue for uploads through a shared link, but a workflow can move each upload into your
**locked folder** the moment it arrives. IPP never shows a locked photo, so the upload leaves the gallery until you
decide to keep it. This is the staging step: visitors upload, you approve, the gallery updates.

The locked folder needs a PIN. Set one in your Immich account settings if you have not already. Then create a
workflow as in [Tag uploaded photos](#tag-uploaded-photos), with these actions:

1. Trigger: **Asset Upload**.
2. Filter: **Filter by filename**, match type `startsWith`, pattern `ipp_upload_`.
3. Action: **Move to locked folder**. Add a second action, **Add Tags**, if you want the approved uploads to stay
   easy to find afterwards.

To review, open the locked folder in Immich and enter your PIN. A photo's info panel lists the album it was sent
to under **Appears in**, since it is still a member while locked. Move the photos you want to keep out of the locked
folder: they return to the gallery on the next cache refresh. Delete the rest. Pair this with a
[notification](/visitor-uploads#get-a-notification-for-each-upload) so you know when there is something to review;
its message names the share, which is the only record of the destination for a share of individual photos, as those
have no album.

Two things to know:

- The upload is pulled back, not held back. The workflow runs a few seconds after the file is stored, and IPP
  caches a share's photo list for up to 2 minutes, so a visitor who has the gallery open can see the photo for a
  short while. Anyone who copied the photo's address in that window can keep opening it until you delete it.
- Keeping a photo relies on Immich leaving it in the album while it is locked, which it does for photos a workflow
  moves. If a future Immich version removes it from the album instead, add the approved photos back to the album
  by hand.
