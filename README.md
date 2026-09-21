# Nova Files

A modern Windows desktop file manager built with **Electron** — featuring real Windows shell icons, image thumbnails, folder previews, multi-tab browsing, and a custom dark Fluent Design UI.

## Features

- **Real Windows Shell Icons** — Extracted via Win32 APIs (`ExtractIconExW`, `SHGetFileInfoW`) at native resolution (up to 256×256)
- **Image Thumbnails** — Actual photo previews via Electron's `nativeImage` thumbnail cache
- **Folder Previews** — 2×2 image preview grid on folder icons
- **Smooth Zoom Slider** — Icons scale from 52px to 360px with resolution-aware caching
- **Dual View** — Icon grid + Details table (name, date, type, size)
- **Multi-Tab** — Multiple folders open simultaneously with independent state
- **Inspector Panel** — Right-side file preview + metadata
- **Custom Titlebar** — Frameless window, Windows 11 Fluent Design style
- **Dark Theme** — Built-in with multiple color schemes and accent colors
- **File Operations** — Copy, Cut, Paste, Delete, Rename, New Folder
- **Right-Click Context Menu** — Full Windows-style context menu

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 33 |
| Native APIs | koffi (Win32 FFI) — `ExtractIconExW`, `SHGetFileInfoW`, `GetIconInfo` |
| Thumbnails | Electron `nativeImage` + Windows Thumbnail Cache |
| UI | Vanilla JS + Tailwind CSS (CDN) |
| Build | electron-builder |

## Getting Started

```bash
# Clone
git clone https://github.com/your-username/NovaFiles.git
cd NovaFiles

# Install dependencies
npm install

# Run
npm start
```

## Project Structure

```
src/
├── main/                        # Backend (Electron main process)
│   ├── main.js                  # Window, IPC handlers, protocol
│   ├── preload.js               # Context bridge (secure IPC)
│   ├── iconExtractor.js         # Win32 icon extraction (koffi FFI)
│   └── services/
│       ├── fsService.js         # File system reading/operations
│       ├── driveService.js      # Drive detection
│       ├── shellService.js      # Open, properties, clipboard
│       └── thumbnailService.js  # Image thumbnails
└── renderer/                    # Frontend (UI)
    ├── index.html               # Main page
    ├── js/
    │   ├── app.js               # App initialization
    │   ├── fileGrid.js          # Icon grid + details view + zoom
    │   ├── fileIcons.js         # Shell icon IPC wrapper
    │   ├── navigation.js        # Folder navigation
    │   ├── tabs.js              # Multi-tab system
    │   ├── inspector.js         # Right panel
    │   ├── contextMenu.js       # Right-click menu
    │   ├── fileOperations.js    # Copy/paste/delete
    │   └── themes.js            # Theme system
    └── styles/
        └── main.css             # All CSS
```

## How Icon Extraction Works

```
ExtractIconExW → iterate ALL icon indices → pick largest native resolution (256×256)
    ↓ fail
nativeImage.createThumbnailFromPath → Windows thumbnail cache (up to 256×256)
    ↓ fail
SHGetFileInfoW → fast native fallback (48×48)
    ↓ fail
app.getFileIcon → Electron built-in
    ↓ fail
PowerShell ExtractAssociatedIcon → last resort
```

- Icons are cached in memory with resolution-aware keys
- Batch IPC: single call loads all icons for a folder
- Cache invalidated when zoom changes significantly

## License

MIT
