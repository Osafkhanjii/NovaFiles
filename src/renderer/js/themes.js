class ThemesManager {
  constructor(app) {
    this.app = app;
    this.flyout = document.getElementById('settings-flyout');
    this.btnToggle = document.getElementById('btn-toggle-settings');
    this.btnClose = document.getElementById('btn-close-settings');
    this.chkExtensions = document.getElementById('chk-extensions');
    this.chkHidden = document.getElementById('chk-hidden');

    this.currentTheme = localStorage.getItem('nova_theme') || 'dark';
    this.currentAccent = localStorage.getItem('nova_accent') || '#0078d4';
    this.showExtensions = localStorage.getItem('nova_extensions') !== 'false';
    this.showHidden = localStorage.getItem('nova_hidden') === 'true';

    this.initEventListeners();
    this.applyTheme(this.currentTheme);
    this.applyAccent(this.currentAccent);
    this.applyCheckboxes();
  }

  initEventListeners() {
    this.btnToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.flyout?.classList.toggle('hidden');
    });

    this.btnClose?.addEventListener('click', () => {
      this.flyout?.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (this.flyout && !this.flyout.contains(e.target) && e.target !== this.btnToggle) {
        this.flyout.classList.add('hidden');
      }
    });

    // Theme buttons
    document.querySelectorAll('.theme-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        this.applyTheme(opt.dataset.theme);
      });
    });

    // Accent buttons
    document.querySelectorAll('#accent-options button').forEach(acc => {
      acc.addEventListener('click', () => {
        this.applyAccent(acc.dataset.accent);
      });
    });

    // Option checkboxes
    this.chkExtensions?.addEventListener('change', (e) => {
      this.showExtensions = e.target.checked;
      localStorage.setItem('nova_extensions', this.showExtensions);
      // Re-render
      const activeTab = this.app.tabsManager?.getActiveTab();
      if (activeTab) this.app.loadDirectory(activeTab.path);
    });

    this.chkHidden?.addEventListener('change', (e) => {
      this.showHidden = e.target.checked;
      localStorage.setItem('nova_hidden', this.showHidden);
      const activeTab = this.app.tabsManager?.getActiveTab();
      if (activeTab) this.app.loadDirectory(activeTab.path);
    });
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('nova_theme', theme);

    document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
    if (theme !== 'dark') {
      document.body.classList.add(`theme-${theme}`);
    }

    document.querySelectorAll('.theme-opt').forEach(opt => {
      const isActive = opt.dataset.theme === theme;
      opt.className = isActive
        ? 'theme-opt active flex items-center gap-2 p-1.5 rounded border border-win-accent bg-win-selected text-win-text text-left cursor-pointer'
        : 'theme-opt flex items-center gap-2 p-1.5 rounded border border-win-border hover:bg-white/5 text-win-textSecondary text-left cursor-pointer';
    });
  }

  applyAccent(color) {
    this.currentAccent = color;
    localStorage.setItem('nova_accent', color);

    document.documentElement.style.setProperty('--win-accent', color);
    document.documentElement.style.setProperty('--win-selected-border', color);

    document.querySelectorAll('#accent-options button').forEach(btn => {
      const isSelected = btn.dataset.accent === color;
      btn.innerHTML = isSelected ? '✓' : '';
      if (isSelected) {
        btn.classList.add('ring-2', 'ring-white/60');
      } else {
        btn.classList.remove('ring-2', 'ring-white/60');
      }
    });
  }

  applyCheckboxes() {
    if (this.chkExtensions) this.chkExtensions.checked = this.showExtensions;
    if (this.chkHidden) this.chkHidden.checked = this.showHidden;
  }
}
