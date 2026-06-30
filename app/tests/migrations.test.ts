import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { applyMigrations } from '../src/config/migrations'

/*
  The migrations module mutates the passed-in config object in place and
  logs a one-line deprecation notice when it makes a change. These tests
  cover all four shims registered in `SHIMS`. Console output is silenced
  per-test so the suite stays quiet and so we can assert on it where the
  deprecation message is part of the contract.
*/

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('applyMigrations', () => {
  it('is a no-op for a fresh config that has no legacy keys', () => {
    const config = {
      ipp: {
        showMetadata: {
          exif: { dateTimeOriginal: true },
          location: { city: true }
        },
        gallery: { showTitle: true },
        lightbox: { showArrows: true }
      }
    }
    const before = JSON.stringify(config)
    applyMigrations(config)
    expect(JSON.stringify(config)).toBe(before)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('is a no-op for a completely empty config', () => {
    const config = {}
    applyMigrations(config)
    // applyMigrations seeds an `ipp` object on its way through, so empty in
    // means `{ ipp: {} }` out - that's fine, just check no crash + no logs.
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('lightGallery shim', () => {
  it('maps lightGallery.controls / download / mobileSettings to ipp.lightbox.*', () => {
    const config = {
      lightGallery: {
        controls: false,
        download: false,
        mobileSettings: { controls: true }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const ipp = config.ipp as Record<string, unknown>
    const lightbox = ipp.lightbox as Record<string, unknown>
    expect(lightbox.showArrows).toBe(false)
    expect(lightbox.showDownload).toBe(false)
    expect(lightbox.mobileArrows).toBe(true)
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('does not overwrite values the user has already set on the new path', () => {
    const config = {
      lightGallery: { controls: false, download: false },
      ipp: {
        lightbox: { showArrows: true, showDownload: true }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const lightbox = (config.ipp as Record<string, unknown>).lightbox as Record<string, unknown>
    expect(lightbox.showArrows).toBe(true)
    expect(lightbox.showDownload).toBe(true)
  })

  it('does nothing when lightGallery is absent', () => {
    const config = { ipp: { lightbox: { showArrows: true } } } as Record<string, unknown>
    applyMigrations(config)
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('topLevelGallery shim', () => {
  it('moves legacy top-level keys under ipp.gallery.*', () => {
    const config = {
      ipp: {
        singleImageGallery: true,
        showGalleryTitle: false,
        groupGalleryByDate: true
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const gallery = (config.ipp as Record<string, unknown>).gallery as Record<string, unknown>
    expect(gallery.singleImage).toBe(true)
    expect(gallery.showTitle).toBe(false)
    expect(gallery.groupByDate).toBe(true)
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('keeps the user-set value on the new path when both forms are present', () => {
    const config = {
      ipp: {
        singleImageGallery: false,
        gallery: { singleImage: true }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const gallery = (config.ipp as Record<string, unknown>).gallery as Record<string, unknown>
    expect(gallery.singleImage).toBe(true)
  })

  it('does nothing when no legacy keys are present', () => {
    const config = {
      ipp: { gallery: { singleImage: true } }
    } as Record<string, unknown>
    applyMigrations(config)
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('descriptionSplit shim', () => {
  it('expands boolean true to { caption: true, sidebar: true }', () => {
    const config = {
      ipp: { showMetadata: { description: true } }
    } as Record<string, unknown>

    applyMigrations(config)

    const description = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).description
    expect(description).toEqual({ caption: true, sidebar: true })
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('expands boolean false to { caption: false, sidebar: false }', () => {
    const config = {
      ipp: { showMetadata: { description: false } }
    } as Record<string, unknown>

    applyMigrations(config)

    const description = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).description
    expect(description).toEqual({ caption: false, sidebar: false })
  })

  it('leaves an existing object form alone', () => {
    const config = {
      ipp: {
        showMetadata: {
          description: { caption: false, sidebar: true }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const description = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).description
    expect(description).toEqual({ caption: false, sidebar: true })
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('metadataEnabled shim', () => {
  it('legacy enabled=true defaults every unset per-field flag to true', () => {
    const config = {
      ipp: {
        showMetadata: {
          exif: { enabled: true }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const exif = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).exif as Record<string, unknown>
    expect(exif.enabled).toBeUndefined()
    expect(exif.dateTimeOriginal).toBe(true)
    expect(exif.fileName).toBe(true)
    expect(exif.dimensions).toBe(true)
    expect(exif.fileSize).toBe(true)
    expect(exif.make).toBe(true)
    expect(exif.model).toBe(true)
    expect(exif.lensModel).toBe(true)
    expect(exif.exposureTime).toBe(true)
    expect(exif.iso).toBe(true)
    expect(exif.fNumber).toBe(true)
    expect(exif.focalLength).toBe(true)
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('legacy enabled=true preserves explicit per-field false ("all except X")', () => {
    const config = {
      ipp: {
        showMetadata: {
          location: { enabled: true, gps: false }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const location = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).location as Record<string, unknown>
    expect(location.enabled).toBeUndefined()
    expect(location.city).toBe(true)
    expect(location.state).toBe(true)
    expect(location.country).toBe(true)
    expect(location.gps).toBe(false)
  })

  it('legacy enabled=false clears any per-field flags that were true', () => {
    // This is the shipped 2.3.0 default shape: enabled=false + every per-
    // field=true as documentation. Under the new semantic those `true`s
    // would otherwise become live opt-ins; the shim zeroes them.
    const config = {
      ipp: {
        showMetadata: {
          exif: {
            enabled: false,
            dateTimeOriginal: true,
            fileName: true,
            make: true,
            iso: true
          }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const exif = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).exif as Record<string, unknown>
    expect(exif.enabled).toBeUndefined()
    expect(exif.dateTimeOriginal).toBe(false)
    expect(exif.fileName).toBe(false)
    expect(exif.make).toBe(false)
    expect(exif.iso).toBe(false)
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('legacy enabled=false leaves explicit per-field false alone', () => {
    const config = {
      ipp: {
        showMetadata: {
          location: { enabled: false, gps: false }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const location = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).location as Record<string, unknown>
    expect(location.gps).toBe(false)
  })

  it('handles both exif and location groups in one pass', () => {
    const config = {
      ipp: {
        showMetadata: {
          exif: { enabled: true },
          location: { enabled: false, gps: true }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const showMetadata = (config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>
    const exif = showMetadata.exif as Record<string, unknown>
    const location = showMetadata.location as Record<string, unknown>
    expect(exif.dateTimeOriginal).toBe(true)
    expect(location.gps).toBe(false)
    // One deprecation log call regardless of how many groups were migrated
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('does nothing when no legacy enabled key is present', () => {
    const config = {
      ipp: {
        showMetadata: {
          exif: { dateTimeOriginal: true }
        }
      }
    } as Record<string, unknown>

    applyMigrations(config)

    const exif = ((config.ipp as Record<string, unknown>).showMetadata as Record<string, unknown>).exif as Record<string, unknown>
    expect(exif.dateTimeOriginal).toBe(true)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('does nothing when showMetadata is absent', () => {
    const config = { ipp: {} } as Record<string, unknown>
    applyMigrations(config)
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('downloadOriginalPhoto shim', () => {
  it('maps true -> maxDownloadQuality: original', () => {
    const config = { ipp: { downloadOriginalPhoto: true } } as Record<string, unknown>
    applyMigrations(config)
    expect((config.ipp as Record<string, unknown>).maxDownloadQuality).toBe('original')
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('maps false -> maxDownloadQuality: preview', () => {
    const config = { ipp: { downloadOriginalPhoto: false } } as Record<string, unknown>
    applyMigrations(config)
    expect((config.ipp as Record<string, unknown>).maxDownloadQuality).toBe('preview')
  })

  it('does not overwrite an explicitly-set maxDownloadQuality', () => {
    const config = { ipp: { downloadOriginalPhoto: false, maxDownloadQuality: 'fullsize' } } as Record<string, unknown>
    applyMigrations(config)
    expect((config.ipp as Record<string, unknown>).maxDownloadQuality).toBe('fullsize')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('does nothing when downloadOriginalPhoto is absent', () => {
    const config = { ipp: { maxDownloadQuality: 'original' } } as Record<string, unknown>
    applyMigrations(config)
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('allowDownloadAll rename shim', () => {
  it('maps allowDownloadAll -> allowDownload, preserving the int value', () => {
    const config = { ipp: { allowDownloadAll: 2 } } as Record<string, unknown>
    applyMigrations(config)
    expect((config.ipp as Record<string, unknown>).allowDownload).toBe(2)
    expect(logSpy).toHaveBeenCalledOnce()
  })

  it('maps the falsy 0 value through (not skipped as "absent")', () => {
    const config = { ipp: { allowDownloadAll: 0 } } as Record<string, unknown>
    applyMigrations(config)
    expect((config.ipp as Record<string, unknown>).allowDownload).toBe(0)
  })

  it('does not overwrite an explicitly-set allowDownload', () => {
    const config = { ipp: { allowDownloadAll: 2, allowDownload: 1 } } as Record<string, unknown>
    applyMigrations(config)
    expect((config.ipp as Record<string, unknown>).allowDownload).toBe(1)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('does nothing when allowDownloadAll is absent', () => {
    const config = { ipp: { allowDownload: 1 } } as Record<string, unknown>
    applyMigrations(config)
    expect(logSpy).not.toHaveBeenCalled()
  })
})
