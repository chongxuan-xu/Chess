"use client";

import React from 'react';
import { Star, ThumbsUp, Check, ArrowRight, BookOpen, X } from 'lucide-react';
import type { MoveClassification } from '@/lib/chess/types';
import { cn } from '@/lib/utils';

interface MoveClassificationIconProps {
  classification: MoveClassification;
  className?: string; // Optional custom className to merge
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function MoveClassificationIcon({ classification, className, size = 'md' }: MoveClassificationIconProps) {
  // Determine scales based on size
  const isXl = size === 'xl';
  const isLg = size === 'lg';
  const isMd = size === 'md';
  const isSm = size === 'sm';

  const sizeClass = isXl 
    ? 'w-11 h-11' 
    : isLg 
      ? 'w-8.5 h-8.5' 
      : isMd 
        ? 'w-6.5 h-6.5' 
        : 'w-5 h-5';

  const txtDouble = isXl 
    ? 'text-lg tracking-tighter' 
    : isLg 
      ? 'text-sm tracking-tighter' 
      : isMd 
        ? 'text-[11px] tracking-tighter' 
        : 'text-[9px] tracking-tighter';

  const txtSingle = isXl 
    ? 'text-xl font-black' 
    : isLg 
      ? 'text-base font-black' 
      : isMd 
        ? 'text-sm font-black' 
        : 'text-xs font-bold';

  const wrapper = (bg: string, content: React.ReactNode, title: string) => (
    <div 
      className={cn(
        "rounded-full text-white flex items-center justify-center shrink-0 select-none font-sans font-extrabold shadow-md border border-white/10", 
        bg, 
        sizeClass,
        className
      )} 
      title={title}
    >
      {content}
    </div>
  );

  switch (classification) {
    case 'Brilliant':
      return wrapper(
        "bg-cyan-400 text-white shadow-cyan-400/20", 
        <span className={cn("leading-none select-none pr-[0.5px]", txtDouble)}>!!</span>, 
        "Brilliant"
      );
    case 'Great Move':
      return wrapper(
        "bg-blue-500 text-white shadow-blue-500/20", 
        <span className={cn("leading-none select-none", txtSingle)}>!</span>, 
        "Great"
      );
    case 'Best':
      return wrapper(
        "bg-green-600 text-white shadow-green-600/20", 
        <Star className={cn("fill-current text-white", isXl || isLg ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />, 
        "Best"
      );
    case 'Excellent':
      return wrapper(
        "bg-green-500 text-white shadow-green-500/20", 
        <ThumbsUp className={cn("stroke-[2.5]", isXl || isLg ? "w-4 h-4" : "w-3.5 h-3.5")} />, 
        "Excellent"
      );
    case 'Good':
      return wrapper(
        "bg-emerald-800 text-white shadow-emerald-800/20", 
        <Check className={cn("stroke-[3.5]", isXl || isLg ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />, 
        "Good"
      );
    case 'Inaccuracy':
      return wrapper(
        "bg-yellow-500 text-white shadow-yellow-500/20", 
        <span className={cn("leading-none select-none", txtDouble)}>?!</span>, 
        "Inaccuracy"
      );
    case 'Mistake':
      return wrapper(
        "bg-orange-500 text-white shadow-orange-500/20", 
        <span className={cn("leading-none select-none", txtSingle)}>?</span>, 
        "Mistake"
      );
    case 'Blunder':
      return wrapper(
        "bg-red-650 text-white bg-red-600 shadow-red-600/20", 
        <span className={cn("leading-none select-none", txtDouble)}>??</span>, 
        "Blunder"
      );
    case 'Miss':
      return wrapper(
        "bg-pink-500 text-white shadow-pink-500/20", 
        <X className={cn("stroke-[3.5]", isXl || isLg ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />, 
        "Miss"
      );
    case 'Forced':
      return wrapper(
        "bg-amber-600 text-white shadow-amber-600/20", 
        <ArrowRight className={cn("stroke-[3.5]", isXl || isLg ? "w-4.5 h-4.5" : "w-3.5 h-3.5")} />, 
        "Forced"
      );
    case 'Book':
      return wrapper(
        "bg-[rgb(139,90,43)] text-white shadow-[rgb(139,90,43)]/20", 
        <BookOpen className={cn("fill-current text-white", isXl || isLg ? "w-4 h-4" : "w-3 h-3")} />, 
        "Book"
      );
    default:
      return null;
  }
}
