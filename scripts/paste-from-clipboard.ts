/**
 * paste-from-clipboard.ts
 * Sends real system paste keystrokes to the specified application.
 * On macOS: uses osascript to send Cmd+V to the target app.
 * On Linux: uses xdotool or ydotool to send Ctrl+V.
 * On Windows: uses PowerShell to send Ctrl+V via UI Automation.
 */

import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

interface PasteOptions {
  app?: string;
  retries?: number;
  delay?: number; // ms between retries
}

function getPlatform(): 'linux' | 'darwin' | 'win32' {
  return process.platform as 'linux' | 'darwin' | 'win32';
}

function sendPasteKeystroke(platform: string, appName?: string): boolean {
  if (platform === 'darwin') {
    // Activate the app, then send Cmd+V
    const appCmd = appName ? `activate application "${appName}"` : '';
    const script = appCmd
      ? `tell application "${appName}" to activate\ndelay 0.1\ntell application "System Events" to keystroke "v" using command down`
      : `tell application "System Events" to keystroke "v" using command down`;

    const r = spawnSync('osascript', ['-e', script], { timeout: 10_000 });
    return r.status === 0;
  }

  if (platform === 'linux') {
    // Try xdotool first (most common)
    const xdotoolCheck = spawnSync('which', ['xdotool']);
    if (xdotoolCheck.status === 0) {
      if (appName) {
        // Try to find window and focus it
        spawnSync('xdotool', ['search', '--name', appName, 'windowfocus'], { timeout: 5_000 });
      }
      const r = spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], { timeout: 5_000 });
      return r.status === 0;
    }
    // Try ydotool
    const ydotoolCheck = spawnSync('which', ['ydotool']);
    if (ydotoolCheck.status === 0) {
      const r = spawnSync('ydotool', ['key', 'ctrl+v'], { timeout: 5_000 });
      return r.status === 0;
    }
    return false;
  }

  if (platform === 'win32') {
    // Use PowerShell UI Automation
    const r = spawnSync('powershell', [
      '-Command',
      `
Add-Type -AssemblyName UIAutomationClient;
Add-Type -AssemblyName UIAutomationTypes;
# Focus the foreground window
$hwnd = [System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle;
if ($hwnd -eq [IntPtr]::Zero) { $hwnd = (Get-Process -Id $PID).MainWindowHandle }
# Send Ctrl+V
[System.Windows.Forms.SendKeys]::SendWait('^v');
`,
    ], { timeout: 10_000 });
    return r.status === 0;
  }

  return false;
}

async function pasteFromClipboard(options: PasteOptions = {}): Promise<boolean> {
  const { app, retries = 3, delay = 500 } = options;
  const platform = getPlatform();

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[paste-from-clipboard] Attempt ${attempt}/${retries}...`);
    if (sendPasteKeystroke(platform, app)) {
      console.log(`[paste-from-clipboard] Paste keystroke sent successfully.`);
      return true;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return false;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Send real paste keystroke to an application.

Usage:
  bun paste-from-clipboard.ts [options]
Options:
  --app <name>    Target application name (e.g., "Google Chrome")
  --retries <n>  Number of retry attempts (default: 3)
  --delay <ms>    Delay between retries in ms (default: 500)
`);
    process.exit(0);
  }

  let app: string | undefined;
  let retries = 3;
  let delay = 500;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app' && args[i + 1]) app = args[++i];
    else if (args[i] === '--retries' && args[i + 1]) retries = parseInt(args[++i]!, 10);
    else if (args[i] === '--delay' && args[i + 1]) delay = parseInt(args[++i]!, 10);
  }

  const ok = await pasteFromClipboard({ app, retries, delay });
  if (!ok) {
    console.error('[paste-from-clipboard] Failed to send paste keystroke.');
    process.exit(1);
  }
}

await main();
