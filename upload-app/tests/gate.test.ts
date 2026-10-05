import { describe, it, expect, afterEach } from 'vitest'
import { KeyType } from '@ipp/core'
import { assertPermit, authoriseUpload, UploadPermit } from '../src/gate'
import { resetConfig, setConfig, share } from './helpers'

afterEach(resetConfig)

describe('authoriseUpload', () => {
  it('issues a permit only when the share\'s Immich toggle is on', () => {
    expect(authoriseUpload(share(), 'k', KeyType.key)).not.toBeNull()
    expect(authoriseUpload(share({ allowUpload: false }), 'k', KeyType.key)).toBeNull()
    expect(authoriseUpload(share({ allowUpload: undefined }), 'k', KeyType.key)).toBeNull()
  })

  it('refuses slug links when the operator has turned them off', () => {
    setConfig({ ipp: { allowSlugLinks: false } })
    expect(authoriseUpload(share(), 'my-slug', KeyType.slug)).toBeNull()
    expect(authoriseUpload(share(), 'k', KeyType.key)).not.toBeNull()
  })
})

describe('assertPermit', () => {
  it('passes a permit from authoriseUpload', () => {
    expect(() => assertPermit(authoriseUpload(share(), 'k', KeyType.key)!)).not.toThrow()
  })

  it('throws for a permit built by hand', () => {
    const forged = { link: share(), key: 'k', keyType: KeyType.key } as unknown as UploadPermit
    expect(() => assertPermit(forged)).toThrow('without a permit')
  })

  it('throws when the share stopped accepting uploads after the permit was issued', () => {
    const link = share()
    const permit = authoriseUpload(link, 'k', KeyType.key)!
    link.allowUpload = false
    expect(() => assertPermit(permit)).toThrow('does not allow uploads')
  })
})
