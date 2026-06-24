"use client";

import React from 'react';
import { Play, Pause, RotateCcw, FastForward, Rewind, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ControlPanelProps {
  onReview: () => void;
  onAnalyze: () => void;
  onRestart: () => void;
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  isAnalyzing: boolean;
  isReviewing: boolean;
}

export function ControlPanel({ 
  onReview, 
  onRestart, 
  onNext, 
  onPrev, 
  onTogglePlay,
  isPlaying,
  isReviewing 
}: ControlPanelProps) {
  return (
    <Card className="bg-slate-900 border-slate-800 p-4 shrink-0">
      <div className="flex flex-col gap-4">
        {/* Navigation Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2 w-full justify-between">
            <Button 
              variant="outline" 
              size="icon" 
              className="bg-slate-800 hover:bg-slate-700 h-9 w-9 text-slate-300 hover:text-white"
              onClick={onPrev}
              title="Previous Move"
            >
              <Rewind className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="bg-slate-800 hover:bg-slate-700 h-9 w-9 text-slate-300 hover:text-white"
              onClick={onTogglePlay}
              title={isPlaying ? "Pause" : "Auto-play Game"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="bg-slate-800 hover:bg-slate-700 h-9 w-9 text-slate-300 hover:text-white"
              onClick={onNext}
              title="Next Move"
            >
              <FastForward className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="bg-slate-800 hover:bg-slate-700 h-9 w-9 text-slate-300 hover:text-white"
              onClick={onRestart}
              title="Restart Game"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="w-full">
          <Button 
            className="w-full gap-2 bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20"
            onClick={onReview}
            disabled={isReviewing}
          >
            <Sparkles className="w-4 h-4" /> 
            {isReviewing ? "Reviewing..." : "Game Review"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
