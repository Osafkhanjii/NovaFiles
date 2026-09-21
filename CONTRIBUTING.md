# Contributing to Nova Files

Thank you for your interest in contributing to Nova Files! 🎉

## 🚀 Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/NovaFiles.git
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Run** the app:
   ```bash
   npm start
   ```

## 📋 Development Guidelines

### Code Style
- Use vanilla JavaScript (no TypeScript, no bundler)
- Follow existing naming conventions
- Keep functions focused and small
- Add comments for complex Win32 API interactions

### File Structure
- **`src/main/`** — Electron main process (backend)
- **`src/renderer/`** — Frontend UI
- **`src/renderer/js/`** — Individual modules (one per file)
- **`src/renderer/styles/`** — CSS files

### Commit Messages
Use clear, descriptive commit messages:
```
feat: Add dual pane view
fix: Fix icon blur at high zoom levels
docs: Update README with new screenshots
refactor: Optimize batch icon loading
```

### Testing
- Test on Windows 10 and 11 if possible
- Test with different display scaling (100%, 125%, 150%)
- Test with folders containing 100+ files
- Test with various file types (.exe, .lnk, .pdf, .zip, etc.)

## 🐛 Reporting Bugs

Use the [Bug Report](https://github.com/Osafkhanjii/NovaFiles/issues/new?template=bug_report.md) template.

Include:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Your OS version and screen resolution

## ✨ Suggesting Features

Use the [Feature Request](https://github.com/Osafkhanjii/NovaFiles/issues/new?template=feature_request.md) template.

## 📝 Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Test thoroughly
4. Update README if needed
5. Submit a PR with a clear description

### PR Checklist
- [ ] Code follows existing style
- [ ] Changes have been tested on Windows
- [ ] No console errors
- [ ] README updated (if applicable)
- [ ] Commit messages are clear

## 🏷️ Labels

- `bug` — Something isn't working
- `enhancement` — New feature or improvement
- `documentation` — Documentation improvements
- `good first issue` — Good for newcomers
- `help wanted` — Extra attention needed

---

Thank you for contributing! ❤️
