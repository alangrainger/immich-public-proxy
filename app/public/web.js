// How many thumbnails to load per "page" fetched from Immich
const PER_PAGE = 50



class LGallery {
  items
  lightGallery
  element
  index = PER_PAGE
  masonry

  spinner () {
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
    this.masonry = new Masonry(this.element,{
      itemSelector: '.grid-item',
      percentPosition: true,
      gutter: 0,
      columnWidth: '.lg-item:first-of-type' //Taken from first item. Can put .Class as selector
    })
  
    this.masonry.layout()
  
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
  // loadMoreItems () {
  //   if (this.index < this.items.length) {
      
  //     const existingCount = this.element.querySelectorAll('.grid-item').length

  //     // Append new thumbnails
  //     this.items
  //       .slice(this.index, this.index + PER_PAGE)
  //       .forEach(item => {
  //         if (item.video) {
  //           this.element.insertAdjacentHTML('beforeend', `<a class="lg-item grid-item" data-video='${item.video}'
  //                                                         ${item.downloadUrl ? 'data-download-url="' + item.downloadUrl + '"' : ''}>
  //                                                         <img alt="" src="${item.thumbnailUrl}"/><div class="play-icon"></div></a>`)
  //         } else {
  //           this.element.insertAdjacentHTML('beforeend', `<a class="lg-item grid-item" href="${item.previewUrl}"
  //                                                         ${item.downloadUrl ? 'data-download-url="' + item.downloadUrl + '"' : ''}>
  //                                                         <img alt="" src="${item.thumbnailUrl}"/></a>`)
  //         }
  //       })

  //     // Select the newly added elements
  //     const allItems = this.element.querySelectorAll('.grid-item')
  //     const newItems = Array.from(allItems).slice(existingCount)

  //     // Tell Masonry about the new elements
  //     this.masonry.appended(Array.from(newItems))
      
  //     // Refresh masonry, lightgallery and the index
  //     imagesLoaded(newItems, () => {
  //       this.masonry.layout()
  //     })
  //     this.lightGallery.refresh()

  //     this.index += PER_PAGE

  //   }
  // }

  loadMoreItems () {
    if (this.index >= this.items.length) return
  
    // 1) Build new batch off-DOM
    const fragment = document.createDocumentFragment()
    const newItems = []
  
    this.items
      .slice(this.index, this.index + PER_PAGE)
      .forEach(item => {
        const a = document.createElement('a')
        a.classList.add('lg-item', 'grid-item')
  
        if (item.video) {
          a.setAttribute('data-video', item.video)
          if (item.downloadUrl) {
            a.setAttribute('data-download-url', item.downloadUrl)
          }
          const img = document.createElement('img')
          img.alt = ''
          img.src = item.thumbnailUrl
          a.append(img)
  
          const play = document.createElement('div')
          play.classList.add('play-icon')
          a.append(play)
  
        } else {
          a.href = item.previewUrl
          if (item.downloadUrl) {
            a.setAttribute('data-download-url', item.downloadUrl)
          }
          const img = document.createElement('img')
          img.alt = ''
          img.src = item.thumbnailUrl
          a.append(img)
        }
  
        fragment.append(a)
        newItems.push(a)
      })
  
    // 2) Append everything in one reflow
    this.element.append(fragment)
  
    // 3) Tell Masonry exactly which items are new
    this.masonry.appended(newItems)
  
    // 4) Wait for those images to load, then layout and finally refresh lightGallery
    imagesLoaded(newItems, () => {
      this.masonry.layout()
      this.lightGallery.refresh()
    })
  
    // 5) Advance index
    this.index += PER_PAGE
  }

}
const lgallery = new LGallery()