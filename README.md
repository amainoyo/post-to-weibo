# post-to-weibo

> Post text, images, videos, and long-form Markdown articles to Weibo via a real Chrome browser.

## Features

- 📝 **Regular posts** — Text with up to 18 images or videos
- 📄 **Headline articles** — Publish Markdown articles as Weibo card articles
- 🌐 **Real browser** — Bypasses anti-bot detection using Chrome CDP
- 🔄 **Session persistence** — Login once, post forever
- 🖥️ **Cross-platform** — macOS, Linux, Windows/WSL2

## Prerequisites

- [Google Chrome](https://www.google.com/chrome/) or Chromium
- [`bun`](https://bun.sh) runtime (or `npx` as fallback)

## Quick Start

### 1. Clone / Copy

```bash
git clone https://github.com/your-username/post-to-weibo.git
cd post-to-weibo
```

### 2. Login to Weibo (one-time)

```bash
# This opens Chrome — just log in normally and close the browser
bun scripts/weibo-post.ts "test"
```

### 3. Post a message

```bash
# Text only
bun scripts/weibo-post.ts "Hello from the CLI! 🚀"

# With image
bun scripts/weibo-post.ts "Check this out!" --image ./photo.png

# With multiple images
bun scripts/weibo-post.ts "图文并茂" --image a.png --image b.png
```

## Headline Articles

Convert a Markdown file into a Weibo article:

```bash
bun scripts/weibo-article.ts article.md
bun scripts/weibo-article.ts article.md --cover ./cover.jpg
```

**Markdown format:**

```markdown
---
title: My Article Title
summary: Brief description (max 44 chars)
cover_image: ./cover.jpg
---

# Heading

Paragraph with **bold** and *italic* text.

![Image description](path/to/image.jpg)

## Section

More content...
```

## Usage

### `weibo-post.ts` — Regular Posts

```bash
bun scripts/weibo-post.ts <text> [options]

Options:
  --image <path>   Add an image (repeatable, max 18 total)
  --video <path>   Add a video (repeatable)
  --profile <dir>  Chrome profile directory
```

### `weibo-article.ts` — Headline Articles

```bash
bun scripts/weibo-article.ts <markdown_file> [options]

Options:
  --title <text>   Override article title (max 32 chars)
  --summary <text> Override article summary (max 44 chars)
  --cover <image>  Override cover image
  --profile <dir>  Chrome profile directory
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `WEIBO_BROWSER_CHROME_PATH` | Chrome executable path | Auto-detected |
| `WEIBO_BROWSER_PROFILE_DIR` | Chrome profile directory | `~/.local/share/baoyu-skills/chrome-profile` |
| `WEIBO_BROWSER_DEBUG_PORT` | Fixed debug port | Random |

### Custom Chrome Profile

```bash
WEIBO_BROWSER_PROFILE_DIR=/path/to/profile bun scripts/weibo-post.ts "Hello"
```

## Troubleshooting

### "Chrome debug port not ready"

Kill existing Chrome CDP instances and retry:

```bash
pkill -f "Chrome.*remote-debugging-port"
sleep 2
bun scripts/weibo-post.ts "Hello"
```

### Login expired

Delete the profile directory and re-login:

```bash
rm -rf ~/.local/share/baoyu-skills/chrome-profile
bun scripts/weibo-post.ts "Hello"  # Opens browser for login
```

### Image paste not working on Linux

Install `xclip`:

```bash
sudo apt install xclip   # Debian/Ubuntu
sudo dnf install xclip   # Fedora
```

## Architecture

```
scripts/
├── weibo-post.ts         # Regular post entry point
├── weibo-article.ts     # Headline article entry point
├── weibo-utils.ts        # Chrome CDP connection, port management
├── md-to-html.ts         # Markdown → HTML for articles
├── copy-to-clipboard.ts  # Copy images/HTML to system clipboard
└── paste-from-clipboard.ts # Send real Ctrl+V / Cmd+V keystrokes
```

## License

MIT
