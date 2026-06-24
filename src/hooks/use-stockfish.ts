'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createStockfishWorker } from '@/lib/chess/stockfish-worker';
import { cpForWhite } from '@/lib/chess/analysis-engine';

type EvalState = { cp: number; isMate: boolean; depth: number };

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [evaluation, setEvaluation] = useState<EvalState>({ cp: 0, isMate: false, depth: 0 });
  const [bestMove, setBestMove] = useState<string | null>(null);

  // Use refs to avoid stale closures in the worker's message handler
  const activeFenRef = useRef<string>('');
  const isSearchingRef = useRef<boolean>(false);

  const initWorker = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = createStockfishWorker();
    if (!worker) return;

    workerRef.current = worker;
    setIsReady(false);
    isSearchingRef.current = false;

    worker.onmessage = (e) => {
      // If this message belongs to a terminated worker, ignore it
      if (worker !== workerRef.current) return;

      const msg = e.data;
      if (typeof msg !== 'string') return;

      if (msg.includes('uciok')) {
        worker.postMessage('setoption name Hash value 64');
        worker.postMessage('setoption name UCI_ShowWDL value true');
        worker.postMessage('setoption name MultiPV value 1');
        worker.postMessage('isready');
      }

      if (msg.includes('readyok')) {
        setIsReady(true);
        // If there's an active search queued, start it
        if (activeFenRef.current) {
          isSearchingRef.current = false;
          worker.postMessage('ucinewgame');
          worker.postMessage(`position fen ${activeFenRef.current}`);
          worker.postMessage('go depth 12');
        }
      }

      if (msg.includes('info depth') && msg.includes('score')) {
        isSearchingRef.current = true;
        const parts = msg.split(' ');
        const depthIndex = parts.indexOf('depth');
        const cpIndex = parts.indexOf('cp');
        const mateIndex = parts.indexOf('mate');
        const depth = depthIndex !== -1 ? parseInt(parts[depthIndex + 1], 10) : 0;
        const currentFen = activeFenRef.current;

        // Start displaying evaluations from depth >= 1 for maximum real-time responsiveness
        if (depth >= 1) {
          if (cpIndex !== -1) {
            const rawCp = parseInt(parts[cpIndex + 1], 10);
            setEvaluation({
              cp: cpForWhite(rawCp, currentFen),
              isMate: false,
              depth
            });
          } else if (mateIndex !== -1) {
            const rawMate = parseInt(parts[mateIndex + 1], 10);
            setEvaluation({
              cp: cpForWhite(rawMate * 10000, currentFen),
              isMate: true,
              depth
            });
          }
        }
      }

      if (msg.startsWith('bestmove')) {
        const parts = msg.split(' ');
        const move = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        setBestMove(move);
        isSearchingRef.current = false;
      }
    };

    worker.postMessage('uci');
  }, []);

  useEffect(() => {
    initWorker();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [initWorker]);

  const analyze = useCallback((fen: string, depth = 12) => {
    activeFenRef.current = fen;
    setBestMove(null);
    setEvaluation({ cp: 0, isMate: false, depth: 0 });
    isSearchingRef.current = false;

    const worker = workerRef.current;
    if (worker && isReady) {
      worker.postMessage('stop');
      worker.postMessage('ucinewgame');
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    } else if (!worker) {
      initWorker();
    }
  }, [isReady, initWorker]);

  const stop = useCallback(() => {
    activeFenRef.current = '';
    const worker = workerRef.current;
    if (worker) {
      worker.postMessage('stop');
    }
  }, []);

  return { isReady, evaluation, bestMove, analyze, stop, workerRef };
}
