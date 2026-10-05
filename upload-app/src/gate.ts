/*
  The upload authorisation gate. The upload is the only place this codebase
  writes to Immich, so the check is not left to a caller remembering it:

    1. `authoriseUpload()` - per request, once the share is resolved. Returns
       an `UploadPermit`, which `forwardUpload` cannot be called without.
    2. `assertPermit()` - immediately before the request to Immich is built.

  The gate is the owner's "Allow public user to upload" toggle on the share,
  read from a share lookup at most 60 s old. Immich enforces the same toggle
  on every upload, so a mistake here still cannot upload to a share whose
  owner said no.
*/

import { KeyType, SharedLink, slugLinksDisabled } from '@ipp/core'

/*
  A real symbol rather than a type-only brand, so `assertPermit` has
  something to test once types are erased. Not exported and not in the
  global registry, so a permit cannot be built outside this file.
*/
const permitBrand: unique symbol = Symbol('ipp.uploadPermit')

/**
 * Proof that a share passed the upload gate, plus the share-scoped
 * credentials the forwarder needs. Obtainable only from `authoriseUpload`.
 */
export interface UploadPermit {
  readonly [permitBrand]: true
  readonly link: SharedLink
  /** The key exactly as the visitor's URL carried it (a key or a slug). */
  readonly key: string
  readonly keyType: KeyType
  /** Share password from the session cookie, for password-protected shares. */
  readonly password?: string
}

/** Whether this share accepts uploads through this key type right now. */
export function uploadAllowed (link: SharedLink, keyType: KeyType): boolean {
  return link.allowUpload === true && !slugLinksDisabled(keyType)
}

/** Issue a permit, or null when this share does not accept uploads. */
export function authoriseUpload (link: SharedLink, key: string, keyType: KeyType, password?: string): UploadPermit | null {
  if (!uploadAllowed(link, keyType)) return null
  return { [permitBrand]: true, link, key, keyType, password } as UploadPermit
}

/**
 * Re-check the gate at the point of use. Throws, because reaching here
 * without a valid permit is a bug, not a visitor error.
 */
export function assertPermit (permit: UploadPermit): void {
  if (!permit || permit[permitBrand] !== true) {
    throw new Error('Upload attempted without a permit')
  }
  if (!uploadAllowed(permit.link, permit.keyType)) {
    throw new Error('Upload attempted for a share that does not allow uploads')
  }
}
