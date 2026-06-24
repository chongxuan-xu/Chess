"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface EloChartProps {
  history: number[];
  type: "bullet" | "blitz" | "rapid";
}

export function EloChart({ history = [1200], type }: EloChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  const safeHistory = useMemo(() => {
    if (!history || history.length === 0) return [1200];
    return history;
  }, [history]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const chartData = useMemo(() => {
    return safeHistory.map((rating, index) => ({
      match: index,
      rating: rating,
      displayName: index === 0 ? "Initial" : `Game ${index}`
    }));
  }, [safeHistory]);

  // Read min and max rating to buffer the chart nicely
  const { minRating, maxRating } = useMemo(() => {
    if (safeHistory.length === 0) return { minRating: 1100, maxRating: 1300 };
    const values = [...safeHistory];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = 50;
    return {
      minRating: Math.max(100, min - padding),
      maxRating: max + padding
    };
  }, [safeHistory]);

  if (!isMounted) {
    return (
      <div className="h-64 w-full flex items-center justify-center text-xs font-mono text-slate-500 uppercase tracking-wider">
        Loading Elo Chart...
      </div>
    );
  }

  return (
    <div className="w-full h-64 bg-slate-950/60 rounded-xl p-3 border border-slate-900 shadow-inner mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.4} />
          <XAxis
            dataKey="match"
            stroke="#64748b"
            fontSize={9}
            tickLine={false}
            tickFormatter={(v) => (v === 0 ? "Start" : `#${v}`)}
            axisLine={false}
          />
          <YAxis
            domain={[minRating, maxRating]}
            stroke="#64748b"
            fontSize={9}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#020617",
              borderColor: "#1e293b",
              borderRadius: "0.5rem",
              fontSize: "11px",
              fontFamily: "monospace",
              color: "#f8fafc"
            }}
            labelFormatter={(v) => (v === 0 ? "Base Rating" : `Match #${v}`)}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke={
              type === "bullet"
                ? "#f59e0b" // Amber
                : type === "blitz"
                ? "#ef4444" // Red
                : "#0ea5e9" // Sky
            }
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 1 }}
            activeDot={{ r: 6, strokeWidth: 0, fill: "#ffffff" }}
            name="Elo Rating"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
