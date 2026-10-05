import { defineConfig } from 'vitepress'

const REPO_URL = 'https://github.com/alangrainger/immich-public-proxy'

export default defineConfig({
  title: 'Immich Public Proxy',
  description: 'Share your Immich photos and albums publicly without exposing your Immich instance to the internet.',
  lang: 'en-NZ',
  cleanUrls: true,
  lastUpdated: true,
  // README.md is the maintainer's guide to this site, not a page.
  srcExclude: ['README.md'],
  head: [
    ['link', { rel: 'icon', href: '/ipp.svg' }]
  ],
  themeConfig: {
    logo: '/ipp.svg',
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'About', link: '/introduction' },
      { text: 'Configuration', link: '/config/' },
      { text: 'Releases', link: `${REPO_URL}/releases`, target: '_self' }
    ],
    /* One group per kind of content (tutorial, reference, how-to, troubleshooting).
       README.md in this folder explains the split; read it before adding a page.
       Paths are public URLs: change a label or heading, never a path. */
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/introduction' },
          {
            text: 'Installation',
            link: '/installation',
            items: [
              { text: 'Kubernetes', link: '/kubernetes' }
            ]
          },
          { text: 'Sharing from Immich', link: '/how-to-use' },
          { text: 'Upgrading', link: '/upgrading' }
        ]
      },
      {
        text: 'Configuration',
        items: [
          { text: 'Overview', link: '/config/' },
          { text: 'Environment variables', link: '/config/environment-variables' },
          { text: 'General options', link: '/config/ipp-options' },
          { text: 'Gallery', link: '/config/gallery' },
          { text: 'Lightbox', link: '/config/lightbox' },
          { text: 'Metadata', link: '/config/metadata' },
          { text: 'Error responses', link: '/config/error-responses' },
          { text: 'Renamed config keys', link: '/config/upgrading' }
        ]
      },
      {
        text: 'Guides',
        items: [
          { text: 'Single domain with Immich', link: '/running-on-single-domain' },
          { text: 'Redirect root domain to a share', link: '/redirect-root-to-share' },
          { text: 'Securing Immich with mTLS', link: '/securing-immich-with-mtls' }
        ]
      },
      { text: 'Troubleshooting', link: '/troubleshooting' }
    ],
    socialLinks: [
      { icon: 'github', link: REPO_URL }
    ],
    editLink: {
      pattern: `${REPO_URL}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Released under the AGPL-3.0 licence.'
    }
  }
})
