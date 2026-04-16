/**
 * copy-to-clipboard.ts
 * Copies images or HTML content to the system clipboard.
 * Supports: Linux (xclip), macOS (pbcopy), Windows (clip).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

interface CopyOptions {
  file?: string;
}

function getPlatform(): 'linux' | 'darwin' | 'win32' {
  return process.platform as 'linux' | 'darwin' | 'win32';
}

function copyImageToClipboard(imagePath: string, platform: string): boolean {
  if (!fs.existsSync(imagePath)) {
    console.error(`[copy-to-clipboard] File not found: ${imagePath}`);
    return false;
  }

  const absPath = path.resolve(imagePath);

  if (platform === 'linux') {
    // Try xclip first, then xsel
    const pngCheck = spawnSync('which', ['xclip']);
    if (pngCheck.status === 0) {
      // xclip supports image/* MIME type
      const r = spawnSync(
        'xclip',
        ['-selection', 'clipboard', '-t', 'image/png', '-i', absPath],
        { timeout: 10_000 },
      );
      if (r.status === 0) return true;
    }
    // Try converting to PNG and copying via xsel
    const convertCheck = spawnSync('which', ['convert']);
    if (convertCheck.status === 0) {
      const pngPath = absPath.replace(/\.[^.]+$/, '.png');
      const conv = spawnSync('convert', [absPath, pngPath], { timeout: 10_000 });
      if (conv.status === 0) {
        const r = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', pngPath], { timeout: 10_000 });
        return r.status === 0;
      }
    }
    return false;
  }

  if (platform === 'darwin') {
    const r = spawnSync('osascript', [
      '-e',
      `set the clipboard to (read (POSIX file "${absPath}") as JPEG picture)`,
    ], { timeout: 10_000 });
    if (r.status === 0) return true;
    // fallback: just use pbcopy
    const r2 = spawnSync('osascript', ['-e', `set the clipboard to POSIX file "${absPath}"`], { timeout: 10_000 });
    return r2.status === 0;
  }

  if (platform === 'win32') {
    const r = spawnSync('powershell', [
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${absPath}'))`,
    ], { timeout: 10_000 });
    return r.status === 0;
  }

  return false;
}

function copyHtmlToClipboard(htmlPath: string, platform: string): boolean {
  if (!fs.existsSync(htmlPath)) {
    console.error(`[copy-to-clipboard] File not found: ${htmlPath}`);
    return false;
  }

  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  return copyHtmlStringToClipboard(htmlContent, platform);
}

function copyHtmlStringToClipboard(html: string, platform: string): boolean {
  if (platform === 'linux') {
    const xclipCheck = spawnSync('which', ['xclip']);
    if (xclipCheck.status === 0) {
      // Write both text/html and text/plain to clipboard
      const proc = spawnSync(
        'xclip',
        ['-selection', 'clipboard', '-t', 'text/html', '-i', '/dev/stdin'],
        { input: Buffer.from(html), timeout: 10_000 },
      );
      if (proc.status === 0) return true;
    }
    // Fallback: plain text
    const r = spawnSync('xclip', ['-selection', 'clipboard', '-i', '/dev/stdin'], {
      input: Buffer.from(html.replace(/<[^>]+>/g, '')),
      timeout: 10_000,
    });
    return r.status === 0;
  }

  if (platform === 'darwin') {
    const r = spawnSync('osascript', ['-e', `set the clipboard to {text type:"text/html", text:"${html.replace(/"/g, '\\"')}"}`], { timeout: 10_000 });
    return r.status === 0;
  }

  if (platform === 'win32') {
    // On Windows, use PowerShell to set HTML clipboard format
    const r = spawnSync('powershell', [
      '-Command',
      `Set-Clipboard -Value '${html.replace(/'/g, "''")}'`,
    ], { timeout: 10_000 });
    return r.status === 0;
  }

  return false;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Copy to system clipboard
Usage:
  bun copy-to-clipboard.ts image <path>   Copy image to clipboard
  bun copy-to-clipboard.ts html --file <path>   Copy HTML file to clipboard
`);
    process.exit(0);
  }

  const [mode, arg] = args;
  const platform = getPlatform();

  if (mode === 'image' && arg) {
    const ok = copyImageToClipboard(arg, platform);
    if (ok) {
      console.log(`[copy-to-clipboard] Image copied: ${arg}`);
    } else {
      console.error(`[copy-to-clipboard] Failed to copy image: ${arg}`);
      process.exit(1);
    }
    return;
  }

  if (mode === 'html') {
    let htmlPath: string | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--file' && args[i + 1]) {
        htmlPath = args[++i];
      }
    }
    if (!htmlPath) {
      console.error('[copy-to-clipboard] Missing --file <path> for html mode');
      process.exit(1);
    }
    const ok = copyHtmlToClipboard(htmlPath, platform);
    if (ok) {
      console.log(`[copy-to-clipboard] HTML copied: ${htmlPath}`);
    } else {
      console.error(`[copy-to-clipboard] Failed to copy HTML: ${htmlPath}`);
      process.exit(1);
    }
    return;
  }

  console.error('[copy-to-clipboard] Unknown mode. Use: image <path> | html --file <path>');
  process.exit(1);
}

await main();
