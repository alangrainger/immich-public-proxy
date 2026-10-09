import { defineConfigWithTheme, type DefaultTheme } from 'vitepress'
import { configCheckPlugin } from './configCheck'

const REPO_URL = 'https://github.com/alangrainger/immich-public-proxy'

/** The default theme's config plus the star count the navbar pill shows. */
export interface ThemeConfig extends DefaultTheme.Config {
  /** GitHub stars at build time; the pill is omitted when undefined. */
  stars?: number
}

/**
 * The repo's star count, fetched once per build so visitors' browsers never
 * call GitHub themselves. Undefined when the API can't be reached (a local
 * build with no network, or the anonymous rate limit), which hides the pill.
 * The docs workflow passes GITHUB_TOKEN for a higher limit and rebuilds
 * weekly so the number stays current.
 */
async function fetchStars (): Promise<number | undefined> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN
  try {
    const res = await fetch('https://api.github.com/repos/alangrainger/immich-public-proxy', {
      headers,
      signal: AbortSignal.timeout(5000)
    })
    const body = res.ok ? await res.json() : undefined
    if (typeof body?.stargazers_count === 'number') return body.stargazers_count
    console.warn('Star count unavailable (GitHub API status ' + res.status + '); the navbar pill is omitted.')
  } catch (e) {
    console.warn('Star count unavailable (' + (e instanceof Error ? e.message : String(e)) + '); the navbar pill is omitted.')
  }
  return undefined
}

export default async () => defineConfigWithTheme<ThemeConfig>({
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
  vite: {
    // Fails the build when the config reference pages and the default config files disagree
    plugins: [configCheckPlugin()]
  },
  themeConfig: {
    logo: '/ipp.svg',
    stars: await fetchStars(),
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
          { text: 'Config generator', link: '/config/generator' },
          { text: 'Environment variables', link: '/config/environment-variables' },
          { text: 'General options', link: '/config/ipp-options' },
          { text: 'Gallery', link: '/config/gallery' },
          { text: 'Lightbox', link: '/config/lightbox' },
          { text: 'Metadata', link: '/config/metadata' },
          { text: 'Error responses', link: '/config/error-responses' },
          { text: 'Upload service', link: '/config/upload-service' },
          { text: 'Renamed config keys', link: '/config/upgrading' }
        ]
      },
      {
        text: 'Guides',
        items: [
          { text: 'Put IPP behind a reverse proxy', link: '/reverse-proxy' },
          { text: 'Let visitors send photos back', link: '/visitor-uploads' },
          { text: 'Tag and review visitor uploads', link: '/tag-and-review-uploads' },
          { text: 'Single domain with Immich', link: '/running-on-single-domain' },
          { text: 'Redirect root domain to a share', link: '/redirect-root-to-share' }
        ]
      },
      {
        text: 'Securing Immich',
        items: [
          { text: 'Overview', link: '/securing-immich/' },
          { text: 'Authenticating the Immich app', link: '/securing-immich/immich-app' },
          { text: 'Cloudflare', link: '/securing-immich/cloudflare' },
          { text: 'Your own reverse proxy', link: '/securing-immich/reverse-proxy' },
          { text: 'Client certificates (mTLS)', link: '/securing-immich/client-certificates' },
          { text: 'Install the certificate on your devices', link: '/securing-immich/devices' }
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
