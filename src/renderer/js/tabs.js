class TabsManager {
  constructor(app) {
    this.app = app;
    this.tabsBar = document.getElementById('tabs-bar');
    this.btnNewTab = document.getElementById('btn-new-tab');
    this.tabs = [];
    this.activeTabId = null;
    this.tabCounter = 0;

    this.initEventListeners();
  }

  initEventListeners() {
    this.btnNewTab?.addEventListener('click', () => {
      const active = this.getActiveTab();
      const newPath = active ? active.path : (this.app.drives[0]?.path || 'C:\\');
      this.createTab(newPath, true);
    });

    // Keyboard shortcut Ctrl+T (New Tab) and Ctrl+W (Close Tab)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const active = this.getActiveTab();
        const newPath = active ? active.path : (this.app.drives[0]?.path || 'C:\\');
        this.createTab(newPath, true);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (this.activeTabId) {
          this.closeTab(this.activeTabId);
        }
      }
    });
  }

  createTab(initialPath, activate = true) {
    this.tabCounter++;
    const id = `tab-${this.tabCounter}`;
    const folderName = this.app.navigationManager?.getFolderName(initialPath) || 'Folder';

    const tab = {
      id,
      title: folderName,
      path: initialPath,
      history: [initialPath],
      historyIndex: 0,
      viewMode: 'icons',
      zoomLevel: 48,
      scrollY: 0,
      selectedItem: null
    };

    this.tabs.push(tab);

    if (activate || !this.activeTabId) {
      this.switchTab(id);
    } else {
      this.renderTabBar();
    }

    return tab;
  }

  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId) || null;
  }

  switchTab(tabId) {
    const targetTab = this.tabs.find(t => t.id === tabId);
    if (!targetTab) return;

    this.activeTabId = tabId;
    this.renderTabBar();

    // Restore this tab's zoom and view mode via the unified state API
    this.app.fileGrid?.restoreTabState(targetTab.zoomLevel, targetTab.viewMode);

    // Navigate to this tab's path
    this.app.navigationManager?.navigateTo(targetTab.path, false);
  }

  closeTab(tabId) {
    if (this.tabs.length <= 1) {
      // Don't close the only tab; reset to default drive
      const onlyTab = this.tabs[0];
      const defaultPath = this.app.drives[0]?.path || 'C:\\';
      onlyTab.path = defaultPath;
      onlyTab.history = [defaultPath];
      onlyTab.historyIndex = 0;
      onlyTab.title = this.app.navigationManager?.getFolderName(defaultPath) || 'Local Disk';
      this.switchTab(onlyTab.id);
      return;
    }

    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    this.tabs.splice(index, 1);

    if (this.activeTabId === tabId) {
      const nextActive = this.tabs[Math.max(0, index - 1)];
      this.switchTab(nextActive.id);
    } else {
      this.renderTabBar();
    }
  }

  updateTabUI() {
    this.renderTabBar();
  }

  renderTabBar() {
    if (!this.tabsBar) return;
    this.tabsBar.innerHTML = '';

    this.tabs.forEach(tab => {
      const isActive = tab.id === this.activeTabId;

      const tabEl = document.createElement('div');
      tabEl.className = isActive
        ? 'tab-item group active flex items-center gap-2.5 px-[20px] py-[9px] rounded-t bg-win-header border-t border-x border-win-border text-win-text text-[14px] font-semibold cursor-pointer shadow-xs min-w-[160px] max-w-[240px] justify-between transition-all titlebar-no-drag'
        : 'tab-item group flex items-center gap-2.5 px-[20px] py-[9px] rounded-t hover:bg-white/5 text-win-textMuted hover:text-win-text text-[14px] cursor-pointer border-t border-x border-transparent transition-all min-w-[150px] max-w-[220px] justify-between titlebar-no-drag';

      tabEl.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 pointer-events-none">
          <svg class="w-4 h-4 ${isActive ? 'text-amber-400' : 'text-win-textMuted'} shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-1.5V9a3 3 0 0 0-3-3h-3.379a3 3 0 0 1-2.121-.879L8.379 4A3 3 0 0 0 6.257 3H4.5A3 3 0 0 0 1.5 6v12a3 3 0 0 0 3 3h15Z"></path>
          </svg>
          <span class="truncate">${escapeHtml(tab.title)}</span>
        </div>
        <button class="tab-close-btn w-[22px] h-[22px] rounded hover:bg-white/10 flex items-center justify-center text-win-textMuted hover:text-win-text transition-colors shrink-0 cursor-pointer" title="Close Tab (Ctrl+W)">
          <svg class="w-[15px] h-[15px]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"></path></svg>
        </button>
      `;

      tabEl.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close-btn')) {
          e.stopPropagation();
          this.closeTab(tab.id);
        } else {
          this.switchTab(tab.id);
        }
      });

      // Middle-click on tab → open Home page
      tabEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          const homePath = this.app.specialFolders?.find(f => f.id === 'desktop')?.path
            || this.app.drives?.[0]?.path
            || 'C:\\';
          this.createTab(homePath, true);
        }
      });

      this.tabsBar.appendChild(tabEl);
    });

    // Append the + button at the end
    if (this.btnNewTab) {
      this.tabsBar.appendChild(this.btnNewTab);
    }
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
