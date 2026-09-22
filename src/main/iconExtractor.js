/**
 * iconExtractor.js — v7 (PowerShell .ps1 file + 4K thumbnails)
 */

const { app, nativeImage } = require('electron');
const koffi = require('koffi');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { execFile } = require('child_process');

// ── Logging ───────────────────────────────────────────────

const LOG_FILE = path.join(__dirname, '..', 'icon-debug.log');
function log(msg) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch(e) {}
}
try { fs.writeFileSync(LOG_FILE, ''); } catch(e) {}

const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
);

const PS_SCRIPT = path.join(__dirname, 'icon-extractor.ps1');

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'nova-files-icon-cache');
try { fs.mkdirSync(ICON_CACHE_DIR, { recursive: true }); } catch(e) {}

const memoryCache = new Map();

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv', '.flv']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.tiff', '.tif', '.svg']);
const LNK_EXTS   = new Set(['.lnk', '.url']);

function snapSize(size) {
  if (size <= 64) return 64;
  if (size <= 128) return 128;
  if (size <= 256) return 256;
  if (size <= 512) return 512;
  if (size <= 1024) return 1024;
  return 2048;
}

// ═══════════════════════════════════════════════════════════
// Win32 Structs + koffi
// ═══════════════════════════════════════════════════════════

const SHFILEINFO = koffi.struct('SHFILEINFO', {
  hIcon: 'void *', iIcon: 'int32', dwAttributes: 'uint32',
  szDisplayName: koffi.array('uint16', 260), szTypeName: koffi.array('uint16', 80),
});

const ICONINFO = koffi.struct('ICONINFO', {
  fIcon: 'bool', xHotspot: 'uint32', yHotspot: 'uint32',
  hbmMask: 'void *', hbmColor: 'void *',
});

const BITMAPINFO = koffi.struct('BITMAPINFO', {
  bmiHeader: koffi.struct({
    biSize: 'uint32', biWidth: 'int32', biHeight: 'int32',
    biPlanes: 'uint16', biBitCount: 'uint16', biCompression: 'uint32',
    biSizeImage: 'uint32', biXPelsPerMeter: 'int32', biYPelsPerMeter: 'int32',
    biClrUsed: 'uint32', biClrImportant: 'uint32',
  }),
  bmiColors: koffi.array('uint32', 1),
});

const BITMAP = koffi.struct('BITMAP', {
  bmType: 'int32', bmWidth: 'int32', bmHeight: 'int32',
  bmWidthBytes: 'int32', bmPlanes: 'uint16', bmBitsPixel: 'uint16',
  bmBits: 'void *',
});

const shell32 = koffi.load('shell32.dll');
const user32  = koffi.load('user32.dll');
const gdi32   = koffi.load('gdi32.dll');

const SHGetFileInfoW = shell32.func('SHGetFileInfoW', 'uintptr_t', [
  'str16', 'uint32', 'void *', 'uint32', 'uint32',
]);
const ExtractIconExW = shell32.func('ExtractIconExW', 'uint32', [
  'str16', 'int32', 'void *', 'void *', 'uint32',
]);
const DestroyIcon = user32.func('DestroyIcon', 'bool', ['void *']);
const GetDC       = user32.func('GetDC', 'void *', ['void *']);
const ReleaseDC   = user32.func('ReleaseDC', 'int32', ['void *', 'void *']);
const DrawIconEx  = user32.func('DrawIconEx', 'bool', [
  'void *', 'int32', 'int32', 'void *', 'int32', 'int32', 'uint32', 'void *', 'uint32',
]);
const CreateCompatibleDC     = gdi32.func('CreateCompatibleDC', 'void *', ['void *']);
const DeleteDC               = gdi32.func('DeleteDC', 'bool', ['void *']);
const CreateCompatibleBitmap = gdi32.func('CreateCompatibleBitmap', 'void *', ['void *', 'int32', 'int32']);
const SelectObject           = gdi32.func('SelectObject', 'void *', ['void *', 'void *']);
const DeleteObject           = gdi32.func('DeleteObject', 'bool', ['void *']);
const GetDIBits              = gdi32.func('GetDIBits', 'int32', [
  'void *', 'void *', 'uint32', 'uint32', 'void *', 'void *', 'uint32',
]);
const GetIconInfo = user32.func('GetIconInfo', 'bool', ['void *', 'void *']);
const GetObjectW  = gdi32.func('GetObjectW', 'int32', ['void *', 'int32', 'void *']);

const FILE_ATTRIBUTE_NORMAL   = 0x80;
const SHGFI_ICON              = 0x00000100;
const SHGFI_USEFILEATTRIBUTES = 0x00000010;
const SHGFI_LARGEICON         = 0x00000000;
const DI_NORMAL               = 0x0003;
const BI_RGB                  = 0;

// ── PNG encoder ───────────────────────────────────────────

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function rgbaToPNG(rgba, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── HICON → dataURL ───────────────────────────────────────

function getIconSize(hIcon) {
  try {
    const icoInfoBuf = koffi.alloc(ICONINFO, 1);
    if (!GetIconInfo(hIcon, icoInfoBuf)) return 32;
    const icoInfo = koffi.decode(icoInfoBuf, ICONINFO);
    const hbmColor = icoInfo.hbmColor;
    if (!hbmColor) {
      if (icoInfo.hbmMask) DeleteObject(icoInfo.hbmMask);
      return 32;
    }
    const bmpBuf = koffi.alloc(BITMAP, 1);
    if (GetObjectW(hbmColor, koffi.sizeof(BITMAP), bmpBuf) === 0) {
      DeleteObject(hbmColor);
      if (icoInfo.hbmMask) DeleteObject(icoInfo.hbmMask);
      return 32;
    }
    const bmp = koffi.decode(bmpBuf, BITMAP);
    const w = bmp.bmWidth;
    let h = bmp.bmHeight;
    if (bmp.bmBitsPixel < 32 && h > w * 2) h = Math.floor(h / 2);
    const sz = Math.max(w, h);
    DeleteObject(hbmColor);
    if (icoInfo.hbmMask) DeleteObject(icoInfo.hbmMask);
    return sz || 32;
  } catch (e) { return 32; }
}

function iconToDataURL(hIcon) {
  try {
    const sz = getIconSize(hIcon);
    if (!sz || sz <= 0) return null;
    const screenDC = GetDC(0);
    const memDC = CreateCompatibleDC(screenDC);
    const hBmp = CreateCompatibleBitmap(screenDC, sz, sz);
    const oldBmp = SelectObject(memDC, hBmp);
    DrawIconEx(memDC, 0, 0, hIcon, sz, sz, 0, 0, DI_NORMAL);
    const bmiBuf = koffi.alloc(BITMAPINFO, 1);
    const bmi = koffi.decode(bmiBuf, BITMAPINFO);
    bmi.bmiHeader.biSize = 40;
    bmi.bmiHeader.biWidth = sz;
    bmi.bmiHeader.biHeight = -sz;
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;
    koffi.encode(bmiBuf, BITMAPINFO, bmi);
    const pixelArrType = koffi.array('uint8', sz * sz * 4);
    const pixelPtr = koffi.alloc(pixelArrType, 1);
    const dibResult = GetDIBits(memDC, hBmp, 0, sz, pixelPtr, bmiBuf, 0);
    SelectObject(memDC, oldBmp);
    DeleteObject(hBmp);
    DeleteDC(memDC);
    ReleaseDC(0, screenDC);
    if (dibResult === 0) return null;
    const rawBGRX = koffi.decode(pixelPtr, pixelArrType);
    const rgba = Buffer.alloc(sz * sz * 4);
    for (let i = 0; i < sz * sz; i++) {
      const s = i * 4;
      rgba[s]     = rawBGRX[s + 2];
      rgba[s + 1] = rawBGRX[s + 1];
      rgba[s + 2] = rawBGRX[s];
      rgba[s + 3] = rawBGRX[s + 3];
    }
    const png = rgbaToPNG(rgba, sz, sz);
    return { dataURL: `data:image/png;base64,${png.toString('base64')}`, width: sz, height: sz };
  } catch (err) { return null; }
}

// ── Koffi methods (fast, for EXE/DLL) ─────────────────────

function getIconViaExtractIcon(filePath) {
  try {
    const hLargeDummy = koffi.alloc('void *', 1);
    const hSmallDummy = koffi.alloc('void *', 1);
    const totalCount = ExtractIconExW(filePath, 0, hLargeDummy, hSmallDummy, 0);
    if (totalCount <= 0) return null;

    const iconCount = Math.min(totalCount, 20);
    let bestResult = null;
    let bestSize = 0;

    for (let i = 0; i < iconCount; i++) {
      const hLargePtr = koffi.alloc('void *', 1);
      const hSmallPtr = koffi.alloc('void *', 1);
      const count = ExtractIconExW(filePath, i, hLargePtr, hSmallPtr, 1);
      if (count === 0) continue;
      const hIcon = koffi.decode(hLargePtr, 'void *');
      if (!hIcon || hIcon === 0n) continue;
      const nativeSize = getIconSize(hIcon);
      if (nativeSize > bestSize) {
        const result = iconToDataURL(hIcon);
        if (result && nativeSize > bestSize) {
          bestResult = result;
          bestSize = nativeSize;
        }
      }
      DestroyIcon(hIcon);
    }
    if (bestResult) log(`ExtractIconEx: ${path.basename(filePath)} → ${bestSize}×${bestSize}`);
    return bestResult;
  } catch (err) { return null; }
}

function getIconViaSHGetFileInfo(filePath) {
  try {
    const flags = SHGFI_ICON | SHGFI_USEFILEATTRIBUTES | SHGFI_LARGEICON;
    const infoBuf = koffi.alloc(SHFILEINFO, 1);
    const result = SHGetFileInfoW(filePath, FILE_ATTRIBUTE_NORMAL, infoBuf, koffi.sizeof(SHFILEINFO), flags);
    if (result === 0) return null;
    const info = koffi.decode(infoBuf, SHFILEINFO);
    const hIcon = info.hIcon;
    if (!hIcon) return null;
    const iconResult = iconToDataURL(hIcon);
    DestroyIcon(hIcon);
    return iconResult;
  } catch (err) { return null; }
}

// ═══════════════════════════════════════════════════════════
// PowerShell batch (calls .ps1 file)
// ═══════════════════════════════════════════════════════════

async function runPowerShellJumboBatch(filePaths, targetSize) {
  const results = {};
  if (filePaths.length === 0) return results;

  const pathsJson = JSON.stringify(filePaths);

  const res = await new Promise((resolve) => {
    execFile(POWERSHELL, [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', PS_SCRIPT,
      '-PathsJson', pathsJson,
      '-TargetSize', String(targetSize),
      '-CacheDir', ICON_CACHE_DIR
    ], { timeout: 120000, maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });

  if (res.err) { log(`PS FAIL: ${res.err.message}`); return results; }
  if (!res.stdout.trim()) { log(`PS empty output`); return results; }

  try {
    let jsonStr = res.stdout.trim();
    const s = jsonStr.indexOf('{'); if (s > 0) jsonStr = jsonStr.substring(s);
    const e = jsonStr.lastIndexOf('}'); if (e >= 0) jsonStr = jsonStr.substring(0, e + 1);
    const parsed = JSON.parse(jsonStr);

    for (const [fp, outFile] of Object.entries(parsed)) {
      if (!outFile || typeof outFile !== 'string') continue;
      if (!fs.existsSync(outFile)) continue;
      try {
        const img = nativeImage.createFromPath(outFile);
        if (img && !img.isEmpty()) {
          const sz = img.getSize();
          results[fp] = { dataURL: img.toDataURL(), width: sz.width, height: sz.height };
        }
      } catch (e) {}
    }
  } catch (e) {
    log(`PS JSON error: ${e.message}`);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// SINGLE FILE
// ═══════════════════════════════════════════════════════════

async function extractIconForFile(filePath, targetSize) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return null;
  } catch (_) {}

  // 1. ExtractIconExW — EXE/DLL se 256×256
  const extIcon = getIconViaExtractIcon(filePath);
  if (extIcon && extIcon.width >= 128) return extIcon;

  // 2. Thumbnail — images/videos (4K support)
  try {
    const thumb = await nativeImage.createThumbnailFromPath(filePath, {
      width: targetSize, height: targetSize
    });
    if (thumb && !thumb.isEmpty()) {
      const sz = thumb.getSize();
      if (sz.width >= 64) {
        return { dataURL: thumb.toDataURL(), width: sz.width, height: sz.height };
      }
    }
  } catch (e) {}

  // 3. SHGetFileInfoW — 32×32
  const shgfi = getIconViaSHGetFileInfo(filePath);
  if (shgfi) return shgfi;

  return null;
}

async function getFileIcon(filePath, size) {
  const targetSize = snapSize(Math.min(size || 256, 2048));
  const cacheKey = `${filePath}|${targetSize}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  let result = await extractIconForFile(filePath, targetSize);

  if (!result || result.width < 128) {
    try {
      const psResults = await runPowerShellJumboBatch([filePath], targetSize);
      if (psResults[filePath]) result = psResults[filePath];
    } catch (e) {}
  }

  if (result) memoryCache.set(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════
// BATCH
// ═══════════════════════════════════════════════════════════

async function getIconsBatch(filePaths, size) {
  const targetSize = snapSize(Math.min(size || 256, 2048));
  const results = {};
  const toFetch = [];

  for (const fp of filePaths) {
    const key = `${fp}|${targetSize}`;
    if (memoryCache.has(key)) results[fp] = memoryCache.get(key);
    else toFetch.push(fp);
  }

  if (toFetch.length === 0) return results;

  // Split: images/videos → nativeImage; everything else → PowerShell
  const thumbPaths = [];
  const psPaths = [];

  for (const fp of toFetch) {
    const ext = path.extname(fp).toLowerCase();
    let isDir = false;
    try { isDir = fs.statSync(fp).isDirectory(); } catch (_) {}

    if (isDir) {
      psPaths.push(fp);
    } else if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
      thumbPaths.push(fp);
    } else {
      psPaths.push(fp);
    }
  }

  log(`Batch: ${thumbPaths.length} thumb, ${psPaths.length} PS, target=${targetSize}`);

  // 1. Image/video thumbnails (parallel, nativeImage)
  await Promise.all(thumbPaths.map(async (fp) => {
    try {
      const thumb = await nativeImage.createThumbnailFromPath(fp, {
        width: targetSize, height: targetSize
      });
      if (thumb && !thumb.isEmpty()) {
        const sz = thumb.getSize();
        const result = { dataURL: thumb.toDataURL(), width: sz.width, height: sz.height };
        memoryCache.set(`${fp}|${targetSize}`, result);
        results[fp] = result;
      }
    } catch (e) {}
  }));

  // 2. Shell icons via PowerShell (ONE batch)
  if (psPaths.length > 0) {
    try {
      const psResults = await runPowerShellJumboBatch(psPaths, targetSize);
      for (const [fp, res] of Object.entries(psResults)) {
        if (res) {
          memoryCache.set(`${fp}|${targetSize}`, res);
          results[fp] = res;
        }
      }
    } catch (e) {
      log(`PS batch error: ${e.message}`);
    }
  }

  // 3. Fallback: any missing via koffi
  const missing = toFetch.filter(fp => !results[fp]);
  if (missing.length > 0) {
    for (const fp of missing) {
      try {
        const result = await extractIconForFile(fp, targetSize);
        if (result) {
          memoryCache.set(`${fp}|${targetSize}`, result);
          results[fp] = result;
        }
      } catch (e) {}
    }
  }

  log(`Batch done: ${Object.keys(results).length}/${filePaths.length}`);
  return results;
}

module.exports = { getFileIcon, getIconsBatch };