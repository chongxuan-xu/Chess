export type StockfishMessage = {
  type: 'ready' | 'eval' | 'bestmove' | 'info' | 'error';
  data?: any;
};

// Stockfish.js 10.0.2, served locally from /public/stockfish.
// This uses a highly compatible, single-file JS build that works without
// WebAssembly or cross-origin isolation requirements, avoiding "unreachable" errors.
export const STOCKFISH_VERSION = '10.0.2';
export const STOCKFISH_ENGINE_FILE = 'stockfish-10.js';
export const STOCKFISH_WASM_URL = `/stockfish/${STOCKFISH_ENGINE_FILE}`;

export function createStockfishWorker(): Worker | null {
  if (typeof window === 'undefined') return null;

  try {
    const worker = new Worker(STOCKFISH_WASM_URL);

    worker.addEventListener('error', (event) => {
      console.error('Stockfish worker failed to load', event.message || event);
    });

    worker.addEventListener('messageerror', (event) => {
      console.error('Stockfish worker message error', event);
    });

    return worker;
  } catch (e) {
    console.error('Failed to create Stockfish worker', e);
    return null;
  }
}
