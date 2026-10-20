/** Lê um corpo `text/event-stream` e emite { event, data } para cada evento. */
export async function* readSSE(body) {
  const decoder = new TextDecoder();
  let buf = '';
  const boundary = /\r?\n\r?\n/;

  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let m;
    while ((m = boundary.exec(buf))) {
      const raw = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const ev = parseEvent(raw);
      if (ev) yield ev;
    }
  }
  buf += decoder.decode();
  if (buf.trim()) {
    const ev = parseEvent(buf);
    if (ev) yield ev;
  }
}

function parseEvent(raw) {
  let event = 'message';
  const data = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}
