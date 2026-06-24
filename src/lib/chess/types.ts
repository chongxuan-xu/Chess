export type MoveClassification = 
  | 'Book'
  | 'Brilliant' 
  | 'Great Move' 
  | 'Best' 
  | 'Excellent' 
  | 'Good' 
  | 'Inaccuracy' 
  | 'Mistake' 
  | 'Miss' 
  | 'Blunder' 
  | 'Forced';

export interface MoveAnalysis {
  san: string;
  fen: string;
  classification?: MoveClassification;
  evalBefore: number; // in centipawns
  evalAfter: number; // in centipawns
  isMate: boolean;
  mateIn?: number;
  cpLoss: number;
  bestMove?: string;
  bestMoveUci?: string;
  explanation?: string;
  reasoning?: string;
  accuracy?: number;
  materialBalance?: number;
  depth?: number;
  wdl?: { w: number; d: number; l: number }; // Win/Draw/Loss from player perspective
  epBefore?: number;
  epAfter?: number;
}

export interface GameReviewSummary {
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteStats: Record<string, number>;
  blackStats: Record<string, number>;
  moves: MoveAnalysis[];
}
