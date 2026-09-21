class NovaFilesApp {
  constructor() {
    this.drives = [];
    this.specialFolders = [];
    this.currentItems = [];
    this.sortField = 'name';
    this.sortAsc = true;

    this.navigationManager = null;
    this.tabsManager = null;
    this.fileGrid = null;
    this.fileOperations = null;
    this.inspector = null;
    this.contextMenu = null;
    this.themesManager = null;

    this.initWindowControls();
    this.initSearch();
  }

  async init() {
    // Initialize components
    this.navigationManager = new NavigationManager(this);
    this.tabsManager = new TabsManager(this);
    this.fileGrid = new FileGrid(this);
    this.fileOperations = new FileOperationsManager(this);
    this.inspector = new InspectorController(this);
    this.contextMenu = new ContextMenuController(this);
    this.themesManager = new ThemesManager(this);

    // Load drives and standard user folders
    await this.loadDrives();
    await this.loadSpecialFolders();
    this.renderThisPC();

    // Open initial tab with Desktop or first drive
    const initialLocation = this.getInitialLocation();
    this.tabsManager.createTab(initialLocation, true);

    // Initialize resizable panels
    this.initResizablePanels();
  }

  getInitialLocation() {
    const desktopFolder = this.specialFolders.find(f => f.id === 'desktop');
    if (desktopFolder && desktopFolder.path) {
      return desktopFolder.path;
    }
    if (this.drives && this.drives.length > 0) {
      return this.drives[0].path;
    }
    return 'C:\\';
  }

  initWindowControls() {
    document.getElementById('btn-win-min')?.addEventListener('click', () => {
      window.electronAPI?.minimizeWindow();
    });
    document.getElementById('btn-win-max')?.addEventListener('click', () => {
      window.electronAPI?.maximizeWindow();
    });
    document.getElementById('btn-win-close')?.addEventListener('click', () => {
      window.electronAPI?.closeWindow();
    });
  }

  initSearch() {
    const searchInput = document.getElementById('desktop-search');
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        this.fileGrid.render(this.currentItems);
        return;
      }
      const filtered = this.currentItems.filter(item => item.name.toLowerCase().includes(q));
      this.fileGrid.render(filtered);
    });

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
      }
    });
  }

  async loadDrives() {
    if (!window.electronAPI) return;
    try {
      this.drives = await window.electronAPI.getDrives();
      this.renderSidebarDrives();
    } catch (err) {
      console.error('Failed to load drives:', err);
    }
  }

  renderSidebarDrives() {
    const container = document.getElementById('sidebar-drives');
    if (!container) return;
    container.innerHTML = '';

    this.drives.forEach(drive => {
      const driveEl = document.createElement('div');
      driveEl.className = 'group px-2.5 py-2 rounded-md hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-win-border';
      driveEl.dataset.path = drive.path;

      const driveIconSvg = drive.isRemovable
        ? `<svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="16" rx="2" width="10" x="7" y="4"></rect><path d="M11 20v2M13 20v2"></path></svg>`
        : `<svg class="w-4 h-4 text-win-accent shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="16" rx="2" width="20" x="2" y="4"></rect><path d="M6 16h.01M10 16h.01M14 16h.01M18 16h.01"></path></svg>`;

      driveEl.innerHTML = `
        <div class="flex items-center justify-between text-win-sm mb-1.5">
          <div class="flex items-center gap-2 truncate min-w-0">
            ${driveIconSvg}
            <span class="text-win-text font-semibold truncate text-[13px]">${escapeHtml(drive.name)}</span>
          </div>
          <span class="text-[11px] font-mono text-win-textMuted ml-1">${drive.usedPercent}%</span>
        </div>
        <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-1">
          <div class="h-full ${drive.usedPercent > 90 ? 'bg-red-500' : 'bg-win-accent'} rounded-full transition-all duration-300" style="width: ${drive.usedPercent}%;"></div>
        </div>
        <div class="text-[11.5px] font-mono text-win-textMuted flex justify-between">
          <span>${escapeHtml(drive.freeFormatted)} free</span>
          <span>${escapeHtml(drive.totalFormatted)}</span>
        </div>
      `;

      driveEl.addEventListener('click', () => {
        this.navigationManager.navigateTo(drive.path);
      });

      container.appendChild(driveEl);
    });
  }

  async loadSpecialFolders() {
    if (!window.electronAPI) return;
    try {
      const data = await window.electronAPI.getSpecialFolders();
      this.specialFolders = data.folders || [];
      this.renderSidebarLocations();
      this.renderQuickAccess(data.home);
    } catch (err) {
      console.error('Failed to load special folders:', err);
    }
  }

  renderQuickAccess(homePath) {
    const container = document.getElementById('sidebar-quick-access');
    if (!container) return;
    container.innerHTML = '';

    const homeItem = document.createElement('a');
    homeItem.className = 'flex items-center justify-between px-2.5 h-8.5 rounded-md hover:bg-white/5 text-win-textSecondary hover:text-win-text transition-colors cursor-pointer text-[13px] font-medium';
    homeItem.innerHTML = `
      <div class="flex items-center gap-2.5 truncate">
        <svg class="w-4 h-4 text-win-accent shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
        <span class="truncate">Home</span>
      </div>
    `;
    homeItem.addEventListener('click', () => {
      if (homePath) this.navigationManager.navigateTo(homePath);
    });
    container.appendChild(homeItem);
  }

  renderThisPC() {
    const container = document.getElementById('sidebar-this-pc');
    if (!container) return;
    container.innerHTML = '';

    // This PC header item
    const thisPC = document.createElement('a');
    thisPC.className = 'flex items-center px-2.5 h-8 rounded-md hover:bg-white/5 text-win-textSecondary hover:text-win-text transition-colors cursor-pointer text-[13px] font-medium';
    thisPC.innerHTML = `
      <div class="flex items-center gap-2.5 truncate">
        <svg class="w-4 h-4 text-win-accent shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="20" x="2" y="4"></rect><path d="M6 16h.01M10 16h.01M14 16h.01M18 16h.01"></path></svg>
        <span class="font-semibold">This PC</span>
      </div>
    `;
    thisPC.addEventListener('click', () => {
      this.navigationManager?.navigateTo('This PC');
    });
    container.appendChild(thisPC);

    // Drives under This PC
    if (this.drives && this.drives.length > 0) {
      this.drives.forEach(drive => {
        const driveEl = document.createElement('a');
        driveEl.className = 'flex items-center px-2.5 h-7 rounded-md hover:bg-white/5 text-win-textSecondary hover:text-win-text transition-colors cursor-pointer text-[12.5px] ml-5';
        driveEl.dataset.path = drive.path;

        const driveIcon = drive.isRemovable
          ? `<svg class="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="8" x="8" y="4"></rect><path d="M10 18v2M12 18v2"></path></svg>`
          : `<svg class="w-3.5 h-3.5 text-win-accent shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="18" x="3" y="4"></rect><path d="M6 16h.01M10 16h.01M14 16h.01M18 16h.01"></path></svg>`;

        driveEl.innerHTML = `
          <div class="flex items-center gap-2 truncate">
            ${driveIcon}
            <span class="truncate">${escapeHtml(drive.name)}</span>
          </div>
        `;
        driveEl.addEventListener('click', () => {
          this.navigationManager.navigateTo(drive.path);
        });
        container.appendChild(driveEl);
      });
    }

    // Special folders under This PC
    if (this.specialFolders && this.specialFolders.length > 0) {
      this.specialFolders.forEach(folder => {
        const folderEl = document.createElement('a');
        folderEl.className = 'flex items-center px-2.5 h-7 rounded-md hover:bg-white/5 text-win-textSecondary hover:text-win-text transition-colors cursor-pointer text-[12.5px] ml-5';
        folderEl.dataset.path = folder.path;

        const folderIcon = `<svg class="w-3.5 h-3.5 text-win-textMuted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`;

        folderEl.innerHTML = `
          <div class="flex items-center gap-2 truncate">
            ${folderIcon}
            <span class="truncate">${escapeHtml(folder.name)}</span>
          </div>
        `;
        folderEl.addEventListener('click', () => {
          this.navigationManager.navigateTo(folder.path);
        });
        container.appendChild(folderEl);
      });
    }
  }

  renderThisPCView() {
    const grid = document.getElementById('desktop-grid');
    const detailsHeader = document.getElementById('details-header');
    if (!grid) return;

    // Hide details header, use icons-style grid
    detailsHeader?.classList.add('hidden');
    grid.className = 'grid-icons-dynamic';
    grid.innerHTML = '';

    if (!this.drives || this.drives.length === 0) {
      grid.className = 'flex flex-col items-center justify-center h-64 text-win-textMuted text-win-sm gap-2 select-none';
      grid.innerHTML = '<span class="text-win-sm font-medium">No drives detected.</span>';
      return;
    }

    // Section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'col-span-full text-[13px] font-semibold text-win-textSecondary mb-2 px-1';
    sectionHeader.textContent = 'Devices and drives';
    grid.appendChild(sectionHeader);

    // Render each drive as a card
    this.drives.forEach(drive => {
      const card = document.createElement('div');
      card.className = 'desktop-item flex flex-col items-center text-center cursor-pointer group';
      card.dataset.path = drive.path;

      // Drive icon — like Windows Explorer style
      const iconSlot = document.createElement('div');
      iconSlot.className = 'icon-slot mb-1.5 flex items-center justify-center relative';
      iconSlot.innerHTML = `
        <svg class="w-full h-full" viewBox="0 0 64 80" fill="none">
          <rect x="8" y="8" width="48" height="52" rx="4" fill="${drive.usedPercent > 90 ? '#991b1b' : '#1e3a5f'}" opacity="0.92"/>
          <rect x="8" y="8" width="48" height="52" rx="4" stroke="${drive.usedPercent > 90 ? '#dc2626' : '#3b82f6'}" stroke-width="1.5"/>
          <rect x="14" y="14" width="36" height="8" rx="2" fill="rgba(255,255,255,0.15)"/>
          <rect x="14" y="14" width="${Math.round(36 * drive.usedPercent / 100)}" height="8" rx="2" fill="${drive.usedPercent > 90 ? '#ef4444' : '#3b82f6'}"/>
          <rect x="14" y="28" width="36" height="4" rx="1" fill="rgba(255,255,255,0.08)"/>
          <rect x="14" y="36" width="24" height="4" rx="1" fill="rgba(255,255,255,0.08)"/>
          <rect x="14" y="44" width="30" height="4" rx="1" fill="rgba(255,255,255,0.08)"/>
          <text x="32" y="66" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-weight="bold" font-size="8" letter-spacing="0.5">${escapeHtml(drive.letter)}:\\</text>
        </svg>
      `;

      const nameEl = document.createElement('span');
      nameEl.className = 'item-name text-win-text leading-tight px-1 rounded max-w-full font-normal';
      nameEl.textContent = `${drive.name} (${drive.letter}:)`;

      // Usage bar below the name
      const usageBar = document.createElement('div');
      usageBar.className = 'w-full mt-1 px-2';
      usageBar.innerHTML = `
        <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full ${drive.usedPercent > 90 ? 'bg-red-500' : 'bg-win-accent'} rounded-full transition-all duration-300" style="width: ${drive.usedPercent}%;"></div>
        </div>
        <div class="flex justify-between text-[10px] font-mono text-win-textMuted mt-0.5">
          <span>${escapeHtml(drive.freeFormatted)} free</span>
          <span>${escapeHtml(drive.totalFormatted)}</span>
        </div>
      `;

      card.appendChild(iconSlot);
      card.appendChild(nameEl);
      card.appendChild(usageBar);

      // Double-click → navigate into drive
      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.navigationManager?.navigateTo(drive.path);
      });

      // Middle-click → open drive in new tab
      card.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          this.tabsManager?.createTab(drive.path, true);
        }
      });

      // Single click → select
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fileGrid?.clearSelection();
        card.classList.add('is-selected');
        this.inspector?.inspectItem({
          name: `${drive.name} (${drive.letter}:)`,
          path: drive.path,
          isDirectory: true,
          kind: 'Drive',
          formattedSize: drive.totalFormatted,
          formattedMtime: ''
        });
      });

      grid.appendChild(card);
    });

    // Update status bar
    const statusTotal = document.getElementById('status-total-count');
    if (statusTotal) statusTotal.textContent = `${this.drives.length} drives`;

    // Update breadcrumb to show "This PC"
    this.updateBreadcrumbThisPC();
  }

  updateBreadcrumbThisPC() {
    const breadcrumbList = document.getElementById('breadcrumb-list');
    if (!breadcrumbList) return;
    breadcrumbList.innerHTML = '';

    const thisPcSpan = document.createElement('span');
    thisPcSpan.className = 'text-win-text font-medium px-1 py-0.5 rounded flex items-center gap-1';
    thisPcSpan.innerHTML = `
      <svg class="w-3 h-3 text-win-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="20" x="2" y="4"></rect><path d="M6 16h.01M10 16h.01M14 16h.01M18 16h.01"></path></svg>
      This PC
    `;
    breadcrumbList.appendChild(thisPcSpan);

    // Update tab title
    const activeTab = this.tabsManager?.getActiveTab();
    if (activeTab) {
      activeTab.title = 'This PC';
      this.tabsManager.updateTabUI();
    }
  }

  renderSidebarLocations() {
    const container = document.getElementById('sidebar-locations');
    if (!container) return;
    container.innerHTML = '';

    const iconMap = {
      desktop: `<svg class="w-4 h-4 text-win-textMuted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="20" x="2" y="3"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line></svg>`,
      documents: `<svg class="w-4 h-4 text-win-textMuted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`,
      downloads: `<svg class="w-4 h-4 text-win-accent shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x2="12" y1="15" y2="3"></line></svg>`,
      pictures: `<svg class="w-4 h-4 text-win-textMuted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>`,
      videos: `<svg class="w-4 h-4 text-win-textMuted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="15" rx="2" width="20" x="2" y="4"></rect><path d="m10 9 5 3-5 3v-6Z"></path></svg>`,
      music: `<svg class="w-4 h-4 text-win-textMuted shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`
    };

    this.specialFolders.forEach(folder => {
      const locEl = document.createElement('a');
      locEl.className = 'flex items-center justify-between px-2.5 h-8.5 rounded-md hover:bg-white/5 text-win-textSecondary hover:text-win-text transition-colors cursor-pointer text-[13px] font-medium';
      locEl.dataset.path = folder.path;

      const svgIcon = iconMap[folder.id] || `<svg class="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-1.5V9a3 3 0 0 0-3-3h-3.379a3 3 0 0 1-2.121-.879L8.379 4A3 3 0 0 0 6.257 3H4.5A3 3 0 0 0 1.5 6v12a3 3 0 0 0 3 3h15Z"></path></svg>`;

      locEl.innerHTML = `
        <div class="flex items-center gap-2.5">
          ${svgIcon}
          <span>${escapeHtml(folder.name)}</span>
        </div>
        ${folder.itemCount !== undefined ? `<span class="text-[11px] font-mono text-win-textMuted bg-white/5 px-1.5 py-0.5 rounded">${folder.itemCount}</span>` : ''}
      `;

      locEl.addEventListener('click', () => {
        this.navigationManager.navigateTo(folder.path);
      });

      container.appendChild(locEl);
    });
  }

  async loadDirectory(dirPath) {
    // Special "This PC" view — show drives in main content area
    if (dirPath === 'This PC') {
      this.renderThisPCView();
      this.highlightSidebarItem('');
      const searchInput = document.getElementById('desktop-search');
      if (searchInput) searchInput.value = '';
      this.fileGrid.clearSelection();
      return;
    }

    if (!window.electronAPI) return;

    try {
      const showHidden = this.themesManager?.showHidden || false;
      const data = await window.electronAPI.readDirectory(dirPath, showHidden);
      
      this.currentItems = data.items || [];
      this.sortItems(this.sortField, false);

      // Highlight active sidebar item
      this.highlightSidebarItem(dirPath);

      // Update active drive status in footer
      this.updateFooterDriveInfo(dirPath);

      // Reset search input
      const searchInput = document.getElementById('desktop-search');
      if (searchInput) searchInput.value = '';

      // Clear selection or update inspector to folder overview
      this.fileGrid.clearSelection();
    } catch (err) {
      console.error('Failed to read directory:', err);
      this.currentItems = [];
      this.fileGrid.render([]);
      alert(`Cannot access folder: ${err.message}`);
    }
  }

  highlightSidebarItem(activePath) {
    const normalizedActive = activePath.toLowerCase().replace(/\\+$/, '');
    
    document.querySelectorAll('#sidebar-drives > div, #sidebar-locations > a').forEach(el => {
      const p = (el.dataset.path || '').toLowerCase().replace(/\\+$/, '');
      if (p && p === normalizedActive) {
        el.classList.add('bg-win-selected', 'border-win-selectedBorder/50');
      } else {
        el.classList.remove('bg-win-selected', 'border-win-selectedBorder/50');
      }
    });
  }

  updateFooterDriveInfo(currentPath) {
    const footerDriveSpan = document.getElementById('status-drive-info');
    if (!footerDriveSpan || !this.drives || this.drives.length === 0) return;

    const driveLetter = currentPath.substring(0, 2).toUpperCase();
    const drive = this.drives.find(d => d.letter.toUpperCase() === driveLetter);
    if (drive) {
      footerDriveSpan.textContent = `${drive.name} ${drive.freeFormatted} free`;
      footerDriveSpan.classList.remove('hidden');
    } else {
      footerDriveSpan.classList.add('hidden');
    }
  }

  sortItems(field, toggle = true) {
    if (toggle && this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      if (!toggle) this.sortAsc = true;
    }

    this.currentItems.sort((a, b) => {
      // Folders always first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let valA = a[field];
      let valB = b[field];

      if (field === 'size') {
        valA = a.rawSize || 0;
        valB = b.rawSize || 0;
      }

      if (typeof valA === 'string') {
        return this.sortAsc
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
      }

      return this.sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    this.fileGrid.render(this.currentItems);
  }

  initResizablePanels() {
    const sidebar = document.getElementById('left-sidebar');
    const inspector = document.getElementById('inspector-pane');
    const sidebarHandle = document.getElementById('resize-sidebar');
    const inspectorHandle = document.getElementById('resize-inspector');
    const mainExplorer = document.getElementById('main-explorer');

    if (!sidebar || !inspector || !sidebarHandle || !inspectorHandle) return;

    // Restore persisted widths
    const savedSidebarWidth = localStorage.getItem('nova-sidebar-width');
    const savedInspectorWidth = localStorage.getItem('nova-inspector-width');
    if (savedSidebarWidth) sidebar.style.width = savedSidebarWidth + 'px';
    if (savedInspectorWidth) inspector.style.width = savedInspectorWidth + 'px';

    const MIN_SIDEBAR = 180;
    const MAX_SIDEBAR = 420;
    const MIN_INSPECTOR = 200;
    const MAX_INSPECTOR = 450;

    // Sidebar resize
    this._initResizeDrag(sidebarHandle, sidebar, 'left', MIN_SIDEBAR, MAX_SIDEBAR, (width) => {
      localStorage.setItem('nova-sidebar-width', width);
    });

    // Inspector resize
    this._initResizeDrag(inspectorHandle, inspector, 'right', MIN_INSPECTOR, MAX_INSPECTOR, (width) => {
      localStorage.setItem('nova-inspector-width', width);
    });
  }

  _initResizeDrag(handle, panel, side, min, max, onEnd) {
    let rafId = null;
    let pendingWidth = null;

    const applyWidth = () => {
      rafId = null;
      if (pendingWidth !== null) {
        panel.style.width = pendingWidth + 'px';
        pendingWidth = null;
      }
    };

    const onMouseMove = (e) => {
      e.preventDefault();
      let newWidth;
      if (side === 'left') {
        newWidth = e.clientX - panel.parentElement.getBoundingClientRect().left;
      } else {
        newWidth = panel.parentElement.getBoundingClientRect().right - e.clientX;
      }
      // Dynamic max: ensure main area keeps at least 400px
      const parentRect = panel.parentElement.getBoundingClientRect();
      const handleWidth = 6;
      const minMainArea = 400;
      let dynamicMax = max;
      if (side === 'left') {
        dynamicMax = Math.min(max, parentRect.width - minMainArea - handleWidth);
      } else {
        dynamicMax = Math.min(max, parentRect.width - minMainArea - handleWidth);
      }
      dynamicMax = Math.max(min, dynamicMax);
      newWidth = Math.min(dynamicMax, Math.max(min, newWidth));
      pendingWidth = newWidth;
      if (rafId === null) {
        rafId = requestAnimationFrame(applyWidth);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      // Apply final width
      if (pendingWidth !== null) {
        panel.style.width = pendingWidth + 'px';
        if (onEnd) onEnd(pendingWidth);
        pendingWidth = null;
      } else if (onEnd) {
        onEnd(parseInt(panel.style.width));
      }
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// Start app on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new NovaFilesApp();
  window.app.init();
});
