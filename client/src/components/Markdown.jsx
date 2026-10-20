import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import Icon from './Icon.jsx';
import { copyText } from '../util.js';

function nodeText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  return nodeText(node.props?.children);
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const code = Array.isArray(children) ? children[0] : children;
  const lang = /language-([\w-]+)/.exec(code?.props?.className || '')?.[1] || 'texto';

  const copy = async () => {
    if (await copyText(nodeText(code).replace(/\n$/, ''))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span>{lang}</span>
        <button type="button" onClick={copy} className="ghost-btn" aria-label="Copiar código">
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components = {
  pre: CodeBlock,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" />,
  table: ({ node, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};

/** Renderiza Markdown (GFM) com realce de código. HTML bruto NÃO é interpretado (seguro contra XSS). */
const Markdown = memo(function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
