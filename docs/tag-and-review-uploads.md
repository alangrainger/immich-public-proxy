# Tag and review visitor uploads

Immich workflows can act on each photo a visitor sends: tag it, copy it into a second album, or hold it back from the
gallery until you approve it.

This guide assumes visitor uploads are already [set up](/visitor-uploads).

## Tag uploaded photos

Every uploaded file is stored with `ipp_upload_` at the start of its name. An Immich workflow can match the prefix
to tag uploads, or to copy them into a second album. The prefix is set by
[`upload.filenamePrefix`](/config/upload-service#filenameprefix); set it to `""` if you would rather keep the
visitor's filename unchanged. In Immich, open **Workflows** and create a workflow with:

1. Trigger: **Asset Upload**.
2. Filter: **Filter by filename**, match type `startsWith`, pattern `ipp_upload_`.
3. Action: **Add Tags** with a tag such as `Sent by visitors`, or **Add to Album(s)**.

### Why IPP marks the filename instead of tagging

IPP talks to Immich with the visitor's share key and nothing else. Immich lets a share key do exactly one write:
store a file into the share. Every tag endpoint needs an API key with tag permissions. The upload service holds no
API key, and giving one to a service that faces the public would let that service change your library.

A sidecar file could carry a tag without an API key, but Immich reads a sidecar's keywords in place of the
photo's own, so a visitor's existing keywords would be lost. The filename keeps the photo's metadata untouched.

## Find each visitor's uploads

The upload page asks each visitor for their name (see [`upload.askName`](/config/upload-service#askname)). A name
given is stored in the filename between the prefix and the original name, with a comma after it, as
`ipp_upload_jane-smith,IMG_0042.jpg`. So in Immich:

- Search for `ipp_upload_jane-smith,` to see everything Jane sent.
- Add a workflow per visitor to tag or sort their uploads: **Filter by filename**, match type `startsWith`, pattern
  `ipp_upload_jane-smith,`, then **Add Tags** with a tag such as `Uploaded/Jane Smith`.

The comma matters: without it, `ipp_upload_jane` would also match `jane-smith` and `janet`. The name is whatever the
visitor typed, made lower case with hyphens for spaces and punctuation. A visitor who leaves the field empty is stored
with the prefix alone and no comma. A visitor can type any name, so treat it as a label, not proof.

### Why a comma

The filename is `<prefix><fields><original>`, where each field is followed by a comma. The separator had to be one
that a visitor's own filename never keeps, so that a stem with no comma has no fields, and otherwise the last comma
ends them. An underscore cannot do that: `ipp_upload_photo_1.jpg` would read as a visitor called `photo`. A tilde
was ruled out because Android names an edited photo `IMG_1234~2.jpg`. A comma is typeable, legal on every file
system, never written by a camera or a phone, and only rarely by a person. When a visitor's filename does contain
one, it is removed.

The fields are positional so that more can be added later, such as an event code the owner hands out. A new field
goes on the end, an empty one is written empty, and a file with no fields at all has no comma. So a future
`ipp_upload_jane-smith,34,IMG_0042.jpg` and `ipp_upload_,34,IMG_0042.jpg` would sit beside today's names, and a
script that splits on the comma reads all of them: the last piece is the original filename, the rest are the fields
in order.

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
  caches a share's photo list for [`shareCacheTime`](/config/ipp-options#sharecachetime), 2 minutes by default, so a visitor who has the gallery open can see the photo for a
  short while. Anyone who copied the photo's address in that window can keep opening it until you delete it.
- Keeping a photo relies on Immich leaving it in the album while it is locked, which it does for photos a workflow
  moves. If a future Immich version removes it from the album instead, add the approved photos back to the album
  by hand.
