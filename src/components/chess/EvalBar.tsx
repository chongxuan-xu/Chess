"use client";

import React from 'react';
import { cn } from "@/lib/utils";

interface EvalBarProps {
  score: number; // centipawn normalized to -10..10
  isMate: boolean;
  orientation?: 'vertical' | 'horizontal';
}

export function EvalBar({ score, isMate, orientation = 'vertical' }: EvalBarProps) {
  // Map -10..10 score to 0%..100% percentage
  const percentage = Math.max(0, Math.min(100, ((score + 10) / 20) * 100));

  if (orientation === 'horizontal') {
    return (
      <div className="relative w-full h-5 bg-slate-800 rounded-md overflow-hidden flex flex-row shadow-inner border border-white/5">
        {/* Visual background fill for White from left to right */}
        <div 
          className="eval-bar-fill h-full bg-white transition-all duration-700 ease-in-out" 
          style={{ width: `${percentage}%` }}
        />
        
        {/* Midpoint marker at 0.0 evaluation */}
        <div className="absolute top-0 left-1/2 h-full w-px bg-slate-500/30 z-10" />
        
        {/* Evaluation display text */}
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold select-none z-20 transition-all duration-300">
          <span className={percentage > 50 ? "text-slate-900" : "text-white"}>
            {isMate ? `#${Math.abs(Math.round(score))}` : (score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1))}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-8 h-full bg-slate-800 rounded-md overflow-hidden flex flex-col-reverse shadow-inner border border-white/5">
      {/* Visual background fill for White */}
      <div 
        className="eval-bar-fill w-full bg-white transition-all duration-700 ease-in-out" 
        style={{ height: `${percentage}%` }}
      />
      
      {/* Midpoint marker at 0.0 evaluation */}
      <div className="absolute top-1/2 left-0 w-full h-px bg-slate-500/30 z-10" />
      
      {/* Evaluation display text */}
      <div className={cn(
        "absolute left-0 w-full text-[10px] font-bold text-center py-2 select-none z-20 transition-all duration-300",
        percentage > 50 ? "bottom-0 text-slate-900" : "top-0 text-white"
      )}>
        {isMate ? `#${Math.abs(Math.round(score))}` : (score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1))}
      </div>
    </div>
  );
}
