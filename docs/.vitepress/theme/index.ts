import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import { h } from 'vue'
import type { ThemeConfig } from '../config'
import './custom.css'

const DEMO_URL = 'https://demo.ipp.nz/s/demo-gallery'
const REPO_URL = 'https://github.com/alangrainger/immich-public-proxy'
// Material Design "star"
const STAR_PATH = 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

/** 1234 as "1.2k", under a thousand as is. */
function formatStars (count: number): string {
  return count >= 1000 ? (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(count)
}

/**
 * The GitHub star count as a navbar pill, after the GitHub icon. The count
 * comes from the build (`themeConfig.stars`, see config.ts); nothing is
 * rendered when the build had none.
 */
const StarCount = {
  setup () {
    const { theme } = useData<ThemeConfig>()
    return () => {
      const stars = theme.value.stars
      if (stars === undefined) return null
      return h('a', {
        class: 'ipp-stars',
        href: REPO_URL,
        target: '_blank',
        rel: 'noreferrer',
        title: 'Star on GitHub',
        'aria-label': stars + ' GitHub stars'
      }, [
        h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [h('path', { fill: 'currentColor', d: STAR_PATH })]),
        formatStars(stars)
      ])
    }
  }
}

/**
 * Extend the default theme to:
 *   - show the GitHub star count in the navbar (`nav-bar-content-after`);
 *   - use the live-demo screenshot as the hero image (`home-hero-image`),
 *     absolutely centred within the hero image container so it lines up
 *     vertically with the hero text;
 *   - place the IPP shield logo below the feature grid (`home-features-after`).
 */
export default {
  extends: DefaultTheme,
  Layout () {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(StarCount),
      'home-hero-image': () => h(
        'a',
        {
          href: DEMO_URL,
          style: 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: block; width: 100%;'
        },
        [
          h('img', {
            src: '/screenshot.webp',
            alt: 'Immich Public Proxy gallery screenshot',
            style: 'width: 100%; border-radius: 12px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);'
          })
        ]
      ),
      'home-features-after': () => h(
        'div',
        { style: 'display: flex; justify-content: center; margin: 4rem auto 2rem;' },
        [
          h('img', {
            src: '/ipp.svg',
            alt: 'Immich Public Proxy',
            width: 200,
            height: 200,
            style: 'opacity: 0.85;'
          })
        ]
      )
    })
  }
}
