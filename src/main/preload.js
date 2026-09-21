const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Drives & Special folders
  getDrives: (forceRefresh) => ipcRenderer.invoke('get-drives', forceRefresh),
  getSpecialFolders: () => ipcRenderer.invoke('get-special-folders'),

  // Filesystem reading & operations
  readDirectory: (path, showHidden) => ipcRenderer.invoke('read-directory', path, showHidden),
  createFolder: (parentPath, baseName) => ipcRenderer.invoke('create-folder', parentPath, baseName),
  renameItem: (oldPath, newName) => ipcRenderer.invoke('rename-item', oldPath, newName),
  deleteItem: (itemPath) => ipcRenderer.invoke('delete-item', itemPath),
  copyItem: (srcPath, destDir) => ipcRenderer.invoke('copy-item', srcPath, destDir),
  moveItem: (srcPath, destDir) => ipcRenderer.invoke('move-item', srcPath, destDir),
  getItemDetails: (itemPath) => ipcRenderer.invoke('get-item-details', itemPath),

  // Thumbnails & Metadata
  getThumbnail: (filePath, size) => ipcRenderer.invoke('get-thumbnail', filePath, size),
  getImageDimensions: (filePath) => ipcRenderer.invoke('get-image-dimensions', filePath),
  getFolderPreviewImages: (folderPath) => ipcRenderer.invoke('get-folder-preview-images', folderPath),
  getFolderFirstItem: (folderPath) => ipcRenderer.invoke('get-folder-first-item', folderPath),
  getFileIcon: (filePath, size) => ipcRenderer.invoke('get-file-icon', filePath, size),
  getFileIconsBatch: (filePaths, size) => ipcRenderer.invoke('get-file-icons-batch', filePaths, size),
  batchGetFileIcons: (filePaths, size) => ipcRenderer.invoke('get-icons-batch', filePaths, size),
  getInspectorPreview: (filePath) => ipcRenderer.invoke('get-inspector-preview', filePath),

  // Shell integration
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  openWith: (targetPath) => ipcRenderer.invoke('open-with', targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('show-item-in-folder', targetPath),
  showProperties: (targetPath) => ipcRenderer.invoke('show-properties', targetPath),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // Window control
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
});
