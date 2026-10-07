import { describe, it, expect } from 'vitest'
import { renderPage } from '@ipp/core'
import { h } from 'preact'
import { Gallery, GalleryProps } from '../src/view/gallery'

/*
  The "Add photos" button is rendered hidden, with the upload service's
  healthcheck URL on it, when the service is assumed to be at a path on IPP's
  hostname rather than configured. The client reveals it once the healthcheck
  answers. When the header holds nothing else it is hidden too, so a gallery
  with no title and no download button does not show an empty bar.
*/

function galleryProps (overrides: Partial<GalleryProps> = {}): GalleryProps {
  return {
    items: [{ id: 'a', type: 'IMAGE', previewUrl: '/p', thumbnailUrl: '/t', downloadFilename: 'photo.jpg' }],
    title: 'Test gallery',
    description: '',
    publicBaseUrl: 'https://example.com',
    path: '/share/k',
    showDownloadZip: false,
    showTitle: false,
    lightboxConfig: { showArrows: true, showDownload: true, mobileArrows: false, autoPlayVideos: false },
    metadataConfig: { descriptionInCaption: false, descriptionInSidebar: false, sidebarHasContent: false, locationWebLink: false },
    groupByDate: false,
    ...overrides
  }
}

const header = (html: string) => html.match(/<header[^>]*>/)?.[0]
const button = (html: string) => html.match(/<a id="upload-link"[^>]*>/)?.[0]

describe('gallery upload button', () => {
  it('is hidden with the healthcheck to probe when the upload service is assumed', () => {
    const html = renderPage(h(Gallery, galleryProps({ uploadLink: '/upload/share/k', uploadHealthcheck: '/upload/healthcheck' })))
    expect(button(html)).toContain(' hidden')
    expect(button(html)).toContain('data-healthcheck="/upload/healthcheck"')
    expect(header(html)).toContain(' hidden')
  })

  it('shows at once when the owner configured the upload URL', () => {
    const html = renderPage(h(Gallery, galleryProps({ uploadLink: 'https://upload.example.com/share/k' })))
    expect(button(html)).toContain('href="https://upload.example.com/share/k"')
    expect(button(html)).not.toContain('hidden')
    expect(button(html)).not.toContain('data-healthcheck')
    expect(header(html)).toBe('<header id="header">')
  })

  it('keeps the header visible when it holds other content', () => {
    const html = renderPage(h(Gallery, galleryProps({ showTitle: true, uploadLink: '/upload/share/k', uploadHealthcheck: '/upload/healthcheck' })))
    expect(header(html)).toBe('<header id="header">')
    expect(button(html)).toContain(' hidden')
  })

  it('renders no button and no header when the share takes no uploads', () => {
    const html = renderPage(h(Gallery, galleryProps({ uploadHealthcheck: '/upload/healthcheck' })))
    expect(button(html)).toBeUndefined()
    expect(header(html)).toBeUndefined()
  })
})
