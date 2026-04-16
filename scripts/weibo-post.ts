import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  CdpConnection,
  findChromeExecutable,
  findExistingChromeDebugPort,
  getDefaultProfileDir,
  getFreePort,
  killChromeByProfile,
  sleep,
  waitForChromeDebugPort,
} from './weibo-utils.js';

const WEIBO_HOME_URL = 'https://weibo.com/';

const MAX_FILES = 18;

interface WeiboPostOptions {
  text?: string;
  images?: string[];
  videos?: string[];
  timeoutMs?: number;
  profileDir?: string;
  chromePath?: string;
}

export async function postToWeibo(options: WeiboPostOptions): Promise<void> {
  const { text, images = [], videos = [], timeoutMs = 120_000, profileDir = getDefaultProfileDir() } = options;

  const allFiles = [...images, ...videos];
  if (allFiles.length > MAX_FILES) {
    throw new Error(`Too many files: ${allFiles.length} (max ${MAX_FILES})`);
  }

  await mkdir(profileDir, { recursive: true });

  const chromePath = options.chromePath ?? findChromeExecutable();
  if (!chromePath) throw new Error('Chrome not found. Set WEIBO_BROWSER_CHROME_PATH env var.');

  const launchChrome = async (): Promise<number> => {
    const port = await getFreePort();
    console.log(`[weibo-post] Launching Chrome (profile: ${profileDir})`);
    const chromeArgs = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--headless',  // headless 模式
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      WEIBO_HOME_URL,
    ];
    if (process.platform === 'darwin') {
      const appPath = chromePath.replace(/\/Contents\/MacOS\/Google Chrome$/, '');
      spawn('open', ['-na', appPath, '--args', ...chromeArgs], { stdio: 'ignore' });
    } else {
      spawn(chromePath, chromeArgs, { stdio: 'ignore' });
    }
    return port;
  };

  let port: number;
  const existingPort = findExistingChromeDebugPort(profileDir);

  if (existingPort) {
    console.log(`[weibo-post] Found existing Chrome on port ${existingPort}, checking health...`);
    try {
      const wsUrl = await waitForChromeDebugPort(existingPort, 5_000);
      const testCdp = await CdpConnection.connect(wsUrl, 5_000, { defaultTimeoutMs: 5_000 });
      await testCdp.send('Target.getTargets');
      testCdp.close();
      console.log('[weibo-post] Existing Chrome is responsive, reusing.');
      port = existingPort;
    } catch {
      console.log('[weibo-post] Existing Chrome unresponsive, restarting...');
      killChromeByProfile(profileDir);
      await sleep(2000);
      port = await launchChrome();
    }
  } else {
    port = await launchChrome();
  }

  let cdp: CdpConnection | null = null;

  try {
    const wsUrl = await waitForChromeDebugPort(port, 30_000);
    cdp = await CdpConnection.connect(wsUrl, 30_000, { defaultTimeoutMs: 15_000 });

    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    let pageTarget = targets.targetInfos.find((t) => t.type === 'page' && t.url.includes('weibo.com'));

    if (!pageTarget) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: WEIBO_HOME_URL });
      pageTarget = { targetId, url: WEIBO_HOME_URL, type: 'page' };
    }

    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

    await cdp.send('Target.activateTarget', { targetId: pageTarget.targetId });

    await cdp.send('Page.enable', {}, { sessionId });
    await cdp.send('Runtime.enable', {}, { sessionId });
    await cdp.send('Input.setIgnoreInputEvents', { ignore: false }, { sessionId });

    const currentUrl = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
      expression: `window.location.href`,
      returnByValue: true,
    }, { sessionId });

    if (!currentUrl.result.value.includes('weibo.com/') || currentUrl.result.value.includes('card.weibo.com')) {
      console.log('[weibo-post] Navigating to Weibo home...');
      await cdp.send('Page.navigate', { url: WEIBO_HOME_URL }, { sessionId });
      await sleep(3000);
    }

    console.log('[weibo-post] Waiting for Weibo editor...');
    await sleep(3000);

    const waitForEditor = async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = await cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', {
          expression: `!!document.querySelector('#homeWrap textarea')`,
          returnByValue: true,
        }, { sessionId });
        if (result.result.value) return true;
        await sleep(1000);
      }
      return false;
    };

    const editorFound = await waitForEditor();
    if (!editorFound) {
      console.log('[weibo-post] Editor not found. Please log in to Weibo in the browser window.');
      console.log('[weibo-post] Waiting for login...');
      const loggedIn = await waitForEditor();
      if (!loggedIn) throw new Error('Timed out waiting for Weibo editor. Please log in first.');
    }

    if (text) {
      console.log('[weibo-post] Typing text...');

      // Focus and use Input.insertText via CDP
      // 增强清空逻辑：多次清空，防止微博草稿恢复
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const editor = document.querySelector('#homeWrap textarea');
          if (editor) { 
            editor.focus(); 
            // 第一次清空
            editor.value = '';
            // 使用execCommand更彻底清空
            editor.select();
            document.execCommand('delete', false);
            // 第二次清空（确保清除）
            editor.value = '';
          }
        })()`,
      }, { sessionId });
      await sleep(800);  // 等待微博可能的草稿恢复

      // 再次清空，确保没有残留内容
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const editor = document.querySelector('#homeWrap textarea');
          if (editor) { editor.value = ''; }
        })()`,
      }, { sessionId });
      await sleep(500);

      // 清空后验证
      const afterClearCheck = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
        expression: `document.querySelector('#homeWrap textarea')?.value || ''`,
        returnByValue: true,
      }, { sessionId });
      
      if (afterClearCheck.result.value.length > 0) {
        console.warn(`[weibo-post] 清空后仍有内容残留: ${afterClearCheck.result.value.length}字符，强制清空`);
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const editor = document.querySelector('#homeWrap textarea');
            if (editor) { editor.value = ''; }
          })()`,
        }, { sessionId });
        await sleep(300);
      }

      console.log('[weibo-post] 输入框已彻底清空，开始输入新内容');
      await cdp.send('Input.insertText', { text }, { sessionId });
      await sleep(800);  // 确保内容输入完成

      // Verify text was entered
      const textCheck = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
        expression: `document.querySelector('#homeWrap textarea')?.value || ''`,
        returnByValue: true,
      }, { sessionId });

      if (textCheck.result.value.length > 0) {
        console.log(`[weibo-post] Text verified (${textCheck.result.value.length} chars)`);
      } else {
        console.warn('[weibo-post] Text input appears empty, trying execCommand fallback...');
        await cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const editor = document.querySelector('#homeWrap textarea');
            if (editor) { editor.focus(); document.execCommand('insertText', false, ${JSON.stringify(text)}); }
          })()`,
        }, { sessionId });
        await sleep(300);

        const textRecheck = await cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
          expression: `document.querySelector('#homeWrap textarea')?.value || ''`,
          returnByValue: true,
        }, { sessionId });
        console.log(`[weibo-post] Text after fallback: ${textRecheck.result.value.length} chars`);
      }
    }

    if (allFiles.length > 0) {
      const missing = allFiles.filter((f) => !fs.existsSync(f));
      if (missing.length > 0) {
        throw new Error(`Files not found: ${missing.join(', ')}`);
      }

      const absolutePaths = allFiles.map((f) => path.resolve(f));
      console.log(`[weibo-post] Uploading ${absolutePaths.length} file(s) via file input...`);

      await cdp.send('DOM.enable', {}, { sessionId });

      const { root } = await cdp.send<{ root: { nodeId: number } }>('DOM.getDocument', {}, { sessionId });

      const { nodeId } = await cdp.send<{ nodeId: number }>('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '#homeWrap input[type="file"]',
      }, { sessionId });

      if (!nodeId || nodeId === 0) {
        throw new Error('File input not found. Make sure the Weibo compose area is visible.');
      }

      await cdp.send('DOM.setFileInputFiles', {
        nodeId,
        files: absolutePaths,
      }, { sessionId });

      console.log('[weibo-post] Files set on input. Waiting for upload...');
      await sleep(2000);

      const uploadCheck = await cdp.send<{ result: { value: number } }>('Runtime.evaluate', {
        expression: `document.querySelectorAll('#homeWrap img[src^="blob:"], #homeWrap img[src^="data:"], #homeWrap video').length`,
        returnByValue: true,
      }, { sessionId });

      if (uploadCheck.result.value > 0) {
        console.log(`[weibo-post] Upload verified (${uploadCheck.result.value} media item(s) detected)`);
      } else {
        console.warn('[weibo-post] Upload may still be in progress. Please verify in browser.');
      }
    }

    console.log('[weibo-post] Post composed. Please review and click the publish button in the browser.');
    console.log('[weibo-post] Browser remains open for manual review.');
    
    // 尝试自动点击发布按钮
    console.log('[weibo-post] Attempting to auto-click publish button...');
    try {
      // 等待内容填写完成，按钮可能变为可用状态
      console.log('[weibo-post] Waiting for button to become enabled...');
      await sleep(2000);
      
      // 尝试多种可能的发布按钮选择器（根据用户提供的HTML结构更新）
      const publishSelectors = [
        // 精确选择文本为"发送"的按钮（最高优先级）
        'button.woo-button-main:not(:contains("展开")):contains("发送")',
        'button[class*="woo-button-main"]:not(:contains("展开")):contains("发送")',
        
        // 通用选择器
        'button:contains("发送"):not(:contains("展开"))',
        
        // 备用选择器
        'button.woo-button-primary:contains("发送")',
        'button[class*="woo-button-flat"]:contains("发送")',
        'button[node-type="submit"]',
        '.W_btn_a',
        '.btn_send'
      ];
      
      for (const selector of publishSelectors) {
        try {
          const clickResult = await cdp.send('Runtime.evaluate', {
            expression: `
              (function() {
                // 查找所有woo-button-main类的按钮
                const allButtons = document.querySelectorAll('button.woo-button-main, button[class*="woo-button-main"]');
                let sendButton = null;
                
                for (const btn of allButtons) {
                  const text = btn.textContent || btn.innerText || '';
                  // 寻找文本包含"发送"但不包含"展开"的按钮
                  if (text.includes('发送') && !text.includes('展开')) {
                    sendButton = btn;
                    break;
                  }
                }
                
                if (!sendButton) {
                  // 备用方案：查找任何包含"发送"的按钮
                  const allSendButtons = document.querySelectorAll('button');
                  for (const btn of allSendButtons) {
                    const text = btn.textContent || btn.innerText || '';
                    if (text.includes('发送') && !text.includes('展开')) {
                      sendButton = btn;
                      break;
                    }
                  }
                }
                
                if (sendButton && sendButton.offsetParent !== null) {
                  // 检查按钮是否可用（没有disabled属性）
                  if (sendButton.disabled) {
                    console.log('发送按钮存在但被禁用，等待激活...');
                    // 触发输入事件以激活按钮
                    const textarea = document.querySelector('textarea, [contenteditable="true"], .weibo-editor');
                    if (textarea) {
                      textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    return {success: false, selector: '发送按钮', reason: 'disabled', buttonText: sendButton.textContent};
                  }
                  sendButton.click();
                  return {success: true, selector: '发送按钮', text: sendButton.textContent || sendButton.innerText};
                }
                return {success: false, selector: '${selector}', reason: 'not_found'};
              })()
            `,
            returnByValue: true,
          }, { sessionId });
          
          if (clickResult.result.value.success) {
            console.log('[weibo-post] ✓ Publish button clicked: ' + clickResult.result.value.selector + ' ("' + (clickResult.result.value.text || '') + '")');
            console.log('[weibo-post] ✓ Post should be published automatically.');
            await sleep(3000); // 等待发布完成
            break;
          } else if (clickResult.result.value.reason === 'disabled') {
            console.log('[weibo-post] ⚠️ 发送按钮存在但被禁用，等待激活后重试...');
            await sleep(1500); // 给更多时间让按钮激活
            
            // 重试逻辑 - 再次查找发送按钮
            const retryResult = await cdp.send('Runtime.evaluate', {
              expression: `
                (function() {
                  // 再次查找发送按钮
                  const allButtons = document.querySelectorAll('button.woo-button-main, button[class*="woo-button-main"]');
                  let sendButton = null;
                  
                  for (const btn of allButtons) {
                    const text = btn.textContent || btn.innerText || '';
                    if (text.includes('发送') && !text.includes('展开')) {
                      sendButton = btn;
                      break;
                    }
                  }
                  
                  if (sendButton && !sendButton.disabled) {
                    sendButton.click();
                    return {success: true, selector: '发送按钮', text: sendButton.textContent};
                  }
                  return {success: false, reason: sendButton ? 'still_disabled' : 'not_found'};
                })()
              `,
              returnByValue: true,
            }, { sessionId });
            
            if (retryResult.result.value.success) {
              console.log('[weibo-post] ✓ 发送按钮在重试时点击成功: ' + retryResult.result.value.text);
              await sleep(3000);
              break;
            } else {
              console.log('[weibo-post] ⚠️ 重试失败，原因: ' + retryResult.result.value.reason);
            }
          }
        } catch (err) {
          // 忽略单个选择器的错误，继续尝试下一个
        }
      }
      
      // 验证是否发布成功
      await sleep(2000);
      const verifyResult = await cdp.send('Runtime.evaluate', {
        expression: `
          (function() {
            // 检查是否有发布成功的提示或页面变化
            const successIndicators = [
              document.querySelector('.weibo-success'),
              document.querySelector('.send_success'),
              document.querySelector('.feed_list .WB_feed:first-child .WB_text'),
              document.querySelector('.sendok')
            ].filter(el => el !== null);
            return {hasSuccessIndicator: successIndicators.length > 0};
          })()
        `,
        returnByValue: true,
      }, { sessionId });
      
      if (verifyResult.result.value.hasSuccessIndicator) {
        console.log('[weibo-post] ✓ Post published successfully!');
      } else {
        console.log('[weibo-post] ⚠️ Auto-publish attempted. Please verify in browser if needed.');
      }
      
    } catch (autoPublishError) {
      console.log('[weibo-post] ⚠️ Auto-publish failed, manual review required:', autoPublishError.message);
    }

  } finally {
    if (cdp) {
      cdp.close();
    }
  }
}

function printUsage(): never {
  console.log(`Post to Weibo using real Chrome browser

Usage:
  npx -y bun weibo-post.ts [options] [text]

Options:
  --image <path>   Add image (can be repeated)
  --video <path>   Add video (can be repeated)
  --profile <dir>  Chrome profile directory
  --help           Show this help

Max ${MAX_FILES} files total (images + videos combined).

Examples:
  npx -y bun weibo-post.ts "Hello from CLI!"
  npx -y bun weibo-post.ts "Check this out" --image ./screenshot.png
  npx -y bun weibo-post.ts "Post it!" --image a.png --image b.png
  npx -y bun weibo-post.ts "Watch this" --video ./clip.mp4
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  const images: string[] = [];
  const videos: string[] = [];
  let profileDir: string | undefined;
  const textParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--image' && args[i + 1]) {
      images.push(args[++i]!);
    } else if (arg === '--video' && args[i + 1]) {
      videos.push(args[++i]!);
    } else if (arg === '--profile' && args[i + 1]) {
      profileDir = args[++i];
    } else if (!arg.startsWith('-')) {
      textParts.push(arg);
    }
  }

  const text = textParts.join(' ').trim() || undefined;

  if (!text && images.length === 0 && videos.length === 0) {
    console.error('Error: Provide text or at least one image/video.');
    process.exit(1);
  }

  await postToWeibo({ text, images, videos, profileDir });
}

await main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
