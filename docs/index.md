---
layout: home

hero:
  name: Immich Public Proxy
  text: Share your photos safely
  tagline: Share your Immich photos and albums publicly without exposing your Immich instance to the internet.
  actions:
    - theme: brand
      text: Live demo
      link: https://demo.ipp.nz/s/demo-gallery
      target: _self
    - theme: alt
      text: Get started
      link: /installation
    - theme: alt
      text: Configuration
      link: /config/

features:
  - icon: 🔒
    title: Locked down by design
    details: IPP sits in front of Immich and only serves what you have explicitly shared. It needs no API key and knows nothing about your instance, keeping the attack surface tiny.
  - icon: 📤
    title: Let visitors upload photos (optional)
    details: You can optionally enable uploads, so guests can add their own photos and videos to a share. This doesn't need an Immich API key.
    link: /visitor-uploads
  - icon: ⚙️
    title: Managed entirely in Immich
    details: All sharing stays managed within Immich itself. Set IPP up once and you never need to touch it again.
---

