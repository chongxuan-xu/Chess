"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createStockfishWorker } from '@/lib/chess/stockfish-worker';
import { classifyMove, calculateAccuracy, getMaterialValue, calculateEPFromWDL, epForWhite, cpForWhite, getConsecutiveBookPlyCount } from '@/lib/chess/analysis-engine';
import type { MoveAnalysis, GameReviewSummary } from '@/lib/chess/types';
import { Chess } from 'chess.js';

type EngineLine = { san: string; ep: number; cp: number; whiteCp: number; uci: string; pv: string };
type EngineData = { topMoves: EngineLine[]; isMate: boolean; sideToMoveEP: number; whiteEP: number; cp: number; whiteCp: number };

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const TARGET_DEPTH = 12;
const ANALYSIS_TIMEOUT_MS = 1500;

function emptyEngineData(fen: string): EngineData {
  return {
    topMoves: [],
    isMate: false,
    sideToMoveEP: 0.5,
    whiteEP: epForWhite(0.5, fen),
    cp: 0,
    whiteCp: 0
  };
}


function quickCoachLine(classification: string, moveSan: string, bestMove?: string): string {
  const choices: Record<string, string[]> = {
    Book: [
      'Opening theory. This develops normally and keeps the position balanced.',
      'A known book move. Good opening structure is maintained.',
      'Still in theory. The move follows a standard opening plan.'
    ],
    Forced: [
      'Forced. This answers the immediate threat and keeps the game legal or playable.',
      'A necessary defensive move. Ignoring the threat would be costly.',
      'The position demanded this response to avoid serious trouble.'
    ],
    Brilliant: [
      'Brilliant. A strong tactical sacrifice that the engine approves.',
      'A sharp resource. The sacrifice works because of concrete tactics.',
      'Excellent calculation. This gives material for lasting compensation.'
    ],
    'Great Move': [
      'Great move. This finds the key resource in a difficult position.',
      'A strong practical choice. It solves the main tactical problem.',
      'Great find. This move keeps control when alternatives slip.'
    ],
    Best: [
      'Best move. This is the engine’s top continuation.',
      'Precise. This keeps the maximum advantage available.',
      'The strongest continuation in the position.'
    ],
    Excellent: [
      'Excellent move. Nearly as strong as the engine choice.',
      'Very accurate. The position stays under control.',
      'A clean move that preserves the main advantage.'
    ],
    Good: [
      'Good move. Solid, though there may be a more precise option.',
      'A playable continuation that keeps the position healthy.',
      'Reasonable move. It does not seriously damage the position.'
    ],
    Inaccuracy: [
      'Inaccuracy. A small chance was missed.',
      'Slightly imprecise. The position remains playable, but better was available.',
      'This gives up a little pressure or activity.'
    ],
    Mistake: [
      'Mistake. This loses important control of the position.',
      'A tactical or positional slip. The opponent can now improve.',
      'This move gives away too much advantage.'
    ],
    Miss: [
      'Miss. There was a stronger tactical opportunity.',
      'A key chance was missed. Look for forcing moves first.',
      'This overlooks a more powerful continuation.'
    ],
    Blunder: [
      'Blunder. This seriously changes the result of the position.',
      'A major mistake. The opponent can win material or attack decisively.',
      'Critical error. The position becomes much worse.'
    ]
  };
  const list = choices[classification] || choices.Good;
  const seed = [...moveSan].reduce((a, c) => a + c.charCodeAt(0), 0);
  const line = list[seed % list.length];
  if (bestMove && !['Book', 'Forced', 'Best'].includes(classification)) {
    return `${line} Better was ${bestMove}.`;
  }
  return line;
}

async function createReadyEngine(): Promise<Worker> {
  const worker = createStockfishWorker();
  if (!worker) throw new Error('Stockfish worker could not be created');

  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      worker.removeEventListener('message', onMessage);
      resolve();
    };
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      if (e.data.includes('uciok')) {
        worker.postMessage('setoption name Hash value 64');
        worker.postMessage('setoption name UCI_ShowWDL value true');
        worker.postMessage('isready');
      }
      if (e.data.includes('readyok')) finish();
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage('uci');
    setTimeout(finish, 2500);
  });

  return worker;
}

export default function ReviewLoadingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing Stockfish...");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gml_page_ready"));
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem('raw_game_moves') || localStorage.getItem('raw_game_moves');
    if (!raw) {
      router.push('/');
      return;
    }

    let pgnMoves: MoveAnalysis[] = [];
    try {
      pgnMoves = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse raw_game_moves", e);
      router.push('/');
      return;
    }

    if (pgnMoves.length === 0) {
      router.push('/analysis');
      return;
    }

    let cancelled = false;
    let activeWorkers: Worker[] = [];

    const runWorkerTask = (worker: Worker, task: { j: number; fen: string; multiPV: number; depth: number }): Promise<EngineData> => {
      return new Promise((resolve) => {
        let bestLines: EngineLine[] = [];
        let latestSideToMoveEP = 0.5;
        let latestCp = 0;
        let latestIsMate = false;
        let hasAnyScore = false;
        let done = false;
        let isSynchronized = false;

        const cleanup = () => {
          worker.removeEventListener('message', handler);
        };

        const resolveOnce = (data: EngineData) => {
          if (done) return;
          done = true;
          cleanup();
          resolve(data);
        };

        // If something goes wrong or takes too long, resolve with fallback
        const timeout = setTimeout(() => {
          resolveOnce({
            ...emptyEngineData(task.fen),
            topMoves: bestLines.filter(Boolean),
            isMate: latestIsMate,
            sideToMoveEP: latestSideToMoveEP,
            whiteEP: epForWhite(latestSideToMoveEP, task.fen),
            cp: latestCp,
            whiteCp: cpForWhite(latestCp, task.fen)
          });
        }, ANALYSIS_TIMEOUT_MS);

        const handler = (e: MessageEvent) => {
          if (typeof e.data !== 'string') return;
          const msg = e.data;

          if (!isSynchronized) {
            // Wait for readyok to know the worker is synchronized/idle before starting search
            if (msg.includes('readyok')) {
              isSynchronized = true;
              worker.postMessage(`position fen ${task.fen}`);
              worker.postMessage(`go depth ${task.depth}`);
            }
            return;
          }

          const parts = msg.split(' ');

          if (msg.includes('info depth') && msg.includes('score')) {
            const dIndex = parts.indexOf('depth');
            const depth = dIndex !== -1 ? parseInt(parts[dIndex + 1], 10) : 0;
            if (depth >= 1) {
              hasAnyScore = true;
              const mvIndex = parts.indexOf('multipv');
              const wdlIndex = parts.indexOf('wdl');
              const cpIndex = parts.indexOf('cp');
              const mateIndex = parts.indexOf('mate');
              const pvIndex = parts.indexOf('pv');
              const mv = mvIndex !== -1 ? parseInt(parts[mvIndex + 1], 10) : 1;
              const rawCp = cpIndex !== -1 ? parseInt(parts[cpIndex + 1], 10) : latestCp;
              const uci = pvIndex !== -1 ? parts[pvIndex + 1] : '';
              latestIsMate = mateIndex !== -1;
              latestCp = latestIsMate && mateIndex !== -1 ? parseInt(parts[mateIndex + 1], 10) * 10000 : rawCp;

              let epValue = latestSideToMoveEP;
              if (wdlIndex !== -1) {
                const w = parseInt(parts[wdlIndex + 1], 10);
                const d = parseInt(parts[wdlIndex + 2], 10);
                const l = parseInt(parts[wdlIndex + 3], 10);
                epValue = calculateEPFromWDL(w, d, l);
              } else if (cpIndex !== -1 || mateIndex !== -1) {
                epValue = 1 / (1 + Math.exp(-latestCp / 400));
              }
              latestSideToMoveEP = epValue;

              if (uci) {
                const tempGame = new Chess(task.fen);
                let san = uci;
                try {
                  const moveResult = tempGame.move({
                    from: uci.substring(0, 2),
                    to: uci.substring(2, 4),
                    promotion: uci.length === 5 ? uci[4] : 'q'
                  });
                  san = moveResult.san;
                } catch {}

                bestLines[mv - 1] = {
                  san,
                  ep: epValue,
                  cp: latestCp,
                  whiteCp: cpForWhite(latestCp, task.fen),
                  uci,
                  pv: uci
                };
              }
            }
          }

          if (msg.startsWith('bestmove')) {
            if (!hasAnyScore) return;
            clearTimeout(timeout);
            const filtered = bestLines.filter(Boolean);
            const sideToMoveEP = filtered[0]?.ep ?? latestSideToMoveEP;
            const cp = filtered[0]?.cp ?? latestCp;
            resolveOnce({
              topMoves: filtered,
              isMate: latestIsMate,
              sideToMoveEP,
              whiteEP: epForWhite(sideToMoveEP, task.fen),
              cp,
              whiteCp: cpForWhite(cp, task.fen)
            });
          }
        };

        worker.addEventListener('message', handler);
        worker.postMessage('stop');
        worker.postMessage(`setoption name MultiPV value ${task.multiPV}`);
        worker.postMessage('setoption name UCI_ShowWDL value true');
        worker.postMessage('isready'); // Request synchronization token
      });
    };

    const performAnalysis = async () => {
      try {
        setStatus("Loading Stockfish engines in parallel...");
        const numWorkers = 3;
        const workerPromises = Array.from({ length: numWorkers }, () => createReadyEngine());
        const createdWorkers = await Promise.all(workerPromises);
        if (cancelled) {
          createdWorkers.forEach(w => w.terminate());
          return;
        }
        activeWorkers = createdWorkers;

        const bookPlyTarget = getConsecutiveBookPlyCount(pgnMoves);
        const resultsMap: Record<number, EngineData> = {};
        const tasks: { j: number; fen: string; multiPV: number; depth: number }[] = [];

        for (let j = bookPlyTarget; j <= pgnMoves.length; j++) {
          const isLast = j === pgnMoves.length;
          const fen = j === 0 ? START_FEN : pgnMoves[j - 1].fen;
          tasks.push({
            j,
            fen,
            multiPV: isLast ? 1 : 3,
            depth: TARGET_DEPTH
          });
        }

        setStatus("Initializing fast parallel review...");
        setProgress(5);

        let taskIndex = 0;
        const activePromises = activeWorkers.map(async (worker) => {
          while (taskIndex < tasks.length && !cancelled) {
            const currentTaskIdx = taskIndex++;
            const task = tasks[currentTaskIdx];
            setStatus(`Analyzing position ${currentTaskIdx + 1}/${tasks.length}...`);
            setProgress(Math.min(84, 5 + Math.round((currentTaskIdx / tasks.length) * 79)));
            const result = await runWorkerTask(worker, task);
            resultsMap[task.j] = result;
          }
        });

        await Promise.all(activePromises);
        if (cancelled) return;

        setStatus("Assembling game review...");
        setProgress(85);

        const analyzedMoves: MoveAnalysis[] = [];
        for (let i = 0; i < pgnMoves.length; i++) {
          const currentMove = pgnMoves[i];
          const prevFen = i === 0 ? START_FEN : analyzedMoves[i - 1].fen;
          const isWhite = i % 2 === 0;

          const isBookPly = i < bookPlyTarget;

          let bestData = resultsMap[i] || emptyEngineData(prevFen);
          let playedData = resultsMap[i + 1] || emptyEngineData(currentMove.fen);

          const bestEP = bestData.topMoves[0]?.ep ?? 0.5;
          const playedWhiteEP = playedData.whiteEP;
          const playerEP = isWhite ? playedWhiteEP : 1 - playedWhiteEP;

          const materialBefore = getMaterialValue(prevFen);
          const materialAfter = getMaterialValue(currentMove.fen);

          const { classification, reasoning } = isBookPly
            ? { classification: 'Book' as const, reasoning: 'Matches stored opening-book theory.' }
            : classifyMove({
                playerEP,
                bestEP,
                topMoves: bestData.topMoves,
                isMate: playedData.isMate,
                materialBefore,
                materialAfter,
                fenBefore: prevFen,
                moveSan: currentMove.san,
                isWhite,
                depth: TARGET_DEPTH
              });

          const epLoss = classification === 'Book' ? 0 : Math.max(0, bestEP - playerEP);
          const bestMove = bestData.topMoves[0]?.san;

          analyzedMoves.push({
            ...currentMove,
            evalBefore: bestData.whiteCp,
            evalAfter: playedData.whiteCp,
            epBefore: bestEP,
            epAfter: playerEP,
            classification,
            reasoning,
            bestMove,
            bestMoveUci: bestData.topMoves[0]?.uci,
            cpLoss: Math.round(epLoss * 1000),
            explanation: quickCoachLine(classification, currentMove.san, bestMove),
            materialBalance: materialAfter,
            isMate: playedData.isMate,
            depth: isBookPly ? 0 : TARGET_DEPTH
          });
        }

        const bookPlyCount = getConsecutiveBookPlyCount(analyzedMoves);
        for (let i = 0; i < bookPlyCount; i++) {
          analyzedMoves[i].classification = 'Book';
          analyzedMoves[i].reasoning = 'Matches stored opening-book theory.';
          analyzedMoves[i].explanation = 'This move follows the stored opening book.';
          analyzedMoves[i].cpLoss = 0;
        }

        setStatus("Generating local coach notes...");
        setProgress(90);

        setProgress(100);
        setStatus("Finalizing accuracy stats...");
        const accuracy = calculateAccuracy(analyzedMoves);
        const summary: GameReviewSummary = {
          whiteAccuracy: accuracy.white,
          blackAccuracy: accuracy.black,
          moves: analyzedMoves,
          whiteStats: { brilliant: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0, forced: 0, greatmove: 0 },
          blackStats: { brilliant: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0, forced: 0, greatmove: 0 }
        };

        analyzedMoves.forEach((m, idx) => {
          const stats = idx % 2 === 0 ? summary.whiteStats : summary.blackStats;
          const key = m.classification?.toLowerCase().replace(/\s+/g, '') || 'good';
          if (key in stats) stats[key as keyof typeof stats]++;
        });

        sessionStorage.setItem('chess_review_data', JSON.stringify(summary));
        localStorage.setItem('chess_review_data', JSON.stringify(summary));
        router.push('/review');
      } catch (err) {
        console.error('Game review failed:', err);
        setStatus('Stockfish failed to start. Please reload and try again.');
      } finally {
        activeWorkers.forEach(w => w.terminate());
      }
    };

    performAnalysis();

    return () => {
      cancelled = true;
      activeWorkers.forEach(w => w.terminate());
    };
  }, [router]);

  return (
    <div className="h-screen w-full bg-[#161512] flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-sky-500/20 to-transparent animate-pulse" />

      <div className="max-w-md w-full flex flex-col items-center gap-8 relative z-10">
        <div className="relative">
          <div className="w-24 h-24 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center animate-pulse">
            <Sparkles className="w-12 h-12 text-sky-400" />
          </div>
          <div className="absolute -top-2 -right-2 bg-sky-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full animate-bounce font-mono">
            STOCKFISH
          </div>
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-2xl font-headline font-black tracking-tight text-white uppercase">Game Review</h1>
          <p className="text-slate-400 text-xs h-5 font-mono max-w-sm overflow-hidden text-ellipsis whitespace-nowrap">{status}</p>
        </div>

        <div className="w-full space-y-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/60 shadow-xl">
          <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
            <span>Analyzing Progress</span>
            <span className="text-sky-400">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
