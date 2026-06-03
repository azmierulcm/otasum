'use client';

import { useState, useCallback } from 'react';
import { Module } from '@/lib/types';
import { extractPdfText } from '@/lib/pdfExtract';
import UploadZone from '@/components/UploadZone';
import LoadingState from '@/components/LoadingState';
import ResultsView from '@/components/ResultsView';

type AppState = 'idle' | 'loading' | 'results' | 'error';

type StreamEvent =
  | { type: 'module'; data: Module }
  | { type: 'done' }
  | { type: 'error'; message: string };

export default function Home() {
  const [state, setState]       = useState<AppState>('idle');
  const [modules, setModules]   = useState<Module[]>([]);
  const [error, setError]       = useState('');
  const [fileName, setFileName] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');

  const handleFileSubmit = useCallback(async (file: File) => {
    setFileName(file.name);
    setState('loading');
    setModules([]);
    setError('');
    setLoadingMsg('');

    try {
      // ── 1. Extract text in the browser (no binary upload, no size limit) ──
      setLoadingMsg('Extracting flight document text…');
      const rawText = await extractPdfText(file, (page, total) => {
        setLoadingMsg(`Reading page ${page} of ${total}…`);
      });

      if (rawText.trim().length < 200) {
        throw new Error(
          'Could not extract text from this PDF. It may be scanned or image-based — run OCR first.',
        );
      }

      // ── 2. POST extracted text (~500 KB) — well under any platform limit ──
      setLoadingMsg('Sending to analysis engine…');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText, fileName: file.name }),
      });

      // Catch platform-level errors before the stream starts
      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(
          text.replace(/<[^>]+>/g, '').trim().slice(0, 200) ||
            `Server error (${response.status})`,
        );
      }

      // ── 3. Read NDJSON stream — modules arrive as they complete ──────────
      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            throw new Error(`Unexpected server response — please try again. (${line.slice(0, 80)})`);
          }

          if (event.type === 'error') throw new Error(event.message);

          if (event.type === 'module') {
            setModules(prev => {
              const next = prev.filter(m => m.key !== event.data.key);
              return [...next, event.data].sort((a, b) => a.number - b.number);
            });
            setState('results');
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setState('error');
    }
  }, []);

  const handleReset = useCallback(() => {
    setState('idle');
    setModules([]);
    setError('');
    setFileName('');
    setLoadingMsg('');
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F7]">
      {/* Sticky header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={state !== 'idle' ? handleReset : undefined}
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 bg-[#1B2B5E] rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-sm group-hover:bg-[#243d7a] transition-colors">
              ✈
            </div>
            <div className="leading-tight">
              <p className="font-bold text-[#1B2B5E] text-base tracking-tight leading-none">
                Otasum
              </p>
              <p className="text-[10px] text-gray-400 font-normal leading-none mt-0.5 hidden sm:block">
                AI Briefing Analysis
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-2 py-1 rounded-lg tracking-wider">
              LIDO · OFP
            </span>
            {state === 'results' && (
              <span className="w-2 h-2 rounded-full bg-[#00A699] animate-pulse" title="Analysis complete" />
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-col flex-1">
        {state === 'idle' && (
          <UploadZone onSubmit={handleFileSubmit} />
        )}

        {state === 'loading' && (
          <LoadingState fileName={fileName} overrideMsg={loadingMsg} />
        )}

        {state === 'results' && (
          <ResultsView
            modules={modules}
            fileName={fileName}
            onReset={handleReset}
          />
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center justify-center flex-1 px-4 py-16 text-center animate-fade-in">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-3xl mb-5 border border-red-100">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-[#1B2B5E] mb-2 tracking-tight">Analysis Failed</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-xs leading-relaxed">{error}</p>
            <button
              onClick={handleReset}
              className="bg-[#FF5A5F] text-white font-semibold text-sm px-7 py-3 rounded-xl hover:bg-[#E04E53] active:scale-95 transition-all shadow-airbnb"
            >
              Try Again
            </button>
            {fileName && (
              <p className="mt-4 text-xs text-gray-400 font-mono">{fileName}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
