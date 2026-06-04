'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-[#1B2B5E] mb-4 mt-6 tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold text-[#1B2B5E] mb-3 mt-5 pb-2 border-b border-gray-200 tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4 uppercase tracking-wide">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-xs font-bold text-gray-600 mb-1.5 mt-3 uppercase tracking-widest">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-base text-[#484848] mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-[#1B2B5E]">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-500">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 space-y-1.5 list-decimal list-outside ml-4">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-base text-[#484848] flex gap-2.5 items-start leading-relaxed">
      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#FF5A5F] flex-shrink-0" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl bg-[#1B2B5E] p-4 mb-4 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code className="font-mono text-green-300 whitespace-pre" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-blue-50 text-[#1B2B5E] px-1.5 py-0.5 rounded font-mono text-xs font-semibold border border-blue-100"
        {...props}
      >
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-[#FF5A5F] pl-4 my-3 py-1 bg-red-50 rounded-r-xl text-sm text-gray-600">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4 rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#1B2B5E] text-white">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
  tr: ({ children }) => (
    <tr className="even:bg-gray-50/70 hover:bg-sky-50/60 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-left font-semibold text-sm uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2.5 text-sm text-[#484848] font-mono align-top">{children}</td>
  ),
  hr: () => <hr className="my-5 border-gray-200" />,
};

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
