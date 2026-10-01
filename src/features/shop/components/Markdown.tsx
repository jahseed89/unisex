import { useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Minimal markdown renderer for catalogue copy.
 *
 * Product descriptions are authored by staff, so the input is trusted editorial
 * text — but it is still never injected as HTML. This walks the string and
 * emits React nodes, which removes the injection surface entirely.
 *
 * Supported: ATX headings (## / ###), unordered lists (-, *), ordered lists
 * (1.), paragraphs, **bold**, *italic* and [links](href). Anything else is
 * rendered as plain text inside a paragraph.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source])

  return <div className={cn('prose-editorial', className)}>{blocks}</div>
}

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }

function parseBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1]!.length === 2 ? 2 : 3,
        text: heading[2]!,
      })
      continue
    }

    const unordered = /^[-*]\s+(.*)$/.exec(trimmed)
    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (unordered || ordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      const pattern = isOrdered ? /^\d+[.)]\s+(.*)$/ : /^[-*]\s+(.*)$/
      const items: string[] = []

      // Consume the whole run, including wrapped continuation lines.
      while (index < lines.length) {
        const current = (lines[index] ?? '').trim()
        const match = pattern.exec(current)
        if (match) {
          items.push(match[1]!)
          index += 1
          continue
        }
        if (!current) break
        items[items.length - 1] = `${items[items.length - 1]!} ${current}`
        index += 1
      }
      index -= 1

      blocks.push({ type: 'list', ordered: isOrdered, items })
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()

  return blocks.map((block, index) => renderBlock(block, index))
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 2 ? 'h3' : 'h4'
      return <Tag key={key}>{inline(block.text)}</Tag>
    }
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key}>
          {block.items.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'paragraph':
    default:
      return <p key={key}>{inline(block.text)}</p>
  }
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      const external = /^https?:\/\//i.test(link[2]!)
      return (
        <a
          key={index}
          href={link[2]}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {link[1]}
        </a>
      )
    }
    return <span key={index}>{part}</span>
  })
}
