/** 极简 Markdown 渲染：支持标题、列表、表格、引用、粗体、行内代码。
 *  仅用于渲染本站受控内容与 AI 输出，输出前做 HTML 转义。 */

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(s) {
  let t = esc(s)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return t
}

export function renderMarkdown(src) {
  if (!src) return ''
  const lines = String(src).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0

  const isTableSep = (l) => /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(l) && l.includes('-')

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = line.split('|').map((c) => c.trim()).filter((c, idx, arr) => !(idx === 0 && !c) && !(idx === arr.length - 1 && !c))
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(
          lines[i]
            .split('|')
            .map((c) => c.trim())
            .filter((c, idx, arr) => !(idx === 0 && !c) && !(idx === arr.length - 1 && !c)),
        )
        i++
      }
      out.push('<table><thead><tr>' + header.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>')
      out.push(rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join(''))
      out.push('</tbody></table>')
      continue
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const lvl = h[1].length + 1
      out.push(`<h${Math.min(lvl, 4)}>${inline(h[2])}</h${Math.min(lvl, 4)}>`)
      i++
      continue
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${buf.map(inline).join('<br />')}</blockquote>`)
      continue
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push('<ol>' + buf.map((b) => `<li>${inline(b)}</li>`).join('') + '</ol>')
      continue
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      out.push('<ul>' + buf.map((b) => `<li>${inline(b)}</li>`).join('') + '</ul>')
      continue
    }

    // 段落
    const buf = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    out.push(`<p>${buf.map(inline).join('<br />')}</p>`)
  }

  return out.join('\n')
}
