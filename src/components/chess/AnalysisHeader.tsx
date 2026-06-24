"use client";

import React from 'react';
import { FileDown, FileUp, Settings2, Lightbulb, BarChart3, LightbulbOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AnalysisHeaderProps {
  gameTitle?: string;
  onImportPgn: () => void;
  onExportPgn: () => void;
  showHints: boolean;
  setShowHints: (show: boolean) => void;
  showEval: boolean;
  setShowEval: (show: boolean) => void;
}

export function AnalysisHeader({ 
  gameTitle = "Untitled Analysis", 
  onImportPgn, 
  onExportPgn,
  showHints,
  setShowHints,
  showEval,
  setShowEval
}: AnalysisHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold font-headline text-white flex items-center gap-2">
          Grandmaster Lens
          <Badge variant="outline" className="text-sky-400 border-sky-400/30 bg-sky-400/5">BETA</Badge>
        </h1>
        <p className="text-slate-400 text-sm font-medium">{gameTitle}</p>
      </div>
      
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <div className="flex items-center gap-1 mr-2 px-2 py-1 bg-slate-900/50 rounded-lg border border-slate-800 font-sans">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 transition-colors ${showEval ? 'text-sky-400' : 'text-slate-500'}`}
                  onClick={() => setShowEval(!showEval)}
                >
                  <BarChart3 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{showEval ? 'Hide' : 'Show'} Evaluation Bar</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`h-8 w-8 transition-colors ${showHints ? 'text-amber-400' : 'text-slate-500'}`}
                  onClick={() => setShowHints(!showHints)}
                >
                  {showHints ? <Lightbulb className="w-4 h-4" /> : <LightbulbOff className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{showHints ? 'Hide' : 'Show'} Best Move Hints</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <Button variant="outline" size="sm" onClick={onImportPgn} className="gap-2 bg-slate-900 border-slate-800">
          <FileUp className="w-4 h-4" /> Import PGN
        </Button>
        <Button variant="outline" size="sm" onClick={onExportPgn} className="gap-2 bg-slate-900 border-slate-800">
          <FileDown className="w-4 h-4" /> Export
        </Button>
        <Button variant="outline" size="icon" className="bg-slate-900 border-slate-800 h-9 w-9 text-slate-300 hover:text-white">
          <Settings2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
