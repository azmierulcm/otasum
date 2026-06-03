'use client';

import { useState } from 'react';
import { Module, MODULE_META } from '@/lib/types';
import MarkdownRenderer from './MarkdownRenderer';

interface ResultsViewProps {
  modules: Module[];
  fileName: string;
  onReset: () => void;
}

const SKELETON_QUIPS: Record<string, string> = {
  weather: 'Arguing with the met office about that forecast…',
  notams:  'Reading all the NOTAMs so you don\'t have to…',
};

export default function ResultsView({ modules, fileName, onReset }: ResultsViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMeta   = MODULE_META[activeIndex];
  const activeModule = modules.find(m => m.key === activeMeta.key);
  const total        = MODULE_META.length;
  const received     = modules.length;
  const allDone      = received === total;
  const pct          = Math.round((received / total) * 100);

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* File info bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">📄</span>
          <p className="text-xs text-gray-500 font-mono truncate">{fileName}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!allDone && (
            <span className="text-[10px] font-semibold text-[#00A699] tabular-nums">
              {received}/{total} modules
            </span>
          )}
          <button
            onClick={onReset}
            className="text-xs font-semibold text-[#FF5A5F] border border-[#FF5A5F] rounded-full px-3 py-1 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            New Upload
          </button>
        </div>
      </div>

      {/* Progress bar — fills as modules stream in, pops away when done */}
      <div
        className={`h-1 bg-gray-100 origin-top ${allDone ? 'animate-progress-pop' : ''}`}
        aria-hidden
      >
        <div
          className="h-full bg-[#00A699] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Module tab bar */}
      <div className="bg-white border-b border-gray-100 overflow-x-auto tabs-scroll sticky top-14 z-10">
        <div className="flex min-w-max px-2">
          {MODULE_META.map((meta, index) => {
            const isActive = index === activeIndex;
            const isReady  = modules.some(m => m.key === meta.key);
            return (
              <button
                key={meta.key}
                onClick={() => setActiveIndex(index)}
                className={`
                  relative flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs font-semibold whitespace-nowrap
                  transition-all duration-200 border-b-2
                  ${isActive ? 'border-b-2' : 'border-transparent text-gray-400 hover:text-gray-600'}
                `}
                style={isActive ? { borderBottomColor: meta.color, color: meta.color } : {}}
              >
                <span className="text-sm">{meta.emoji}</span>
                <span className="hidden sm:inline">{meta.label}</span>
                <span className="sm:hidden">{meta.shortLabel}</span>
                {!isReady && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse ml-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-[#F7F7F7]">
        <div
          key={activeMeta.key}
          className="max-w-3xl mx-auto px-3 sm:px-4 py-5 pb-24 animate-fade-in"
        >
          {/* Module badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-xs font-bold mb-4 shadow-sm"
            style={{ backgroundColor: activeMeta.color }}
          >
            <span>{activeMeta.emoji}</span>
            <span>MODULE {activeMeta.number}</span>
            <span className="opacity-60">·</span>
            <span className="uppercase tracking-wide">{activeMeta.label}</span>
          </div>

          {/* Content card */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 sm:p-6">
            {activeModule ? (
              <MarkdownRenderer content={activeModule.content} />
            ) : (
              <ModuleLoadingSkeleton quip={SKELETON_QUIPS[activeMeta.key]} />
            )}
          </div>

          {activeModule && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <CopyButton content={activeModule.content} label="Copy Module" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav — mobile */}
      <div className="safe-bottom fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-1 sm:hidden z-20">
        <div className="flex justify-around">
          {MODULE_META.map((meta, index) => {
            const isActive = index === activeIndex;
            const isReady  = modules.some(m => m.key === meta.key);
            return (
              <button
                key={meta.key}
                onClick={() => setActiveIndex(index)}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors"
                style={isActive ? { color: meta.color } : {}}
              >
                <span className={`text-lg transition-transform ${isActive ? 'scale-110' : ''}`}>
                  {meta.emoji}
                </span>
                <span className={`text-[9px] font-bold tracking-wide ${isActive ? 'opacity-100' : 'text-gray-400 opacity-70'}`}>
                  {meta.shortLabel}
                </span>
                {!isReady && (
                  <span className="w-1 h-1 rounded-full bg-gray-300 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModuleLoadingSkeleton({ quip }: { quip?: string }) {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3.5 bg-gray-100 rounded-lg w-3/4" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-full" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-5/6" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-2/3 mt-6" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-full" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-4/5" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-full" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-3/4 mt-6" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-full" />
      <div className="h-3.5 bg-gray-100 rounded-lg w-5/6" />
      <p className="text-center text-xs text-gray-400 italic pt-6">
        {quip ?? 'Awaiting AI analysis…'}
      </p>
    </div>
  );
}

function CopyButton({ content, label }: { content: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
    >
      <span className="text-sm">{copied ? '✓' : '⎘'}</span>
      <span>{copied ? 'Copied to clipboard' : label}</span>
    </button>
  );
}
