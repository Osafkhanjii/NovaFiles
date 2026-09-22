/**
 * FileGrid — Unified Zoom & View System (v5 — FULL BATCH + 3-BUCKET CACHE + PREFETCH)
 *
 * Fixes:
 *  - 3-bucket cache (64/128/256) → zoom pe instant, no refetch
 *  - Pre-fetch neighbours on zoom settle → zero delay
 *  - Batch IPC for both icons & details views
 *  - Inline styles on <img> → no CSS override for small icons
 */

class FileGrid {
  constructor(app) {
    this.app = app;

    this.container     = document.getElementById('file-container');
    this.grid          = document.getElementById('desktop-grid');
    this.detailsHeader = document.getElementById('details-header');
    this.statusTotalCount = document.getElementById('status-total-count');
    this.statusSelection  = document.getElementById('status-selection');

    this.slider    = document.getElementById('status-icon-slider');
    this.sizeLabel = document.getElementById('status-size-label');
    this.btnDec    = document.getElementById('status-slider-dec');
    this.btnInc    = document.getElementById('status-slider-inc');
    this.zoomArea  = document.getElementById('zoom-control-area');

    this.viewBtns = document.querySelectorAll('.bottom-view-btn');

    this.zoomLevel   = 48;
    this.currentMode = 'icons';

    this.items         = [];
    this.selectedItems = new Set();
    this.selectedItem  = null;

    this.THRESHOLD_TO_DETAILS = 18;
    this.THRESHOLD_TO_ICONS   = 24;

    this._animRAF  = null;
    this._observer = null;
    this._fileIconCache = new Map();
    this._folderPreviewCache = new Map();
    this._imageCache = new Map();
    this._folderPreviewQueue = [];
    this._folderPreviewRunning = false;
    this._loadRequestId = 0;
    this._prefetchTimeout = null;

    // 3-bucket sizes
    this._BUCKET_SMALL  = 64;
    this._BUCKET_MEDIUM = 128;
    this._BUCKET_LARGE  = 256;

    this._initSlider();
    this._initStepButtons();
    this._initViewButtons();
    this._initWheelOnSlider();
    this._initAltWheelOnFileArea();
    this._initContainerClick();
    this._initThumbnailObserver();
    this._initZoomHover();

    this.applyZoom(this.zoomLevel, false);
  }

  // ═══════════════════════════════════════════════════════════
  // 3-BUCKET SIZE (fixes zoom delay)
  // ═══════════════════════════════════════════════════════════

 _getIconSize() {
  const iconT = Math.max(0, (this.zoomLevel - 20) / 80);
  const rawSize = Math.round(52 + iconT * (360 - 52));

  // 2 buckets — sharper icons
  if (rawSize <= 80) return 64;
  return 256;   // ← 256 pe jump karo — 128 se 256 behtar hai
}

  _getThumbnailRequestSize() {
  const iconSize = this._getIconSize();
  if (iconSize <= 64) return 128;
  return 256;   // ← 64 se upar sab 256
}

  _snapSize(size) {
    if (size <= 64) return 64;
    if (size <= 128) return 128;
    if (size <= 256) return 256;
    if (size <= 512) return 512;
    if (size <= 1024) return 1024;
    return 2048;
  }

  // ═══════════════════════════════════════════════════════════
  // Pre-fetch neighbours on zoom settle (fixes mini delay)
  // ═══════════════════════════════════════════════════════════

  _schedulePrefetch() {
    if (this._prefetchTimeout) clearTimeout(this._prefetchTimeout);
    this._prefetchTimeout = setTimeout(() => {
      this._prefetchNeighbourSizes();
    }, 300);
  }

  async _prefetchNeighbourSizes() {
    const currentSize = this._getIconSize();
    const sizesToPrefetch = [];

    if (currentSize === this._BUCKET_SMALL) {
      sizesToPrefetch.push(this._BUCKET_MEDIUM);
    } else if (currentSize === this._BUCKET_MEDIUM) {
      sizesToPrefetch.push(this._BUCKET_SMALL, this._BUCKET_LARGE);
    } else {
      sizesToPrefetch.push(this._BUCKET_MEDIUM);
    }

    // Collect all paths currently on screen
    const wrappers = this.grid?.querySelectorAll('.shell-icon-wrapper') || [];
    const paths = new Set();
    for (const w of wrappers) {
      const fp = w.dataset.filePath;
      if (fp) paths.add(fp);
    }
    if (paths.size === 0) return;

    const pathArr = Array.from(paths);

    for (const size of sizesToPrefetch) {
      // Skip if all cached
      let allCached = true;
      for (const p of pathArr) {
        if (!this._fileIconCache.has(`${p}|${size}`)) { allCached = false; break; }
      }
      if (allCached) continue;

      try {
        const results = await FileIcons.fetchWindowsIconsBatch(pathArr, size);
        for (const [fp, res] of Object.entries(results || {})) {
          if (res && res.dataURL) {
            this._fileIconCache.set(`${fp}|${size}`, {
              dataURL: res.dataURL,
              width: res.width,
              height: res.height,
            });
          }
        }
      } catch (e) {}
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Slider & Controls
  // ═══════════════════════════════════════════════════════════

  _initSlider() {
    if (!this.slider) return;
    this.slider.min   = '0';
    this.slider.max   = '100';
    this.slider.step  = '1';
    this.slider.value = String(this.zoomLevel);
    this.slider.addEventListener('input', (e) => {
      this._cancelAnimation();
      this.applyZoom(parseInt(e.target.value, 10), true);
      this._schedulePrefetch();
    });
  }

  _initStepButtons() {
    this.btnDec?.addEventListener('click', () => {
      this._animateTo(Math.max(0, this.zoomLevel - 8), true);
      this._schedulePrefetch();
    });
    this.btnInc?.addEventListener('click', () => {
      this._animateTo(Math.min(100, this.zoomLevel + 8), true);
      this._schedulePrefetch();
    });
  }

  _initViewButtons() {
    this.viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this._manualSetMode(btn.dataset.mode);
      });
    });
  }

  _manualSetMode(mode) {
    if (mode === 'icons') {
      this._switchMode('icons');
      if (this.zoomLevel <= this.THRESHOLD_TO_DETAILS) this._animateTo(48, false);
    } else if (mode === 'details') {
      this._switchMode('details');
      if (this.zoomLevel >= this.THRESHOLD_TO_ICONS) this._animateTo(10, false);
    }
  }

  setViewMode(mode) { this._manualSetMode(mode); }

  _initWheelOnSlider() {
    const area = this.zoomArea || this.slider;
    if (!area) return;
    area.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      this._cancelAnimation();
      this.applyZoom(Math.min(100, Math.max(0, this.zoomLevel + (e.deltaY < 0 ? 4 : -4))), true);
      this._schedulePrefetch();
    }, { passive: false });
  }

  _initAltWheelOnFileArea() {
    // Ctrl+Scroll works EVERYWHERE in the app — global listener
    const handler = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); e.stopPropagation();
      this._cancelAnimation();
      this.applyZoom(Math.min(100, Math.max(0, this.zoomLevel + (e.deltaY < 0 ? 4 : -4))), true);
      this._schedulePrefetch();
    };
    this.container?.addEventListener('wheel', handler, { passive: false });
    this.grid?.addEventListener('wheel', handler, { passive: false });

    // Global listener for Ctrl+Scroll anywhere in the window
    window.addEventListener('wheel', handler, { passive: false });
  }

  _initContainerClick() {
    this.container?.addEventListener('click', (e) => {
      if (e.target === this.container || e.target === this.grid) this.clearSelection();
    });
    this.container?.addEventListener('mousedown', (e) => {
      if (e.button === 1 && (e.target === this.container || e.target === this.grid)) {
        e.preventDefault();
        const activeTab = this.app.tabsManager?.getActiveTab();
        if (activeTab?.path) this.app.tabsManager?.createTab(activeTab.path, true);
      }
    });
  }

  // ── Zoom area hover show/hide ─────────────────────────

  _initZoomHover() {
    // Zoom area always visible — just ensure it stays visible when slider is focused
    if (this.slider) {
      this.slider.addEventListener('focus', () => { this.zoomArea?.classList.add('visible'); });
      this.slider.addEventListener('blur', () => { this.zoomArea?.classList.remove('visible'); });
    }
  }

  _initThumbnailObserver() {
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const src = img.dataset.src;
        if (src && window.electronAPI) {
          const displaySize = parseInt(img.dataset.displaySize) || 256;
          window.electronAPI.getThumbnail(src, displaySize).then(url => {
            if (url) { img.src = url; img.classList.remove('opacity-0'); }
          }).catch(() => {});
          this._observer.unobserve(img);
        }
      });
    }, { root: this.container, rootMargin: '120px' });
  }

  // ═══════════════════════════════════════════════════════════
  // BATCH LOAD for ICONS view
  // ═══════════════════════════════════════════════════════════

  async _loadAllShellIcons() {
    const wrappers = this.grid?.querySelectorAll('.shell-icon-wrapper') || [];
    if (wrappers.length === 0) return;

    const requestId = ++this._loadRequestId;
    const startZoom = this.zoomLevel;
    const iconSize = this._getIconSize();

    const pathsToLoad = [];
    const seen = new Set();

    for (const wrapper of wrappers) {
      const filePath = wrapper.dataset.filePath;
      if (!filePath) continue;

      const cacheKey = `${filePath}|${iconSize}`;
      const cached = this._fileIconCache.get(cacheKey);
      if (cached) {
        this._applyIconToElement(wrapper, cached.dataURL);
      } else if (!seen.has(filePath)) {
        seen.add(filePath);
        pathsToLoad.push(filePath);
      }
    }

    if (pathsToLoad.length === 0) return;

    if (this._loadRequestId !== requestId) return;
    if (Math.abs(this.zoomLevel - startZoom) > 8) return;

    try {
      const results = await FileIcons.fetchWindowsIconsBatch(pathsToLoad, iconSize);

      if (this._loadRequestId !== requestId) return;
      if (Math.abs(this.zoomLevel - startZoom) > 8) return;

      for (const [filePath, result] of Object.entries(results || {})) {
        if (!result || !result.dataURL) continue;

        const cacheKey = `${filePath}|${iconSize}`;
        this._fileIconCache.set(cacheKey, {
          dataURL: result.dataURL,
          width: result.width,
          height: result.height,
        });

        const targets = this.grid?.querySelectorAll(
          `.shell-icon-wrapper[data-file-path="${CSS.escape(filePath)}"]`
        ) || [];
        targets.forEach(w => this._applyIconToElement(w, result.dataURL));
      }
    } catch (e) {
      console.error('Batch icon load failed:', e);
    }
  }

  _applyIconToElement(el, dataURL) {
    if (!el) return;
    const img = el.querySelector('.shell-icon-img');
    if (img) {
      img.src = dataURL;
      img.style.opacity = '1';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.minWidth = '0';
      img.style.minHeight = '0';
      img.style.objectFit = 'contain';
      img.style.objectPosition = 'center center';
      img.style.display = 'block';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BATCH LOAD for DETAILS view
  // ═══════════════════════════════════════════════════════════

  async _loadAllDetailsIcons() {
    const detailsIconSize = 64;
    const imgs = this.grid?.querySelectorAll('.details-icon-slot img[data-file-path]') || [];
    if (imgs.length === 0) return;

    const requestId = ++this._loadRequestId;
    const startZoom = this.zoomLevel;

    const shellPaths = [];
    const imagePaths = [];
    const seen = new Set();

    for (const img of imgs) {
      const fp = img.dataset.filePath;
      if (!fp || seen.has(fp)) continue;
      seen.add(fp);

      const cacheKey = `${fp}|${detailsIconSize}`;
      if (this._fileIconCache.has(cacheKey)) continue;

      if (img.dataset.isImage === 'true') {
        imagePaths.push(fp);
      } else {
        shellPaths.push(fp);
      }
    }

    // 1. Images: parallel nativeImage thumbnails
    if (imagePaths.length > 0) {
      await Promise.all(imagePaths.map(async (fp) => {
        try {
          const url = await window.electronAPI.getThumbnail(fp, 128);
          if (url && this._loadRequestId === requestId) {
            const cacheKey = `${fp}|${detailsIconSize}`;
            this._fileIconCache.set(cacheKey, { dataURL: url, width: 128, height: 128 });
            this.grid?.querySelectorAll(
              `.details-icon-slot img[data-file-path="${CSS.escape(fp)}"]`
            ).forEach(el => { el.src = url; });
          }
        } catch (e) {}
      }));
    }

    // 2. Shell icons: ONE batch IPC call
    if (shellPaths.length > 0) {
      if (this._loadRequestId !== requestId) return;
      if (Math.abs(this.zoomLevel - startZoom) > 8) return;

      try {
        const results = await FileIcons.fetchWindowsIconsBatch(shellPaths, detailsIconSize);
        if (this._loadRequestId !== requestId) return;

        for (const [fp, result] of Object.entries(results || {})) {
          if (!result || !result.dataURL) continue;

          const cacheKey = `${fp}|${detailsIconSize}`;
          this._fileIconCache.set(cacheKey, {
            dataURL: result.dataURL,
            width: result.width,
            height: result.height,
          });

          this.grid?.querySelectorAll(
            `.details-icon-slot img[data-file-path="${CSS.escape(fp)}"]`
          ).forEach(el => { el.src = result.dataURL; });
        }
      } catch (e) {
        console.error('Details batch load failed:', e);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Zoom
  // ═══════════════════════════════════════════════════════════

  applyZoom(value, triggerSwitch = true) {
    this.zoomLevel = Math.min(100, Math.max(0, value));
    if (this.slider && parseInt(this.slider.value, 10) !== this.zoomLevel)
      this.slider.value = String(this.zoomLevel);

    const activeTab = this.app.tabsManager?.getActiveTab();
    if (activeTab) { activeTab.zoomLevel = this.zoomLevel; activeTab.viewMode = this.currentMode; }

    if (triggerSwitch) {
      if (this.currentMode !== 'details' && this.zoomLevel <= this.THRESHOLD_TO_DETAILS) {
        this._switchMode('details'); return;
      }
      if (this.currentMode === 'details' && this.zoomLevel >= this.THRESHOLD_TO_ICONS) {
        this._switchMode('icons'); return;
      }
    }

    this._applyCSSTokens();
    this._updateZoomLabel();
    this._highlightViewButton(this.currentMode);
  }

  _applyCSSTokens() {
    const t = Math.max(0, Math.min(1, this.zoomLevel / 100));
    const iconT = Math.max(0, (this.zoomLevel - 20) / 80);
    const iconSize = Math.round(52 + iconT * (360 - 52));

    const itemSize = Math.round(iconSize * 1.36 + 24);
    const gridGap  = Math.round(10 + iconT * 14);
    const iconFontSize = Math.round(12.5 + iconT * 2.5);

    const s = document.documentElement.style;
    s.setProperty('--item-size', `${itemSize}px`);
    s.setProperty('--icon-size', `${iconSize}px`);
    s.setProperty('--grid-gap', `${gridGap}px`);
    s.setProperty('--item-font-size', `${iconFontSize}px`);
    s.setProperty('--details-icon-size', `${Math.round(14 + t * 8)}px`);
    s.setProperty('--details-row-height', `${Math.round(26 + t * 12)}px`);
    s.setProperty('--details-font-size', `${Math.round(11 + t * 2)}px`);
    s.setProperty('--details-padding-x', `${Math.round(8 + t * 8)}px`);
    s.setProperty('--details-padding-y', `${Math.round(3 + t * 5)}px`);
    s.setProperty('--details-gap', `${Math.round(2 + t * 4)}px`);

    this.grid?.classList.toggle('huge-scale', this.zoomLevel >= 94);
  }

  _updateZoomLabel() {
    if (!this.sizeLabel) return;
    if (this.currentMode === 'details') { this.sizeLabel.textContent = 'Details View'; return; }
    const iconT = Math.max(0, (this.zoomLevel - 20) / 80);
    const iconSize = Math.round(52 + iconT * (360 - 52));
    let label;
    if (this.zoomLevel < 36)      label = `Small (${iconSize}px)`;
    else if (this.zoomLevel < 64) label = `Medium (${iconSize}px)`;
    else if (this.zoomLevel < 85) label = `Large (${iconSize}px)`;
    else if (this.zoomLevel < 95) label = `X-Large (${iconSize}px)`;
    else                          label = `Huge (${iconSize}px)`;
    this.sizeLabel.textContent = label;
  }

  _highlightViewButton(activeMode) {
    this.viewBtns.forEach(btn => {
      const isActive = btn.dataset.mode === activeMode;
      btn.className = isActive
        ? 'bottom-view-btn px-2 h-6 rounded flex items-center gap-1 text-[11.5px] font-medium cursor-pointer transition-colors text-win-text bg-white/12 border border-white/10 shadow-xs'
        : 'bottom-view-btn px-2 h-6 rounded flex items-center gap-1 text-[11.5px] font-medium cursor-pointer transition-colors text-win-textMuted hover:text-win-text hover:bg-white/5';
    });
  }

  _switchMode(newMode) {
    if (this.currentMode === newMode) return;
    const savedScrollTop = this.container?.scrollTop || 0;
    const savedSelection = Array.from(this.selectedItems);
    this.currentMode = newMode;
    const activeTab = this.app.tabsManager?.getActiveTab();
    if (activeTab) { activeTab.viewMode = newMode; activeTab.zoomLevel = this.zoomLevel; }
    this._renderItems();
    savedSelection.forEach(path => {
      const el = this.grid?.querySelector(`.desktop-item[data-path="${CSS.escape(path)}"]`);
      if (el) { el.classList.add('is-selected'); this.selectedItems.add(path); }
    });
    this._updateSelectionStatus();
    if (this.container) this.container.scrollTop = savedScrollTop;
    this._applyCSSTokens();
    this._updateZoomLabel();
    this._highlightViewButton(newMode);
  }

  _animateTo(targetZoom, triggerSwitch = false) {
    this._cancelAnimation();
    if (targetZoom === this.zoomLevel) return;
    const startZoom = this.zoomLevel, diff = targetZoom - startZoom, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 150);
      this.applyZoom(Math.round(startZoom + diff * (1 - Math.pow(1 - p, 3))), triggerSwitch);
      if (p < 1) this._animRAF = requestAnimationFrame(step);
    };
    this._animRAF = requestAnimationFrame(step);
  }

  _cancelAnimation() { if (this._animRAF) { cancelAnimationFrame(this._animRAF); this._animRAF = null; } }

  restoreTabState(tabZoom, tabMode) {
    this._cancelAnimation();
    this.zoomLevel = Math.min(100, Math.max(0, tabZoom ?? 48));
    this.currentMode = tabMode || (this.zoomLevel <= this.THRESHOLD_TO_DETAILS ? 'details' : 'icons');
    if (this.slider) this.slider.value = String(this.zoomLevel);
    this._renderItems();
    this.applyZoom(this.zoomLevel, false);
    this._schedulePrefetch();
  }

  render(items) {
    this.items = items || [];
    this._folderPreviewQueue = [];
    this._renderItems();
    this._updateSelectionStatus();
  }

  _renderItems() {
    if (!this.grid) return;
    this.grid.innerHTML = '';

    if (this.items.length === 0) {
      this.detailsHeader?.classList.add('hidden');
      this.grid.className = 'flex flex-col items-center justify-center h-64 text-win-textMuted text-win-sm gap-2 select-none';
      this.grid.innerHTML = `
        <svg class="w-12 h-12 opacity-30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z"/>
        </svg>
        <span class="text-win-sm font-medium">This folder is empty.</span>`;
      this.clearSelection();
      if (this.statusTotalCount) this.statusTotalCount.textContent = '0 items';
      return;
    }

    if (this.statusTotalCount) this.statusTotalCount.textContent = `${this.items.length} items`;
    this.currentMode === 'details' ? this._renderDetailsView() : this._renderIconsView();
  }

  // ═══════════════════════════════════════════════════════════
  // ICONS VIEW
  // ═══════════════════════════════════════════════════════════

  _renderIconsView() {
    this.detailsHeader?.classList.add('hidden');
    this.grid.className = 'grid-icons-dynamic';
    if (this.zoomLevel >= 94) this.grid.classList.add('huge-scale');
    this._applyCSSTokens();

    const showThumbnails = this.zoomLevel >= 36;
    const iconSize = this._getIconSize();

    this.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'desktop-item flex flex-col items-center text-center cursor-pointer group';
      el.dataset.path = item.path;

      const iconSlot = document.createElement('div');
      iconSlot.className = 'icon-slot mb-1.5 flex items-center justify-center relative';

      if (item.isDirectory) {
        iconSlot.innerHTML = this._folderIconWithPreview(item);
        const previewContainer = iconSlot.querySelector('.folder-preview-container');
        if (previewContainer && window.electronAPI) {
          this._loadFolderPreview(item.path, previewContainer);
        }
      } else if (item.typeCategory === 'images' && showThumbnails) {
        const img = document.createElement('img');
        img.className = 'file-thumbnail';
        img.alt = '';
img.style.cssText = 'width:88%;height:88%;object-fit:contain;object-position:center center;image-rendering:auto;border-radius:4px;border:1px solid rgba(255,255,255,0.18);box-shadow:0 2px 8px rgba(0,0,0,0.35);opacity:0;transition:opacity 0.15s;';
img.onload = () => { img.style.opacity = '1'; };   // ← YE ADD KARO
img.onerror = () => { img.style.display = 'none'; };
        const thumbSize = this._getThumbnailRequestSize();
        const imgCacheKey = `img:${item.path}|${thumbSize}`;
        const imgCached = this._imageCache.get(imgCacheKey);

        if (imgCached) {
          img.src = imgCached.dataURL;
        } else {
          img.src = 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" opacity="0.12">' +
            '<rect width="48" height="48" rx="4" fill="#666"/>' +
            '<path d="M12 32l8-10 6 7 4-4 8 7" stroke="#444" stroke-width="1.5" fill="none"/>' +
            '</svg>'
          );

          window.electronAPI.getThumbnail(item.path, thumbSize).then(url => {
            if (url) {
              this._imageCache.set(imgCacheKey, { dataURL: url });
              img.src = url;
            } else {
              window.electronAPI.getFileIcon(item.path, iconSize).then(iconResult => {
                if (iconResult && iconResult.dataURL) {
                  img.src = iconResult.dataURL;
                } else {
                  img.onerror = null;
                  img.style.display = 'none';
                }
              }).catch(() => { img.onerror = null; img.style.display = 'none'; });
            }
          }).catch(() => {
            img.onerror = null;
            img.style.display = 'none';
          });
        }

        iconSlot.appendChild(img);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'shell-icon-wrapper w-full h-full flex items-center justify-center';
        wrapper.dataset.filePath = item.path;
        wrapper.dataset.iconSize = String(iconSize);
        wrapper.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;';

        const img = document.createElement('img');
        img.className = 'shell-icon-img';
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;max-width:100%;max-height:100%;min-width:0;min-height:0;object-fit:contain;object-position:center center;image-rendering:auto;transition:opacity 0.15s;display:block;';

        const cacheKey = `${item.path}|${iconSize}`;
        const cached = this._fileIconCache.get(cacheKey);
        if (cached) {
          img.src = cached.dataURL;
        } else {
          img.src = 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" opacity="0.12">' +
            '<path d="M10 4h20l10 10v28a4 4 0 01-4 4H10a4 4 0 01-4-4V8a4 4 0 014-4z" fill="#666" stroke="#444" stroke-width="1"/>' +
            '</svg>'
          );
        }

        wrapper.appendChild(img);
        iconSlot.appendChild(wrapper);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'item-name text-win-text leading-tight px-1 rounded max-w-full font-normal';
      nameEl.textContent = item.name;

      el.appendChild(iconSlot);
      el.appendChild(nameEl);
      this._attachEvents(el, item);
      this.grid.appendChild(el);
    });

    requestAnimationFrame(() => this._loadAllShellIcons());
  }

  // ═══════════════════════════════════════════════════════════
  // DETAILS VIEW — FULL BATCH
  // ═══════════════════════════════════════════════════════════

  _renderDetailsView() {
    this.detailsHeader?.classList.remove('hidden');
    this.grid.className = 'grid-details';

    const detailsIconSize = 64;

    this.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'desktop-item details-row';
      el.dataset.path = item.path;

      const colName = document.createElement('div');
      colName.className = 'col-name flex items-center gap-2.5 min-w-0';

      const iconSlot = document.createElement('div');
      iconSlot.className = 'details-icon-slot flex items-center justify-center shrink-0';

      const isImage = item.typeCategory === 'images';
      const img = document.createElement('img');
      img.className = isImage ? 'details-thumb' : 'details-shell-icon';
      img.alt = '';
      img.dataset.filePath = item.path;
      img.dataset.isImage = isImage ? 'true' : 'false';
      img.style.cssText = isImage
  ? 'width:var(--details-icon-size);height:var(--details-icon-size);object-fit:contain;object-position:center center;image-rendering:auto;border-radius:3px;flex-shrink:0;display:block;'
  : 'width:var(--details-icon-size);height:var(--details-icon-size);object-fit:contain;object-position:center center;image-rendering:auto;flex-shrink:0;display:block;';

      const cacheKey = `${item.path}|${detailsIconSize}`;
      const cached = this._fileIconCache.get(cacheKey);
      if (cached) {
        img.src = cached.dataURL;
      } else {
        img.src = isImage
          ? 'data:image/svg+xml,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" opacity="0.15">' +
              '<rect width="16" height="16" rx="1" fill="#666"/></svg>')
          : 'data:image/svg+xml,' + encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" opacity="0.15">' +
              '<path d="M3 1h7l3 3v10a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1z" fill="#666" stroke="#444" stroke-width="0.5"/></svg>');
      }

      iconSlot.appendChild(img);

      const nameText = document.createElement('span');
      nameText.className = 'details-name-text truncate text-win-text font-normal';
      nameText.textContent = item.name;
      colName.appendChild(iconSlot);
      colName.appendChild(nameText);

      const colDate = document.createElement('div');
      colDate.className = 'col-date details-col-text text-win-textMuted truncate';
      colDate.textContent = item.formattedMtime || '';

      const colType = document.createElement('div');
      colType.className = 'col-type details-col-text text-win-textMuted truncate';
      colType.textContent = item.kind || '';

      const colSize = document.createElement('div');
      colSize.className = 'col-size details-col-text text-right text-win-textMuted font-mono truncate';
      colSize.textContent = item.isDirectory ? '—' : (item.formattedSize || '');

      el.append(colName, colDate, colType, colSize);
      this._attachEvents(el, item);
      this.grid.appendChild(el);
    });

    requestAnimationFrame(() => this._loadAllDetailsIcons());
  }

  // ═══════════════════════════════════════════════════════════
  // Item events
  // ═══════════════════════════════════════════════════════════

  _attachEvents(el, item) {
    el.addEventListener('click', (e) => { e.stopPropagation(); this._selectItem(item, el, e.ctrlKey); });
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (item.isDirectory) this.app.navigationManager?.navigateTo(item.path);
      else if (window.electronAPI) window.electronAPI.openPath(item.path);
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1 && item.isDirectory) {
        e.preventDefault(); e.stopPropagation();
        this.app.tabsManager?.createTab(item.path, true);
      }
    });
    el.addEventListener('contextmenu', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (!this.selectedItems.has(item.path)) this._selectItem(item, el, false);
      this.app.contextMenu?.show(e.clientX, e.clientY, item);
    });
  }

  _selectItem(item, el, isMulti) {
    if (!isMulti) {
      this.grid?.querySelectorAll('.desktop-item').forEach(i => i.classList.remove('is-selected'));
      this.selectedItems.clear();
    }
    if (this.selectedItems.has(item.path) && isMulti) {
      this.selectedItems.delete(item.path);
      el.classList.remove('is-selected');
    } else {
      this.selectedItems.add(item.path);
      el.classList.add('is-selected');
    }
    this.selectedItem = item;
    this._updateSelectionStatus();
    this.app.inspector?.inspectItem(item);
  }

  clearSelection() {
    this.grid?.querySelectorAll('.desktop-item').forEach(i => i.classList.remove('is-selected'));
    this.selectedItems.clear();
    this.selectedItem = null;
    this._updateSelectionStatus();
    this.app.inspector?.clear();
  }

  _updateSelectionStatus() {
    if (!this.statusSelection) return;
    const count = this.selectedItems.size;
    if (count === 0) {
      this.statusSelection.innerHTML = '0 items selected';
    } else if (count === 1 && this.selectedItem) {
      const sz = this.selectedItem.formattedSize ? ` (${this.selectedItem.formattedSize})` : '';
      this.statusSelection.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-win-accent"></span> 1 item selected${sz}`;
    } else {
      this.statusSelection.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-win-accent"></span> ${count} items selected`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Folder preview — 2x2 grid of actual images
  // ═══════════════════════════════════════════════════════════

  _folderIconWithPreview(item) {
    return `
      <div class="folder-preview-container relative w-full h-full">
        <svg class="absolute inset-0 w-full h-full" style="z-index:0;" fill="none" viewBox="0 0 48 48" preserveAspectRatio="none">
          <path d="M6 12c0-2.2 1.8-4 4-4h8l4 4h16c2.2 0 4 1.8 4 4v20c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V12z" fill="#c8940a"/>
        </svg>
        <div class="folder-preview-images absolute" style="z-index:1; top:36%; bottom:18%; left:8%; right:8%; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:2px;"></div>
        <svg class="absolute inset-0 w-full h-full" style="z-index:2; pointer-events:none;" fill="none" viewBox="0 0 48 48" preserveAspectRatio="none">
          <path d="M6 18h36v20c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V18z" fill="#FFB900"/>
          <path d="M6 18h36v2H6z" fill="#FFC940" opacity="0.6"/>
        </svg>
      </div>`;
  }

  async _loadFolderPreview(folderPath, container) {
    if (this._folderPreviewCache.has(folderPath)) {
      const cached = this._folderPreviewCache.get(folderPath);
      if (cached && container) this._applyFolderPreview(container, cached);
      return;
    }
    this._folderPreviewQueue.push({ folderPath, container });
    if (!this._folderPreviewRunning) this._processFolderPreviewQueue();
  }

  async _processFolderPreviewQueue() {
    this._folderPreviewRunning = true;
    while (this._folderPreviewQueue.length > 0) {
      const { folderPath, container } = this._folderPreviewQueue.shift();
      if (!container || !container.isConnected) continue;

      if (this._folderPreviewCache.has(folderPath)) {
        const cached = this._folderPreviewCache.get(folderPath);
        if (cached && container.isConnected) this._applyFolderPreview(container, cached);
        continue;
      }

      try {
        const imagePaths = await window.electronAPI.getFolderPreviewImages(folderPath);
        if (imagePaths && imagePaths.length > 0) {
          this._folderPreviewCache.set(folderPath, imagePaths);
          if (container && container.isConnected) this._applyFolderPreview(container, imagePaths);
        }
      } catch (_) {}
    }
    this._folderPreviewRunning = false;
  }

  _applyFolderPreview(container, imagePaths) {
    if (!imagePaths || !container) return;
    const previewArea = container.querySelector('.folder-preview-images');
    if (!previewArea) return;
    previewArea.innerHTML = '';

    const iconDisplaySize = this._getIconSize();
    const thumbSize = this._snapSize(Math.max(64, Math.round(iconDisplaySize * 0.5 * 2)));

    const count = Math.min(imagePaths.length, 4);
    for (let i = 0; i < count; i++) {
      const img = document.createElement('img');
      img.className = 'folder-preview-thumb';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:1px;opacity:0;transition:opacity 0.2s;';
      img.alt = '';
      img.loading = 'lazy';

      window.electronAPI.getThumbnail(imagePaths[i], thumbSize).then(url => {
        if (url) {
          img.onload = () => { img.style.opacity = '1'; };
          img.src = url;
        } else {
          img.style.display = 'none';
        }
      }).catch(() => { img.style.display = 'none'; });
      previewArea.appendChild(img);
    }
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}