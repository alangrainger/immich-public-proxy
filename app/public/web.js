// LGallery.js

class LGallery {
  // — Centralized configuration —
  static PER_PAGE       = 50;
  static SCROLL_BUFFER  = 200;
  static MASONRY_CONFIG = {
    itemSelector:   '.grid-item',
    percentPosition: true,
    gutter:          0,
    columnWidth:     '.grid-item:first-of-type'
  };

  // — Instance properties —
  items         = [];
  index         = LGallery.PER_PAGE;
  element       = null;
  masonry       = null;
  lightGallery  = null;
  loader        = null; // #bottom-loader
  preloader     = null; // #page-loader

  constructor() {
    // bind once so we can safely use `this` in event listeners
    this.handleScroll = this.handleScroll.bind(this);

    // cache loader elements
    this.loader    = document.getElementById('bottom-loader');
    this.preloader = document.getElementById('page-loader');
  }

  /**
   * Fade out & remove the page preloader once everything's loaded
   */
  preloaded() {
    if (!this.preloader) return;
    window.addEventListener('load', () => {
      this.preloader.classList.add('hidden');
      this.preloader.addEventListener('transitionend', () => {
        this.preloader.remove();
      });
    });
  }

  /**
   * Initialize Masonry, lightGallery, and scroll‐to‐load behavior
   */
  init({ items = [], lgConfig = {} } = {}) {
    this.items   = items;
    this.element = document.getElementById('lightgallery');

    // set up Masonry
    this.masonry = new Masonry(this.element, LGallery.MASONRY_CONFIG);
    this.masonry.layout();

    // set up lightGallery
    this.lightGallery = lightGallery(
      this.element,
      Object.assign({
        selector:               '.lg-item',
        animateThumb:           true,
        licenseKey:             '8FFA6495-676C4D30-8BFC54B6-4D0A6CEC',
        plugins:                [lgFullscreen, lgThumbnail, lgVideo, lgZoom],
        hash:                   true,
        toggleThumb:            true,
        allowMediaOverlap:      true,
        subHtmlSelectorRelative:true,
        zoomFromOrigin:         true
      }, lgConfig)
    );

    // scroll listener with inline debounce
    let timeout;
    window.addEventListener('scroll', () => {
      clearTimeout(timeout);
      timeout = setTimeout(this.handleScroll, 100);
    });

    // load initial batch if needed
    this.handleScroll();
  }

  /**
   * Listen for scroll events, check how close we are to the bottom, then load more
   */
  handleScroll() {
    if (!this.element) return;
    
    const { bottom } = this.element.getBoundingClientRect();
    
    if (bottom - window.innerHeight > LGallery.SCROLL_BUFFER) return;
    
    this.loadMoreItems();
  }

  /**
   * Load more gallery items as per lightGallery docs
   * https://www.lightgalleryjs.com/demos/infinite-scrolling/
   */
  loadMoreItems() {
    if (this.index >= this.items.length) return;

    // Show bottom loader
    if (this.loader) {
      this.loader.classList.remove('fade-out');
      this.loader.classList.add('fade-in');
    }

    // Build a single HTML string for the batch
    let html = '';
    this.items
      .slice(this.index, this.index + LGallery.PER_PAGE)
      .forEach(item => {
        if (item.video) {
          html += `<a class="lg-item grid-item" data-video="${item.video}"${
            item.downloadUrl ? ` data-download-url="${item.downloadUrl}"` : ''
          }>
            <img alt="" src="${item.thumbnailUrl}"/><div class="play-icon"></div>
          </a>`;
        } else {
          html += `<a class="lg-item grid-item" href="${item.previewUrl}"${
            item.downloadUrl ? ` data-download-url="${item.downloadUrl}"` : ''
          }>
            <img alt="" src="${item.thumbnailUrl}"/>
          </a>`;
        }
      });

    // Parse it into a DocumentFragment
    const fragment = document.createRange().createContextualFragment(html);
    
    // Grab exactly the new <a> nodes
    const newItems = Array.from(fragment.querySelectorAll('a.lg-item'));

    // Append them in one go
    this.element.append(fragment);

    // Tell Masonry about the new items, then wait for images and layout → refresh
    this.masonry.appended(newItems);
    imagesLoaded(newItems, () => {
      this.masonry.layout();
      this.lightGallery.refresh();

      // Hide bottom loader
      if (this.loader) {
        this.loader.classList.remove('fade-in');
        this.loader.classList.add('fade-out');
      }
    });
    
    // Advance the index
    this.index += LGallery.PER_PAGE;
  }
}

const lgallery = new LGallery();