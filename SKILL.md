---
name: post-to-weibo
description: >
  Post text, images, videos, and long-form articles to Weibo (微博) via a real Chrome browser.
  Activates when user asks to "post to Weibo", "发微博", "发布微博", "publish to Weibo",
  "share on Weibo", "写微博", or "微博头条文章".
---

# post-to-weibo

使用真实 Chrome 浏览器发微博，支持文字、图片、视频和头条文章。

## 脚本目录

所有脚本位于 `scripts/` 子目录。

**Agent 执行说明**：
1. 确定本 SKILL.md 所在目录作为 `SKILL_DIR`
2. 脚本路径 = `${SKILL_DIR}/scripts/<script-name>.ts`
3. 确定 `${BUN_X}` 运行时：若 `bun` 已安装 → `bun`；若只有 `npx` → `npx -y bun`

**脚本对照表**：
| 脚本 | 功能 |
|------|------|
| `scripts/weibo-post.ts` | 常规微博（文字 + 图片/视频） |
| `scripts/weibo-article.ts` | 头条文章发布（Markdown） |
| `scripts/md-to-html.ts` | Markdown → HTML 转换（article 依赖） |
| `scripts/copy-to-clipboard.ts` | 复制内容到系统剪贴板 |
| `scripts/paste-from-clipboard.ts` | 发送真实粘贴快捷键 |

## 前提条件

- **Google Chrome** 或 Chromium
- **`bun` 运行时**（推荐）或 `npx`
- **首次运行**：需要手动在浏览器中登录微博（登录状态会持久化保存）

## 常规微博

文字 + 图片/视频（最多 18 个文件），发布到微博首页。

```bash
# 纯文字
${BUN_X} ${SKILL_DIR}/scripts/weibo-post.ts "Hello Weibo!"

# 带图片
${BUN_X} ${SKILL_DIR}/scripts/weibo-post.ts "看这张图" --image ./photo.png

# 带多图
${BUN_X} ${SKILL_DIR}/scripts/weibo-post.ts "图文并茂" \
  --image a.png --image b.png --image c.png

# 带视频
${BUN_X} ${SKILL_DIR}/scripts/weibo-post.ts "看视频" --video ./clip.mp4

# 指定 Chrome profile 目录
${BUN_X} ${SKILL_DIR}/scripts/weibo-post.ts "内容" --image ./img.jpg --profile /path/to/profile
```

**参数说明**：
| 参数 | 说明 |
|------|------|
| `<text>` | 微博内容（位置参数） |
| `--image <path>` | 图片文件（可重复，最多 18 个） |
| `--video <path>` | 视频文件（可重复） |
| `--profile <dir>` | Chrome profile 目录 |

**注意**：脚本将内容填入浏览器后，会自动尝试点击"发送"按钮发布，浏览器保持打开供人工确认。

## 头条文章

将 Markdown 长文发布到微博头条文章平台 `https://card.weibo.com/article/v3/editor`。

```bash
# 基础用法
${BUN_X} ${SKILL_DIR}/scripts/weibo-article.ts article.md

# 指定封面图
${BUN_X} ${SKILL_DIR}/scripts/weibo-article.ts article.md --cover ./cover.jpg

# 覆盖 frontmatter 中的标题
${BUN_X} ${SKILL_DIR}/scripts/weibo-article.ts article.md --title "自定义标题"

# 组合使用
${BUN_X} ${SKILL_DIR}/scripts/weibo-article.ts article.md --cover ./cover.jpg --title "标题"
```

**Markdown 格式（支持 YAML frontmatter）**：
```markdown
---
title: 文章标题（可选）
summary: 文章导语（可选，最多44字）
cover_image: /path/to/cover.jpg
---

# 大标题

正文内容，图片使用标准 Markdown 语法：

![图片描述](本地路径或网络URL)

## 章节标题

更多内容...
```

**字符限制**：
- 标题：最多 32 字符（超出自动截断）
- 导语：最多 44 字符（超出自动重新生成）

**发布流程**：
1. 打开头条文章编辑器
2. 点击"写文章"按钮
3. 填写标题（验证 32 字限制）
4. 填写导语（验证 44 字限制）
5. 通过剪贴板粘贴 HTML 内容到 ProseMirror 编辑器
6. 逐一替换图片占位符（WBIMGPH_\d+）
7. 设置封面图
8. 人工审核并发布

## Chrome 调试端口问题排查

若脚本报错 `Chrome debug port not ready` 或 `Unable to connect`，先杀掉现有 Chrome CDP 实例再重试：

```bash
pkill -f "Chrome.*remote-debugging-port" 2>/dev/null
pkill -f "Chromium.*remote-debugging-port" 2>/dev/null
sleep 2
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `WEIBO_BROWSER_CHROME_PATH` | 指定 Chrome 可执行文件路径 |
| `WEIBO_BROWSER_PROFILE_DIR` | 指定 Chrome profile 目录（登录状态） |
| `WEIBO_BROWSER_DEBUG_PORT` | 固定调试端口（默认随机分配） |

## 已知限制

- 脚本只负责将内容填入浏览器，**人工审核后点击发布**
- 首次运行需要手动登录微博
- 跨平台支持：macOS、Linux、Windows（WSL2）
