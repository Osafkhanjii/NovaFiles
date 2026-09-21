const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// Full path to powershell.exe — Git Bash PATH doesn't include WindowsPowerShell
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }) + ' ' + d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getFileCategory(ext, isDir) {
  if (isDir) return 'folder';
  const e = ext.toLowerCase();
  
  const categories = {
    images: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.svg', '.tiff', '.avif'],
    videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
    audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.alac'],
    docs: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.rtf', '.csv', '.odt'],
    code: ['.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.htm', '.css', '.scss', '.py', '.cpp', '.c', '.cs', '.go', '.rs', '.java', '.php', '.sh', '.bat', '.cmd', '.ps1', '.yml', '.yaml', '.xml', '.sql', '.md'],
    archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso', '.cab', '.xz']
  };

  for (const [cat, extensions] of Object.entries(categories)) {
    if (extensions.includes(e)) return cat;
  }
  return 'file';
}

function getKindDescription(ext, isDir) {
  if (isDir) return 'File folder';
  const e = ext.toLowerCase().replace('.', '');
  if (!e) return 'File';

  const kinds = {
    png: 'PNG Image (.png)',
    jpg: 'JPEG Image (.jpg)',
    jpeg: 'JPEG Image (.jpeg)',
    webp: 'WEBP Image (.webp)',
    gif: 'GIF Image (.gif)',
    svg: 'Scalable Vector Graphics (.svg)',
    pdf: 'Adobe Acrobat Document (.pdf)',
    txt: 'Text Document (.txt)',
    docx: 'Microsoft Word Document (.docx)',
    doc: 'Microsoft Word 97-2003 Document (.doc)',
    xlsx: 'Microsoft Excel Worksheet (.xlsx)',
    pptx: 'Microsoft PowerPoint Presentation (.pptx)',
    zip: 'Compressed (zipped) Folder (.zip)',
    rar: 'WinRAR Archive (.rar)',
    '7z': '7-Zip Archive (.7z)',
    mp4: 'MP4 Video File (.mp4)',
    mkv: 'MKV Video File (.mkv)',
    mp3: 'MP3 Audio File (.mp3)',
    wav: 'WAV Audio File (.wav)',
    json: 'JSON File (.json)',
    js: 'JavaScript File (.js)',
    ts: 'TypeScript File (.ts)',
    html: 'HTML Document (.html)',
    css: 'Cascading Style Sheet (.css)',
    py: 'Python Source File (.py)',
    exe: 'Application (.exe)'
  };

  return kinds[e] || `${e.toUpperCase()} File (.${e})`;
}

class FilesystemService {
  getSpecialFolders() {
    const home = os.homedir();
    const candidateFolders = [
      { id: 'desktop', name: 'Desktop', path: path.join(home, 'Desktop'), icon: 'desktop' },
      { id: 'documents', name: 'Documents', path: path.join(home, 'Documents'), icon: 'documents' },
      { id: 'downloads', name: 'Downloads', path: path.join(home, 'Downloads'), icon: 'downloads' },
      { id: 'pictures', name: 'Pictures', path: path.join(home, 'Pictures'), icon: 'pictures' },
      { id: 'videos', name: 'Videos', path: path.join(home, 'Videos'), icon: 'videos' },
      { id: 'music', name: 'Music', path: path.join(home, 'Music'), icon: 'music' }
    ];

    const validFolders = [];
    for (const folder of candidateFolders) {
      if (fs.existsSync(folder.path)) {
        try {
          const files = fs.readdirSync(folder.path);
          folder.itemCount = files.length;
        } catch (e) {
          folder.itemCount = 0;
        }
        validFolders.push(folder);
      }
    }

    return {
      home,
      folders: validFolders
    };
  }

  async readDirectory(targetPath, showHidden = false) {
    let cleanPath = targetPath;
    if (/^[a-zA-Z]:$/.test(cleanPath)) {
      cleanPath = `${cleanPath}\\`;
    }

    const dirents = await fs.promises.readdir(cleanPath, { withFileTypes: true });

    // Filter hidden files first (synchronous, instant)
    const visible = dirents.filter(d => {
      if (showHidden) return true;
      return !d.name.startsWith('.') && !d.name.startsWith('$');
    });

    // Parallel stat() — all files get stat'd at once instead of sequentially
    const statResults = await Promise.allSettled(
      visible.map(d => {
        const itemPath = path.join(cleanPath, d.name);
        return fs.promises.stat(itemPath).catch(() => fs.promises.lstat(itemPath).catch(() => null));
      })
    );

    const items = [];
    for (let i = 0; i < visible.length; i++) {
      const dirent = visible[i];
      const name = dirent.name;
      const itemPath = path.join(cleanPath, name);
      let isDir = dirent.isDirectory();
      let isSymlink = dirent.isSymbolicLink();
      let size = 0;
      let mtime = null;
      let birthtime = null;

      const stats = statResults[i].status === 'fulfilled' ? statResults[i].value : null;
      if (stats) {
        if (stats.isDirectory()) isDir = true;
        size = stats.size || 0;
        mtime = stats.mtime;
        birthtime = stats.birthtime;
      }

      const ext = isDir ? '' : path.extname(name);
      const category = getFileCategory(ext, isDir);
      const kind = getKindDescription(ext, isDir);

      items.push({
        name,
        path: itemPath,
        isDirectory: isDir,
        isFile: !isDir,
        isSymlink,
        size,
        formattedSize: isDir ? '' : formatBytes(size),
        rawSize: size,
        mtime: mtime ? mtime.toISOString() : '',
        formattedMtime: formatDate(mtime),
        birthtime: birthtime ? birthtime.toISOString() : '',
        formattedBirthtime: formatDate(birthtime),
        extension: ext,
        typeCategory: category,
        kind
      });
    }

    // Sort: Folders first alphabetically, then files alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      currentPath: cleanPath,
      parentPath: path.dirname(cleanPath) === cleanPath ? null : path.dirname(cleanPath),
      items,
      totalCount: items.length
    };
  }

  async createFolder(parentPath, baseName = 'New folder') {
    let folderName = baseName;
    let targetPath = path.join(parentPath, folderName);
    let counter = 1;

    while (fs.existsSync(targetPath)) {
      counter++;
      folderName = `${baseName} (${counter})`;
      targetPath = path.join(parentPath, folderName);
    }

    await fs.promises.mkdir(targetPath, { recursive: true });
    return { name: folderName, path: targetPath };
  }

  async renameItem(oldPath, newName) {
    const parent = path.dirname(oldPath);
    const targetPath = path.join(parent, newName);

    if (fs.existsSync(targetPath) && targetPath.toLowerCase() !== oldPath.toLowerCase()) {
      throw new Error(`An item named "${newName}" already exists in this folder.`);
    }

    await fs.promises.rename(oldPath, targetPath);
    return { oldPath, newPath: targetPath, newName };
  }

  async deleteItem(itemPath) {
    // Attempt deletion to Windows Recycle Bin first using PowerShell Microsoft.VisualBasic
    return new Promise((resolve, reject) => {
      const escaped = itemPath.replace(/'/g, "''");
      const psCommand = `
        Add-Type -AssemblyName Microsoft.VisualBasic;
        if (Test-Path -LiteralPath '${escaped}' -PathType Container) {
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin')
        } else {
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin')
        }
      `;

      execFile(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], async (err) => {
        if (err) {
          console.warn('Recycle Bin send failed, attempting direct rm:', err.message);
          try {
            await fs.promises.rm(itemPath, { recursive: true, force: true });
            resolve({ success: true, method: 'direct' });
          } catch (rmErr) {
            reject(rmErr);
          }
        } else {
          resolve({ success: true, method: 'recycleBin' });
        }
      });
    });
  }

  async copyItem(srcPath, destDir) {
    const itemName = path.basename(srcPath);
    let targetPath = path.join(destDir, itemName);
    
    // If copying to same folder or destination exists, generate copy name
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(itemName);
      const nameWithoutExt = path.basename(itemName, ext);
      let counter = 1;
      while (fs.existsSync(targetPath)) {
        targetPath = path.join(destDir, `${nameWithoutExt} - Copy${counter > 1 ? ` (${counter})` : ''}${ext}`);
        counter++;
      }
    }

    await fs.promises.cp(srcPath, targetPath, { recursive: true });
    return { srcPath, destPath: targetPath };
  }

  async moveItem(srcPath, destDir) {
    const itemName = path.basename(srcPath);
    const targetPath = path.join(destDir, itemName);

    if (srcPath.toLowerCase() === targetPath.toLowerCase()) {
      return { srcPath, destPath: targetPath };
    }

    try {
      await fs.promises.rename(srcPath, targetPath);
    } catch (renameErr) {
      // Cross-device link fallback (e.g. C: to D:)
      if (renameErr.code === 'EXDEV') {
        await fs.promises.cp(srcPath, targetPath, { recursive: true });
        await fs.promises.rm(srcPath, { recursive: true, force: true });
      } else {
        throw renameErr;
      }
    }

    return { srcPath, destPath: targetPath };
  }

  async getItemDetails(itemPath) {
    try {
      const stats = await fs.promises.stat(itemPath);
      const isDir = stats.isDirectory();
      const ext = isDir ? '' : path.extname(itemPath);
      const name = path.basename(itemPath);
      
      let childCount = 0;
      if (isDir) {
        try {
          const children = await fs.promises.readdir(itemPath);
          childCount = children.length;
        } catch (e) {
          childCount = 0;
        }
      }

      return {
        name,
        path: itemPath,
        isDirectory: isDir,
        size: stats.size,
        formattedSize: isDir ? `${childCount} items` : formatBytes(stats.size),
        rawSizeBytes: stats.size,
        mtime: stats.mtime.toISOString(),
        formattedMtime: formatDate(stats.mtime),
        birthtime: stats.birthtime.toISOString(),
        formattedBirthtime: formatDate(stats.birthtime),
        extension: ext,
        kind: getKindDescription(ext, isDir),
        typeCategory: getFileCategory(ext, isDir),
        childCount
      };
    } catch (err) {
      return {
        name: path.basename(itemPath),
        path: itemPath,
        error: err.message
      };
    }
  }
}

module.exports = new FilesystemService();
