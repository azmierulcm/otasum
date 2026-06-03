'use client';

import { useEffect, useState } from 'react';

const MESSAGES = [
  'Parsing flight plan data...',
  'Analyzing weather conditions...',
  'Processing NOTAM database...',
  'Computing fuel figures...',
  'Evaluating EDTO sectors...',
  'Calculating windshear profile...',
  'Generating briefing package...',
  'Final checks in progress...',
];

export default function LoadingState({
  fileName,
  overrideMsg,
}: {
  fileName: string;
  overrideMsg?: string;
}) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (overrideMsg) return; // parent is controlling the message
    const timer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [overrideMsg]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 select-none">
      {/* Flying plane track */}
      <div className="w-full max-w-xs relative h-10 mb-10 overflow-hidden">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 plane-track h-px opacity-40" />
        <div className="text-3xl animate-fly absolute top-1/2 -translate-y-1/2 left-0">✈</div>
      </div>

      {/* Main text */}
      <div className="text-center animate-fade-in">
        <h2 className="text-xl font-bold text-[#1B2B5E] mb-1 tracking-tight">
          Analyzing Briefing Package
        </h2>
        {fileName && (
          <p className="text-xs text-gray-400 font-mono truncate max-w-[240px] mx-auto mt-1 mb-5">
            {fileName}
          </p>
        )}

        {/* Status message — parent can override with live extraction progress */}
        <div className="h-5 flex items-center justify-center overflow-hidden">
          <p key={overrideMsg ?? msgIndex} className="text-sm text-gray-500 animate-fade-in">
            {overrideMsg ?? MESSAGES[msgIndex]}
          </p>
        </div>

        {/* Pulsing dots */}
        <div className="flex justify-center items-center gap-1.5 mt-5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-2 h-2 rounded-full bg-[#FF5A5F] animate-pulse-ring"
              style={{ animationDelay: `${i * 220}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Six module badges — staged loading shimmer */}
      <div className="mt-10 grid grid-cols-3 gap-2 max-w-xs w-full">
        {['OFP', 'WX', 'NOTAM', 'WS', 'EDTO', 'FUEL'].map((label, i) => (
          <div
            key={label}
            className="h-8 bg-gray-200 rounded-xl animate-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-400 max-w-xs text-center">
        Analysis takes 15–30 seconds. Do not close this tab.
      </p>
    </div>
  );
}
