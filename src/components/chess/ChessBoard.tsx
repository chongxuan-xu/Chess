"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Chess, type Move } from 'chess.js';
import dynamic from 'next/dynamic';

const Chessboard = dynamic(
  () => import('react-chessboard').then((mod) => mod.Chessboard),
  { ssr: false }
);

import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Crown } from 'lucide-react'; // Using approximate icons for labels
import { MoveClassification } from '@/lib/chess/types';
import { MoveClassificationIcon } from './MoveClassificationIcon';

interface ChessBoardProps {
  onMove?: (fen: string, move: Move) => void;
  fen?: string;
  isDraggable?: boolean;
  arrows?: string[][];
  id?: string;
  lastMoveTo?: string | null;
  classification?: MoveClassification | null;
}

function fenToSquareMap(fen: string): Record<string, string> {
  if (!fen) return {};
  const parts = fen.split(' ');
  const boardPart = parts[0];
  const rows = boardPart.split('/');
  
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  
  const squareToPiece: Record<string, string> = {};
  
  for (let r = 0; r < 8; r++) {
    const row = rows[r];
    if (!row) continue;
    let fileIdx = 0;
    for (let c = 0; c < row.length; c++) {
      const char = row[c];
      if (/\d/.test(char)) {
        fileIdx += parseInt(char, 10);
      } else {
        if (fileIdx < 8) {
          const square = files[fileIdx] + ranks[r];
          squareToPiece[square] = char;
          fileIdx++;
        }
      }
    }
  }
  
  return squareToPiece;
}

export function ChessBoard({ 
  onMove, 
  fen: controlledFen, 
  isDraggable = true, 
  arrows, 
  id = "custom-chessboard",
  lastMoveTo,
  classification
}: ChessBoardProps) {
  const [game, setGame] = useState(new Chess(controlledFen === 'start' ? undefined : controlledFen));
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [lastMoveSquares, setLastMoveSquares] = useState<string[]>([]);

  useEffect(() => {
    const validTargetFen = !controlledFen || controlledFen === 'start' ? undefined : controlledFen;
    const newGame = new Chess(validTargetFen);
    if (newGame.fen() !== game.fen()) {
      const currentSquareMap = fenToSquareMap(game.fen());
      const newSquareMap = fenToSquareMap(newGame.fen());
      
      const changed: string[] = [];
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
      
      for (const file of files) {
        for (const rank of ranks) {
          const sq = file + rank;
          if ((currentSquareMap[sq] || '') !== (newSquareMap[sq] || '')) {
            changed.push(sq);
          }
        }
      }
      
      if (changed.length > 0 && changed.length <= 4) {
        setLastMoveSquares(changed);
      } else {
        setLastMoveSquares([]);
      }

      setGame(newGame);
      setMoveFrom(null);
      setOptionSquares({});
    }
  }, [controlledFen, game]);

  const makeAMove = useCallback((move: any) => {
    try {
      const gameCopy = new Chess(game.fen());
      const result = gameCopy.move(move);
      
      if (result) {
        setLastMoveSquares([result.from, result.to]);
        setGame(gameCopy);
        if (onMove) onMove(gameCopy.fen(), result);
        setMoveFrom(null);
        setOptionSquares({});
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }, [game, onMove]);

  function getMoveOptions(square: string) {
    const moves = game.moves({
      square: square as any,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as any) && game.get(move.to as any)?.color !== game.get(square as any)?.color
            ? 'radial-gradient(circle, rgba(255,255,255,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(255,255,255,.1) 25%, transparent 25%)',
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = {
      background: 'rgba(56, 189, 248, 0.3)',
    };
    setOptionSquares(newSquares);
    return true;
  }

  function handlePromotionSelect(piece: string) {
    if (pendingPromotion) {
      makeAMove({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: piece,
      });
      setPendingPromotion(null);
    }
  }

  function onSquareClick(square: string) {
    if (!isDraggable) return;

    if (moveFrom === square) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    if (!moveFrom) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      return;
    }

    const moves = game.moves({ square: moveFrom as any, verbose: true });
    const isPromotion = moves.some(m => m.to === square && m.flags.includes('p'));

    if (isPromotion) {
      setPendingPromotion({ from: moveFrom, to: square });
      return;
    }

    const move = makeAMove({
      from: moveFrom,
      to: square,
      promotion: 'q',
    });

    if (!move) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string) {
    if (!isDraggable) return false;

    const moves = game.moves({ square: sourceSquare as any, verbose: true });
    const isPromotion = moves.some(m => m.to === targetSquare && m.flags.includes('p'));

    if (isPromotion) {
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      return true;
    }

    return makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    });
  }

  const mergedSquareStyles = { ...optionSquares } as any;
  lastMoveSquares.forEach((sq) => {
    if (!mergedSquareStyles[sq]) {
      mergedSquareStyles[sq] = {
        background: 'rgba(245, 158, 11, 0.22)', // soft yellow/amber highlight for moved pieces
        borderRadius: '4px',
      };
    }
  });

  const CustomSquareCreator = useMemo(() => {
    const Component = React.forwardRef<any, any>((props, ref) => {
      const { square, children, style } = props;
      const isTarget = lastMoveTo && square === lastMoveTo;

      return (
        <div ref={ref} style={{ ...style, position: 'relative' }} className="flex items-center justify-center">
          {children}
          {isTarget && classification && (
            <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 z-[30] pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]">
              <MoveClassificationIcon classification={classification} size="sm" className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
            </div>
          )}
        </div>
      );
    });
    Component.displayName = 'CustomSquareCreator';
    return Component;
  }, [lastMoveTo, classification]);

  return (
    <>
      <Card className="p-1 bg-slate-900 border-slate-800 chess-board-container overflow-hidden rounded-xl shadow-2xl">
        <Chessboard 
          key={id}
          id={id}
          position={isDraggable ? game.fen() : (controlledFen === 'start' ? undefined : controlledFen)} 
          onPieceDrop={onPieceDrop} 
          onSquareClick={onSquareClick}
          boardOrientation="white"
          arePiecesDraggable={isDraggable}
          customDarkSquareStyle={{ backgroundColor: '#2D343E' }}
          customLightSquareStyle={{ backgroundColor: '#444C56' }}
          customSquareStyles={mergedSquareStyles}
          customArrows={arrows as any}
          animationDuration={200}
          customSquare={CustomSquareCreator}
        />
      </Card>

      <Dialog open={!!pendingPromotion} onOpenChange={(open) => !open && setPendingPromotion(null)}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white font-sans">
          <DialogHeader>
            <DialogTitle className="font-headline font-bold text-xl text-white">Pawn Promotion</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select the piece you'd like to promote your pawn into.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4 py-6 font-sans">
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('q')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white"
            >
              <Crown className="w-8 h-8 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-tighter">Queen</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('r')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-xl text-sky-400">R</div>
              <span className="text-xs font-bold uppercase tracking-tighter">Rook</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('b')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-xl text-sky-400">B</div>
              <span className="text-xs font-bold uppercase tracking-tighter">Bishop</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('n')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-xl text-sky-400">N</div>
              <span className="text-xs font-bold uppercase tracking-tighter">Knight</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
