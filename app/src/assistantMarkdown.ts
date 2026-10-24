/** Small Markdown renderer. Raw text is escaped once; generated markup is never reparsed. */
export const escapeChatText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Read balanced Markdown destinations and keep sentence punctuation outside plain URLs. */
function linkAt(text: string, start: number): { label: string | null; url: string; end: number } | null {
  const prefix = /^\[([^\]\n]+)\]\((https?:\/\/)/.exec(text.slice(start));
  if (prefix) {
    const from = start + prefix[0].length - prefix[2].length;
    let depth = 0;
    for (let i = from; i < text.length; i++) {
      const ch = text[i];
      if (/\s/.test(ch)) break;
      if (ch === '(') depth++;
      if (ch === ')') {
        if (depth === 0) return { label: prefix[1], url: text.slice(from, i), end: i + 1 };
        depth--;
      }
    }
    return null;
  }
  const hit = /^https?:\/\/[^\s<>"'`]+/.exec(text.slice(start));
  if (!hit) return null;
  let url = hit[0];
  for (;;) {
    const before = url;
    url = url.replace(/[.,;:!?*_~]+$/, "");
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      if (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
    }
    if (url === before) break;
  }
  return { label: null, url, end: start + url.length };
}

export function renderAssistantMarkdown(text: string, options: { bold?: (escaped: string) => string; link?: (label: string | null, url: string) => string } = {}) {
  const inline = (line: string): string => {
    const pattern = /`([^`\n]+)`|\[[^\]\n]+\]\(https?:\/\/|https?:\/\/|\*\*([^\n]+?)\*\*|\*([^*\n]+)\*/g;
    let out = '', at = 0, m: RegExpExecArray | null;
    while ((m = pattern.exec(line))) {
      out += escapeChatText(line.slice(at, m.index));
      if (m[1] !== undefined) out += '<code>' + escapeChatText(m[1]) + '</code>';
      else if (m[2] !== undefined) out += options.bold ? options.bold(escapeChatText(m[2])) : '<b>' + escapeChatText(m[2]) + '</b>';
      else if (m[3] !== undefined) out += '<i>' + escapeChatText(m[3]) + '</i>';
      else {
        const link = linkAt(line, m.index);
        if (link) {
          out += options.link ? options.link(link.label === null ? null : escapeChatText(link.label), escapeChatText(link.url)) : escapeChatText(line.slice(m.index, link.end));
          pattern.lastIndex = link.end;
        } else out += escapeChatText(m[0]);
      }
      at = pattern.lastIndex;
    }
    return out + escapeChatText(line.slice(at));
  };
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      close(); const code: string[] = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i]);
      out.push('<pre class="msg-code"><code>' + escapeChatText(code.join('\n')) + '</code></pre>'); continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) { close(); const level = Math.min(6, heading[1].length + 1); out.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const item = line.match(/^\s*(?:([-*])\s+|(\d+)[.)]\s+)(.+)$/);
    if (item) {
      const type = item[1] ? 'ul' : 'ol';
      if (list !== type) { close(); out.push(type === 'ol' && Number(item[2]) !== 1 ? `<ol start="${Number(item[2])}">` : `<${type}>`); list = type; }
      out.push('<li>' + inline(item[3]) + '</li>'); continue;
    }
    close(); out.push(line.trim() ? inline(line) + '<br/>' : '<br/>');
  }
  close(); return out.join('\n');
}
