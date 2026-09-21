/**
 * fileIcons.js — Windows Shell Icon Loader
 *
 * Uses IPC to fetch real Windows shell icons via iconExtractor.
 *
 * - Image files → real <img> thumbnail
 * - All other files → lazy-loaded Windows shell icon via IPC
 * - Unknown files → generic Windows document icon
 *
 * IPC returns { dataURL, width, height } — actual native resolution.
 */

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.ico', '.tiff', '.tif'
]);

function getExtension(filename) {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return filename.slice(lastDot).toLowerCase();
}

function isImageExtension(ext) {
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Returns true if this file should get a real <img> thumbnail (images).
 */
function shouldShowThumbnail(filename) {
  const ext = getExtension(filename);
  return ext && isImageExtension(ext);
}

/**
 * Returns true if this file should get a Windows shell icon via IPC.
 * (Everything except images and folders)
 */
function shouldLoadShellIcon(item) {
  if (item.isDirectory) return false;
  const ext = getExtension(item.name);
  if (ext && isImageExtension(ext)) return false;
  return true;
}

/**
 * Fetch the real Windows shell icon for a file path.
 * Returns { dataURL, width, height } or null on failure.
 */
async function fetchWindowsIcon(filePath, size = 256) {
  if (!window.electronAPI?.getFileIcon) return null;
  try {
    const result = await window.electronAPI.getFileIcon(filePath, size);
    // Backend returns { dataURL, width, height } or null
    return result;
  } catch {
    return null;
  }
}
/**
 * Batch fetch multiple icons in ONE IPC call.
 * Returns { [filePath]: { dataURL, width, height } }
 */
async function fetchWindowsIconsBatch(filePaths, size = 256) {
  if (!window.electronAPI?.getFileIconsBatch) return {};
  if (!filePaths || filePaths.length === 0) return {};
  try {
    return await window.electronAPI.getFileIconsBatch(filePaths, size) || {};
  } catch {
    return {};
  }
}
// ── Export ──────────────────────────────────────────────────────────────────
window.FileIcons = {
  getExtension,
  isImageExtension,
  shouldShowThumbnail,
  shouldLoadShellIcon,
  fetchWindowsIcon,
  fetchWindowsIconsBatch,   // ← ye add karo
  IMAGE_EXTENSIONS,
};