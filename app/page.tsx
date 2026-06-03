'use client';

import { useState, useCallback } from 'react';
import { Module } from '@/lib/types';
import UploadZone from '@/components/UploadZone';
import LoadingState from '@/components/LoadingState';
import ResultsView from '@/components/ResultsView';

type AppState = 'idle' | 'loading' | 'results' | 'error';

export default function Home() {
  const [state, setState] = useState<AppState>('idle');
  const [modules, setModules] = useState<Module[]>([]);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFileSubmit = useCallback(async (file: File) => {
    setFileName(file.name);
    setState('loading');
    setError('');

    try {
      // Send raw bytes — avoids Next.js multipart body-size limits (~4 MB cap)
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });

      // Parse response — surface real server error if not JSON
      const text = await response.text();
      let data: { modules?: Module[]; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text.slice(0, 300) || `Server error (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.error ?? 'Analysis failed.');
      }

      setModules(data.modules ?? []);
      setState('results');
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
          <LoadingState fileName={fileName} />
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
