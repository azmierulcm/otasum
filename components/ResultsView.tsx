'use client';

import { useState, useEffect } from 'react';
import { Module, MODULE_META } from '@/lib/types';
import { downloadBriefing } from '@/lib/generateBriefingHtml';
import MarkdownRenderer from './MarkdownRenderer';

interface ResultsViewProps {
  modules: Module[];
  fileName: string;
  onReset: () => void;
}

// ── Per-module loading quips ──────────────────────────────────────────────────

const SKELETON_QUIPS: Record<string, string[]> = {
  weather: [
    'Decoding METARs and arguing with TAFs…',
    'Checking if that TSRA is actually on your route…',
    'Counting TEMPO groups affecting your arrival…',
    'Consulting SIGMETs from 6 different FIRs…',
    'Negotiating with the jetstream for a better W/C…',
    'Verifying ceilings haven\'t dropped since brief time…',
    'Cross-checking the alternate forecast with appropriate scepticism…',
  ],
  notams: [
    'Sifting through the GPS RAIM NOTAMs first…',
    'Identifying closures that actually affect your flight…',
    'Filtering out the ones that expired in 2019…',
    'Checking if that ILS is really U/S or just "degraded"…',
    'Translating NOTAM-speak into plain English…',
    'Scanning for anything that would ruin your day…',
    'Verifying the stop bar situation at your arrival stand…',
  ],
};

// ── Skeleton sub-components ───────────────────────────────────────────────────

function WxSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Departure section */}
      <div className="space-y-2">
        <div className="h-3 bg-[#1B2B5E]/20 rounded-md w-44" />
        <div className="h-2.5 bg-gray-100 rounded w-full" />
        <div className="h-2.5 bg-gray-100 rounded w-5/6" />
        <div className="h-2.5 bg-gray-100 rounded w-4/5" />
      </div>
      {/* Table placeholder */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <div className="h-8 bg-[#1B2B5E]/15" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-7 border-t border-gray-100 bg-gray-50/60 flex items-center px-3 gap-4">
            <div className="h-2 bg-gray-200 rounded w-16" />
            <div className="h-2 bg-gray-200 rounded w-24" />
            <div className="h-2 bg-gray-200 rounded w-20" />
          </div>
        ))}
      </div>
      {/* Enroute section */}
      <div className="space-y-2">
        <div className="h-3 bg-[#1B2B5E]/20 rounded-md w-52" />
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="h-8 bg-[#1B2B5E]/15" />
          {[0, 1, 2].map(i => (
            <div key={i} className="h-7 border-t border-gray-100 bg-gray-50/60 flex items-center px-3 gap-4">
              <div className="h-2 bg-gray-200 rounded w-20" />
              <div className="h-2 bg-gray-200 rounded w-16" />
              <div className="h-2 bg-gray-200 rounded w-28" />
            </div>
          ))}
        </div>
      </div>
      {/* Destination section */}
      <div className="space-y-2">
        <div className="h-3 bg-[#1B2B5E]/20 rounded-md w-48" />
        <div className="h-2.5 bg-gray-100 rounded w-full" />
        <div className="h-2.5 bg-gray-100 rounded w-3/4" />
        <div className="h-2.5 bg-gray-100 rounded w-4/5" />
      </div>
    </div>
  );
}

function NotamSkeleton() {
  const cards = [
    { color: '#DC2626', w: '60%' },
    { color: '#D97706', w: '75%' },
    { color: '#16A34A', w: '55%' },
  ];
  return (
    <div className="space-y-5 animate-pulse">
      {/* Departure section */}
      <div className="h-3 bg-[#1B2B5E]/20 rounded-md w-40" />
      <div className="space-y-4">
        {cards.map((c, i) => (
          <div key={i} className="pl-3 border-l-2 space-y-1.5" style={{ borderColor: c.color }}>
            <div className="h-3 bg-gray-200 rounded" style={{ width: c.w }} />
            <div className="h-2.5 bg-gray-100 rounded w-full" />
            <div className="h-2.5 bg-gray-100 rounded w-4/5" />
          </div>
        ))}
      </div>
      {/* Destination section */}
      <div className="h-3 bg-[#1B2B5E]/20 rounded-md w-44 mt-2" />
      <div className="space-y-4">
        {[{ color: '#DC2626', w: '65%' }, { color: '#D97706', w: '70%' }].map((c, i) => (
          <div key={i} className="pl-3 border-l-2 space-y-1.5" style={{ borderColor: c.color }}>
            <div className="h-3 bg-gray-200 rounded" style={{ width: c.w }} />
            <div className="h-2.5 bg-gray-100 rounded w-full" />
            <div className="h-2.5 bg-gray-100 rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DownloadButton({ modules, fileName }: { modules: Module[]; fileName: string }) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'done'>('idle');

  const handleDownload = async () => {
    setStatus('generating');
    try {
      await downloadBriefing(modules, fileName);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('idle');
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={status === 'generating'}
      className="flex items-center gap-1.5 text-xs font-semibold text-[#00A699] border border-[#00A699] rounded-full px-3 py-1 hover:bg-teal-50 active:bg-teal-100 transition-colors disabled:opacity-50"
    >
      <span className="text-sm">
        {status === 'generating' ? '⏳' : status === 'done' ? '✓' : '⬇'}
      </span>
      <span>
        {status === 'generating' ? 'Generating…' : status === 'done' ? 'Saved!' : 'Download'}
      </span>
    </button>
  );
}

function ModuleLoadingSkeleton({ moduleKey }: { moduleKey: string }) {
  const quips   = SKELETON_QUIPS[moduleKey] ?? ['Awaiting AI analysis…'];
  const [idx, setIdx]       = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const qTimer = setInterval(() => setIdx(i => (i + 1) % quips.length), 2200);
    const eTimer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => { clearInterval(qTimer); clearInterval(eTimer); };
  }, [quips.length]);

  return (
    <div className="space-y-5">
      {/* AI thinking header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 bg-[#1B2B5E]/8 rounded-full px-3 py-1.5">
          <span className="flex items-center gap-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="block w-1.5 h-1.5 rounded-full bg-[#1B2B5E] animate-pulse"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            ))}
          </span>
          <span className="text-xs font-semibold text-[#1B2B5E]">AI analysing</span>
        </div>
        <span className="text-xs text-gray-400 tabular-nums font-mono">{elapsed}s</span>
      </div>

      {/* Module-specific skeleton */}
      {moduleKey === 'weather' ? <WxSkeleton /> : <NotamSkeleton />}

      {/* Rotating quip */}
      <p
        key={idx}
        className="text-center text-xs text-gray-400 italic animate-fade-in pt-1"
      >
        {quips[idx]}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-2 flex-shrink-0">
          {!allDone && (
            <span className="text-[10px] font-semibold text-[#00A699] tabular-nums">
              {received}/{total} modules
            </span>
          )}
          {allDone && (
            <DownloadButton modules={modules} fileName={fileName} />
          )}
          <button
            onClick={onReset}
            className="text-xs font-semibold text-[#FF5A5F] border border-[#FF5A5F] rounded-full px-3 py-1 hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            New Upload
          </button>
        </div>
      </div>

      {/* Airplane progress bar */}
      {!allDone && (
        <div className="relative bg-gray-50 border-b border-gray-100 overflow-hidden" style={{ height: '30px' }} aria-hidden>
          {/* Fill track */}
          <div
            className="absolute inset-y-0 left-0 bg-[#00A699]/12 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
          {/* Runway dashes */}
          <div className="absolute inset-0 flex items-center px-6 gap-0 pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="flex-1 border-t border-dashed border-gray-200" />
            ))}
          </div>
          {/* ✈ airplane moves with progress */}
          <div
            className="absolute top-1/2 -translate-y-1/2 text-[#00A699] transition-[left] duration-700 ease-out select-none"
            style={{ left: `calc(${Math.max(pct, 3)}% - 12px)`, fontSize: '16px' }}
          >
            ✈
          </div>
          {/* Module count left */}
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 tabular-nums">
            {received}/{total} modules
          </span>
          {/* Percentage right */}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#00A699] tabular-nums">
            {pct}%
          </span>
        </div>
      )}

      {/* Module tab bar */}
      <div className="bg-white border-b border-gray-100 overflow-x-auto tabs-scroll sticky top-14 z-10">
        <div className="flex min-w-max sm:min-w-full sm:justify-center px-2">
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
          {/* Module badge — centred */}
          <div className="flex justify-center mb-4">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-sm"
              style={{ backgroundColor: activeMeta.color }}
            >
              <span>{activeMeta.emoji}</span>
              <span>MODULE {activeMeta.number}</span>
              <span className="opacity-60">·</span>
              <span className="uppercase tracking-wide">{activeMeta.label}</span>
            </div>
          </div>

          {/* Content card */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 sm:p-6">
            {activeModule ? (
              // Strip the duplicate ## MODULE N: header the AI outputs — the badge above handles the title
              <MarkdownRenderer content={activeModule.content.replace(/^##\s*MODULE\s*\d+:[^\n]*\n+/i, '')} />
            ) : (
              <ModuleLoadingSkeleton moduleKey={activeMeta.key} />
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
        <div className="flex justify-evenly">
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
