'use client';

import { RotateCcw, AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 text-center font-sans select-none">
      <div className="p-4 rounded-full bg-slate-900 border border-slate-800 text-red-500 mb-6 animate-bounce">
        <AlertTriangle className="w-12 h-12" />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 font-display">
        Analysis Interrupted
      </h1>
      <p className="text-slate-400 max-w-md text-sm mb-8 leading-relaxed">
        An unexpected illegal move or tactical error occurred on our end. Please try again.
      </p>
      {error.message && (
        <code className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-red-400 max-w-lg overflow-x-auto mb-8 font-mono">
          {error.message}
        </code>
      )}
      <button
        onClick={() => reset()}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-100 font-semibold rounded-xl text-sm transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Reset Board
      </button>
    </div>
  );
}
