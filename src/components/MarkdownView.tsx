// 只读 Markdown 渲染：覆盖标题、段落、列表、引用、代码块、分隔线与常见行内语法。
// 直接生成 React 元素，不拼接 HTML 字符串，避免注入风险。

import React from 'react';
import { cn } from '@/lib/utils';

interface MarkdownViewProps {
  markdown: string;
  testId?: string;
  className?: string;
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; text: string }
  | { type: 'hr' };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s*```/;

function isBlockStart(line: string): boolean {
  return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || UL_RE.test(line) || OL_RE.test(line);
}

function parseBlocks(markdown: string): Block[] {
  const lines = String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    if (FENCE_RE.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_RE.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: (heading[1] ?? '#').length, text: heading[2] ?? '' });
      index += 1;
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const quote: string[] = [];
      while (index < lines.length) {
        const match = QUOTE_RE.exec(lines[index] ?? '');
        if (!match) break;
        quote.push(match[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = UL_RE.exec(lines[index] ?? '');
        if (!match) break;
        items.push(match[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = OL_RE.exec(lines[index] ?? '');
        if (!match) break;
        items.push(match[1] ?? '');
        index += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (current.trim() === '' || (paragraph.length > 0 && isBlockStart(current))) break;
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraph });
  }
  return blocks;
}

const INLINE_PATTERN = '(`[^`\\n]+`|\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__|~~[^~\\n]+~~|\\*[^*\\n]+\\*|_[^_\\n]+_|\\[[^\\]\\n]+\\]\\([^)\\s]+\\))';
const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

function safeHref(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url) ? url : null;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = new RegExp(INLINE_PATTERN, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), key)}</del>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else {
      const link = LINK_RE.exec(token);
      const label = link?.[1] ?? token;
      const href = link?.[2] ? safeHref(link[2]) : null;
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownView({ markdown, testId, className }: MarkdownViewProps) {
  const blocks = parseBlocks(markdown);
  return (
    <div className={cn('markdown-view', className)} data-testid={testId}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.type === 'heading') {
          const level = Math.min(6, Math.max(3, block.level + 1));
          return React.createElement(`h${level}`, { key, className: cn('md-heading', `md-h${block.level}`) }, renderInline(block.text, key));
        }
        if (block.type === 'paragraph') {
          return (
            <p key={key} className="md-paragraph">
              {renderInline(block.lines.join('\n'), key)}
            </p>
          );
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const ListTag = block.type;
          return React.createElement(
            ListTag,
            { key, className: cn('md-list', `md-${block.type}`) },
            block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>),
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="md-quote">
              {renderInline(block.lines.join('\n'), key)}
            </blockquote>
          );
        }
        if (block.type === 'code') {
          return (
            <pre key={key} className="md-code-block">
              <code>{block.text}</code>
            </pre>
          );
        }
        return <hr key={key} className="md-hr" />;
      })}
    </div>
  );
}
