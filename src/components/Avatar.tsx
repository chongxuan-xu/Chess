"use client";

import React, { useEffect, useState } from "react";
import { 
  Crown, 
  Flame, 
  Zap, 
  Shield, 
  Swords, 
  Infinity as InfinityIcon, 
  Brain, 
  Target,
  Trophy,
  Skull,
  User
} from "lucide-react";

export type AvatarType = "icon" | "url" | "text";

export interface AvatarConfig {
  type: AvatarType;
  iconName?: string;
  bgGradient?: string;
  url?: string;
  text?: string;
}

export const AVATAR_PRESETS = [
  { id: "grandmaster", icon: Crown, bg: "from-sky-500 to-indigo-600", label: "Grandmaster", iconName: "Crown" },
  { id: "aggressor", icon: Flame, bg: "from-orange-500 to-red-600", label: "Aggressor", iconName: "Flame" },
  { id: "tactician", icon: Zap, bg: "from-amber-400 to-yellow-600", label: "Tactician", iconName: "Zap" },
  { id: "rock", icon: Shield, bg: "from-emerald-500 to-teal-700", label: "Defender", iconName: "Shield" },
  { id: "challenger", icon: Swords, bg: "from-purple-650 to-pink-600", label: "Challenger", iconName: "Swords" },
  { id: "endgame", icon: InfinityIcon, bg: "from-cyan-400 to-sky-600", label: "Endgame Maestro", iconName: "Infinity" },
  { id: "thinker", icon: Brain, bg: "from-fuchsia-500 to-blue-600", label: "Thinker", iconName: "Brain" },
  { id: "sniper", icon: Target, bg: "from-rose-500 to-violet-700", label: "Sniper", iconName: "Target" },
  { id: "champion", icon: Trophy, bg: "from-yellow-400 to-amber-600", label: "Champion", iconName: "Trophy" },
  { id: "executioner", icon: Skull, bg: "from-slate-700 to-slate-900", label: "Executioner", iconName: "Skull" },
];

export function getAvatarIcon(name: string) {
  switch (name) {
    case "Crown": return Crown;
    case "Flame": return Flame;
    case "Zap": return Zap;
    case "Shield": return Shield;
    case "Swords": return Swords;
    case "Infinity": return InfinityIcon;
    case "Brain": return Brain;
    case "Target": return Target;
    case "Trophy": return Trophy;
    case "Skull": return Skull;
    default: return User;
  }
}

interface AvatarProps {
  className?: string;
  sizeClassName?: string;
  config?: AvatarConfig;
}

export function Avatar({ className = "", sizeClassName = "h-10 w-10", config }: AvatarProps) {
  const [actualConfig, setActualConfig] = useState<AvatarConfig | null>(null);

  useEffect(() => {
    if (config) {
      setActualConfig(config);
      return;
    }

    // Load from localStorage if not provided manually
    const loadConfig = () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("gml_avatar_config");
        if (saved) {
          try {
            setActualConfig(JSON.parse(saved));
          } catch {
            setActualConfig(null);
          }
        } else {
          setActualConfig(null);
        }
      }
    };

    loadConfig();

    // Listen to custom events so it updates immediately when changed
    window.addEventListener("gml_avatar_updated", loadConfig);
    return () => {
      window.removeEventListener("gml_avatar_updated", loadConfig);
    };
  }, [config]);

  // Fallback representation: Initial letter of the player's name
  const [fallbackLetter, setFallbackLetter] = useState("G");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("gml_user");
      if (savedUser) {
        try {
          const u = JSON.parse(savedUser);
          if (u.username) setFallbackLetter(u.username[0].toUpperCase());
        } catch {}
      } else {
        const guestName = localStorage.getItem("gml_guest_name");
        if (guestName) setFallbackLetter(guestName[0].toUpperCase());
      }
    }
  }, []);

  if (!actualConfig) {
    // Default initial avatar (text character centered on grandmaster backdrop)
    return (
      <div 
        className={`rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-mono font-black border border-sky-400/30 flex-shrink-0 shadow-lg ${sizeClassName} ${className}`}
      >
        <span className="text-[13px]">{fallbackLetter}</span>
      </div>
    );
  }

  if (actualConfig.type === "url" && actualConfig.url) {
    return (
      <div className={`rounded-full overflow-hidden border border-slate-800/80 bg-slate-900 flex-shrink-0 relative ${sizeClassName} ${className}`}>
        <img 
          src={actualConfig.url} 
          alt="Avatar" 
          className="w-full h-full object-cover" 
          referrerPolicy="no-referrer"
          onError={() => {
            // If image fails to load, temporarily set fallback state
            setActualConfig({ type: "text", text: fallbackLetter });
          }}
        />
      </div>
    );
  }

  if (actualConfig.type === "text") {
    return (
      <div 
        className={`rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 font-mono font-bold flex-shrink-0 ${sizeClassName} ${className}`}
      >
        <span>{actualConfig.text || fallbackLetter}</span>
      </div>
    );
  }

  // Type is "icon"
  const IconComponent = getAvatarIcon(actualConfig.iconName || "Crown");
  const gradient = actualConfig.bgGradient || "from-sky-500 to-indigo-600";

  return (
    <div 
      className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white border border-white/10 flex-shrink-0 shadow-[0_0_15px_rgba(14,165,233,0.1)] ${sizeClassName} ${className}`}
    >
      <IconComponent className="w-1/2 h-1/2" />
    </div>
  );
}
