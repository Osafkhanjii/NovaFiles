class NavigationManager {
  constructor(app) {
    this.app = app;
    this.breadcrumbList = document.getElementById('breadcrumb-list');
    this.breadcrumbContainer = document.getElementById('breadcrumb-container');
    this.addressInputContainer = document.getElementById('address-input-container');
    this.addressInput = document.getElementById('address-input');
    this.btnBack = document.getElementById('btn-back');
    this.btnForward = document.getElementById('btn-forward');
    this.btnUp = document.getElementById('btn-up');
    this.copyAddressBtn = document.getElementById('copy-address-btn');

    this.initEventListeners();
  }

  initEventListeners() {
    this.btnBack?.addEventListener('click', () => this.goBack());
    this.btnForward?.addEventListener('click', () => this.goForward());
    this.btnUp?.addEventListener('click', () => this.goUp());

    // Click breadcrumb container to edit path
    this.breadcrumbContainer?.addEventListener('click', (e) => {
      if (e.target.closest('.breadcrumb-segment') || e.target.closest('#copy-address-btn')) {
        return; // Clicked on a button
      }
      this.enableAddressEdit();
    });

    // Address input events
    this.addressInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const targetPath = this.addressInput.value.trim();
        if (targetPath) {
          this.navigateTo(targetPath);
        }
        this.disableAddressEdit();
      } else if (e.key === 'Escape') {
        this.disableAddressEdit();
      }
    });

    this.addressInput?.addEventListener('blur', () => {
      this.disableAddressEdit();
    });

    // Copy address button
    this.copyAddressBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentPath = this.app.tabsManager?.getActiveTab()?.path;
      if (currentPath && window.electronAPI) {
        window.electronAPI.copyToClipboard(currentPath);
        this.copyAddressBtn.classList.add('text-win-accent');
        setTimeout(() => this.copyAddressBtn.classList.remove('text-win-accent'), 1000);
      }
    });
  }

  enableAddressEdit() {
    const currentPath = this.app.tabsManager?.getActiveTab()?.path || '';
    if (this.addressInput) {
      this.addressInput.value = currentPath;
      this.breadcrumbList?.classList.add('hidden');
      this.addressInputContainer?.classList.remove('hidden');
      this.addressInput.focus();
      this.addressInput.select();
    }
  }

  disableAddressEdit() {
    this.addressInputContainer?.classList.add('hidden');
    this.breadcrumbList?.classList.remove('hidden');
  }

  async navigateTo(targetPath, addToHistory = true) {
    if (!targetPath) return;

    const activeTab = this.app.tabsManager.getActiveTab();
    if (!activeTab) return;

    // Special "This PC" view
    if (targetPath === 'This PC') {
      if (addToHistory && activeTab.path !== 'This PC') {
        activeTab.history = activeTab.history.slice(0, activeTab.historyIndex + 1);
        activeTab.history.push('This PC');
        activeTab.historyIndex = activeTab.history.length - 1;
      }
      activeTab.path = 'This PC';
      activeTab.title = 'This PC';
      this.app.tabsManager.updateTabUI();
      this.updateBreadcrumbs('This PC');
      await this.app.loadDirectory('This PC');
      this.updateNavButtons();
      return;
    }

    // Normalize Windows path
    let normalized = targetPath.replace(/\//g, '\\');
    if (/^[a-zA-Z]:$/.test(normalized)) {
      normalized = `${normalized}\\`;
    }

    if (addToHistory && activeTab.path !== normalized) {
      // Truncate any forward history
      activeTab.history = activeTab.history.slice(0, activeTab.historyIndex + 1);
      activeTab.history.push(normalized);
      activeTab.historyIndex = activeTab.history.length - 1;
    }

    activeTab.path = normalized;
    activeTab.title = this.getFolderName(normalized);

    // Update tab bar UI
    this.app.tabsManager.updateTabUI();

    // Load directory contents
    await this.app.loadDirectory(normalized);

    // Update breadcrumb and navigation buttons
    this.updateBreadcrumbs(normalized);
    this.updateNavButtons();
  }

  goBack() {
    const activeTab = this.app.tabsManager.getActiveTab();
    if (!activeTab || activeTab.historyIndex <= 0) return;

    activeTab.historyIndex--;
    const previousPath = activeTab.history[activeTab.historyIndex];
    this.navigateTo(previousPath, false);
  }

  goForward() {
    const activeTab = this.app.tabsManager.getActiveTab();
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return;

    activeTab.historyIndex++;
    const nextPath = activeTab.history[activeTab.historyIndex];
    this.navigateTo(nextPath, false);
  }

  goUp() {
    const activeTab = this.app.tabsManager.getActiveTab();
    if (!activeTab || !activeTab.path) return;

    const current = activeTab.path;
    // Check if at root drive (e.g. C:\)
    if (/^[a-zA-Z]:\\?$/.test(current)) {
      // Go to Drives view or stay at root
      return;
    }

    // Remove trailing slash if any
    const trimmed = current.endsWith('\\') ? current.slice(0, -1) : current;
    const lastSlash = trimmed.lastIndexOf('\\');
    if (lastSlash > 0) {
      const parent = trimmed.substring(0, lastSlash);
      const parentPath = /^[a-zA-Z]:$/.test(parent) ? `${parent}\\` : parent;
      this.navigateTo(parentPath);
    }
  }

  updateNavButtons() {
    const activeTab = this.app.tabsManager.getActiveTab();
    if (!activeTab) return;

    const canGoBack = activeTab.historyIndex > 0;
    const canGoForward = activeTab.historyIndex < activeTab.history.length - 1;
    const canGoUp = !/^[a-zA-Z]:\\?$/.test(activeTab.path);

    if (this.btnBack) {
      this.btnBack.disabled = !canGoBack;
      this.btnBack.className = canGoBack
        ? 'w-7 h-7 rounded hover:bg-white/10 text-win-textSecondary hover:text-win-text flex items-center justify-center transition-colors cursor-pointer'
        : 'w-7 h-7 rounded text-win-textMuted/40 flex items-center justify-center cursor-not-allowed';
    }

    if (this.btnForward) {
      this.btnForward.disabled = !canGoForward;
      this.btnForward.className = canGoForward
        ? 'w-7 h-7 rounded hover:bg-white/10 text-win-textSecondary hover:text-win-text flex items-center justify-center transition-colors cursor-pointer'
        : 'w-7 h-7 rounded text-win-textMuted/40 flex items-center justify-center cursor-not-allowed';
    }

    if (this.btnUp) {
      this.btnUp.disabled = !canGoUp;
      this.btnUp.className = canGoUp
        ? 'w-7 h-7 rounded hover:bg-white/10 text-win-textSecondary hover:text-win-text flex items-center justify-center transition-colors cursor-pointer'
        : 'w-7 h-7 rounded text-win-textMuted/40 flex items-center justify-center cursor-not-allowed';
    }
  }

  updateBreadcrumbs(dirPath) {
    if (!this.breadcrumbList) return;
    this.breadcrumbList.innerHTML = '';

    // "This PC" button — always present
    const thisPcBtn = document.createElement('button');
    thisPcBtn.className = 'breadcrumb-segment hover:bg-white/10 px-1 py-0.5 rounded text-win-textMuted hover:text-win-text';
    thisPcBtn.textContent = 'This PC';
    thisPcBtn.addEventListener('click', () => {
      this.navigateTo('This PC');
    });
    this.breadcrumbList.appendChild(thisPcBtn);

    // If viewing "This PC" itself, stop here
    if (dirPath === 'This PC') {
      const span = document.createElement('span');
      span.className = 'text-win-text font-medium px-1 py-0.5 rounded flex items-center gap-1';
      span.innerHTML = `
        <svg class="w-3 h-3 text-win-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect height="14" rx="2" width="20" x="2" y="4"></rect><path d="M6 16h.01M10 16h.01M14 16h.01M18 16h.01"></path></svg>
        This PC
      `;
      this.breadcrumbList.appendChild(span);
      return;
    }

    // Split path into segments
    const parts = dirPath.split('\\').filter(Boolean);
    let accumulatedPath = '';

    parts.forEach((part, index) => {
      // Add separator
      const sep = document.createElement('span');
      sep.className = 'text-win-textMuted/60';
      sep.textContent = '>';
      this.breadcrumbList.appendChild(sep);

      if (index === 0 && part.includes(':')) {
        accumulatedPath = `${part}\\`;
      } else {
        accumulatedPath += (accumulatedPath.endsWith('\\') ? '' : '\\') + part;
      }

      const segmentPath = accumulatedPath;
      const isLast = index === parts.length - 1;

      if (isLast) {
        const span = document.createElement('span');
        span.className = 'text-win-text font-medium px-1 py-0.5 rounded flex items-center gap-1';
        span.innerHTML = `
          <svg class="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-1.5V9a3 3 0 0 0-3-3h-3.379a3 3 0 0 1-2.121-.879L8.379 4A3 3 0 0 0 6.257 3H4.5A3 3 0 0 0 1.5 6v12a3 3 0 0 0 3 3h15Z"></path>
          </svg>
          ${part}
        `;
        this.breadcrumbList.appendChild(span);
      } else {
        const btn = document.createElement('button');
        btn.className = 'breadcrumb-segment hover:bg-white/10 px-1 py-0.5 rounded text-win-textMuted hover:text-win-text';
        btn.textContent = index === 0 ? `Local Disk (${part})` : part;
        btn.addEventListener('click', () => this.navigateTo(segmentPath));
        this.breadcrumbList.appendChild(btn);
      }
    });
  }

  getFolderName(p) {
    if (!p) return 'This PC';
    const trimmed = p.endsWith('\\') ? p.slice(0, -1) : p;
    const parts = trimmed.split('\\');
    return parts[parts.length - 1] || p;
  }
}
