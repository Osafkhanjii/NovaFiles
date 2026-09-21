const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Full path to powershell.exe — Git Bash PATH doesn't include WindowsPowerShell
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

class DriveService {
  constructor() {
    this.cachedDrives = [];
    this.lastQueryTime = 0;
  }

  async getDrives(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedDrives.length > 0 && now - this.lastQueryTime < 5000) {
      return this.cachedDrives;
    }

    try {
      const drives = await this.queryWindowsDrives();
      this.cachedDrives = drives;
      this.lastQueryTime = now;
      return drives;
    } catch (err) {
      console.warn('PowerShell drive query failed, using fallback:', err.message);
      const fallbackDrives = this.getFallbackDrives();
      this.cachedDrives = fallbackDrives;
      this.lastQueryTime = now;
      return fallbackDrives;
    }
  }

  queryWindowsDrives() {
    return new Promise((resolve, reject) => {
      const psCommand = 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,Size,FreeSpace,DriveType,FileSystem | ConvertTo-Json -Compress';
      
      execFile(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }

        try {
          const rawOutput = stdout.trim();
          if (!rawOutput) {
            return resolve(this.getFallbackDrives());
          }

          let data = JSON.parse(rawOutput);
          if (!Array.isArray(data)) {
            data = [data];
          }

          const drives = data.map(item => {
            const letter = item.DeviceID; // e.g. "C:"
            const totalBytes = Number(item.Size) || 0;
            const freeBytes = Number(item.FreeSpace) || 0;
            const usedBytes = Math.max(0, totalBytes - freeBytes);
            const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
            
            // DriveType: 2 = Removable, 3 = Local Fixed, 4 = Network, 5 = CD/DVD
            let driveTypeName = 'Fixed';
            if (item.DriveType === 2) driveTypeName = 'Removable';
            else if (item.DriveType === 4) driveTypeName = 'Network';
            else if (item.DriveType === 5) driveTypeName = 'Optical';

            let name = (item.VolumeName && item.VolumeName.trim().length > 0)
              ? `${item.VolumeName.trim()} (${letter})`
              : (driveTypeName === 'Removable' ? `USB Drive (${letter})` : `Local Disk (${letter})`);

            return {
              letter,
              path: letter.endsWith('\\') ? letter : `${letter}\\`,
              name,
              volumeName: item.VolumeName ? item.VolumeName.trim() : '',
              totalBytes,
              freeBytes,
              usedBytes,
              usedPercent,
              totalFormatted: formatBytes(totalBytes),
              freeFormatted: formatBytes(freeBytes),
              fileSystem: item.FileSystem || 'NTFS',
              driveType: driveTypeName,
              isRemovable: item.DriveType === 2
            };
          });

          resolve(drives);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  }

  getFallbackDrives() {
    const letters = ['C', 'D', 'E', 'F', 'G', 'H', 'Z'];
    const drives = [];

    for (const l of letters) {
      const rootPath = `${l}:\\`;
      try {
        if (fs.existsSync(rootPath)) {
          drives.push({
            letter: `${l}:`,
            path: rootPath,
            name: `Local Disk (${l}:)`,
            volumeName: '',
            totalBytes: 0,
            freeBytes: 0,
            usedBytes: 0,
            usedPercent: 50,
            totalFormatted: 'Unknown',
            freeFormatted: 'Available',
            fileSystem: 'NTFS',
            driveType: 'Fixed',
            isRemovable: false
          });
        }
      } catch (e) {
        // Ignore unmounted drives
      }
    }

    return drives;
  }
}

module.exports = new DriveService();
