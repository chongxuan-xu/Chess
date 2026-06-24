"use client";

import React from "react";

interface PageLoaderProps {
  message?: string;
  submessage?: string;
}

export function PageLoader({ message: _message, submessage: _submessage, "data-overlay-loader": overlayLoader }: PageLoaderProps & { "data-overlay-loader"?: string }) {
  return (
    <div 
      data-page-loader="true"
      data-overlay-loader={overlayLoader}
      className="h-screen w-full bg-[#0c0f16] flex flex-col items-center justify-center p-8 relative overflow-hidden select-none"
    >
      {/* Centered container with ONLY the Crown symbol */}
      <div className="relative flex items-center justify-center">
        <div className="animate-crown-dance">
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="w-12 h-12 text-amber-400 filter drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]"
          >
            <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
          </svg>
        </div>
      </div>
    </div>
  );
}
