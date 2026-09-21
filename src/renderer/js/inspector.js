class InspectorController {
  constructor(app) {
    this.app = app;
    this.pane = document.getElementById('inspector-pane');
    this.toggleBtn = document.getElementById('toggle-inspector-btn');
    this.closeBtn = document.getElementById('close-inspector-x');

    this.filename = document.getElementById('inspector-filename');
    this.filetype = document.getElementById('inspector-filetype');
    this.previewImg = document.getElementById('inspector-preview-img');
    this.previewGeneric = document.getElementById('inspector-preview-generic');
    this.previewGenericTitle = document.getElementById('inspector-preview-generic-title');
    this.badgeFormat = document.getElementById('inspector-badge-format');

    this.propSize = document.getElementById('prop-size');
    this.propDims = document.getElementById('prop-dims');
    this.propColorspace = document.getElementById('prop-colorspace');
    this.propModified = document.getElementById('prop-modified');
    this.propCreated = document.getElementById('prop-created');
    this.propPath = document.getElementById('prop-path');

    this.btnOpen = document.getElementById('inspector-btn-open');
    this.btnFolder = document.getElementById('inspector-btn-folder');
    this.btnCopyPath = document.getElementById('btn-copy-path');
    this.copyBtnText = document.getElementById('copy-btn-text');

    this.currentItem = null;
    this.initEventListeners();
  }

  initEventListeners() {
    this.toggleBtn?.addEventListener('click', () => {
      this.pane?.classList.toggle('hidden');
    });

    this.closeBtn?.addEventListener('click', () => {
      this.pane?.classList.add('hidden');
    });

    this.btnOpen?.addEventListener('click', () => {
      if (this.currentItem && window.electronAPI) {
        window.electronAPI.openPath(this.currentItem.path);
      }
    });

    this.btnFolder?.addEventListener('click', () => {
      if (this.currentItem && window.electronAPI) {
        window.electronAPI.showItemInFolder(this.currentItem.path);
      }
    });

    this.btnCopyPath?.addEventListener('click', () => {
      if (this.currentItem && window.electronAPI) {
        window.electronAPI.copyToClipboard(this.currentItem.path);
        if (this.copyBtnText) {
          this.copyBtnText.textContent = 'Copied!';
          setTimeout(() => { this.copyBtnText.textContent = 'Copy'; }, 1200);
        }
      }
    });
  }

  async inspectItem(item) {
    this.currentItem = item;
    if (!item) {
      this.clear();
      return;
    }

    // Unhide inspector if user had it open
    if (this.filename) this.filename.textContent = item.name;
    if (this.filetype) this.filetype.textContent = item.kind || (item.isDirectory ? 'File folder' : 'File');
    if (this.propPath) {
      this.propPath.textContent = item.path;
      this.propPath.title = item.path;
    }
    if (this.propModified) this.propModified.textContent = item.formattedMtime || '—';
    if (this.propCreated) this.propCreated.textContent = item.formattedBirthtime || '—';

    if (item.isDirectory) {
      if (this.propSize) this.propSize.textContent = item.formattedSize || 'Folder';
      if (this.propDims) this.propDims.textContent = 'Directory';
      if (this.propColorspace) this.propColorspace.textContent = 'Folder Structure';

      this.previewImg?.classList.add('hidden');
      this.previewGeneric?.classList.remove('hidden');
      this.previewGeneric?.classList.add('flex');
      if (this.previewGenericTitle) this.previewGenericTitle.textContent = item.name;
      if (this.badgeFormat) this.badgeFormat.textContent = 'FOLDER';

      // Asynchronously fetch item count
      if (window.electronAPI) {
        window.electronAPI.getItemDetails(item.path).then(details => {
          if (details && this.currentItem && this.currentItem.path === item.path) {
            if (this.propSize) this.propSize.textContent = `${details.childCount} items`;
            if (this.propDims) this.propDims.textContent = `${details.childCount} items inside`;
          }
        }).catch(() => {});
      }
    } else {
      // File
      if (this.propSize) this.propSize.textContent = item.formattedSize || '0 B';
      if (this.propColorspace) this.propColorspace.textContent = item.typeCategory === 'images' ? 'sRGB' : 'Binary';

      if (item.typeCategory === 'images') {
        // Image preview and dimensions — use high-resolution original
        this.previewImg?.classList.remove('hidden');
        this.previewGeneric?.classList.add('hidden');
        this.previewGeneric?.classList.remove('flex');
        
        // Load high-resolution inspector preview
        if (window.electronAPI) {
          window.electronAPI.getInspectorPreview(item.path).then(thumbUrl => {
            if (thumbUrl && this.currentItem && this.currentItem.path === item.path) {
              if (this.previewImg) this.previewImg.src = thumbUrl;
            }
          }).catch(() => {
            // Fallback to regular thumbnail
            window.electronAPI?.getThumbnail(item.path, 512).then(url => {
              if (url && this.currentItem && this.currentItem.path === item.path) {
                if (this.previewImg) this.previewImg.src = url;
              }
            }).catch(() => {});
          });

          window.electronAPI.getImageDimensions(item.path).then(dims => {
            if (dims && this.currentItem && this.currentItem.path === item.path) {
              if (this.propDims) this.propDims.textContent = dims.formatted;
              if (this.badgeFormat) this.badgeFormat.textContent = `${dims.type?.toUpperCase()} • ${dims.width}×${dims.height}`;
            } else {
              if (this.propDims) this.propDims.textContent = 'Image';
              if (this.badgeFormat) this.badgeFormat.textContent = (item.extension || 'IMG').replace('.', '').toUpperCase();
            }
          });
        }
      } else {
        // Non-image file
        this.previewImg?.classList.add('hidden');
        this.previewGeneric?.classList.remove('hidden');
        this.previewGeneric?.classList.add('flex');
        if (this.previewGenericTitle) this.previewGenericTitle.textContent = item.name;
        if (this.propDims) this.propDims.textContent = 'Document / Data';
        const ext = (item.extension || '').replace('.', '').toUpperCase() || 'FILE';
        if (this.badgeFormat) this.badgeFormat.textContent = ext;
      }
    }
  }

  clear() {
    this.currentItem = null;
    const activeTab = this.app.tabsManager?.getActiveTab();
    const folderName = activeTab ? activeTab.title : 'No selection';

    if (this.filename) this.filename.textContent = folderName;
    if (this.filetype) this.filetype.textContent = 'Current Folder';
    if (this.propSize) this.propSize.textContent = `${this.app.fileGrid?.items?.length || 0} items`;
    if (this.propDims) this.propDims.textContent = '—';
    if (this.propColorspace) this.propColorspace.textContent = '—';
    if (this.propModified) this.propModified.textContent = '—';
    if (this.propCreated) this.propCreated.textContent = '—';
    if (this.propPath) {
      this.propPath.textContent = activeTab?.path || '—';
      this.propPath.title = activeTab?.path || '';
    }

    this.previewImg?.classList.add('hidden');
    this.previewGeneric?.classList.remove('hidden');
    this.previewGeneric?.classList.add('flex');
    if (this.previewGenericTitle) this.previewGenericTitle.textContent = folderName;
    if (this.badgeFormat) this.badgeFormat.textContent = 'FOLDER';
  }
}
