import React from "react";

export function BulletIcon({ className = "w-5 h-5", strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Bullet projectile sleek shape */}
      <path d="M12 2C9 5 9 14 9 18h6c0-4 0-13-3-16z" />
      <path d="M9 14h6" />
      <path d="M9 18v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}
