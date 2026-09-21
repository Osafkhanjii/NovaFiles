class FileOperationsManager {
  constructor(app) {
    this.app = app;
    this.clipboard = null; // { items: [{ path, name }], op: 'copy' | 'cut' }
    this.modalContainer = document.getElementById('operation-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalInput = document.getElementById('modal-input');
    this.modalConfirmBtn = document.getElementById('modal-confirm-btn');
    this.modalCancelBtn = document.getElementById('modal-cancel-btn');
    this.modalDescription = document.getElementById('modal-desc');

    this.initKeyboardShortcuts();
    this.initModalEvents();
  }

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore shortcuts if typing inside an input or modal is open
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (!this.modalContainer?.classList.contains('hidden')) return;

      const selectedItem = this.app.fileGrid?.selectedItem;
      const selectedPaths = Array.from(this.app.fileGrid?.selectedItems || []);

      if (e.ctrlKey && e.key.toLowerCase() === 'c' && selectedItem) {
        e.preventDefault();
        this.copy([selectedItem]);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'x' && selectedItem) {
        e.preventDefault();
        this.cut([selectedItem]);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        this.paste();
      } else if (e.key === 'F2' && selectedItem) {
        e.preventDefault();
        this.promptRename(selectedItem);
      } else if (e.key === 'Delete' && selectedItem) {
        e.preventDefault();
        this.promptDelete([selectedItem]);
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.promptCreateFolder();
      }
    });

    // Toolbar "New Folder" button
    document.getElementById('btn-new-folder')?.addEventListener('click', () => {
      this.promptCreateFolder();
    });
  }

  initModalEvents() {
    this.modalCancelBtn?.addEventListener('click', () => this.hideModal());
    this.modalContainer?.addEventListener('click', (e) => {
      if (e.target === this.modalContainer) this.hideModal();
    });
  }

  showModal({ title, description, defaultValue = '', inputType = 'text', confirmText = 'OK', onConfirm }) {
    if (!this.modalContainer) return;

    this.modalTitle.textContent = title;
    this.modalDescription.textContent = description || '';
    this.modalConfirmBtn.textContent = confirmText;

    if (inputType === 'none') {
      this.modalInput.classList.add('hidden');
    } else {
      this.modalInput.classList.remove('hidden');
      this.modalInput.value = defaultValue;
    }

    this.modalContainer.classList.remove('hidden');

    if (inputType !== 'none') {
      setTimeout(() => {
        this.modalInput.focus();
        this.modalInput.select();
      }, 50);
    } else {
      this.modalConfirmBtn.focus();
    }

    const handleConfirm = () => {
      const val = this.modalInput.value.trim();
      this.hideModal();
      onConfirm(val);
      cleanup();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideModal();
        cleanup();
      }
    };

    const cleanup = () => {
      this.modalConfirmBtn.removeEventListener('click', handleConfirm);
      this.modalInput.removeEventListener('keydown', handleKeyDown);
    };

    this.modalConfirmBtn.addEventListener('click', handleConfirm);
    this.modalInput.addEventListener('keydown', handleKeyDown);
  }

  hideModal() {
    this.modalContainer?.classList.add('hidden');
  }

  hasClipboardItems() {
    return this.clipboard && this.clipboard.items && this.clipboard.items.length > 0;
  }

  copy(items) {
    if (!items || items.length === 0) return;
    this.clipboard = {
      items: items.map(i => ({ path: i.path, name: i.name })),
      op: 'copy'
    };
    // Remove visual cut effect
    document.querySelectorAll('.desktop-item').forEach(el => el.classList.remove('is-cut'));
  }

  cut(items) {
    if (!items || items.length === 0) return;
    this.clipboard = {
      items: items.map(i => ({ path: i.path, name: i.name })),
      op: 'cut'
    };
    // Mark visually as cut
    document.querySelectorAll('.desktop-item').forEach(el => {
      if (items.some(i => i.path === el.dataset.path)) {
        el.classList.add('is-cut');
      } else {
        el.classList.remove('is-cut');
      }
    });
  }

  async paste() {
    if (!this.hasClipboardItems()) return;
    const activeTab = this.app.tabsManager?.getActiveTab();
    if (!activeTab || !activeTab.path) return;

    const currentDir = activeTab.path;
    const { items, op } = this.clipboard;

    try {
      for (const item of items) {
        if (op === 'cut') {
          await window.electronAPI.moveItem(item.path, currentDir);
        } else {
          await window.electronAPI.copyItem(item.path, currentDir);
        }
      }

      if (op === 'cut') {
        this.clipboard = null;
      }

      await this.app.loadDirectory(currentDir);
    } catch (err) {
      alert(`Paste failed: ${err.message}`);
    }
  }

  promptCreateFolder() {
    const activeTab = this.app.tabsManager?.getActiveTab();
    if (!activeTab) return;

    this.showModal({
      title: 'New Folder',
      description: 'Enter a name for the new folder:',
      defaultValue: 'New folder',
      confirmText: 'Create',
      onConfirm: async (folderName) => {
        if (!folderName) return;
        try {
          await window.electronAPI.createFolder(activeTab.path, folderName);
          await this.app.loadDirectory(activeTab.path);
        } catch (err) {
          alert(`Could not create folder: ${err.message}`);
        }
      }
    });
  }

  promptRename(item) {
    this.showModal({
      title: 'Rename Item',
      description: `Rename "${item.name}" to:`,
      defaultValue: item.name,
      confirmText: 'Rename',
      onConfirm: async (newName) => {
        if (!newName || newName === item.name) return;
        try {
          await window.electronAPI.renameItem(item.path, newName);
          const activeTab = this.app.tabsManager?.getActiveTab();
          if (activeTab) await this.app.loadDirectory(activeTab.path);
        } catch (err) {
          alert(`Could not rename item: ${err.message}`);
        }
      }
    });
  }

  promptDelete(items) {
    if (!items || items.length === 0) return;
    const names = items.map(i => i.name).join(', ');

    this.showModal({
      title: 'Delete Item',
      description: `Are you sure you want to send ${names} to the Recycle Bin?`,
      inputType: 'none',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          for (const item of items) {
            await window.electronAPI.deleteItem(item.path);
          }
          const activeTab = this.app.tabsManager?.getActiveTab();
          if (activeTab) await this.app.loadDirectory(activeTab.path);
        } catch (err) {
          alert(`Could not delete item: ${err.message}`);
        }
      }
    });
  }
}
