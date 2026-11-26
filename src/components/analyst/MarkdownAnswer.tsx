import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders an analyst answer as GitHub-flavoured Markdown (tables, bold, lists).
 * Safe by construction: raw HTML in the text is skipped (no rehype-raw), and
 * react-markdown's default urlTransform drops javascript:/data: links.
 */
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[#202824]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => <h3 className="mt-3 mb-1.5 text-[14px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1.5 text-[14px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-[13px] font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-[13px] font-semibold">{children}</h4>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-[#315F52] underline underline-offset-2 hover:text-[#264B40]"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-[#F3F1EC] px-1 py-0.5 font-mono text-[12px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-[#F3F1EC] p-3 font-mono text-[12px]">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[#D9D7D0] pl-3 text-[#525E58]">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-[#E8E6E0]">
      <table className="min-w-full divide-y divide-[#E8E6E0] text-left text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#FAF9F6] text-[11px] uppercase tracking-wide text-[#788C83]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-[#F0EEE8]">{children}</tbody>,
  th: ({ children, style }) => (
    <th scope="col" style={style} className="whitespace-nowrap px-3 py-2 font-medium">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3 py-2 tabular-nums text-[#202824]">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-[#E8E6E0]" />,
};

export function MarkdownAnswer({ children }: { children: string }): ReactNode {
  return (
    <div className="analyst-markdown break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
