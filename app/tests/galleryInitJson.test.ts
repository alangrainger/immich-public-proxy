import { describe, it, expect } from 'vitest'
import { h } from 'preact'
import { Gallery, GalleryProps, GalleryItem } from '../src/view/gallery'
import { renderPage } from '../src/view/render'

/*
  Regression test for the init-JSON XSS: asset strings (originalFileName, EXIF
  description/city/make/model) are attacker-influenced and are serialised into
  the <script type="application/json"> init block. A raw `</script>` inside
  them must not be able to terminate that block and inject markup.
*/

function galleryProps (item: Partial<GalleryItem>): GalleryProps {
  return {
    items: [{
      id: 'a',
      type: 'IMAGE',
      previewUrl: '/share/photo/k/a/preview',
      thumbnailUrl: '/share/photo/k/a/thumbnail',
      downloadFilename: 'photo.jpg',
      ...item
    }],
    title: 'Test gallery',
    description: '',
    publicBaseUrl: 'https://example.com',
    path: '/share/k',
    showDownloadZip: false,
    showTitle: false,
    lightboxConfig: { showArrows: true, showDownload: true, mobileArrows: false, autoPlayVideos: false },
    metadataConfig: { descriptionInCaption: false, descriptionInSidebar: false, sidebarHasContent: false, locationWebLink: false },
    groupByDate: false
  }
}

const payload = '</script><script>alert(1)</script>'

describe('gallery init JSON escaping', () => {
  it('neutralises </script> in a crafted download filename', () => {
    const html = renderPage(h(Gallery, galleryProps({ downloadFilename: payload })))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('\\u003c/script>')
  })

  it('neutralises </script> in crafted EXIF metadata', () => {
    const html = renderPage(h(Gallery, galleryProps({
      description: payload,
      exif: { fileName: payload, city: payload, make: payload }
    })))
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('still produces JSON the client can parse back to the same items', () => {
    const html = renderPage(h(Gallery, galleryProps({ downloadFilename: payload })))
    const match = html.match(/<script type="application\/json" id="ipp-init">(.*?)<\/script>/s)
    expect(match).not.toBeNull()
    const params = JSON.parse(match![1])
    expect(params.items[0].downloadFilename).toBe(payload)
  })
})
