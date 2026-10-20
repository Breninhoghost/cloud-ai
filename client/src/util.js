export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para contextos sem a Clipboard API (ex.: HTTP não seguro).
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'xml', 'yml', 'yaml', 'toml', 'ini', 'env',
  'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'cs', 'go', 'rs', 'rb', 'php',
  'sh', 'sql', 'kt', 'swift', 'r', 'tex',
]);
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;
export const MAX_ATTACHMENTS = 4;

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

/** Converte um File em anexo { kind, name, data|content } ou lança Error com mensagem em português. */
export async function fileToAttachment(file) {
  if (IMAGE_TYPES.includes(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`"${file.name}" é grande demais (máx. 4 MB por imagem).`);
    return { kind: 'image', name: file.name, data: await readAsDataURL(file) };
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) {
    const content = await file.text();
    if (content.length > MAX_TEXT_CHARS) throw new Error(`"${file.name}" é grande demais (máx. 200 mil caracteres).`);
    if (content.includes('\u0000')) throw new Error(`"${file.name}" parece ser um arquivo binário.`);
    return { kind: 'text', name: file.name, content };
  }
  throw new Error(`Tipo de arquivo não suportado: "${file.name}". Use imagens (PNG, JPEG, WebP, GIF) ou arquivos de texto/código.`);
}

export function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const first = (name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
