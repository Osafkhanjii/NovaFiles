<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Status">
</p>

<h1 align="center">⚡ Nova Files</h1>

<p align="center">
  <b>A modern Windows desktop file manager built with Electron</b><br>
  Real Windows shell icons • Image thumbnails • Folder previews • Multi-tab • Dark theme
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-screenshots">Screenshots</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🖼️ Real Windows Shell Icons
No generic SVGs — extracts actual Windows icons via **Win32 APIs** (`ExtractIconExW`, `SHGetFileInfoW`) at native resolution up to **256×256**.

### 📸 Image Thumbnails
Real photo previews for JPG, PNG, WebP, GIF, BMP using Electron's `nativeImage` thumbnail cache.

### 🗂️ Folder Previews
See what's inside before you open — **2×2 image grid** preview on folder icons.

### 🔍 Smooth Zoom
Icons scale from **52px → 360px** with resolution-aware caching. No blurry upscaling.

</td>
<td width="50%">

### 📑 Multi-Tab
Multiple folders open simultaneously — just like a browser. Middle-click to open in new tab.

### 📋 Details View
Windows-style table with **Name, Date, Type, Size** columns. Sortable.

### 🎨 Dark Theme
4 built-in themes: Dark, Midnight, Slate Gray, Light. Plus 5 accent colors.

### ✂️ File Operations
Copy, Cut, Paste, Delete, Rename, New Folder — all from right-click context menu.

</td>
</tr>
</table>

### More
- **Inspector Panel** — Right-side file preview + metadata
- **Custom Titlebar** — Frameless window, Windows 11 Fluent Design
- **Quick Search** — Filter files instantly
- **Keyboard Shortcuts** — Ctrl+T, Ctrl+W, Alt+Up, Delete, F2, etc.
- **Batch Icon Loading** — Single IPC call loads all icons at once
- **Parallel File Stat** — `Promise.allSettled()` for fast directory reading

---

## 📸 Screenshots

> *Screenshots coming soon! Run `npm start` to see it in action.*

<details>
<summary>🖥️ Icon Grid View</summary>
<br>

- Real Windows shell icons for every file type
- Smooth zoom from Small to Huge
- Folder previews show contents

</details>

<details>
<summary>📊 Details View</summary>
<br>

- Windows-style table layout
- File name, date modified, type, size
- Small icons in each row

</details>

<details>
<summary>🎨 Themes</summary>
<br>

- Dark (default)
- Midnight
- Slate Gray
- Light

</details>

---

## 🚀 Quick Start

### Prerequisites
- **Windows 10/11**
- **Node.js 18+** ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)

### Install & Run

```bash
# 1. Clone the repository
git clone https://github.com/Osafkhanjii/NovaFiles.git

# 2. Navigate to project
cd NovaFiles

# 3. Install dependencies
npm install

# 4. Run the app
npm start
```

### Build Executable

```bash
# Build portable .exe
npm run build
```

Output will be in the `dist/` folder.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Renderer (UI)                     │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ fileGrid │  │ tabs.js  │  │   contextMenu.js  │  │
│  │  .js     │  │          │  │                   │  │
│  └────┬─────┘  └──────────┘  └───────────────────┘  │
│       │                                              │
│       │  IPC (contextBridge)                         │
│  ┌────▼─────────────────────────────────────────┐    │
│  │              preload.js                       │    │
│  └────────────────────┬──────────────────────────┘    │
├───────────────────────┼──────────────────────────────┤
│                 Main Process                         │
│  ┌────────────────────▼──────────────────────────┐    │
│  │              main.js (IPC handlers)            │    │
│  └──┬────────┬───────────┬───────────┬───────────┘    │
│     │        │           │           │                │
│  ┌──▼──┐ ┌───▼───┐ ┌─────▼────┐ ┌────▼──────┐       │
│  │ fs  │ │icon   │ │thumbnail │ │  shell    │       │
│  │Srv  │ │Extract│ │  Srv     │ │  Srv      │       │
│  └─────┘ └───┬───┘ └──────────┘ └───────────┘       │
│              │                                        │
│         ┌────▼────────────────────┐                   │
│         │  Win32 APIs (koffi FFI) │                   │
│         │  ExtractIconExW         │                   │
│         │  SHGetFileInfoW         │                   │
│         │  GetIconInfo            │                   │
│         └─────────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

### Icon Extraction Pipeline

```
Request icon for file
        │
        ▼
┌───────────────────┐
│ ExtractIconExW    │──→ 256×256 ✓ (fastest, ~1ms)
│ (iterate all)     │
└───────┬───────────┘
        │ fail
        ▼
┌───────────────────┐
│ nativeImage       │──→ Up to 256×256 ✓
│ Thumbnail Cache   │
└───────┬───────────┘
        │ fail
        ▼
┌───────────────────┐
│ SHGetFileInfoW    │──→ 48×48 ✓ (~1ms)
└───────┬───────────┘
        │ fail
        ▼
┌───────────────────┐
│ app.getFileIcon   │──→ 48×48 ✓
└───────┬───────────┘
        │ fail
        ▼
┌───────────────────┐
│ PowerShell        │──→ Native size ✓ (~300ms)
│ Last resort       │
└───────────────────┘
```

---

## 📁 Project Structure

```
NovaFiles/
├── src/
│   ├── main/                        # Electron main process
│   │   ├── main.js                  # Window, IPC handlers, protocol
│   │   ├── preload.js               # Secure context bridge
│   │   ├── iconExtractor.js         # Win32 icon extraction (koffi FFI)
│   │   └── services/
│   │       ├── fsService.js         # File system operations
│   │       ├── driveService.js      # Drive detection
│   │       ├── shellService.js      # Shell integration
│   │       └── thumbnailService.js  # Image thumbnails
│   └── renderer/                    # Frontend UI
│       ├── index.html               # Main page
│       ├── js/
│       │   ├── app.js               # App initialization
│       │   ├── fileGrid.js          # Icon grid + zoom system
│       │   ├── fileIcons.js         # Shell icon IPC wrapper
│       │   ├── navigation.js        # Folder navigation
│       │   ├── tabs.js              # Multi-tab system
│       │   ├── inspector.js         # Properties panel
│       │   ├── contextMenu.js       # Right-click menu
│       │   ├── fileOperations.js    # Copy/paste/delete
│       │   └── themes.js            # Theme system
│       └── styles/
│           └── main.css             # All CSS
├── package.json
├── LICENSE
└── README.md
```

---

## 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | [Electron 33](https://www.electronjs.org/) | Desktop app framework |
| Native APIs | [koffi](https://github.com/nickelc/koffi) | Win32 FFI bindings |
| UI | Vanilla JS | Zero framework overhead |
| Styling | [Tailwind CSS](https://tailwindcss.com/) (CDN) | Utility-first CSS |
| Build | [electron-builder](https://www.electron.build/) | Packaging & distribution |

### Win32 APIs Used
- `ExtractIconExW` — Extract all icon resources from PE files
- `SHGetFileInfoW` — Get shell icon for any file path
- `GetIconInfo` — Query icon bitmap dimensions
- `DrawIconEx` — Render HICON to bitmap
- `GetObjectW` — Query GDI bitmap properties

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Alt+Left` | Go back |
| `Alt+Right` | Go forward |
| `Alt+Up` | Go to parent folder |
| `Delete` | Delete selected |
| `F2` | Rename selected |
| `Ctrl+Shift+N` | New folder |
| `Ctrl+A` | Select all |
| `Ctrl+scroll` | Zoom in/out |

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Ideas for Contributions
- [ ] File search with content indexing
- [ ] Drag & drop file operations
- [ ] File preview panel (PDF, video, audio)
- [ ] Custom icon themes
- [ ] File grouping/sorting options
- [ ] Undo/redo for file operations
- [ ] Dual pane view
- [ ] File bookmarks

---

## 📝 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Osafkhanjii">Osaf Khan</a>
</p>
