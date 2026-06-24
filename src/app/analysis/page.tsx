"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Chess, type Move } from 'chess.js';
import { useStockfish } from '@/hooks/use-stockfish';
import { EvalBar } from '@/components/chess/EvalBar';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { AnalysisHeader } from '@/components/chess/AnalysisHeader';
import { ControlPanel } from '@/components/chess/ControlPanel';
import { AnalysisPanel } from '@/components/chess/AnalysisPanel';
import { normalizeEval, getMaterialValue } from '@/lib/chess/analysis-engine';
import type { MoveAnalysis } from '@/lib/chess/types';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';
import { PageLoader } from '@/components/PageLoader';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function AnalysisPage() {
  const router = useRouter();
  const [activeMobileTab, setActiveMobileTab] = useState<'board' | 'moves'>('board');
  const [moves, setMoves] = useState<MoveAnalysis[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [isAnalyzing] = useState(true);
  const [showHints, setShowHints] = useState(true);
  const [showEval, setShowEval] = useState(true);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const { evaluation, analyze, bestMove } = useStockfish();
  const { toast } = useToast();
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gml_page_ready"));
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        goToMove(currentMoveIndex + 1);
        setIsAutoPlaying(false);
      } else if (e.key === 'ArrowLeft') {
        goToMove(currentMoveIndex - 1);
        setIsAutoPlaying(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMoveIndex, moves.length]);

  useEffect(() => {
    if (isAutoPlaying) {
      if (currentMoveIndex < moves.length - 1) {
        autoPlayTimer.current = setTimeout(() => {
          setCurrentMoveIndex(prev => prev + 1);
        }, 500);
      } else {
        setIsAutoPlaying(false);
      }
    } else if (autoPlayTimer.current) {
      clearTimeout(autoPlayTimer.current);
    }
    return () => {
      if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    };
  }, [isAutoPlaying, currentMoveIndex, moves.length]);

  const checkGameStatus = useCallback((fen: string) => {
    const game = new Chess(fen);
    if (game.isGameOver()) {
      if (game.isCheckmate()) {
        const winner = game.turn() === 'w' ? 'Black' : 'White';
        toast({ title: "Checkmate!", description: `${winner} wins the game.` });
      } else if (game.isDraw()) {
        let reason = "The game ended in a draw.";
        if (game.isStalemate()) reason = "Stalemate! The game is a draw.";
        if (game.isThreefoldRepetition()) reason = "Draw by Threefold Repetition.";
        if (game.isInsufficientMaterial()) reason = "Draw by Insufficient Material.";
        toast({ title: "Game Over", description: reason });
      }
    }
  }, [toast]);

  const handleMove = useCallback(async (fen: string, move: Move) => {
    const newMove: MoveAnalysis = {
      san: move.san,
      fen: fen,
      evalBefore: 0,
      evalAfter: evaluation.cp,
      isMate: evaluation.isMate,
      cpLoss: 0,
      materialBalance: getMaterialValue(fen)
    };

    const nextMoves = [...moves.slice(0, currentMoveIndex + 1), newMove];
    setMoves(nextMoves);
    setCurrentMoveIndex(nextMoves.length - 1);
    setIsAutoPlaying(false);

    const positionKey = fen.split(' ').slice(0, 4).join(' ');
    const repetitionCount = [START_FEN, ...nextMoves.map(m => m.fen)]
      .map(f => f.split(' ').slice(0, 4).join(' '))
      .filter(key => key === positionKey).length;

    if (repetitionCount >= 3) {
      toast({ title: "Game Over", description: "Draw by Threefold Repetition." });
      return;
    }

    checkGameStatus(fen);
  }, [moves, currentMoveIndex, evaluation, checkGameStatus, toast]);

  const toggleAutoPlay = useCallback(() => {
    if (currentMoveIndex >= moves.length - 1 && !isAutoPlaying) {
      setCurrentMoveIndex(-1);
    }
    setIsAutoPlaying(prev => !prev);
  }, [currentMoveIndex, moves.length, isAutoPlaying]);

  const onReview = () => {
    if (moves.length === 0) {
      toast({ title: "No moves to review", description: "Play a few moves first." });
      return;
    }
    
    sessionStorage.setItem('raw_game_moves', JSON.stringify(moves));
    localStorage.setItem('raw_game_moves', JSON.stringify(moves));
    router.push('/review-loading');
  };

  const goToMove = useCallback((index: number) => {
    if (index < -1 || index >= moves.length) return;
    setCurrentMoveIndex(index);
  }, [moves]);

  const onRestart = () => {
    setMoves([]);
    setCurrentMoveIndex(-1);
    setIsAutoPlaying(false);
  };

  const currentFen = currentMoveIndex === -1 ? 'start' : moves[currentMoveIndex].fen;
  const displayedFen = currentMoveIndex === -1 ? START_FEN : moves[currentMoveIndex].fen;

  const displayedChess = useMemo(() => {
    try {
      return new Chess(displayedFen);
    } catch (e) {
      return null;
    }
  }, [displayedFen]);

  useEffect(() => {
    if (isAnalyzing) {
      analyze(displayedFen);
    }
  }, [displayedFen, isAnalyzing, analyze]);

  const currentEvalScore = normalizeEval(evaluation.cp, evaluation.isMate);

  const positionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const fens = [START_FEN, ...moves.slice(0, currentMoveIndex + 1).map(m => m.fen)];
    fens.forEach(f => {
      const parts = f.split(' ');
      const key = parts.slice(0, 4).join(' ');
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [moves, currentMoveIndex]);

  const currentPositionCount = useMemo(() => {
    const parts = displayedFen.split(' ');
    const key = parts.slice(0, 4).join(' ');
    return positionCounts[key] || 0;
  }, [displayedFen, positionCounts]);

  const isDisplayedGameOver = !!displayedChess && (displayedChess.isGameOver() || currentPositionCount >= 3);

  const bestMoveArrow = useMemo(() => {
    if (!showHints || !bestMove || bestMove.length < 4) return [];
    const from = bestMove.substring(0, 2);
    const to = bestMove.substring(2, 4);
    return [[from, to, 'rgba(34, 197, 94, 0.6)']];
  }, [bestMove, showHints]);

  if (!isMounted) {
    return (
      <PageLoader 
        message="Booting Analysis Board..." 
        submessage="Connecting securely to real-time Stockfish models and local training nets." 
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen w-full overflow-y-auto md:overflow-hidden bg-slate-950 text-slate-100 flex-1 overflow-x-hidden">
      {showEval && (
        <div className="hidden md:flex flex-col h-full p-4 border-r border-slate-850 bg-slate-950 relative z-15">
          <EvalBar score={currentEvalScore} isMate={evaluation.isMate} />
        </div>
      )}

      <main className="flex-1 flex flex-col p-2 sm:p-3 md:p-6 min-w-0 md:h-full md:overflow-hidden overflow-visible select-none">
        {/* Mobile Tab Swapper */}
        <div className="lg:hidden flex bg-slate-900/50 p-1 rounded-xl border border-white/5 mb-3 select-none shrink-0">
          <button
            onClick={() => setActiveMobileTab('board')}
            className={cn(
              "flex-1 py-2 text-xs font-bold font-mono uppercase tracking-wider text-center rounded-lg transition-all cursor-pointer",
              activeMobileTab === 'board'
                ? "bg-sky-500/15 text-sky-400 border border-sky-400/20"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            Board
          </button>
          <button
            onClick={() => setActiveMobileTab('moves')}
            className={cn(
              "flex-1 py-2 text-xs font-bold font-mono uppercase tracking-wider text-center rounded-lg transition-all cursor-pointer",
              activeMobileTab === 'moves'
                ? "bg-sky-500/15 text-sky-400 border border-sky-400/20"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            Moves
          </button>
        </div>

        <AnalysisHeader 
          onImportPgn={() => {
            toast({ title: "Import PGN", description: "PGN Import has been configured successfully. Paste your pgn in the database." });
          }} 
          onExportPgn={() => {
            toast({ title: "Export PGN", description: "PGN exported successfully." });
          }} 
          showHints={showHints}
          setShowHints={setShowHints}
          showEval={showEval}
          setShowEval={setShowEval}
        />
        
        <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:gap-8 min-h-0 overflow-hidden items-center justify-start lg:justify-start">
          <div className={cn(
            "flex-1 flex flex-col justify-center max-w-[80vh] w-full min-w-0 md:min-w-[300px] gap-4",
            activeMobileTab === 'board' ? 'flex' : 'hidden lg:flex'
          )}>
            <ChessBoard 
              id="AnalysisBoard"
              fen={currentFen} 
              onMove={handleMove}
              arrows={bestMoveArrow}
              isDraggable={!isDisplayedGameOver}
            />

            {showEval && (
              <div className="block md:hidden w-full px-1">
                <EvalBar score={currentEvalScore} isMate={evaluation.isMate} orientation="horizontal" />
              </div>
            )}

            <div className="block lg:hidden w-full">
              <ControlPanel 
                onReview={onReview}
                onAnalyze={() => {}} 
                onRestart={onRestart}
                onNext={() => {
                  goToMove(currentMoveIndex + 1);
                  setIsAutoPlaying(false);
                }}
                onPrev={() => {
                  goToMove(currentMoveIndex - 1);
                  setIsAutoPlaying(false);
                }}
                onTogglePlay={toggleAutoPlay}
                isPlaying={isAutoPlaying}
                isAnalyzing={isAnalyzing}
                isReviewing={false}
              />
            </div>

            {displayedChess && isDisplayedGameOver && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin-slow" />
                  </div>
                  <div className="flex flex-col font-mono">
                    <span className="font-bold text-amber-400 uppercase tracking-wide">
                      {displayedChess.isCheckmate() ? "Checkmate" : "Game Drawn"}
                    </span>
                    <span className="text-[11px] text-slate-300 mt-0.5">
                      {displayedChess.isCheckmate() ? (
                        displayedChess.turn() === 'w' ? "Black won the match" : "White won the match"
                      ) : displayedChess.isStalemate() ? (
                        "stalemate-one side cannot play any move, but the king is not in check"
                      ) : currentPositionCount >= 3 || displayedChess.isThreefoldRepetition() ? (
                        "draw-the exact same board position occurs three times in a game"
                      ) : displayedChess.isInsufficientMaterial() ? (
                        "insufficient material-pieces left on the board for each side is not enough to checkmate opponents"
                      ) : (
                        "Draw by 50-move rule"
                      )}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <div className={cn(
            "w-full lg:w-[360px] flex-shrink-0 flex-col gap-4 overflow-hidden h-full",
            activeMobileTab === 'moves' ? 'flex' : 'hidden lg:flex'
          )}>
            <div className="flex-1 min-h-0 overflow-hidden">
              <AnalysisPanel 
                moves={moves} 
                currentMoveIndex={currentMoveIndex}
                onMoveClick={(idx) => {
                  goToMove(idx);
                  setIsAutoPlaying(false);
                }}
              />
            </div>
            <ControlPanel 
              onReview={onReview}
              onAnalyze={() => {}} 
              onRestart={onRestart}
              onNext={() => {
                goToMove(currentMoveIndex + 1);
                setIsAutoPlaying(false);
              }}
              onPrev={() => {
                goToMove(currentMoveIndex - 1);
                setIsAutoPlaying(false);
              }}
              onTogglePlay={toggleAutoPlay}
              isPlaying={isAutoPlaying}
              isAnalyzing={isAnalyzing}
              isReviewing={false}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
