import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import screenshot from '../../screenshot.webp'
import './custom.css'

const DEMO_URL = 'https://demo.ipp.nz/s/demo-gallery'

/**
 * Extend the default theme to:
 *   - use the live-demo screenshot as the hero image (`home-hero-image`),
 *     absolutely centred within the hero image container so it lines up
 *     vertically with the hero text;
 *   - place the IPP shield logo below the feature grid (`home-features-after`).
 */
export default {
  extends: DefaultTheme,
  Layout () {
    return h(DefaultTheme.Layout, null, {
      'home-hero-actions-after': () => h(
        'div',
        { style: 'display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap;' },
        [
          h('a', { href: 'https://github.com/alangrainger/immich-public-proxy', target: '_blank', rel: 'noreferrer' }, [
            h('img', {
              src: 'https://badgen.net/github/stars/alangrainger/immich-public-proxy?scale=1.1',
              alt: 'GitHub stars',
              style: 'vertical-align: middle;'
            })
          ]),
          h('a', { href: 'https://hub.docker.com/r/alangrainger/immich-public-proxy', target: '_blank', rel: 'noreferrer' }, [
            h('img', {
              src: 'https://badgen.net/docker/pulls/alangrainger/immich-public-proxy?icon=docker&label=docker%20pulls&color=green&scale=1.1',
              alt: 'Docker pulls',
              style: 'vertical-align: middle;'
            })
          ])
        ]
      ),
      'home-hero-image': () => h(
        'a',
        {
          href: DEMO_URL,
          style: 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: block; width: 100%;'
        },
        [
          h('img', {
            src: screenshot,
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
