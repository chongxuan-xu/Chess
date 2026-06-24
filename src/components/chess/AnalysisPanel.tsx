"use client";

import React, { useEffect, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoveAnalysis } from "@/lib/chess/types";
import { MoveClassificationIcon } from "./MoveClassificationIcon";
import { cn } from "@/lib/utils";

interface AnalysisPanelProps {
  moves: MoveAnalysis[];
  currentMoveIndex: number;
  onMoveClick: (index: number) => void;
  reviewSummary?: { whiteAccuracy: number; blackAccuracy: number };
}

export function AnalysisPanel({ moves, currentMoveIndex, onMoveClick, reviewSummary }: AnalysisPanelProps) {
  const moveRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    moveRefs.current[currentMoveIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMoveIndex]);

  // Format moves into pairs (White, Black)
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      white: moves[i],
      black: moves[i + 1] || null,
      index: Math.floor(i / 2) + 1
    });
  }

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-slate-800 shrink-0 bg-slate-900/40">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Game Log</h2>
        {reviewSummary && (
          <div className="grid grid-cols-2 gap-4 mb-2">
            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
              <span className="text-[10px] text-slate-400 block mb-1">WHITE ACCURACY</span>
              <span className="text-xl font-headline font-bold text-white">{reviewSummary.whiteAccuracy}%</span>
            </div>
            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
              <span className="text-[10px] text-slate-400 block mb-1">BLACK ACCURACY</span>
              <span className="text-xl font-headline font-bold text-white">{reviewSummary.blackAccuracy}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full w-full">
          <div className="p-2">
            <div className="grid grid-cols-[3rem_1fr_1fr] text-[11px] font-bold text-slate-500 px-4 py-2 uppercase border-b border-slate-800/50 mb-1">
              <span>#</span>
              <span>White</span>
              <span>Black</span>
            </div>
            {sidebarNoMoves(movePairs) ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <p className="text-xs font-medium">No moves played yet</p>
              </div>
            ) : (
              movePairs.map((pair, i) => (
                <div key={i} className="grid grid-cols-[3rem_1fr_1fr] items-center hover:bg-slate-800/40 transition-colors rounded-md group">
                  <div className="text-slate-600 font-mono text-[10px] px-4">{pair.index}.</div>
                  
                  <button 
                    ref={(el) => { moveRefs.current[(pair.index - 1) * 2] = el; }}
                    onClick={() => onMoveClick((pair.index - 1) * 2)}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-sm text-sm font-medium transition-all text-left",
                      currentMoveIndex === (pair.index - 1) * 2 ? "bg-sky-500/20 text-sky-400 shadow-sm font-semibold" : "text-slate-300 hover:text-white"
                    )}
                  >
                    <span>{pair.white.san}</span>
                    {pair.white.classification && (
                      <MoveClassificationIcon classification={pair.white.classification} className="w-3 h-3" />
                    )}
                  </button>

                  {pair.black ? (
                    <button 
                      ref={(el) => { moveRefs.current[(pair.index - 1) * 2 + 1] = el; }}
                      onClick={() => onMoveClick((pair.index - 1) * 2 + 1)}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-sm text-sm font-medium transition-all text-left",
                        currentMoveIndex === (pair.index - 1) * 2 + 1 ? "bg-sky-500/20 text-sky-400 shadow-sm font-semibold" : "text-slate-300 hover:text-white"
                      )}
                    >
                      <span>{pair.black.san}</span>
                      {pair.black.classification && (
                        <MoveClassificationIcon classification={pair.black.classification} className="w-3 h-3" />
                      )}
                    </button>
                  ) : <div />}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {moves[currentMoveIndex]?.classification && moves[currentMoveIndex]?.explanation && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <MoveClassificationIcon classification={moves[currentMoveIndex].classification!} className="w-4 h-4" />
            <h3 className="font-bold text-white text-sm">{moves[currentMoveIndex].classification}</h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed italic line-clamp-3">
            &ldquo;{moves[currentMoveIndex].explanation}&rdquo;
          </p>
          {moves[currentMoveIndex].bestMove && moves[currentMoveIndex].classification !== 'Best' && (
            <div className="mt-2 pt-2 border-t border-slate-800/50 flex items-center justify-between">
              <span className="text-[9px] font-bold text-sky-400 uppercase tracking-wider">Engine Best</span>
              <span className="text-[11px] font-mono text-white bg-white/5 px-1.5 py-0.5 rounded">{moves[currentMoveIndex].bestMove}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function sidebarNoMoves(movePairs: any[]) {
  return movePairs.length === 0;
}
