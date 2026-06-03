'use client';

import { useEffect, useState } from 'react';

const MESSAGES = [
  'Requesting pushback clearance from dispatch...',
  'Still counting the NOTAMs. Send help.',
  'Convincing the met office to commit to a forecast...',
  'Cross-checking fuel burn with actual physics...',
  'Checking if the CTOT is real or just a rumour...',
  'Politely ignoring the GPS RAIM NOTAMs...',
  'Asking the captain to re-read the ATIS... again...',
  'Calculating whether contingency fuel is truly contingent...',
  'Negotiating directly with SIGMET WS-0341...',
  'Verifying that FL400 is higher than FL380...',
  'Confirming the alternate is still on the planet...',
  'Checking if dispatch actually read the OFP...',
  'Filing a formal complaint with the jetstream...',
  'Translating ACARS into English...',
];

const MODULE_LABELS = ['OFP', 'WX', 'NOTAM', 'WS', 'EDTO', 'FUEL'];

export default function LoadingState({ fileName }: { fileName: string }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [shimmerDot, setShimmerDot] = useState(0);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex(i => (i + 1) % MESSAGES.length);
    }, 2200);
    return () => clearInterval(msgTimer);
  }, []);

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setShimmerDot(i => (i + 1) % MODULE_LABELS.length);
    }, 400);
    return () => clearInterval(dotTimer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 select-none">
      {/* Flying plane */}
      <div className="w-full max-w-xs relative h-10 mb-10 overflow-hidden">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 plane-track h-px opacity-40" />
        <div className="text-3xl animate-fly absolute top-1/2 -translate-y-1/2 left-0">✈</div>
      </div>

      {/* Headline */}
      <div className="text-center mb-6 animate-fade-in">
        <h2 className="text-xl font-bold text-[#1B2B5E] tracking-tight">
          Crunching your OFP
        </h2>
        {fileName && (
          <p className="text-xs text-gray-400 font-mono truncate max-w-[240px] mx-auto mt-1">
            {fileName}
          </p>
        )}
      </div>

      {/* Indeterminate progress bar */}
      <div className="w-full max-w-xs h-1.5 bg-gray-100 rounded-full overflow-hidden mb-6">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#1B2B5E] via-[#00A699] to-[#FF5A5F] animate-shimmer" />
      </div>

      {/* Witty rotating message */}
      <div className="h-6 flex items-center justify-center mb-8 overflow-hidden">
        <p
          key={msgIndex}
          className="text-sm text-gray-500 italic text-center animate-fade-in px-4"
        >
          {MESSAGES[msgIndex]}
        </p>
      </div>

      {/* Module shimmer chips */}
      <div className="grid grid-cols-3 gap-2 max-w-xs w-full mb-8">
        {MODULE_LABELS.map((label, i) => (
          <div
            key={label}
            className={`
              h-9 rounded-xl flex items-center justify-center text-xs font-bold
              transition-colors duration-300
              ${i === shimmerDot
                ? 'bg-[#1B2B5E] text-white shadow-sm'
                : 'bg-gray-100 text-gray-400'
              }
            `}
          >
            {label}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 max-w-xs text-center">
        Sit back. This takes 15–30 seconds.{'\n'}We promise it&apos;s worth it.
      </p>
    </div>
  );
}
