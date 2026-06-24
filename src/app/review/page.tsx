"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { EvalBar } from '@/components/chess/EvalBar';
import { MoveClassificationIcon } from '@/components/chess/MoveClassificationIcon';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Home, Info, Lightbulb, BarChart3, LightbulbOff, Play, Pause } from 'lucide-react';
import { MOVE_CLASSIFICATION_PRIORITY, normalizeEval } from '@/lib/chess/analysis-engine';
import type { GameReviewSummary } from '@/lib/chess/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageLoader } from '@/components/PageLoader';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function GameReviewPage() {
  const [activeMobileTab, setActiveMobileTab] = useState<'board' | 'logs'>('board');
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gml_page_ready"));
    }
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [data, setData] = useState<GameReviewSummary | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showHints, setShowHints] = useState(true);
  const [showEval, setShowEval] = useState(true);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [hasStartedReview, setHasStartedReview] = useState(false);
  const [whiteName, setWhiteName] = useState('White');
  const [blackName, setBlackName] = useState('Black');
  const moveRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  useEffect(() => {
    const raw = sessionStorage.getItem('chess_review_data') || localStorage.getItem('chess_review_data');
    if (raw) {
      try {
        setData(JSON.parse(raw));
      } catch (err) {
        console.error("Failed to parse review data", err);
        router.push('/');
      }
    } else {
      router.push('/');
    }

    const rWhite = sessionStorage.getItem('review_player_white');
    const rBlack = sessionStorage.getItem('review_player_black');
    const isOnline = sessionStorage.getItem('review_is_online') === 'true';

    if (isOnline && rWhite && rBlack) {
      setWhiteName(rWhite);
      setBlackName(rBlack);
    } else {
      setWhiteName('White');
      setBlackName('Black');
    }
  }, [router]);

  const currentMove = useMemo(() => data?.moves[currentIndex], [data, currentIndex]);

  const lastMoveTo = useMemo(() => {
    if (!currentMove || currentIndex === -1) return null;
    const isWhite = currentIndex % 2 === 0;
    const san = currentMove.san;
    if (!san) return null;
    if (san === 'O-O') return isWhite ? 'g1' : 'g8';
    if (san === 'O-O-O') return isWhite ? 'c1' : 'c8';
    let clean = san.replace(/[+#?!]/g, '');
    const promoIndex = clean.indexOf('=');
    if (promoIndex !== -1) {
      clean = clean.substring(0, promoIndex);
    }
    if (clean.length >= 2) {
      const square = clean.slice(-2);
      if (/^[a-h][1-8]$/.test(square)) {
        return square;
      }
    }
    return null;
  }, [currentMove, currentIndex]);

  const goToMove = useCallback((idx: number) => {
    if (data && idx >= -1 && idx < data.moves.length) {
      setCurrentIndex(idx);
    }
  }, [data]);

  // Keyboard navigation controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!data) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToMove(currentIndex + 1);
        setIsAutoPlaying(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToMove(currentIndex - 1);
        setIsAutoPlaying(false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToMove(-1);
        setIsAutoPlaying(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        goToMove(data.moves.length - 1);
        setIsAutoPlaying(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goToMove, data]);

  // Auto-play logic
  useEffect(() => {
    if (isAutoPlaying && data) {
      if (currentIndex < data.moves.length - 1) {
        autoPlayTimer.current = setTimeout(() => {
          setCurrentIndex(prev => prev + 1);
        }, 800); 
      } else {
        setIsAutoPlaying(false);
      }
    } else if (autoPlayTimer.current) {
      clearTimeout(autoPlayTimer.current);
    }
    return () => {
      if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    };
  }, [isAutoPlaying, currentIndex, data]);

  useEffect(() => {
    if (!isMobile) {
      moveRefs.current[currentIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIndex, hasStartedReview, isMobile]);

  const highlightClassifications = MOVE_CLASSIFICATION_PRIORITY.filter(c => c !== 'Book' && c !== 'Forced');

  const bestMoveArrow = useMemo(() => {
    const moveUci = currentMove?.bestMoveUci;
    if (!showHints || !moveUci || moveUci.length < 4) return [];

    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);

    return [[from, to, 'rgba(14, 165, 233, 0.6)']];
  }, [currentMove?.bestMoveUci, showHints]);

  const toggleAutoPlay = () => {
    if (data && currentIndex >= data.moves.length - 1 && !isAutoPlaying) {
      setCurrentIndex(0);
    }
    setIsAutoPlaying(!isAutoPlaying);
  };

  if (!isMounted || !data) {
    return (
      <PageLoader 
        message="Opening Engine Report..." 
        submessage="Parsing tactical evaluation trees and building dynamic move summaries." 
      />
    );
  }

  const currentEval = currentMove
    ? normalizeEval(currentMove.evalAfter, currentMove.isMate)
    : 0;

  if (!hasStartedReview) {
    const allCategories = [
      { name: 'Brilliant', key: 'brilliant', colorClass: 'text-cyan-400' },
      { name: 'Great Move', key: 'greatmove', label: 'Great', colorClass: 'text-blue-500' },
      { name: 'Best', key: 'best', colorClass: 'text-green-600' },
      { name: 'Excellent', key: 'excellent', colorClass: 'text-green-500' },
      { name: 'Good', key: 'good', colorClass: 'text-emerald-700' },
      { name: 'Book', key: 'book', colorClass: 'text-amber-700' },
      { name: 'Inaccuracy', key: 'inaccuracy', colorClass: 'text-yellow-500' },
      { name: 'Mistake', key: 'mistake', colorClass: 'text-orange-500' },
      { name: 'Miss', key: 'miss', colorClass: 'text-pink-500' },
      { name: 'Blunder', key: 'blunder', colorClass: 'text-red-500' }
    ];

    return (
      <div className="min-h-screen w-full bg-[#161512] text-white flex flex-col items-center justify-start pt-28 sm:pt-36 pb-12 p-1.5 xs:p-3 sm:p-4 md:p-8 font-sans overflow-y-auto">
        <Card className="w-full max-w-2xl bg-[#262421]/95 border-white/10 rounded-[24px] p-3.5 xs:p-5 md:p-8 shadow-2xl flex flex-col gap-5 transition-all">
          <div className="text-center">
            <Badge variant="outline" className="mb-2 bg-sky-500/10 text-sky-400 border-sky-500/20 uppercase tracking-[0.15em] text-xs px-3 py-1 font-mono font-bold">
              Game Review
            </Badge>
            <h1 className="text-2xl xs:text-3xl md:text-4xl font-black uppercase tracking-tight text-white">Highlights</h1>
            <p className="text-[10px] xs:text-xs md:text-sm text-slate-300 mt-1 max-w-md mx-auto">
              All ply assessments evaluated by Stockfish engine telemetry.
            </p>
          </div>

          <div className="flex flex-col gap-2 max-w-2xl mx-auto w-full py-2 bg-black/25 px-2 xs:px-4 md:px-6 rounded-[20px] border border-white/5 shadow-inner">
            {/* Header: Players */}
            <div className="grid grid-cols-[90px_1fr_36px_1fr] xs:grid-cols-[110px_1fr_48px_1fr] sm:grid-cols-[140px_1fr_56px_1fr] items-center text-xs xs:text-sm font-semibold tracking-wide text-slate-400 border-b border-white/10 py-3">
              <span className="text-[10px] xs:text-xs uppercase font-mono font-bold tracking-widest text-slate-400">Players</span>
              <div className="flex items-center gap-1.5 justify-end pr-1 text-right">
                <span className="text-[11px] xs:text-xs md:text-sm font-black text-slate-100 truncate max-w-[45px] xs:max-w-[80px] sm:max-w-[120px] md:max-w-[150px]">
                  {whiteName}
                </span>
                <div className="w-5 h-5 xs:w-7 h-7 rounded bg-sky-500/10 border border-sky-500/20 text-sky-450 font-black flex items-center justify-center text-[9px] xs:text-[10px] shadow-sm select-none shrink-0">W</div>
              </div>
              <div className="flex justify-center">
                <span className="text-[8px] xs:text-[9px] uppercase font-mono font-bold bg-slate-800 text-slate-400 px-1 xs:px-1.5 py-0.5 rounded leading-none select-none tracking-widest">vs</span>
              </div>
              <div className="flex items-center gap-1.5 justify-start pl-1 text-left">
                <div className="w-5 h-5 xs:w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 font-black flex items-center justify-center text-[9px] xs:text-[10px] shadow-sm select-none shrink-0">B</div>
                <span className="text-[11px] xs:text-xs md:text-sm font-black text-slate-100 truncate max-w-[45px] xs:max-w-[80px] sm:max-w-[120px] md:max-w-[150px]">
                  {blackName}
                </span>
              </div>
            </div>

            {/* Accuracy Row */}
            <div className="grid grid-cols-[90px_1fr_36px_1fr] xs:grid-cols-[110px_1fr_48px_1fr] sm:grid-cols-[140px_1fr_56px_1fr] items-center text-xs xs:text-sm font-semibold tracking-wide text-slate-400 border-b border-white/10 py-3">
              <span className="text-[10px] xs:text-xs uppercase font-mono font-bold tracking-widest text-slate-400">Accuracy</span>
              <div className="flex justify-end pr-1 select-none">
                <span className="inline-block px-1.5 py-0.5 xs:px-3 xs:py-1 rounded-lg bg-white text-slate-950 font-black text-[10px] xs:text-xs md:text-sm shadow-md hover:scale-105 transition-all">
                  {data.whiteAccuracy}%
                </span>
              </div>
              <div />
              <div className="flex justify-start pl-1 select-none">
                <span className="inline-block px-1.5 py-0.5 xs:px-3 xs:py-1 rounded-lg bg-slate-900 text-white font-black text-[10px] xs:text-xs md:text-sm border border-white/15 shadow-md hover:scale-105 transition-all">
                  {data.blackAccuracy}%
                </span>
              </div>
            </div>

            {/* Move Classification rows */}
            <div className="space-y-1.5 py-2">
              {allCategories.map((cat) => {
                const whiteCount = data.whiteStats[cat.key] || 0;
                const blackCount = data.blackStats[cat.key] || 0;
                const label = cat.label || cat.name;

                return (
                  <div 
                    key={cat.key} 
                    className="grid grid-cols-[90px_1fr_36px_1fr] xs:grid-cols-[110px_1fr_48px_1fr] sm:grid-cols-[140px_1fr_56px_1fr] items-center group hover:bg-white/[0.03] py-1 px-1 xs:px-2 rounded-lg transition-all"
                  >
                    {/* Label */}
                    <span className="font-bold text-[10px] xs:text-xs md:text-sm text-slate-200 group-hover:text-white transition-colors">{label}</span>

                    {/* White Count - Highlighted Color unconditionally */}
                    <div className="text-right pr-3 select-none">
                      <span className={cn(
                        "font-black font-mono text-xs xs:text-sm md:text-base transition-all",
                        cat.colorClass
                      )}>
                        {whiteCount}
                      </span>
                    </div>

                    {/* Centered Move Type Icon (Larger size) */}
                    <div className="flex justify-center select-none shrink-0 scale-90 xs:scale-100">
                      <MoveClassificationIcon classification={cat.name as any} size="md" />
                    </div>

                    {/* Black Count - Highlighted Color unconditionally */}
                    <div className="text-left pl-3 select-none">
                      <span className={cn(
                        "font-black font-mono text-xs xs:text-sm md:text-base transition-all",
                        cat.colorClass
                      )}>
                        {blackCount}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Button 
            onClick={() => setHasStartedReview(true)} 
            className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-450 active:scale-[0.98] text-slate-950 font-black uppercase tracking-[0.1em] text-xs md:text-sm shadow-lg shadow-sky-500/10 cursor-pointer transition-all"
          >
            Start Review
          </Button>
        </Card>
      </div>
    );
  }

  const movePairs = [];
  for (let i = 0; i < data.moves.length; i += 2) {
    movePairs.push({
      white: data.moves[i],
      black: data.moves[i + 1] || null,
      index: Math.floor(i / 2) + 1
    });
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen w-full bg-[#161512] text-white overflow-y-auto md:overflow-hidden relative font-sans overflow-x-hidden">
      {/* Decorative top border ornament */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-sky-500/25 to-transparent animate-pulse z-20" />

      {showEval && (
        <div className="hidden md:flex flex-col h-full p-4 border-r border-white/5 bg-black/20 relative z-10 select-none animate-in fade-in slide-in-from-left-2 duration-300">
          <EvalBar score={currentEval} isMate={currentMove ? currentMove.isMate : false} />
        </div>
      )}

      <main className="flex-1 flex flex-col lg:flex-row gap-8 p-1.5 sm:p-3 md:p-6 lg:h-full lg:overflow-hidden overflow-visible relative z-10 animate-in fade-in duration-300">
        
        {/* Mobile Tab Swapper */}
        <div className="lg:hidden flex bg-[#262421]/60 p-1 rounded-xl border border-white/5 mb-2 select-none shrink-0 relative z-15">
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
            onClick={() => setActiveMobileTab('logs')}
            className={cn(
              "flex-1 py-2 text-xs font-bold font-mono uppercase tracking-wider text-center rounded-lg transition-all cursor-pointer",
              activeMobileTab === 'logs'
                ? "bg-sky-500/15 text-sky-400 border border-sky-400/20"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            Moves
          </button>
        </div>

        {/* Left Column: Board Canvas & Navigation Controls */}
        <div className={cn(
          "flex-1 flex flex-col gap-4 min-w-0 h-full justify-center",
          activeMobileTab === 'board' ? 'flex' : 'hidden lg:flex'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push('/analysis')} 
                className="text-slate-400 hover:text-white font-mono text-xs"
              >
                <Home className="w-3.5 h-3.5 mr-1" /> BACK
              </Button>
              <h1 className="text-lg font-black tracking-tight uppercase font-display flex items-center gap-2">
                Engine Review
                <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 uppercase tracking-tighter text-[9px] font-mono">DETERMINISTIC</Badge>
              </h1>
            </div>

            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
              <TooltipProvider>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-8 w-8 rounded-lg transition-colors ${showEval ? 'text-sky-400 bg-sky-500/10' : 'text-slate-500 hover:text-slate-350'}`}
                      onClick={() => setShowEval(!showEval)}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-950 border-slate-800 text-slate-300 font-sans text-xs">
                    <p>{showEval ? 'Hide' : 'Show'} Evaluation Bar</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`h-8 w-8 rounded-lg transition-colors ${showHints ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-slate-350'}`}
                      onClick={() => setShowHints(!showHints)}
                    >
                      {showHints ? <Lightbulb className="w-3.5 h-3.5" /> : <LightbulbOff className="w-3.5 h-3.5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-950 border-slate-800 text-slate-300 font-sans text-xs">
                    <p>{showHints ? 'Hide' : 'Show'} Best Move Hints</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center max-h-[68vh] gap-4">
            <div className="w-full max-w-[460px] aspect-square rounded-2xl p-2 bg-slate-950/90 border border-slate-900/80 shadow-[0_0_50px_rgba(14,165,233,0.08)] relative flex-shrink-0">
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-sky-500/30 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-sky-500/30 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-sky-500/30 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-sky-500/30 rounded-br-xl" />
              
              <div className="rounded-xl overflow-hidden h-full">
                <ChessBoard 
                  id="ReviewBoard"
                  fen={currentIndex === -1 ? START_FEN : currentMove.fen} 
                  isDraggable={false} 
                  arrows={bestMoveArrow}
                  lastMoveTo={lastMoveTo}
                  classification={currentMove?.classification}
                />
              </div>
            </div>

            {showEval && (
              <div className="block md:hidden w-full max-w-[460px] px-1 relative z-10 shrink-0">
                <EvalBar score={currentEval} isMate={currentMove ? currentMove.isMate : false} orientation="horizontal" />
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-center gap-3 mt-1 shrink-0 select-none">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-white/5 transition-all cursor-pointer animate-in fade-in duration-200"
                disabled={currentIndex === -1}
                onClick={() => { goToMove(-1); setIsAutoPlaying(false); }}
                title="Starting Position"
              >
                <Home className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-white/5 transition-all cursor-pointer animate-in fade-in duration-200"
                disabled={currentIndex === -1}
                onClick={() => { goToMove(currentIndex - 1); setIsAutoPlaying(false); }}
                title="Previous Move (Left Arrow)"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 text-sky-400 hover:text-sky-300 hover:bg-[#0EA5E9]/20 active:scale-95 transition-all cursor-pointer animate-in fade-in duration-200"
                onClick={toggleAutoPlay}
                title={isAutoPlaying ? "Pause Auto-play" : "Start Auto-play"}
              >
                {isAutoPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:text-white hover:bg-white/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-white/5 transition-all cursor-pointer animate-in fade-in duration-200"
                disabled={currentIndex >= data.moves.length - 1}
                onClick={() => { goToMove(currentIndex + 1); setIsAutoPlaying(false); }}
                title="Next Move (Right Arrow)"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

        </div>

        {/* Right Column: Move Stats, Details & Log */}
        <div className={cn(
          "w-full lg:w-[380px] xl:w-[420px] flex flex-col gap-4 overflow-hidden h-full shrink-0",
          activeMobileTab === 'logs' ? 'flex' : 'hidden lg:flex'
        )}>
          
          {/* Accuracy Card */}
          <Card className="bg-[#262421]/60 border-white/5 p-4 rounded-2xl shrink-0 backdrop-blur-sm">
            <div className="flex justify-between items-center">
              <div className="text-center flex-1 border-r border-white/10">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5 tracking-widest font-mono">{whiteName} Accuracy</span>
                <span className="text-3xl font-black font-display text-white">{data.whiteAccuracy}%</span>
              </div>
              <div className="text-center flex-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5 tracking-widest font-mono">{blackName} Accuracy</span>
                <span className="text-3xl font-black font-display text-white">{data.blackAccuracy}%</span>
              </div>
            </div>
          </Card>

          {/* Core Analysis explanation Card */}
          <Card className="bg-[#262421]/60 border-white/5 p-5 rounded-2xl shrink-0 backdrop-blur-sm relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {currentIndex === -1 ? (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center font-bold font-sans">
                    S
                  </div>
                ) : (
                  <MoveClassificationIcon classification={currentMove.classification!} className="w-8 h-8 rounded-xl" />
                )}
                <div>
                  <h3 className="font-extrabold text-base leading-none mb-1 text-slate-100">
                    {currentIndex === -1 ? "Starting Position" : currentMove.classification}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {currentIndex === -1 
                      ? "Standard chess starting position" 
                      : `Move ${currentIndex + 1}: ${isWhiteTurn(currentIndex) ? whiteName : blackName} (${currentMove.san})`}
                  </p>
                </div>
              </div>
              
              <TooltipProvider>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <button className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-md" disabled={currentIndex === -1}>
                      <Info className="w-4 h-4 cursor-help" />
                    </button>
                  </TooltipTrigger>
                  {currentIndex !== -1 && currentMove && (
                    <TooltipContent className="max-w-[240px] text-xs bg-slate-950 border-slate-800 p-3 text-slate-300 font-mono leading-relaxed shadow-xl">
                      <p className="font-bold mb-1 text-sky-400 font-sans uppercase text-[10px]">Engine telemetry</p>
                      <p className="border-b border-slate-800 pb-1 mb-1">Score: {(currentMove.evalAfter / 100).toFixed(2)} ep</p>
                      <p>Centipawn Loss: {currentMove.cpLoss} cp</p>
                      {currentMove.reasoning && (
                        <p className="mt-1.5 text-slate-400 italic font-sans text-[11px] border-t border-slate-800 pt-1.5">{currentMove.reasoning}</p>
                      )}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed italic bg-slate-950/20 p-3 rounded-xl border border-slate-900 border-dashed mb-3">
              &ldquo;{currentIndex === -1 ? "Move analysis starts after White's first move. Press Next or Play to begin." : (currentMove.explanation || currentMove.reasoning)}&rdquo;
            </p>

            {currentIndex !== -1 && currentMove && !['Best', 'Book', 'Forced', 'Brilliant', 'Great Move'].includes(currentMove.classification!) && currentMove.bestMove && (
              <div className="pt-2 border-t border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest font-mono">Engine Best Move</span>
                  <span className="text-xs font-mono font-extrabold bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20 text-sky-400">{currentMove.bestMove}</span>
                </div>
              </div>
            )}
          </Card>

          {/* History Scroll Card */}
          <Card className="bg-[#262421]/40 border-white/5 flex-1 overflow-hidden rounded-2xl flex flex-col backdrop-blur-sm">
            <div className="p-3 border-b border-white/5 bg-black/20 shrink-0">
              <h2 className="text-[10px] font-bold text-slate-550 uppercase tracking-widest font-mono">Move Logs Analysis</h2>
            </div>
            
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2 gap-0.5 flex flex-col">
                <div className="grid grid-cols-[3rem_1fr_1fr] items-center text-[10px] font-bold text-slate-500 px-3 py-1 font-mono uppercase tracking-wider border-b border-white/5 mb-1 select-none">
                  <span>#</span>
                  <span>{whiteName} Move</span>
                  <span>{blackName} Move</span>
                </div>
                
                {movePairs.map((pair, i) => (
                  <div key={i} className="grid grid-cols-[3rem_1fr_1fr] items-center hover:bg-white/5 rounded-lg transition-colors py-0.5 px-1 font-sans">
                    <div className="text-slate-600 font-mono text-[10px] pl-3 h-full flex items-center">{pair.index}.</div>
                    
                    <button 
                      ref={(el) => { moveRefs.current[(pair.index - 1) * 2] = el; }}
                      onClick={() => { goToMove((pair.index - 1) * 2); setIsAutoPlaying(false); }}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg transition-all border border-transparent mr-1 text-left w-full",
                        currentIndex === (pair.index - 1) * 2 
                          ? "bg-sky-500/10 border-sky-500/30 text-sky-400" 
                          : "text-slate-300 hover:text-white"
                      )}
                    >
                      <span className="font-bold text-xs">{pair.white.san}</span>
                      <div className="flex items-center gap-1.5 scale-90">
                         <span className="text-[9px] text-slate-500 font-mono">{(pair.white.evalAfter / 100).toFixed(1)}</span>
                         <MoveClassificationIcon classification={pair.white.classification!} className="scale-90" />
                      </div>
                    </button>

                    {pair.black ? (
                      <button 
                        ref={(el) => { moveRefs.current[(pair.index - 1) * 2 + 1] = el; }}
                        onClick={() => { goToMove((pair.index - 1) * 2 + 1); setIsAutoPlaying(false); }}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg transition-all border border-transparent text-left w-full",
                          currentIndex === (pair.index - 1) * 2 + 1 
                            ? "bg-sky-500/10 border-sky-500/30 text-sky-400" 
                            : "text-slate-300 hover:text-white"
                        )}
                      >
                        <span className="font-bold text-xs">{pair.black.san}</span>
                        <div className="flex items-center gap-1.5 scale-90">
                           <span className="text-[9px] text-slate-500 font-mono">{(pair.black.evalAfter / 100).toFixed(1)}</span>
                           <MoveClassificationIcon classification={pair.black.classification!} className="scale-90" />
                        </div>
                      </button>
                    ) : <div />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>

        </div>
      </main>
    </div>
  );
}

function isWhiteTurn(index: number) {
  return index % 2 === 0;
}
