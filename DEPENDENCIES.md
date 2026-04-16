# Dependencies

This project has **zero npm dependencies**. All functionality is built using Node.js built-in modules only.

## Runtime Requirements

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Node.js | ≥ 18 | Runtime |
| bun | ≥ 1.0 (optional) | Faster runtime, or use `npx -y bun` |

## System Dependencies

### Chrome / Chromium

Any modern Chrome or Chromium installation works.

**Linux:**
```bash
sudo apt install chromium-browser   # Debian/Ubuntu
sudo dnf install chromium          # Fedora
```

**macOS:**
Chrome is typically pre-installed at `/Applications/Google Chrome.app`.

**Windows:**
Chrome installed via default installer at `C:\Program Files\Google\Chrome\Application\chrome.exe`.

### Platform-Specific Tools

#### Linux

| Tool | Purpose | Install |
|------|---------|---------|
| `xclip` | Copy image/HTML to clipboard | `sudo apt install xclip` |
| `ps` | Find existing Chrome processes | (built-in) |
| `xdotool` | Send paste keystrokes (optional) | `sudo apt install xdotool` |

#### macOS

| Tool | Purpose | Install |
|------|---------|---------|
| `osascript` | Send keystrokes, activate apps | (built-in) |
| `pbcopy` / `pbreade` | Clipboard operations | (built-in) |

#### Windows

| Tool | Purpose | Install |
|------|---------|---------|
| PowerShell | Send keystrokes, clipboard | (built-in) |

## Optional: ImageMagick (Linux)

For clipboard image copying on Linux, ImageMagick is recommended for format conversion:

```bash
sudo apt install imagemagick
```

## Bun vs Node.js

Both work identically. Bun is recommended for:
- Faster startup (~3x faster)
- Native TypeScript execution without transpilation

If using Node.js directly:

```bash
node --loader ts-node/esm scripts/weibo-post.ts "Hello"
```

For simplicity, always use `bun` or `npx -y bun`.
