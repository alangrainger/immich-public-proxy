// How many thumbnails to load per "page" fetched from Immich
const PER_PAGE = 50



class LGallery {
  items
  lightGallery
  element
  index = PER_PAGE

  spinner (){
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
  }

  /**
   * Create a lightGallery instance and populate it with the first page of gallery items
   */

  init (params = {}) {

    this.element = document.getElementById('lightgallery'),
    masonry = new Masonry(this.element,{
      itemSelector: '.grid-item',
      percentPosition: true,
      gutter: 0,
      columnWidth: '.lg-item:first-of-type' //Taken from first item. Can put .Class as selector
    })
  
    masonry.layout()
  
    this.lightGallery = lightGallery(this.element, Object.assign({
      selector: '.lg-item',
      animateThumb: true,
      licenseKey: '8FFA6495-676C4D30-8BFC54B6-4D0A6CEC',
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
    }, params.lgConfig))

    this.items = params.items

    let timeout
    window.addEventListener('scroll', () => {
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(lgallery.handleScroll, 100)
    })
    lgallery.handleScroll()
  }

  /**
   * Listen for scroll events and load more gallery items
   */
  handleScroll () {
    const rect = lgallery.element.getBoundingClientRect()
    const scrollPosition = Math.max(0, rect.bottom - window.innerHeight)
    const buffer = 200 // pixels before bottom to trigger load

    if (scrollPosition <= buffer) {
      lgallery.loadMoreItems()
    }
  }

  /**
   * Load more gallery items as per lightGallery docs
   * https://www.lightgalleryjs.com/demos/infinite-scrolling/
   */
  loadMoreItems () {
    if (this.index < this.items.length) {
      // Append new thumbnails
      this.items
        .slice(this.index, this.index + PER_PAGE)
        .forEach(item => {
          if (item.video) {
            this.element.insertAdjacentHTML('beforeend', `<a data-video='${item.video}'
        ${item.downloadUrl ? 'data-download-url="' + item.downloadUrl + '"' : ''}>
        <img alt="" src="${item.thumbnailUrl}"/><div class="play-icon"></div></a>`)
          } else {
            this.element.insertAdjacentHTML('beforeend', `<a href="${item.previewUrl}"
        ${item.downloadUrl ? 'data-download-url="' + item.downloadUrl + '"' : ''}>
        <img alt="" src="${item.thumbnailUrl}"/></a>`)
          }
        })
      this.index += PER_PAGE
      this.lightGallery.refresh()
    }
  }
}
const lgallery = new LGallery()






// function initLightGallery (config = {}) {
// /* Preloader */
//   const preloader = document.getElementById('page-loader');
//   if (preloader) {
//     const fadeEffect = () => {
//       setInterval(() => {
//         if (!preloader.style.opacity)    { preloader.style.opacity = 1; }
//         if (preloader.style.opacity > 0) { preloader.style.opacity -= 0.1;} 
//         else { 
//           clearInterval(fadeEffect);
//           preloader.remove();
//         }
//       }, 20)
//     }
//     window.addEventListener('load', fadeEffect);
//   }

// /* Init Gallery */
//   masonryElMixed = document.getElementById('lightgallery'),
//   masonryElMixed && imagesLoaded( document.getElementById('lightgallery'), function() {

//     masonry = new Masonry(masonryElMixed,{
//       itemSelector: '.grid-item',
//       percentPosition: true,
//       gutter: 0,
//       columnWidth: '.lg-item:first-of-type' //Taken from first item. Can put .Class as selector
//     })

//     masonry.layout()

//     lgallery = window.lightGallery(masonryElMixed, Object.assign({
//       selector: '.lg-item',
//       animateThumb: true,
//       /*
//       This license key was graciously provided by LightGallery under their
//       GPLv3 open-source project license:
//       */
//       licenseKey: '8FFA6495-676C4D30-8BFC54B6-4D0A6CEC',
//       /*
//       Please do not take it and use it for other projects, as it was provided
//       specifically for Immich Public Proxy.

//       For your own projects you can use the default license key of
//       0000-0000-000-0000 as per their docs:

//       https://www.lightgalleryjs.com/docs/settings/#licenseKey
//       */
//       plugins: [
//         lgFullscreen, 
//         lgThumbnail,
//         lgVideo,
//         lgZoom
//       ],
//       hash: true,
//       toggleThumb: true,
//       allowMediaOverlap: true,
//       subHtmlSelectorRelative: true,
//       zoomFromOrigin: true,
//     }), config)

//   })
// }


