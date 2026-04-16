/**
 * md-to-html.ts
 * Converts Markdown to HTML for Weibo article editor.
 * Extracts title, summary, cover_image from YAML frontmatter.
 * Replaces local image paths with WBIMGPH_<N> placeholders.
 */

import fs from 'node:fs';
import path from 'node:path';

interface ParsedArticle {
  title: string;
  summary: string;
  shortSummary: string;
  html: string;
  coverImage: string | null;
  contentImages: Array<{ placeholder: string; localPath: string; alt: string }>;
}

/**
 * Very simple Markdown → HTML converter.
 * Handles: headings, bold, italic, code blocks, inline code, links, images, lists, blockquotes.
 * Images: converts `![alt](path)` to `<img src="path" alt="alt">` with placeholder tracking.
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeLines = [];
      } else {
        inCodeBlock = false;
        result.push(`<pre><code class="language-${codeBlockLang}">${codeLines.join('\n')}</code></pre>`);
        codeLines = [];
        codeBlockLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    if (h1) { result.push(`<h1>${h1[1]}</h1>`); continue; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { result.push(`<h2>${h2[1]}</h2>`); continue; }
    const h3 = line.match(/^### (.+)/);
    if (h3) { result.push(`<h3>${h3[1]}</h3>`); continue; }

    // Blockquote
    if (line.startsWith('> ')) {
      result.push(`<blockquote>${line.slice(2)}</blockquote>`);
      continue;
    }

    // Unordered list
    if (line.match(/^[-*] /)) {
      result.push(`<li>${line.slice(2)}</li>`);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---$/)) {
      result.push('<hr>');
      continue;
    }

    // Paragraph (non-empty lines accumulate)
    if (line.trim()) {
      let html = line;

      // Inline code: `code`
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Bold: **text**
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

      // Italic: *text* or _text_
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

      // Links: [text](url)
      html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

      result.push(`<p>${html}</p>`);
    } else {
      result.push('');
    }
  }

  return result.join('\n');
}

/**
 * Extract frontmatter from markdown content.
 * Returns { frontmatter: record, body: string }
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, body: content };

  const fm: Record<string, string> = {};
  for (const line of fmMatch[1]!.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fm[key] = value;
  }

  return { frontmatter: fm, body: fmMatch[2]! };
}

let _imageCounter = 0;

/**
 * Parse a Markdown file into a structured article for Weibo.
 */
export async function parseMarkdown(
  markdownPath: string,
  options?: { title?: string; coverImage?: string },
): Promise<ParsedArticle> {
  const content = fs.readFileSync(markdownPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  const title = options?.title ?? frontmatter.title ?? path.basename(markdownPath, '.md');
  const coverImage = options?.coverImage ?? frontmatter.cover_image ?? null;

  // Extract first non-empty paragraph for summary
  const paragraphs = body.split('\n\n').filter((p) => p.trim() && !p.startsWith('#') && !p.startsWith('```'));
  const firstPara = paragraphs[0] ?? '';
  const shortSummary = firstPara.replace(/<[^>]+>/g, '').slice(0, 80);

  // Convert images to placeholders and track them
  _imageCounter = 0;
  const contentImages: ParsedArticle['contentImages'] = [];

  const htmlWithPlaceholders = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, imgPath) => {
    _imageCounter++;
    const placeholder = `WBIMGPH_${_imageCounter}`;
    const resolvedPath = path.isAbsolute(imgPath) ? imgPath : path.resolve(path.dirname(markdownPath), imgPath);
    contentImages.push({ placeholder, localPath: resolvedPath, alt: alt || '' });
    return `<p>${placeholder}</p>`;
  });

  const html = markdownToHtml(htmlWithPlaceholders);

  return { title, summary: frontmatter.summary ?? shortSummary, shortSummary, html, coverImage, contentImages };
}
