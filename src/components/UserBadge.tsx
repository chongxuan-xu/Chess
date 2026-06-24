"use client";

import React, { useEffect, useState } from "react";
import { getUserRole, UserRole } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";

interface UserBadgeProps {
  username?: string;
  email?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export function UserBadge({ username, email, className = "", size = "md" }: UserBadgeProps) {
  const { toast } = useToast();
  const [role, setRole] = useState<UserRole>("user");

  useEffect(() => {
    const checkRole = () => {
      setRole(getUserRole(username, email));
    };

    checkRole();

    // Listen to updates so roles refresh instantly on advance
    window.addEventListener("gml_roles_updated", checkRole);
    window.addEventListener("gml_auth_change", checkRole);

    return () => {
      window.removeEventListener("gml_roles_updated", checkRole);
      window.removeEventListener("gml_auth_change", checkRole);
    };
  }, [username, email]);

  if (role === "user") return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    let displayTitle = "";
    let displayDesc = "";

    switch (role) {
      case "owner":
        displayTitle = "Creator & Owner";
        displayDesc = `Verified account of ${username || "GoldYeti"} with highest authority over Grandmaster Lens clusters.`;
        break;
      case "admin":
        displayTitle = "Administrator";
        displayDesc = `Verified system administrator managing matches, server parameters, and chess engines.`;
        break;
      case "moderator":
        displayTitle = "Moderator";
        displayDesc = `Verified community moderator supervising the real-time lobbies and ensuring fair play.`;
        break;
    }

    toast({
      title: displayTitle,
      description: displayDesc,
    });
  };

  // Dimensions mapping
  const sizeMap = {
    sm: { box: "w-5 h-5", spacing: "ml-1" },
    md: { box: "w-6 h-6", spacing: "ml-1.5" },
    lg: { box: "w-8 h-8", spacing: "ml-2" },
    xl: { box: "w-10 h-10", spacing: "ml-2.5" },
  };

  const currSize = sizeMap[size] || sizeMap.md;

  // 1. Owner crown: Black crown + gold trim + one glowing blue gem + subtle gold aura + pulsing effects
  if (role === "owner") {
    return (
      <span 
        onClick={handleClick}
        className={`inline-flex items-center justify-center cursor-pointer select-none focus:outline-none shrink-0 ${currSize.spacing} ${className}`}
        title="Creator & Owner"
      >
        <svg 
          className={`${currSize.box} hover:scale-115 active:scale-90 transition-all duration-300`} 
          viewBox="0 0 24 24" 
          fill="none"
        >
          <style>{`
            @keyframes owner-breath {
              0%, 100% { filter: drop-shadow(0 0 5px rgba(245,158,11,0.65)) drop-shadow(0 0 1px rgba(245,158,11,0.4)); }
              50% { filter: drop-shadow(0 0 12px rgba(245,158,11,0.95)) drop-shadow(0 0 3px rgba(56,189,248,0.7)); }
            }
            @keyframes aura-pulse {
              0%, 100% { transform: scale(0.9); opacity: 0.12; }
              50% { transform: scale(1.2); opacity: 0.28; }
            }
            @keyframes gem-glow {
              0%, 100% { opacity: 0.75; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.25); filter: brightness(1.2); }
            }
            .owner-animate-box {
              animation: owner-breath 3s infinite ease-in-out;
              transform-origin: center;
            }
            .owner-aura {
              animation: aura-pulse 3s infinite ease-in-out;
              transform-origin: 12px 12px;
            }
            .owner-gem {
              animation: gem-glow 2s infinite ease-in-out;
              transform-origin: 12px 11.5px;
            }
          `}</style>
          
          <g className="owner-animate-box">
            {/* Subtle premium gold aura */}
            <circle cx="12" cy="12" r="9" className="owner-aura fill-amber-500" />
            
            {/* Black crown base with polished gold border */}
            <path 
              d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" 
              fill="#0b0f19" 
              stroke="#f59e0b" 
              strokeWidth="1.85" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            
            {/* Polished gold bottom trim */}
            <path 
              d="M5 16h14" 
              stroke="#f59e0b" 
              strokeWidth="1.85" 
              strokeLinecap="round" 
            />
            
            {/* Bottom highlight */}
            <path 
              d="M6 18.5h12" 
              stroke="#fbbf24" 
              strokeWidth="1" 
              strokeLinecap="round" 
              opacity="0.7"
            />

            {/* Glowing blue gemstone in the center */}
            <circle cx="12" cy="11.5" r="2.2" fill="#06b6d4" className="owner-gem" />
            <circle cx="12" cy="11.5" r="4.5" fill="none" stroke="#38bdf8" strokeWidth="0.75" className="animate-ping" style={{ transformOrigin: "12px 11.5px" }} />
          </g>
        </svg>
      </span>
    );
  }

  // 2. Admin crown: Silver crown + blue gemstone centerpiece + polished metallic accents + faint blue glow
  if (role === "admin") {
    return (
      <span 
        onClick={handleClick}
        className={`inline-flex items-center justify-center cursor-pointer select-none focus:outline-none shrink-0 ${currSize.spacing} ${className}`}
        title="Administrator"
      >
        <svg 
          className={`${currSize.box} hover:scale-115 active:scale-90 transition-all duration-300`} 
          viewBox="0 0 24 24" 
          fill="none"
        >
          <defs>
            <linearGradient id="silver-metal-premium" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#f1f5f9" />
              <stop offset="70%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <linearGradient id="sky-gem-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes admin-breath {
              0%, 100% { filter: drop-shadow(0 0 4px rgba(56,189,248,0.5)) drop-shadow(0 0 1px rgba(255,255,255,0.2)); }
              50% { filter: drop-shadow(0 0 11px rgba(56,189,248,0.85)) drop-shadow(0 0 2px rgba(255,255,255,0.4)); }
            }
            @keyframes silver-shimmer {
              0%, 100% { opacity: 0.15; }
              50% { opacity: 0.35; }
            }
            .admin-animate-box {
              animation: admin-breath 3s infinite ease-in-out;
              transform-origin: center;
            }
            .admin-shimmer {
              animation: silver-shimmer 2.5s infinite ease-in-out;
              transform-origin: 12px 12px;
            }
          `}</style>
          
          <g className="admin-animate-box">
            {/* Faint sky-blue glow circle */}
            <circle cx="12" cy="12" r="8.5" fill="#0ea5e9" className="admin-shimmer" />

            {/* Silver crown body with high-contrast borders */}
            <path 
              d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" 
              fill="url(#silver-metal-premium)" 
              stroke="#94a3b8" 
              strokeWidth="1.8" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            
            {/* Polished silver bottom trim */}
            <path 
              d="M5 16h14" 
              stroke="#e2e8f0" 
              strokeWidth="1.8" 
              strokeLinecap="round" 
            />

            {/* Blue gemstone centerpiece (Diamond structure) */}
            <polygon 
              points="12,9 14,11 12,13 10,11" 
              fill="url(#sky-gem-gradient)" 
              stroke="#e0f2fe" 
              strokeWidth="0.75" 
            />
            
            {/* Glowing gem point */}
            <circle cx="12" cy="11" r="1" fill="#ffffff" opacity="0.9" />
          </g>
        </svg>
      </span>
    );
  }

  // 3. Moderator icon: Silver shield + silver crown emblem + small blue gemstone centerpiece + clean metallic finish + subtle blue glow
  if (role === "moderator") {
    return (
      <span 
        onClick={handleClick}
        className={`inline-flex items-center justify-center cursor-pointer select-none focus:outline-none shrink-0 ${currSize.spacing} ${className}`}
        title="Moderator"
      >
        <svg 
          className={`${currSize.box} hover:scale-115 active:scale-90 transition-all duration-300`} 
          viewBox="0 0 24 24" 
          fill="none"
        >
          <defs>
            <linearGradient id="shield-metal-premium" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#e2e8f0" />
              <stop offset="75%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>
          <style>{`
            @keyframes mod-breath {
              0%, 100% { filter: drop-shadow(0 0 4px rgba(14,165,233,0.45)); }
              50% { filter: drop-shadow(0 0 10px rgba(14,165,233,0.75)) drop-shadow(0 0 2px rgba(56,189,248,0.5)); }
            }
            .mod-animate-box {
              animation: mod-breath 3s infinite ease-in-out;
              transform-origin: center;
            }
          `}</style>

          <g className="mod-animate-box">
            {/* Subtle background blue glow */}
            <circle cx="12" cy="12" r="8.5" fill="#38bdf8" opacity="0.08" />

            {/* Highly polished silver shield base */}
            <path 
              d="M12 2C7.5 2 4 4.5 4 8c0 5 4 9 8 11.5 4-2.5 8-6.5 8-11.5 0-3.5-3.5-6-8-6z" 
              fill="url(#shield-metal-premium)" 
              stroke="#64748b" 
              strokeWidth="1.8" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />

            {/* Internal shield border trim for elegant depth */}
            <path 
              d="M12 3.8C8.5 3.8 5.6 5.8 5.6 8.5c0 3.8 3.2 7 6.4 9 3.2-2 6.4-5.2 6.4-9 0-2.7-2.9-4.7-6.4-4.7z" 
              fill="none" 
              stroke="#f1f5f9" 
              strokeWidth="0.75" 
              opacity="0.6"
            />

            {/* Silver crown emblem inside shield */}
            <path 
              d="M7.8 8l1.7 4.5h5l1.7-4.5-2.25 2.5-1.75-2.5-1.75 2.5z" 
              fill="#f8fafc" 
              stroke="#475569" 
              strokeWidth="1" 
              strokeLinejoin="round"
            />

            {/* Small brilliant blue gemstone centerpiece inside the crown emblem */}
            <circle cx="12" cy="9.8" r="1.3" fill="#0ea5e9" stroke="#e0f2fe" strokeWidth="0.4" />
          </g>
        </svg>
      </span>
    );
  }

  return null;
}
