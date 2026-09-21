class ContextMenuController {
  constructor(app) {
    this.app = app;
    this.menu = document.getElementById('desktop-context-menu');
    this.targetItem = null;

    this.initEventListeners();
  }

  initEventListeners() {
    // Hide context menu on click anywhere
    document.addEventListener('click', () => {
      this.hide();
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // Right-click on empty container area
    const container = document.getElementById('file-container');
    container?.addEventListener('contextmenu', (e) => {
      if (e.target === container || e.target === document.getElementById('desktop-grid')) {
        e.preventDefault();
        this.show(e.clientX, e.clientY, null);
      }
    });
  }

  show(x, y, item) {
    this.targetItem = item;
    if (!this.menu) return;

    this.renderMenu(item);

    // Adjust position within viewport bounds
    this.menu.classList.remove('hidden');
    const menuWidth = 220;
    const menuHeight = this.menu.offsetHeight || 260;

    const posX = Math.min(x, window.innerWidth - menuWidth - 8);
    const posY = Math.min(y, window.innerHeight - menuHeight - 8);

    this.menu.style.left = `${Math.max(8, posX)}px`;
    this.menu.style.top = `${Math.max(8, posY)}px`;
  }

  hide() {
    this.menu?.classList.add('hidden');
    this.targetItem = null;
  }

  renderMenu(item) {
    if (!this.menu) return;
    this.menu.innerHTML = '';

    const hasClipboard = this.app.fileOperations?.hasClipboardItems();

    if (item) {
      // ITEM CONTEXT MENU (File or Folder)
      this.addMenuItem('Open', () => {
        if (item.isDirectory) {
          this.app.navigationManager?.navigateTo(item.path);
        } else if (window.electronAPI) {
          window.electronAPI.openPath(item.path);
        }
      }, '↵');

      if (!item.isDirectory) {
        this.addMenuItem('Open with...', () => {
          if (window.electronAPI) window.electronAPI.openWith(item.path);
        });
      }

      this.addMenuItem('Show in File Explorer', () => {
        if (window.electronAPI) window.electronAPI.showItemInFolder(item.path);
      });

      this.addSeparator();

      this.addMenuItem('Cut', () => {
        this.app.fileOperations?.cut([item]);
      }, 'Ctrl+X');

      this.addMenuItem('Copy', () => {
        this.app.fileOperations?.copy([item]);
      }, 'Ctrl+C');

      this.addSeparator();

      this.addMenuItem('Rename', () => {
        this.app.fileOperations?.promptRename(item);
      }, 'F2');

      this.addMenuItem('Delete', () => {
        this.app.fileOperations?.promptDelete([item]);
      }, 'Del');

      this.addSeparator();

      this.addMenuItem('Properties', () => {
        // Open properties inspector pane and native properties
        document.getElementById('inspector-pane')?.classList.remove('hidden');
        if (window.electronAPI) window.electronAPI.showProperties(item.path);
      }, 'Alt+↵');

    } else {
      // EMPTY CANVAS CONTEXT MENU (No "Refresh" option per requirement!)
      this.addMenuItem('View: Icons', () => {
        this.app.fileGrid?.setViewMode('icons');
      });

      this.addMenuItem('View: Details', () => {
        this.app.fileGrid?.setViewMode('details');
      });

      this.addSeparator();

      this.addMenuItem('Sort by: Name', () => {
        this.app.sortItems('name');
      });

      this.addMenuItem('Sort by: Date Modified', () => {
        this.app.sortItems('mtime');
      });

      this.addMenuItem('Sort by: Size', () => {
        this.app.sortItems('size');
      });

      this.addSeparator();

      this.addMenuItem('New folder', () => {
        this.app.fileOperations?.promptCreateFolder();
      }, 'Ctrl+Shift+N');

      if (hasClipboard) {
        this.addMenuItem('Paste', () => {
          this.app.fileOperations?.paste();
        }, 'Ctrl+V');
      }

      this.addSeparator();

      this.addMenuItem('Properties', () => {
        const activeTab = this.app.tabsManager?.getActiveTab();
        if (activeTab && window.electronAPI) {
          window.electronAPI.showProperties(activeTab.path);
        }
      });
    }
  }

  addMenuItem(text, onClick, shortcut = null) {
    const btn = document.createElement('button');
    btn.className = 'ctx-item px-3 py-1.5 text-left hover:bg-win-accent hover:text-white flex items-center justify-between text-win-xs transition-colors rounded-xs cursor-pointer';
    btn.innerHTML = `
      <span>${escapeHtml(text)}</span>
      ${shortcut ? `<kbd class="text-[10px] opacity-60 font-mono ml-4">${shortcut}</kbd>` : ''}
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
      onClick();
    });

    this.menu.appendChild(btn);
  }

  addSeparator() {
    const sep = document.createElement('div');
    sep.className = 'h-px bg-win-border my-1';
    this.menu.appendChild(sep);
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
