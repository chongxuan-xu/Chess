import { Chess } from 'chess.js';
import { MoveClassification, MoveAnalysis } from './types';

// Chess.com-style review priority order used by the local review engine.
export const MOVE_CLASSIFICATION_PRIORITY: MoveClassification[] = [
  'Book',
  'Forced',
  'Brilliant',
  'Great Move',
  'Best',
  'Excellent',
  'Good',
  'Inaccuracy',
  'Mistake',
  'Miss',
  'Blunder'
];

// Lightweight local opening book. Each line is stored as SAN so the review can mark
// every consecutive move up to the last known book move with the Book icon.
const OPENING_LINES: string[][] = [
  ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5','Bb3','d6','c3','O-O'],
  ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d4','exd4','cxd4','Bb4+'],
  ['e4','e5','Nf3','Nf6','Nxe5','d6','Nf3','Nxe4','d4','d5','Bd3'],
  ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6'],
  ['e4','c5','Nf3','Nc6','d4','cxd4','Nxd4','Nf6','Nc3','d6'],
  ['e4','c5','Nf3','e6','d4','cxd4','Nxd4','Nf6','Nc3','d6'],
  ['e4','e6','d4','d5','Nc3','Bb4','e5','c5','a3','Bxc3+','bxc3'],
  ['e4','c6','d4','d5','Nc3','dxe4','Nxe4','Bf5','Ng3','Bg6'],
  ['e4','d6','d4','Nf6','Nc3','g6','Nf3','Bg7','Be2','O-O'],
  ['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7','e3','O-O','Nf3'],
  ['d4','d5','c4','c6','Nf3','Nf6','Nc3','dxc4','a4','Bf5'],
  ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6','Nf3','O-O'],
  ['d4','Nf6','c4','e6','Nc3','Bb4','e3','O-O','Bd3','d5'],
  ['d4','Nf6','c4','e6','Nf3','b6','g3','Bb7','Bg2','Be7'],
  ['c4','e5','Nc3','Nf6','g3','d5','cxd5','Nxd5','Bg2'],
  ['Nf3','d5','g3','Nf6','Bg2','g6','O-O','Bg7','d3','O-O'],
  ['f4','d5','Nf3','Nf6','e3','g6','b3','Bg7','Bb2','O-O'],
  ['b3','e5','Bb2','Nc6','e3','Nf6','Bb5','Bd6'],
  ['g3','d5','Bg2','Nf6','Nf3','g6','O-O','Bg7'],
];

const OPENING_BOOK: Record<string, string[]> = {};
for (const line of OPENING_LINES) {
  const game = new Chess();
  for (const san of line) {
    const base = `${game.fen().split(' ')[0]} ${game.fen().split(' ')[1]}`;
    OPENING_BOOK[base] = Array.from(new Set([...(OPENING_BOOK[base] || []), san]));
    try { game.move(san); } catch { break; }
  }
}

function getBaseFen(fen: string): string {
  const parts = fen.split(' ');
  return `${parts[0]} ${parts[1]}`;
}

export function isBookMove(fenBefore: string, moveSan: string): boolean {
  const base = getBaseFen(fenBefore);
  const bookMoves = OPENING_BOOK[base] || [];
  return bookMoves.includes(moveSan.replace(/[+#?!]+$/g, ''));
}

/**
 * Calculates Expected Points (EP) from Stockfish WDL (Win/Draw/Loss) values.
 * Formula: EP = (Win + Draw * 0.5) / 1000
 */

export function getConsecutiveBookPlyCount(moves: { san: string }[]): number {
  const game = new Chess();
  let count = 0;
  for (const move of moves) {
    if (!isBookMove(game.fen(), move.san)) break;
    try {
      game.move(move.san);
      count += 1;
    } catch {
      break;
    }
  }
  return count;
}

export function calculateEPFromWDL(w: number, d: number, l: number): number {
  return (w + d * 0.5) / 1000;
}

export function epForWhite(epForSideToMove: number, fen: string): number {
  const turn = fen.split(' ')[1];
  return turn === 'w' ? epForSideToMove : 1 - epForSideToMove;
}

export function epForMover(epForSideToMove: number, fen: string): number {
  const turn = fen.split(' ')[1];
  const whiteEP = epForWhite(epForSideToMove, fen);
  return turn === 'w' ? whiteEP : 1 - whiteEP;
}

export function cpForWhite(cpForSideToMove: number, fen: string): number {
  const turn = fen.split(' ')[1];
  return turn === 'w' ? cpForSideToMove : -cpForSideToMove;
}

/**
 * Chess.com-style move classification using a fixed priority order:
 * Book -> Forced -> Brilliant -> Great Move -> Best -> Excellent -> Good -> Inaccuracy -> Mistake -> Miss -> Blunder.
 */
export function classifyMove(params: {
  playerEP: number;
  bestEP: number;
  topMoves: { san: string; ep: number; uci: string }[];
  materialBefore: number;
  materialAfter: number;
  fenBefore: string;
  moveSan: string;
  isWhite: boolean;
  depth: number;
  isMate: boolean;
}): { classification: MoveClassification; reasoning: string } {
  const { playerEP, bestEP, topMoves, materialBefore, materialAfter, fenBefore, moveSan, isWhite, depth } = params;
  const epLoss = Math.max(0, bestEP - playerEP);
  const game = new Chess(fenBefore);
  const legalMoves = game.moves({ verbose: true });
  const isPlayerInCheck = game.inCheck();

  // Book moves are assigned only by getConsecutiveBookPlyCount() in review-loading.
  // Do not mark book moves here, because a repeated/transposed position later in
  // the game should not become Book again.

  const secondBestEP = topMoves.length > 1 ? topMoves[1].ep : -1;
  const thirdBestEP = topMoves.length > 2 ? topMoves[2].ep : -1;
  const epGapToSecond = secondBestEP >= 0 ? Math.max(0, bestEP - secondBestEP) : 1;
  const playableEngineMoves = topMoves.filter(m => bestEP - m.ep <= 0.060).length;
  const playedIsNearBest = epLoss <= 0.025;
  const playedIsAcceptableForcedReply = epLoss <= 0.060;

  // 2. FORCED
  // A forced move is a required response to a threat. This includes legal check responses
  // and engine situations where only one or very few sensible replies avoid a major loss,
  // such as defending a queen, avoiding mate, or stopping a decisive tactic.
  if (legalMoves.length === 1) {
    return { classification: 'Forced', reasoning: 'The only legal move in the position.' };
  }

  if (isPlayerInCheck && playedIsAcceptableForcedReply) {
    return { classification: 'Forced', reasoning: 'A required response to check.' };
  }

  if (playedIsNearBest && epGapToSecond >= 0.200) {
    return { classification: 'Forced', reasoning: 'The only sensible reply to a serious threat; alternatives lose a large amount of expected score.' };
  }

  if (playedIsNearBest && playableEngineMoves <= 1 && thirdBestEP >= 0 && bestEP - thirdBestEP >= 0.180) {
    return { classification: 'Forced', reasoning: 'A narrow defensive move that keeps the position together while other replies fail tactically.' };
  }

  const isBestMove = epLoss <= 0.005;
  const moverMaterialBefore = isWhite ? materialBefore : -materialBefore;
  const moverMaterialAfter = isWhite ? materialAfter : -materialAfter;
  const isPieceSacrifice = moverMaterialAfter < moverMaterialBefore - 1.5;

  // 3. BRILLIANT
  if (isBestMove && isPieceSacrifice && playerEP >= 0.45 && bestEP < 0.95 && depth >= 16) {
    return { classification: 'Brilliant', reasoning: 'A strong engine-approved sacrifice that preserves or improves the position.' };
  }

  // 4. GREAT MOVE
  if (isBestMove && epGapToSecond > 0.120 && depth >= 14) {
    return { classification: 'Great Move', reasoning: 'Found a difficult best move that noticeably outperforms the alternatives.' };
  }

  // 5. BEST
  if (epLoss <= 0.010) return { classification: 'Best', reasoning: 'Engine top choice or equivalent.' };

  // 6. EXCELLENT
  if (epLoss <= 0.025) return { classification: 'Excellent', reasoning: 'A very strong move with almost no loss.' };

  // 7. GOOD
  if (epLoss <= 0.060) return { classification: 'Good', reasoning: 'A solid move that keeps the position playable.' };

  // 8. INACCURACY
  if (epLoss <= 0.120) return { classification: 'Inaccuracy', reasoning: 'A small slip that gives up some advantage.' };

  // 9. MISTAKE
  if (epLoss <= 0.220) return { classification: 'Mistake', reasoning: 'A significant error that worsens the position.' };

  // 10. MISS
  if (bestEP >= 0.75 && playerEP < 0.65) {
    return { classification: 'Miss', reasoning: 'Missed a clear winning or tactical opportunity.' };
  }

  // 11. BLUNDER
  return { classification: 'Blunder', reasoning: 'A critical error that severely impacts the game outcome.' };
}

export function calculateAccuracy(moves: MoveAnalysis[]): { white: number; black: number } {
  const getAcc = (mList: MoveAnalysis[]) => {
    if (mList.length === 0) return 100;
    const nonBookMoves = mList.filter(m => m.classification !== 'Book' && m.classification !== 'Forced');
    if (nonBookMoves.length === 0) return 100;

    const totalEPLoss = nonBookMoves.reduce((acc, m) => acc + Math.max(0, m.cpLoss || 0) / 1000, 0);
    const avgEPLoss = totalEPLoss / nonBookMoves.length;
    return Math.round(Math.max(0, 100 * Math.exp(-5.0 * avgEPLoss)));
  };

  return {
    white: getAcc(moves.filter((_, i) => i % 2 === 0)),
    black: getAcc(moves.filter((_, i) => i % 2 === 1))
  };
}

export function getMaterialValue(fen: string): number {
  const pieces: Record<string, number> = {
    p: 1, n: 3, b: 3, r: 5, q: 9,
    P: 1, N: 3, B: 3, R: 5, Q: 9
  };
  const board = fen.split(' ')[0];
  let white = 0;
  let black = 0;
  for (const char of board) {
    if (pieces[char]) {
      if (char === char.toUpperCase()) white += pieces[char];
      else black += pieces[char];
    }
  }
  return white - black;
}

export function normalizeEval(cp: number, isMate: boolean): number {
  if (isMate) return cp > 0 ? 10 : -10;
  const val = cp / 100;
  if (Math.abs(val) < 2) return val;
  const sign = val > 0 ? 1 : -1;
  const compressed = 2 + Math.log10(Math.abs(val) - 1);
  return Math.min(10, compressed) * sign;
}
