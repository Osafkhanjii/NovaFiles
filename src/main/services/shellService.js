const { shell, clipboard } = require('electron');
const { execFile, exec } = require('child_process');
const path = require('path');

// Full path to powershell.exe — Git Bash PATH doesn't include WindowsPowerShell
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

class ShellService {
  async openPath(targetPath) {
    const error = await shell.openPath(targetPath);
    if (error) {
      throw new Error(error);
    }
    return true;
  }

  showItemInFolder(targetPath) {
    shell.showItemInFolder(targetPath);
    return true;
  }

  openWith(targetPath) {
    // Windows Open With dialog
    exec(`rundll32.exe shell32.dll,OpenAs_RunDLL "${targetPath}"`, (err) => {
      if (err) {
        console.warn('OpenAs_RunDLL failed, falling back to shell.openPath');
        shell.openPath(targetPath);
      }
    });
    return true;
  }

  showProperties(targetPath) {
    const dir = path.dirname(targetPath);
    const filename = path.basename(targetPath);
    const escapedDir = dir.replace(/'/g, "''");
    const escapedFile = filename.replace(/'/g, "''");

    const psCommand = `
      $shell = New-Object -ComObject Shell.Application;
      $folder = $shell.NameSpace('${escapedDir}');
      $item = $folder.ParseName('${escapedFile}');
      $item.InvokeVerb('properties');
    `;

    execFile(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], (err) => {
      if (err) {
        console.warn('Native properties verb failed:', err.message);
      }
    });
    return true;
  }

  copyToClipboard(text) {
    clipboard.writeText(text);
    return true;
  }
}

module.exports = new ShellService();
