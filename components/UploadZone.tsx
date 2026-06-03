'use client';

import { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';

interface UploadZoneProps {
  onSubmit: (file: File) => void;
  disabled?: boolean;
}

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MODULE_CHIPS = ['OFP Summary', 'Weather', 'NOTAMs', 'Windshear', 'EDTO', 'Fuel vs MDF'];

export default function UploadZone({ onSubmit, disabled }: UploadZoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dropError, setDropError] = useState('');

  const onDrop = useCallback((accepted: File[], rejections: FileRejection[]) => {
    setDropError('');
    if (rejections.length > 0) {
      const code = rejections[0].errors[0]?.code;
      if (code === 'file-too-large') {
        setDropError(`File exceeds the ${MAX_SIZE_MB} MB limit. Compress the PDF and retry.`);
      } else if (code === 'file-invalid-type') {
        setDropError('Only PDF files are accepted.');
      } else {
        setDropError(rejections[0].errors[0]?.message ?? 'Upload rejected.');
      }
      return;
    }
    if (accepted[0]) setSelectedFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: MAX_SIZE_BYTES,
    disabled,
  });

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-10 sm:py-16">
      {/* Hero text */}
      <div className="text-center mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#1B2B5E] tracking-tight mb-2">
          AI-Powered Briefing Analysis
        </h1>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Upload your Lido OFP package and get a structured ops brief in seconds.
        </p>
      </div>

      {/* Drop zone card */}
      <div
        {...getRootProps()}
        className={`
          w-full max-w-md border-2 border-dashed rounded-2xl p-8 sm:p-10 flex flex-col items-center gap-4
          cursor-pointer select-none transition-all duration-200
          ${isDragActive
            ? 'border-[#FF5A5F] bg-red-50 scale-[1.02] shadow-airbnb'
            : selectedFile
            ? 'border-[#00A699] bg-teal-50/60 shadow-card'
            : 'border-gray-300 bg-white hover:border-[#FF5A5F] hover:bg-red-50/20 shadow-card hover:shadow-card-hover'
          }
        `}
      >
        <input {...getInputProps()} />

        {/* Animated icon */}
        <div
          className={`
            w-16 h-16 rounded-full flex items-center justify-center text-3xl
            transition-all duration-300
            ${isDragActive ? 'bg-red-100 scale-110' : selectedFile ? 'bg-teal-100' : 'bg-gray-100'}
          `}
        >
          {selectedFile ? '📄' : isDragActive ? '✈️' : '📋'}
        </div>

        {/* File info or placeholder */}
        {selectedFile ? (
          <div className="text-center">
            <p className="font-semibold text-[#1B2B5E] text-sm leading-tight">{selectedFile.name}</p>
            <p className="text-xs text-[#00A699] font-medium mt-1">{formatBytes(selectedFile.size)} · Ready to analyze</p>
            <p className="text-xs text-gray-400 mt-2">Tap to replace</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="font-semibold text-[#484848] text-base">
              {isDragActive ? 'Release to load package' : 'Drop your OFP package here'}
            </p>
            <p className="text-sm text-gray-400 mt-1">or tap to browse</p>
            <p className="text-xs text-gray-400 mt-3">PDF · up to {MAX_SIZE_MB} MB</p>
          </div>
        )}
      </div>

      {/* Error message */}
      {dropError && (
        <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 w-full max-w-md animate-fade-in">
          <span className="flex-shrink-0 mt-0.5">⚠</span>
          <span>{dropError}</span>
        </div>
      )}

      {/* Analyze CTA */}
      {selectedFile && (
        <button
          onClick={() => onSubmit(selectedFile)}
          disabled={disabled}
          className="
            mt-5 w-full max-w-md bg-[#FF5A5F] text-white font-bold text-base
            py-4 px-6 rounded-2xl shadow-airbnb
            hover:bg-[#E04E53] active:scale-[0.98] transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2.5 animate-slide-up
          "
        >
          <span className="text-lg">✈</span>
          <span>Analyze Briefing Package</span>
        </button>
      )}

      {/* Module capability chips */}
      <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-sm">
        {MODULE_CHIPS.map((label) => (
          <span
            key={label}
            className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-500 shadow-sm"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
