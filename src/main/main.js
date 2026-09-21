const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const url = require('url');

const driveService = require('./services/driveService');
const fsService = require('./services/fsService');
const thumbnailService = require('./services/thumbnailService');
const shellService = require('./services/shellService');
const iconExtractor = require('./iconExtractor');

let mainWindow = null;

// Register custom protocol for secure local asset / thumbnail loading
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'atom-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Seamless custom titlebar matching Windows 11 Fluent Design
    title: 'Nova Files',
    backgroundColor: '#18191c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Enable local thumbnail rendering
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Protocol handler for atom-file://
  // File paths are pre-encoded by the renderer (e.g., # → %23, ? → %3F)
  // to prevent the browser's URL parser from treating them as URL delimiters.
  // We decode them here before fetching.
  protocol.handle('atom-file', (request) => {
    try {
      // Remove scheme prefix (case-insensitive)
      const withoutScheme = request.url.replace(/^atom-file:\/\//i, '');
      // Decode percent-encoded characters (the renderer pre-encoded special chars)
      const decoded = decodeURIComponent(withoutScheme);
      // Convert to file:// URL and fetch
      return net.fetch(url.pathToFileURL(decoded).toString());
    } catch (err) {
      console.error('atom-file protocol error:', err.message);
      return new Response('Not found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// IPC Services
ipcMain.handle('get-drives', async (event, forceRefresh) => {
  return await driveService.getDrives(forceRefresh);
});

ipcMain.handle('get-special-folders', () => {
  return fsService.getSpecialFolders();
});

ipcMain.handle('read-directory', async (event, dirPath, showHidden) => {
  return await fsService.readDirectory(dirPath, showHidden);
});

ipcMain.handle('create-folder', async (event, parentPath, baseName) => {
  return await fsService.createFolder(parentPath, baseName);
});

ipcMain.handle('rename-item', async (event, oldPath, newName) => {
  return await fsService.renameItem(oldPath, newName);
});

ipcMain.handle('delete-item', async (event, itemPath) => {
  return await fsService.deleteItem(itemPath);
});

ipcMain.handle('copy-item', async (event, srcPath, destDir) => {
  return await fsService.copyItem(srcPath, destDir);
});

ipcMain.handle('move-item', async (event, srcPath, destDir) => {
  return await fsService.moveItem(srcPath, destDir);
});

ipcMain.handle('get-item-details', async (event, itemPath) => {
  return await fsService.getItemDetails(itemPath);
});

ipcMain.handle('get-thumbnail', async (event, filePath, size) => {
  return await thumbnailService.getThumbnail(filePath, size);
});

ipcMain.handle('get-image-dimensions', (event, filePath) => {
  return thumbnailService.getImageDimensions(filePath);
});

ipcMain.handle('get-folder-preview-images', async (event, folderPath) => {
  try {
    const fs = require('fs');
    const pathMod = require('path');
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const images = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = pathMod.extname(entry.name).toLowerCase();
      if (imageExts.includes(ext)) {
        images.push(pathMod.join(folderPath, entry.name));
        if (images.length >= 4) break;
      }
    }
    return images;
  } catch (err) {
    return [];
  }
});

// Returns the first item in a folder for thumbnail preview
ipcMain.handle('get-folder-first-item', async (event, folderPath) => {
  try {
    const fs = require('fs');
    const pathMod = require('path');
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    if (entries.length === 0) return null;

    // Sort: folders first, then files
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    const first = sorted[0];
    const fullPath = pathMod.join(folderPath, first.name);
    const ext = pathMod.extname(first.name).toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    const isImage = imageExts.includes(ext);

    return {
      name: first.name,
      path: fullPath,
      isDirectory: first.isDirectory(),
      isImage
    };
  } catch (err) {
    return null;
  }
});

ipcMain.handle('get-file-icon', async (event, filePath, size) => {
  try {
    const iconSize = size || 256;
    const result = await iconExtractor.getFileIcon(filePath, iconSize);
    // Returns { dataURL, width, height } or null
    return result;
  } catch (err) { }
  return null;
});
ipcMain.handle('get-file-icons-batch', async (event, filePaths, size) => {
  try {
    return await iconExtractor.getIconsBatch(filePaths, size || 256);
  } catch (err) {
    console.error('get-file-icons-batch error:', err.message);
    return {};
  }
});
// Batch icon extraction — single IPC call for many files
ipcMain.handle('get-icons-batch', async (event, filePaths, size) => {
  try {
    return await iconExtractor.getIconsBatch(filePaths, size);
  } catch (err) { return {}; }
});

// High-resolution inspector preview for images
ipcMain.handle('get-inspector-preview', async (event, filePath) => {
  try {
    return await thumbnailService.getInspectorPreview(filePath);
  } catch (err) {
    console.error('get-inspector-preview IPC error:', err.message);
    return null;
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  return await shellService.openPath(targetPath);
});

ipcMain.handle('open-with', (event, targetPath) => {
  return shellService.openWith(targetPath);
});

ipcMain.handle('show-item-in-folder', (event, targetPath) => {
  return shellService.showItemInFolder(targetPath);
});

ipcMain.handle('show-properties', (event, targetPath) => {
  return shellService.showProperties(targetPath);
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
  return shellService.copyToClipboard(text);
});
