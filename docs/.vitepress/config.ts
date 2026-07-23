import { defineConfig } from 'vitepress'

const DEMO_URL = 'https://immich-demo.note.sx/share/gJfs8l4LcJJrBUpjhMnDoKXFt1Tm5vKXPbXl8BgwPtLtEBCOOObqbQdV5i0oun5hZjQ'
const REPO_URL = 'https://github.com/alangrainger/immich-public-proxy'

export default defineConfig({
  title: 'Immich Public Proxy',
  description: 'Share your Immich photos and albums publicly without exposing your Immich instance to the internet.',
  lang: 'en-NZ',
  cleanUrls: true,
  lastUpdated: true,
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
      { text: 'Live demo', link: DEMO_URL }
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Installation', link: '/installation' },
          { text: 'How to use it', link: '/how-to-use' },
          { text: 'Troubleshooting', link: '/troubleshooting' }
        ]
      },
      {
        text: 'Config options',
        items: [
          { text: 'Overview', link: '/config/' },
          { text: 'IPP options', link: '/config/ipp-options' },
          { text: 'Gallery', link: '/config/gallery' },
          { text: 'Lightbox', link: '/config/lightbox' },
          { text: 'Metadata', link: '/config/metadata' },
          { text: 'Error responses', link: '/config/error-responses' },
          { text: 'Upgrading & migration', link: '/config/upgrading' }
        ]
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Single domain with Immich', link: '/running-on-single-domain' },
          { text: 'Securing Immich with mTLS', link: '/securing-immich-with-mtls' },
          { text: 'Install with Kubernetes', link: '/kubernetes' }
        ]
      }
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
