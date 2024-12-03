function initLightGallery (config = {}) {
/* Preloader */
  const preloader = document.getElementById('page-loader');
  if (preloader) {
    const fadeEffect = () => {
      setInterval(() => {
        if (!preloader.style.opacity)    { preloader.style.opacity = 1; }
        if (preloader.style.opacity > 0) { preloader.style.opacity -= 0.1;} 
        else { 
          clearInterval(fadeEffect);
          preloader.remove();
        }
      }, 20)
    }
    window.addEventListener('load', fadeEffect);
  }

/* Init Gallery */
  masonryElMixed = document.getElementById('lightgallery'),
  masonryElMixed && imagesLoaded( document.getElementById('lightgallery'), function() {

    masonry = new Masonry(masonryElMixed,{
      itemSelector: '.grid-item',
      percentPosition: true,
      gutter: 0,
      columnWidth: '.lg-item:first-of-type' //Taken from first item. Can put .Class as selector
    })

    masonry.layout()

    lgallery = window.lightGallery(masonryElMixed, Object.assign({
      selector: '.lg-item',
      animateThumb: true,
      /*
      This license key was graciously provided by LightGallery under their
      GPLv3 open-source project license:
      */
      licenseKey: '8FFA6495-676C4D30-8BFC54B6-4D0A6CEC',
      /*
      Please do not take it and use it for other projects, as it was provided
      specifically for Immich Public Proxy.

      For your own projects you can use the default license key of
      0000-0000-000-0000 as per their docs:

      https://www.lightgalleryjs.com/docs/settings/#licenseKey
      */
      plugins: [
        lgFullscreen, 
        lgThumbnail,
        lgVideo,
        lgZoom
      ],
      hash: true,
      toggleThumb: true,
      allowMediaOverlap: true,
      subHtmlSelectorRelative: true,
      zoomFromOrigin: true,
    }), config)

  })
}


