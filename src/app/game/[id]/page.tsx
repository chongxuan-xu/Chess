"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Chess } from "chess.js";
import dynamic from 'next/dynamic';

const Chessboard = dynamic(
  () => import('react-chessboard').then((mod) => mod.Chessboard),
  { ssr: false }
);

import { 
  ArrowLeft, 
  Copy, 
  Check, 
  Home, 
  RefreshCw, 
  Sparkles, 
  Compass, 
  Clock, 
  AlertTriangle,
  Play,
  RotateCcw,
  Users,
  MessageSquare,
  Send,
  Crown,
  Info
} from "lucide-react";
import { motion } from "motion/react";
import { getEloState, parsePlayerName, updatePlayerRating } from "@/lib/elo";
import { Avatar, AvatarConfig } from "@/components/Avatar";
import { UserBadge } from "@/components/UserBadge";
import { PageLoader } from "@/components/PageLoader";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GameRecord {
  id: string;
  fen: string;
  white_player_id: string | null;
  black_player_id: string | null;
  white_player_name: string;
  black_player_name: string;
  status: 'waiting' | 'active' | 'finished' | 'draw';
  moves: string[];
  last_move_at: string;
  winner_id?: string | null;
  resigned_player_id?: string | null;
  result_reason?: string | null;
  draw_offer?: string | null;
  white_clocks?: number[];
  black_clocks?: number[];
}

interface ChatMessage {
  id: string;
  sender: string;
  senderId: string;
  text: string;
  color: "w" | "b" | "spectator";
  timestamp: string;
}

function getTimerSettings(presetMode: string): { base: number; increment: number } {
  switch (presetMode) {
    case "1m": return { base: 60, increment: 0 };
    case "1_1": return { base: 60, increment: 1 };
    case "2_1": return { base: 120, increment: 1 };
    case "3m": return { base: 180, increment: 0 };
    case "3_2": return { base: 180, increment: 2 };
    case "5m": return { base: 300, increment: 0 };
    case "10m": return { base: 600, increment: 0 };
    case "10_5": return { base: 600, increment: 5 };
    case "15_10": return { base: 900, increment: 10 };
    
    // Fallbacks
    case "bullet": return { base: 60, increment: 0 };
    case "blitz": return { base: 180, increment: 0 };
    case "rapid": return { base: 600, increment: 0 };
    default: return { base: 300, increment: 0 };
  }
}

export default function GameRoomPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const supabase = getSupabase();

  // Chess validation engine
  const [chessGame, setChessGame] = useState<Chess | null>(null);

  // States
  const [gameRecord, setGameRecord] = useState<GameRecord | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [myNickname, setMyNickname] = useState<string>("Anonymous");
  const [myColor, setMyColor] = useState<"w" | "b" | "spectator">("spectator");
  
  const [eloChange, setEloChange] = useState<{
    oldRating: number;
    newRating: number;
    change: number;
    type: "bullet" | "blitz" | "rapid";
    outcome: "win" | "loss" | "draw";
  } | null>(null);

  // Real-time UI states
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  // AI analysis state
  const [aiCommentary, setAiCommentary] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Board Sizing state
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(540);

  // Click-to-move interactive state helper lists
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  // Timers representation state
  const [whiteTime, setWhiteTime] = useState<number>(300 * 1000);
  const [blackTime, setBlackTime] = useState<number>(300 * 1000);
  const [timerInitialized, setTimerInitialized] = useState(false);

  // Chat representation state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  const channelRef = useRef<any>(null);
  const timeoutTriggeredRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat when updated
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Custom added elements: Rating Info Modal, Disconnect Detection, and Player Avatars
  const [showGameInfoModal, setShowGameInfoModal] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"board" | "info">("board");
  const opponentLastActiveRef = useRef<number>(Date.now());
  const [opponentOnline, setOpponentOnline] = useState<boolean>(true);
  const [abandonmentCountdown, setAbandonmentCountdown] = useState<number>(15);

  const [whiteAvatarConfig, setWhiteAvatarConfig] = useState<AvatarConfig | null>(null);
  const [blackAvatarConfig, setBlackAvatarConfig] = useState<AvatarConfig | null>(null);

  // Game history playback state
  const [viewingMoveIndex, setViewingMoveIndex] = useState<number | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  // Precompute FEN strings for all moves in history for instant traversal
  const moveHistoryFens = useMemo(() => {
    const fens = ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"];
    if (!gameRecord?.moves) return fens;
    const historyChess = new Chess();
    for (const move of gameRecord.moves) {
      try {
        historyChess.move(move);
        fens.push(historyChess.fen());
      } catch (err) {
        console.error("Failed to parse move in design history:", move, err);
        break;
      }
    }
    return fens;
  }, [gameRecord?.moves]);

  // Handle Autoplay tick
  useEffect(() => {
    if (!isAutoPlaying || !gameRecord?.moves) return;

    const totalMoves = gameRecord.moves.length;
    let curr = viewingMoveIndex !== null ? viewingMoveIndex : totalMoves;

    if (curr >= totalMoves) {
      setIsAutoPlaying(false);
      return;
    }

    const interval = setInterval(() => {
      curr += 1;
      if (curr >= totalMoves) {
        setViewingMoveIndex(null); // Return to live position
        setIsAutoPlaying(false);
      } else {
        setViewingMoveIndex(curr);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isAutoPlaying, viewingMoveIndex, gameRecord?.moves]);

  // Handle Arrow Key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input elements
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.getAttribute("contenteditable") === "true") {
        return;
      }

      if (!gameRecord?.moves) return;
      const totalMoves = gameRecord.moves.length;
      const currentIndex = viewingMoveIndex !== null ? viewingMoveIndex : totalMoves;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const nextIdx = Math.max(0, currentIndex - 1);
        setViewingMoveIndex(nextIdx);
        setIsAutoPlaying(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIdx = Math.min(totalMoves, currentIndex + 1);
        if (nextIdx === totalMoves) {
          setViewingMoveIndex(null);
        } else {
          setViewingMoveIndex(nextIdx);
        }
        setIsAutoPlaying(false);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setViewingMoveIndex(0);
        setIsAutoPlaying(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setViewingMoveIndex(null);
        setIsAutoPlaying(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewingMoveIndex, gameRecord?.moves]);

  // Keep track of board positions occurrence for threefold repetition
  const positionHistoryCounts = useMemo(() => {
    if (!gameRecord?.moves) return {};
    const counts: Record<string, number> = {};
    const tempGame = new Chess();
    
    // Initial starting position (key using first 4 spaces-delimited chunks of FEN)
    const startKey = tempGame.fen().split(' ').slice(0, 4).join(' ');
    counts[startKey] = 1;

    for (const move of gameRecord.moves) {
      try {
        tempGame.move(move);
        const key = tempGame.fen().split(' ').slice(0, 4).join(' ');
        counts[key] = (counts[key] || 0) + 1;
      } catch (e) {
        break;
      }
    }
    return counts;
  }, [gameRecord?.moves]);

  const currentPositionCount = useMemo(() => {
    if (!chessGame) return 0;
    const key = chessGame.fen().split(' ').slice(0, 4).join(' ');
    return positionHistoryCounts[key] || 0;
  }, [chessGame, positionHistoryCounts]);

  // 1. Initial mounting check
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Load player identity and initialize Chess game engine
  useEffect(() => {
    if (!isMounted) return;

    // Load or set Player ID
    let pid = localStorage.getItem("gml_player_id");
    if (!pid) {
      pid = crypto.randomUUID();
      localStorage.setItem("gml_player_id", pid);
    }
    setMyPlayerId(pid);

    // Load nickname. Anonymous online players always use Guest(number).
    const savedUser = localStorage.getItem("gml_user");
    let name = "";
    if (savedUser) {
      try { name = JSON.parse(savedUser).username || ""; } catch {}
    }
    if (!name) {
      name = localStorage.getItem("gml_guest_name") || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("gml_guest_name", name);
      localStorage.setItem("gml_nickname", name);
    }
    setMyNickname(name);

    // Initialize chess
    setChessGame(new Chess());
  }, [isMounted]);

  // End-of-game Elo calculation listener
  useEffect(() => {
    if (!gameRecord || !chessGame || myColor === "spectator") return;
    if (gameRecord.status !== "finished" && gameRecord.status !== "draw") return;

    const processedKey = `gml_elo_processed_game_v2_${id}`;
    if (typeof window !== "undefined") {
      if (localStorage.getItem(processedKey)) {
        const storedChange = localStorage.getItem(`gml_elo_change_data_v2_${id}`);
        if (storedChange && !eloChange) {
          try {
            setEloChange(JSON.parse(storedChange));
          } catch {}
        }
        return;
      }

      // Parse host's name to find game mode
      const parsedHost = parsePlayerName(gameRecord.white_player_name || "");
      const gameType = (parsedHost.mode || "blitz") as "bullet" | "blitz" | "rapid";

      // Determine outcome
      let outcome: "win" | "loss" | "draw" | null = null;
      if (gameRecord.status === "draw") {
        outcome = "draw";
      } else if (gameRecord.status === "finished") {
        if (gameRecord.winner_id) {
          outcome = gameRecord.winner_id === myPlayerId ? "win" : "loss";
        } else {
          const currentTurn = chessGame.turn(); // 'w' or 'b'
          outcome = currentTurn === myColor ? "loss" : "win";
        }
      }

      if (!outcome) return;

      // Extract opponent Elo
      let opponentElo = 1200;
      const oppNameStr = myColor === "w" ? gameRecord.black_player_name : gameRecord.white_player_name;
      const oppParsed = parsePlayerName(oppNameStr || "");
      opponentElo = oppParsed.rating || 1200;

      // Update the rating
      const res = updatePlayerRating(gameType, outcome, opponentElo);

      const changeData = {
        oldRating: res.oldRating,
        newRating: res.newRating,
        change: res.change,
        type: gameType,
        outcome
      };

      localStorage.setItem(processedKey, "true");
      localStorage.setItem(`gml_elo_change_data_v2_${id}`, JSON.stringify(changeData));
      setEloChange(changeData);
    }
  }, [gameRecord?.status, chessGame, myColor, id, eloChange]);

  // 3. Resize Observer for Chessboard container (guideline constraint: Responsive canvas stage sizing)
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        // Limit maximum size on big desktop screens and min size, with width safety margin
        const targetSize = Math.max(260, Math.min(width - 4, height - 120, 540));
        setBoardWidth(targetSize);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isMounted]);

  // 4. Fetch game record & register/sync player assignment in room
  const syncPlayerSlot = async (record: GameRecord, playerId: string, nicknameToUse: string) => {
    // Determine player seat assignment
    let updatedRecord = { ...record };
    let needsUpdate = false;

    // Parse the game category from the host's player name
    const parsedHost = parsePlayerName(record.white_player_name || "");
    const gameType = (parsedHost.mode || "blitz") as "bullet" | "blitz" | "rapid";
    
    // Get player's Elo rating for this game type
    const eloState = getEloState();
    const myRating = eloState[gameType] || 1200;
    const formattedMyName = `${nicknameToUse} (${myRating}) [${gameType}]`;

    if (record.white_player_id === playerId) {
      setMyColor("w");
    } else if (record.black_player_id === playerId) {
      setMyColor("b");
    } else {
      // Room is open or player needs assignment
      // Automatically assign the joining player to empty White or Black slots to support direct link invites
      if (!record.white_player_id) {
        // Fill White Seat
        needsUpdate = true;
        updatedRecord.white_player_id = playerId;
        updatedRecord.white_player_name = formattedMyName;
        setMyColor("w");
      } else if (!record.black_player_id) {
        // Fill Black Seat, and transition game status to active
        needsUpdate = true;
        updatedRecord.black_player_id = playerId;
        updatedRecord.black_player_name = formattedMyName;
        updatedRecord.status = "active";
        setMyColor("b");
      } else {
        // Spectator seat
        setMyColor("spectator");
      }
    }

    if (needsUpdate) {
      try {
        const { data, error } = await supabase
          .from("games")
          .update({
            white_player_id: updatedRecord.white_player_id,
            white_player_name: updatedRecord.white_player_name,
            black_player_id: updatedRecord.black_player_id,
            black_player_name: updatedRecord.black_player_name,
            status: updatedRecord.status,
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setGameRecord(data);
          setChessGame(new Chess(data.fen));
          if (channelRef.current) {
            channelRef.current.send({
              type: "broadcast",
              event: "game_update",
              payload: data
            });
          }
        }
      } catch (err) {
        console.error("Error setting game players:", err);
      }
    } else {
      setGameRecord(record);
      setChessGame(new Chess(record.fen));
    }
  };

  const loadGameData = async () => {
    if (!id || !myPlayerId) return;

    try {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setErrorMessage("This chess room does not exist.");
        setIsLoading(false);
        return;
      }

      await syncPlayerSlot(data, myPlayerId, myNickname);
      // Consume and clear the temporary matchmaking flag
      if (typeof window !== "undefined") {
        localStorage.setItem("gml_active_matchmaking", "false");
      }
    } catch (err: any) {
      console.error("Error loading chess game details:", err);
      setErrorMessage("Could not load chess match information.");
    } finally {
      setIsLoading(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("gml_page_ready"));
      }
    }
  };

  // Clock Initialization
  useEffect(() => {
    if (!gameRecord || timerInitialized) return;
    const hostParsed = parsePlayerName(gameRecord.white_player_name || "");
    const settings = getTimerSettings(hostParsed.mode || "blitz");
    setWhiteTime(settings.base * 1000);
    setBlackTime(settings.base * 1000);
    setTimerInitialized(true);
  }, [gameRecord, timerInitialized]);

  // Live Timer Countdown Effect
  const activeTurn = chessGame?.turn() || "w";
  const matchActive = gameRecord?.status === "active";

  const handleTimeout = useCallback(async (lostColor: "w" | "b") => {
    if (!gameRecord || gameRecord.status !== "active") return;
    if (myColor === "spectator") return;
    if (timeoutTriggeredRef.current) return;
    timeoutTriggeredRef.current = true;

    const winnerColor = lostColor === "w" ? "Black" : "White";
    const winnerSide = lostColor === "w" ? "b" : "w";
    const winnerId = lostColor === "w" ? gameRecord.black_player_id : gameRecord.white_player_id;
    const resultVal = lostColor === "w" ? "0-1" : "1-0";

    const updated = {
      ...gameRecord,
      status: "finished" as const,
      winner_id: winnerId,
      winner: winnerSide,
      result: resultVal,
      result_reason: "timeout"
    };

    setGameRecord(updated);

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "game_update",
        payload: updated
      });
    }

    try {
      await supabase
        .from("games")
        .update({
          status: "finished",
          winner_id: winnerId,
          winner: winnerSide,
          result: resultVal,
          result_reason: "timeout",
          last_move_at: new Date().toISOString()
        })
        .eq("id", id);

      alert(`Time out! ${winnerColor} wins on time.`);
    } catch (e) {
      console.error("Failed to post timeout game over:", e);
    }
  }, [gameRecord, myColor, id, supabase]);

  useEffect(() => {
    if (!matchActive || !chessGame) return;

    const interval = setInterval(() => {
      const turn = chessGame.turn();
      if (turn === "w") {
        setWhiteTime((prev) => {
          const next = prev - 1000;
          if (next <= 0) {
            handleTimeout("w");
            return 0;
          }
          return next;
        });
      } else {
        setBlackTime((prev) => {
          const next = prev - 1000;
          if (next <= 0) {
            handleTimeout("b");
            return 0;
          }
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [matchActive, chessGame, handleTimeout]);

  // Load initial data once when myPlayerId/chessGame hydrated
  useEffect(() => {
    if (!myPlayerId || !chessGame) return;
    loadGameData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, myPlayerId]);

  const processGameRecordUpdate = useCallback((updated: GameRecord) => {
    if (updated.status === "active") {
      timeoutTriggeredRef.current = false;
    }
    
    // Clear viewing index to sync board position to live view immediately
    setViewingMoveIndex(null);

    setGameRecord((prevRecord) => {
      if (!prevRecord) return updated;
      const merged = { ...prevRecord, ...updated };

      const prevMovesLength = prevRecord.moves?.length || 0;
      const newMovesLength = merged.moves?.length || 0;

      if (newMovesLength > prevMovesLength) {
        // Sync times from database clocks if they exist
        let clockedW = false;
        let clockedB = false;

        if (merged.white_clocks && merged.white_clocks.length >= newMovesLength) {
          const savedW = merged.white_clocks[newMovesLength - 1];
          if (typeof savedW === "number") {
            setWhiteTime(savedW);
            clockedW = true;
          }
        }
        if (merged.black_clocks && merged.black_clocks.length >= newMovesLength) {
          const savedB = merged.black_clocks[newMovesLength - 1];
          if (typeof savedB === "number") {
            setBlackTime(savedB);
            clockedB = true;
          }
        }

        if (!clockedW || !clockedB) {
          const hostParsed = parsePlayerName(merged.white_player_name || "");
          const modeSettings = getTimerSettings(hostParsed.mode || "blitz");
          const incMs = modeSettings.increment * 1000;

          // Which player completed the move: odd count is White, even count is Black
          const completedTurn = newMovesLength % 2 === 1 ? 'w' : 'b';
          if (completedTurn !== myColor) {
            if (completedTurn === 'w' && !clockedW) {
              setWhiteTime((prev) => prev + incMs);
            } else if (completedTurn === 'b' && !clockedB) {
              setBlackTime((prev) => prev + incMs);
            }
          }
        }
      }
      return merged;
    });

    if (updated.fen) {
      setChessGame(new Chess(updated.fen));
    }
  }, [myColor]);

  // Main real-time subscription model
  useEffect(() => {
    if (!id || !myPlayerId) return;

    // Subscribe to gameplay real-time channel for move, chat and timer synchronization
    const channel = supabase
      .channel(`game-room-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          processGameRecordUpdate(payload.new as GameRecord);
        }
      )
      .on(
        "broadcast",
        { event: "game_update" },
        (payload) => {
          processGameRecordUpdate(payload.payload as GameRecord);
        }
      )
      .on(
        "broadcast",
        { event: "chat" },
        (payload) => {
          const incoming = payload.payload as ChatMessage;
          setChatMessages((prev) => {
            if (prev.some(m => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .on(
        "broadcast",
        { event: "timer_pulse" },
        (payload) => {
          const { whiteTime: wTime, blackTime: bTime } = payload.payload;
          setWhiteTime(wTime);
          setBlackTime(bTime);
        }
      )
      .on(
        "broadcast",
        { event: "presence_heartbeat" },
        (payload) => {
          const { playerId, color, avatarConfig } = payload.payload;
          if (playerId !== myPlayerId) {
            opponentLastActiveRef.current = Date.now();
            if (color === "w") {
              setWhiteAvatarConfig(avatarConfig);
            } else if (color === "b") {
              setBlackAvatarConfig(avatarConfig);
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [id, myPlayerId, myColor, processGameRecordUpdate, supabase]);

  // Periodic fallback backup database poller for bullet/blitz/rapid online alignment
  useEffect(() => {
    if (!id || !myPlayerId || !gameRecord) return;
    if (gameRecord.status === "finished" || gameRecord.status === "draw") return;

    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("games")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const localMoves = gameRecord.moves || [];
          const remoteMoves = data.moves || [];
          
          if (remoteMoves.length !== localMoves.length || data.fen !== gameRecord.fen || data.status !== gameRecord.status) {
            processGameRecordUpdate(data);
          }
        }
      } catch (e) {
        console.error("Polled sync error:", e);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [id, myPlayerId, gameRecord, processGameRecordUpdate, supabase]);

  // System Chat broadcast helper
  const sendSystemChatMessage = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "System",
      senderId: "system",
      text: text,
      color: "spectator",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setChatMessages((prev) => [...prev, msg]);
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload: msg
      });
    }
  }, [myPlayerId]);

  // Handle victory on abandonment
  const handleAbandonmentVictory = useCallback(async () => {
    if (!gameRecord || gameRecord.status !== "active") return;
    try {
      const oppColorName = myColor === 'w' ? "Black" : "White";
      const winnerSide = myColor; // 'w' or 'b'
      const resultVal = myColor === 'w' ? '1-0' : '0-1';
      await supabase
        .from("games")
        .update({
          status: "finished",
          winner_id: myPlayerId,
          winner: winnerSide || undefined,
          result: resultVal,
          result_reason: "abandonment"
        })
        .eq("id", id);
      
      const updated = {
        ...gameRecord,
        status: "finished" as const,
        winner_id: myPlayerId,
        winner: winnerSide || gameRecord.winner,
        result: resultVal,
        result_reason: "abandonment"
      };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }

      sendSystemChatMessage("Opponent abandoned. Match won by abandonment.");
      alert(`The opponent (${oppColorName}) abandoned the match! You win by abandonment.`);
    } catch (e) {
      console.error("Failed to apply abandonment victory:", e);
    }
  }, [gameRecord, myColor, myPlayerId, id, supabase, sendSystemChatMessage]);

  // Local user avatar synchronizer
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadAndSetLocalAvatar = () => {
      const saved = localStorage.getItem("gml_avatar_config");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (myColor === "w") {
            setWhiteAvatarConfig(parsed);
          } else if (myColor === "b") {
            setBlackAvatarConfig(parsed);
          }
        } catch {}
      }
    };

    loadAndSetLocalAvatar();
    window.addEventListener("gml_avatar_updated", loadAndSetLocalAvatar);
    return () => window.removeEventListener("gml_avatar_updated", loadAndSetLocalAvatar);
  }, [myColor]);

  // Heartbeat transmitter
  useEffect(() => {
    if (!matchActive || myColor === "spectator") return;

    // Send initial heartbeat immediately
    const sendHeartbeat = () => {
      if (channelRef.current) {
        const saved = localStorage.getItem("gml_avatar_config");
        let avatarConfig = null;
        if (saved) {
          try { avatarConfig = JSON.parse(saved); } catch {}
        }
        channelRef.current.send({
          type: "broadcast",
          event: "presence_heartbeat",
          payload: { playerId: myPlayerId, color: myColor, avatarConfig }
        });
      }
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 3050);

    return () => clearInterval(heartbeatInterval);
  }, [matchActive, myColor, myPlayerId]);

  // Heartbeat checker & Abandonment alarm countdown
  useEffect(() => {
    if (!matchActive || myColor === "spectator") {
      setOpponentOnline(true);
      setAbandonmentCountdown(15);
      return;
    }

    // Set a startup grace period
    opponentLastActiveRef.current = Date.now() + 1500;

    const checkInterval = setInterval(() => {
      const elapsedSeconds = (Date.now() - opponentLastActiveRef.current) / 1000;
      
      if (elapsedSeconds > 8.5) {
        setOpponentOnline(false);
        setAbandonmentCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(checkInterval);
            handleAbandonmentVictory();
            return 0;
          }
          return prev - 1;
        });
      } else {
        setOpponentOnline(true);
        setAbandonmentCountdown(15);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [matchActive, myColor, handleAbandonmentVictory]);

  // 5. Piece movement action on drop
  const makeAMove = (move: { from: string; to: string; promotion?: string }) => {
    if (!chessGame || !gameRecord) return false;

    try {
      const newGame = new Chess();
      let rebuiltFromHistory = true;

      try {
        for (const san of gameRecord.moves || []) {
          newGame.move(san);
        }
      } catch {
        rebuiltFromHistory = false;
        newGame.load(chessGame.fen());
      }
      
      const res = newGame.move(move);
      if (res) {
        // Calculate increment
        const hostParsed = parsePlayerName(gameRecord.white_player_name || "");
        const modeSettings = getTimerSettings(hostParsed.mode || "blitz");
        const incMs = modeSettings.increment * 1000;

        let nextWhiteTime = whiteTime;
        let nextBlackTime = blackTime;
        const currentTurn = chessGame.turn(); // Turn before the move is processed on server

        if (currentTurn === "w") {
          nextWhiteTime += incMs;
          setWhiteTime(nextWhiteTime);
        } else {
          nextBlackTime += incMs;
          setBlackTime(nextBlackTime);
        }

        const currentKey = newGame.fen().split(' ').slice(0, 4).join(' ');

        const historyGame = new Chess();
        const positionCounts: Record<string, number> = {};
        const addPosition = () => {
          const key = historyGame.fen().split(' ').slice(0, 4).join(' ');
          positionCounts[key] = (positionCounts[key] || 0) + 1;
        };
        addPosition();
        if (rebuiltFromHistory) {
          for (const san of [...(gameRecord.moves || []), res.san]) {
            try {
              historyGame.move(san);
              addPosition();
            } catch {
              break;
            }
          }
        }
        const isThreefold = (positionCounts[currentKey] || 0) >= 3;

        // Determine if target state closes the game
        let nextStatus: GameRecord["status"] = "active";
        let winnerSide: "w" | "b" | null = null;
        let winnerId: string | null = null;
        let resultVal: string | null = null;
        let resultReason: string | null = null;

        if (newGame.isGameOver() || isThreefold) {
          if (newGame.isCheckmate()) {
            nextStatus = "finished";
            winnerSide = newGame.turn() === "w" ? "b" : "w";
            winnerId = winnerSide === "w" ? gameRecord.white_player_id : gameRecord.black_player_id;
            resultVal = winnerSide === "w" ? "1-0" : "0-1";
            resultReason = "checkmate";
          } else {
            nextStatus = "draw";
            resultVal = "1/2-1/2";
            resultReason = isThreefold ? "threefold" : "draw";
          }
        }

        const nextWhiteClocks = [...(gameRecord.white_clocks || []), nextWhiteTime];
        const nextBlackClocks = [...(gameRecord.black_clocks || []), nextBlackTime];

        const updated: GameRecord = {
          ...gameRecord,
          fen: newGame.fen(),
          moves: [...(gameRecord.moves || []), res.san],
          status: nextStatus,
          winner: winnerSide || gameRecord.winner,
          winner_id: winnerId || gameRecord.winner_id,
          result: resultVal || gameRecord.result,
          result_reason: resultReason || gameRecord.result_reason,
          white_clocks: nextWhiteClocks,
          black_clocks: nextBlackClocks,
        };

        // Update local state validation synchronously and optimistically
        setChessGame(newGame);
        setGameRecord(updated);
        setViewingMoveIndex(null); // Return to live position

        // Broadcast updated game record immediately to the other player
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "game_update",
            payload: updated
          });
          channelRef.current.send({
            type: "broadcast",
            event: "timer_pulse",
            payload: { whiteTime: nextWhiteTime, blackTime: nextBlackTime }
          });
        }

        // Send backend update to Supabase in the background
        supabase
          .from("games")
          .update({
            fen: newGame.fen(),
            moves: updated.moves,
            status: nextStatus,
            winner: winnerSide || undefined,
            winner_id: winnerId || undefined,
            result: resultVal || undefined,
            result_reason: resultReason || undefined,
            last_move_at: new Date().toISOString(),
            white_clocks: nextWhiteClocks,
            black_clocks: nextBlackClocks,
          })
          .eq("id", id)
          .then(({ error }) => {
            if (error) {
              console.error("Err pushing move update to table:", error);
            }
          });

        return true;
      }
    } catch (e) {
      console.error("Error making chess move:", e);
      return false;
    }
    return false;
  };

  const handleStartGameReview = () => {
    if (!gameRecord) return;
    const moves = gameRecord.moves || [];

    const tempChess = new Chess();
    const movesForReview = moves.map((san) => {
      try {
        tempChess.move(san);
        return {
          san,
          fen: tempChess.fen(),
          evalBefore: 0,
          evalAfter: 0,
          isMate: false,
          cpLoss: 0,
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    sessionStorage.setItem('raw_game_moves', JSON.stringify(movesForReview));
    localStorage.setItem('raw_game_moves', JSON.stringify(movesForReview));
    sessionStorage.setItem('review_player_white', gameRecord.white_player_name || 'White');
    sessionStorage.setItem('review_player_black', gameRecord.black_player_name || 'Black');
    sessionStorage.setItem('review_is_online', 'true');
    
    router.push('/review-loading');
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    if (!gameRecord || !chessGame) return false;

    // Guard 3: Validate relative player turn - MUST BE FIRST (silent, snap piece back)
    const currentTurn = chessGame.turn() === "w" ? "w" : "b";
    if (myColor !== currentTurn) {
      return false;
    }

    // Guard 1: Game must be in active status to play moves
    if (gameRecord.status === "waiting") {
      alert("Waiting for an opponent to join the room!");
      return false;
    }
    if (gameRecord.status === "finished" || gameRecord.status === "draw") {
      alert("This match has excitingly concluded. Play another one!");
      return false;
    }

    // Guard 2: Spectators cannot move pieces
    if (myColor === "spectator") {
      alert("You are a spectator and cannot move pieces.");
      return false;
    }

    // Guard 4: Validate positions are decided and different
    const isWhiteDecided = !!gameRecord.white_player_id;
    const isBlackDecided = !!gameRecord.black_player_id;
    if (!isWhiteDecided || !isBlackDecided) {
      alert("Matches can only be played once both player positions are decided.");
      return false;
    }
    if (gameRecord.white_player_id === gameRecord.black_player_id) {
      alert("The positions of the two players must be different.");
      return false;
    }

    const moves = chessGame.moves({ square: sourceSquare as any, verbose: true });
    const isPromotion = moves.some(m => m.to === targetSquare && m.flags.includes('p'));

    if (isPromotion) {
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      return true;
    }

    return makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q", // default promote to queen
    });
  };

  // Click-to-Move options helper
  function getMoveOptions(square: string) {
    if (!chessGame) return false;
    const moves = chessGame.moves({
      square: square as any,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, any> = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          chessGame.get(move.to as any) && chessGame.get(move.to as any)?.color !== chessGame.get(square as any)?.color
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

  // Click-to-Move custom callback handler
  function onSquareClick(square: string) {
    if (!gameRecord || !chessGame) return;

    if (viewingMoveIndex !== null) {
      alert("Please return to the live position to play moves.");
      return;
    }

    // Guard 3: Validate relative player turn - MUST BE FIRST (silent click inactivator)
    const currentTurn = chessGame.turn() === "w" ? "w" : "b";
    if (myColor !== currentTurn) {
      return;
    }

    // Guard 1: Game must be in active status to play moves
    if (gameRecord.status === "waiting") {
      alert("Waiting for an opponent to join the room!");
      return;
    }
    if (gameRecord.status === "finished" || gameRecord.status === "draw") {
      alert("This match has excitingly concluded. Play another one!");
      return;
    }

    // Guard 2: Spectators cannot move pieces
    if (myColor === "spectator") {
      alert("You are a spectator and cannot move pieces.");
      return;
    }

    // Guard 4: Validate positions are decided and different
    const isWhiteDecided = !!gameRecord.white_player_id;
    const isBlackDecided = !!gameRecord.black_player_id;
    if (!isWhiteDecided || !isBlackDecided) {
      alert("Matches can only be played once both player positions are decided.");
      return;
    }
    if (gameRecord.white_player_id === gameRecord.black_player_id) {
      alert("The positions of the two players must be different.");
      return;
    }

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

    const moves = chessGame.moves({ square: moveFrom as any, verbose: true });
    const isPromotion = moves.some(m => m.to === square && m.flags.includes('p'));

    if (isPromotion) {
      setPendingPromotion({ from: moveFrom, to: square });
      return;
    }

    const moveSuccess = makeAMove({
      from: moveFrom,
      to: square,
      promotion: 'q',
    });

    if (!moveSuccess) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    } else {
      setMoveFrom(null);
      setOptionSquares({});
    }
  }

  // Handle promotion modal selection close
  function handlePromotionSelect(piece: string) {
    if (pendingPromotion) {
      makeAMove({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: piece,
      });
      setPendingPromotion(null);
      setMoveFrom(null);
      setOptionSquares({});
    }
  }

  // 6. Request Grandmaster AI Lens position analytical commentary
  const handleRequestAiCommentary = async () => {
    if (!chessGame || !gameRecord) return;
    setIsAiLoading(true);
    setAiCommentary("");

    try {
      const response = await fetch("/api/gemini/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fen: chessGame.fen(),
          moves: gameRecord.moves || [],
          playerColor: myColor === "w" ? "White" : myColor === "b" ? "Black" : "Spectator",
        }),
      });

      const data = await response.json();
      if (data.error) {
        setAiCommentary(`Lens Error: ${data.error}`);
      } else {
        setAiCommentary(data.commentary);
      }
    } catch (err: any) {
      setAiCommentary("Failed to obtain commentary. Please retry.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // 7. Restart game room settings
  const handleResetGame = async () => {
    if (!gameRecord) return;
    if (myColor === "spectator") {
      alert("Only active players can reset the match board.");
      return;
    }

    if (!confirm("Are you sure you want to reset this game state to the starting position?")) {
      return;
    }

    try {
      const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      if (chessGame) {
        chessGame.load(initialFen);
      }
      timeoutTriggeredRef.current = false;

      const hostParsed = parsePlayerName(gameRecord.white_player_name || "");
      const modeSettings = getTimerSettings(hostParsed.mode || "blitz");
      const baseMs = modeSettings.base * 1000;

      await supabase
        .from("games")
        .update({
          fen: initialFen,
          moves: [],
          status: "active",
          last_move_at: new Date().toISOString(),
          white_clocks: [],
          black_clocks: [],
        })
        .eq("id", id);
        
      setMoveFrom(null);
      setOptionSquares({});
      setWhiteTime(baseMs);
      setBlackTime(baseMs);

      const updated: GameRecord = {
        ...gameRecord,
        fen: initialFen,
        moves: [],
        status: "active" as const,
        white_clocks: [],
        black_clocks: [],
      };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }
    } catch (err) {
      console.error("Error resetting match state:", err);
    }
  };

  // 8. Copy invite game uuid code
  const handleCopyCode = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 9. Chat submit action
  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: myNickname,
      senderId: myPlayerId,
      text: chatInput.trim(),
      color: myColor === "spectator" ? "spectator" : myColor,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, msg]);

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "chat",
        payload: msg
      });
    }

    setChatInput("");
  };

  // 9b. Draw & Resign actions
  const handleOfferDraw = async () => {
    if (!gameRecord || myColor === "spectator") return;
    try {
      await supabase
        .from("games")
        .update({
          draw_offer: myColor
        })
        .eq("id", id);

      const updated = { ...gameRecord, draw_offer: myColor };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }

      const senderName = myColor === "w" 
        ? parsePlayerName(gameRecord.white_player_name).username 
        : parsePlayerName(gameRecord.black_player_name).username;
      
      sendSystemChatMessage(`${senderName} offered a draw`);
    } catch (e) {
      console.error("Failed to offer draw:", e);
    }
  };

  const handleCancelDrawOffer = async () => {
    if (!gameRecord) return;
    try {
      await supabase
        .from("games")
        .update({
          draw_offer: null
        })
        .eq("id", id);
      
      const updated = { ...gameRecord, draw_offer: null };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }

      const senderName = myColor === "w" 
        ? parsePlayerName(gameRecord.white_player_name).username 
        : parsePlayerName(gameRecord.black_player_name).username;
      
      sendSystemChatMessage(`${senderName} cancelled the draw offer`);
    } catch (e) {
      console.error("Failed to cancel draw offer:", e);
    }
  };

  const handleAcceptDraw = async () => {
    if (!gameRecord) return;
    try {
      await supabase
        .from("games")
        .update({
          status: "draw",
          result: "1/2-1/2",
          result_reason: "agreement",
          draw_offer: null,
          last_move_at: new Date().toISOString()
        })
        .eq("id", id);

      const updated = { ...gameRecord, status: "draw" as const, result: "1/2-1/2", result_reason: "agreement", draw_offer: null };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }

      sendSystemChatMessage("The draw offer was accepted. Game ended in a Draw.");
    } catch (e) {
      console.error("Failed to accept draw:", e);
    }
  };

  const handleDeclineDraw = async () => {
    if (!gameRecord) return;
    try {
      await supabase
        .from("games")
        .update({
          draw_offer: null
        })
        .eq("id", id);

      const updated = { ...gameRecord, draw_offer: null };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }

      const declinerName = myColor === "w"
        ? parsePlayerName(gameRecord.white_player_name).username
        : parsePlayerName(gameRecord.black_player_name).username;

      sendSystemChatMessage(`${declinerName} declined a draw`);
    } catch (e) {
      console.error("Failed to decline draw:", e);
    }
  };

  const handleResign = async () => {
    if (!gameRecord || myColor === "spectator") return;
    if (typeof window === "undefined") return;
    const confirmResign = window.confirm("Are you sure you want to resign?");
    if (!confirmResign) return;

    try {
      const opponentId = myColor === "w" ? gameRecord.black_player_id : gameRecord.white_player_id;
      const myUsername = myColor === "w" ? parsePlayerName(gameRecord.white_player_name || "").username : parsePlayerName(gameRecord.black_player_name || "").username;

      const winnerSide = myColor === "w" ? "b" : "w";
      const resultVal = winnerSide === "w" ? "1-0" : "0-1";

      await supabase
        .from("games")
        .update({
          status: "finished",
          winner_id: opponentId,
          winner: winnerSide,
          result: resultVal,
          resigned_player_id: myPlayerId,
          result_reason: "resignation",
          last_move_at: new Date().toISOString()
        })
        .eq("id", id);

      const updated = {
        ...gameRecord,
        status: "finished" as const,
        winner_id: opponentId,
        winner: winnerSide,
        result: resultVal,
        resigned_player_id: myPlayerId,
        result_reason: "resignation"
      };
      setGameRecord(updated);

      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "game_update",
          payload: updated
        });
      }

      sendSystemChatMessage(`${myUsername} resigned. Match permanently declared lost.`);
    } catch (e) {
      console.error("Failed to resign game:", e);
    }
  };

  // Convert timer values representation text
  const formatTime = (ms: number) => {
    if (ms <= 0) return "0:00";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    
    if (totalSecs < 10) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${mins}:${secs.toString().padStart(2, "0")}.${tenths}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Render checks
  if (!isMounted) {
    return (
      <PageLoader 
        message="Booting Lens Node UI..." 
        submessage="Connecting securely to real-time rendering layers." 
      />
    );
  }

  if (isLoading) {
    return (
      <PageLoader 
        message="Synchronizing Multiplayer Session..." 
        submessage="Waiting for table parameters, active player clocks, and board states." 
      />
    );
  }

  if (errorMessage || !gameRecord || !chessGame) {
    return (
      <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center gap-4 text-center max-w-md mx-auto p-4">
        <AlertTriangle className="w-12 h-12 text-red-500" />
        <p className="text-slate-300 text-sm font-semibold">{errorMessage || "Invalid Match State ID."}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm flex items-center gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4" />
          Lobby Portal
        </button>
      </div>
    );
  }

  // Active game evaluation stats
  const myTurn = myColor === activeTurn;

  // Player Orientation Mapping (Opponent always displays on Top, Self always displays on Bottom)
  const isSpectating = myColor === "spectator";
  const bottomIsWhite = !isSpectating ? (myColor === "w") : true; // Spectators default to White on Bottom

  const getRecapClocks = () => {
    const isFinished = gameRecord?.status === "finished" || gameRecord?.status === "draw";
    if (!isFinished && viewingMoveIndex === null) {
      return { w: whiteTime, b: blackTime };
    }

    const totalMoves = gameRecord?.moves?.length || 0;
    const step = viewingMoveIndex !== null ? viewingMoveIndex : totalMoves;

    if (step === 0) {
      const hostParsed = parsePlayerName(gameRecord?.white_player_name || "");
      const settings = getTimerSettings(hostParsed.mode || "blitz");
      const baseMs = settings.base * 1000;
      return { w: baseMs, b: baseMs };
    }

    const fallbackW = whiteTime;
    const fallbackB = blackTime;

    const recordedW = gameRecord?.white_clocks?.[step - 1];
    const recordedB = gameRecord?.black_clocks?.[step - 1];

    return {
      w: typeof recordedW === "number" ? recordedW : fallbackW,
      b: typeof recordedB === "number" ? recordedB : fallbackB,
    };
  };

  const { w: currentWhiteTime, b: currentBlackTime } = getRecapClocks();

  // TOP CARD variables (Opponent)
  const topPlayerName = bottomIsWhite ? gameRecord.black_player_name : gameRecord.white_player_name;
  const topAvatarConfig = bottomIsWhite ? blackAvatarConfig : whiteAvatarConfig;
  const topFallbackText = bottomIsWhite ? (parsePlayerName(gameRecord.black_player_name).username[0]?.toUpperCase() || "B") : (parsePlayerName(gameRecord.white_player_name).username[0]?.toUpperCase() || "W");
  const topPlayerLabel = bottomIsWhite ? "Black Player" : "White Player (Host)";
  const topThinking = bottomIsWhite ? (activeTurn === "b") : (activeTurn === "w");
  const topTime = bottomIsWhite ? currentBlackTime : currentWhiteTime;

  // BOTTOM CARD variables (You)
  const bottomPlayerName = bottomIsWhite ? gameRecord.white_player_name : gameRecord.black_player_name;
  const bottomAvatarConfig = bottomIsWhite ? whiteAvatarConfig : blackAvatarConfig;
  const bottomFallbackText = bottomIsWhite ? (parsePlayerName(gameRecord.white_player_name).username[0]?.toUpperCase() || "W") : (parsePlayerName(gameRecord.black_player_name).username[0]?.toUpperCase() || "B");
  const bottomPlayerLabel = bottomIsWhite ? "White Player (Host)" : "Black Player";
  const bottomThinking = bottomIsWhite ? (activeTurn === "w") : (activeTurn === "b");
  const bottomTime = bottomIsWhite ? currentWhiteTime : currentBlackTime;

  // Precompute dynamic active FEN for display
  const displayedFen = viewingMoveIndex !== null && viewingMoveIndex >= 0 && viewingMoveIndex < moveHistoryFens.length 
    ? moveHistoryFens[viewingMoveIndex]
    : (chessGame?.fen() || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

  return (
    <div className="flex-1 w-full bg-[#090b11] flex flex-col xl:flex-row items-stretch min-h-screen xl:h-screen xl:max-h-screen xl:overflow-hidden overflow-y-auto overflow-x-hidden">
      
      {/* Mobile Tab Bar Selector */}
      <div className="xl:hidden flex bg-slate-950/90 border-b border-slate-900 shrink-0 select-none relative z-20">
        <button
          onClick={() => setActiveMobileTab("board")}
          className={cn(
            "flex-1 py-3 text-xs font-bold font-mono uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer",
            activeMobileTab === "board" 
              ? "border-sky-505 text-sky-400 bg-sky-550/5 border-sky-400" 
              : "border-transparent text-slate-500 hover:text-slate-350"
          )}
        >
          Board & Arena
        </button>
        <button
          onClick={() => setActiveMobileTab("info")}
          className={cn(
            "flex-1 py-3 text-xs font-bold font-mono uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer",
            activeMobileTab === "info" 
              ? "border-sky-505 text-sky-400 bg-sky-550/5 border-sky-400" 
              : "border-transparent text-slate-500 hover:text-slate-350"
          )}
        >
          Lens Commentary & Chat
        </button>
      </div>

      {/* LEFT CHESSBOARD STAGE COLUMN */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 w-full flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,rgba(14,165,233,0.06),transparent)] relative border-b xl:border-b-0 xl:border-r border-slate-900 min-h-0 xl:min-h-0",
          activeMobileTab === "board" ? "flex" : "hidden xl:flex"
        )}
      >
        {/* Opponent info card top of board */}
        <div className="w-full max-w-[540px] p-3 rounded-t-xl bg-slate-950 border-t border-x border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar 
              sizeClassName="h-7 w-7 rounded-md" 
              config={topAvatarConfig || { type: "text", text: topFallbackText }} 
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-100 flex items-center gap-1">
                {(() => {
                  const p = parsePlayerName(topPlayerName);
                  if (p.username === "Waiting...") return "Waiting...";
                  return (
                    <>
                      <span className="truncate max-w-[160px]">{p.username}</span>
                      <UserBadge username={p.username} size="sm" />
                      <span className="text-[10px] text-slate-450 font-normal">({p.rating})</span>
                    </>
                  );
                })()}
              </span>
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{topPlayerLabel}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {topThinking && matchActive && (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded animate-pulse">
                THINKING
              </span>
            )}
            <div className={`px-3 py-1 rounded text-sm font-mono font-black border ${
              topThinking && matchActive
                ? "bg-red-500/20 text-red-405 border-red-500/30 text-rose-400"
                : "bg-slate-900 text-slate-405 border-slate-850 text-slate-350"
            }`}>
              {formatTime(topTime)}
            </div>
          </div>
        </div>

        {/* Outer board neon glowing glass shadow container (Matched colors exactly to #2D343E and #444C56) */}
        <div 
          className="p-1.5 bg-slate-950/80 border border-slate-900/60 shadow-[0_0_50px_rgba(14,165,233,0.05)] rounded-b-none"
          style={{ width: boardWidth + 12 }}
        >
          <Chessboard
            position={displayedFen}
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            boardWidth={boardWidth}
            boardOrientation={myColor === "b" ? "black" : "white"}
            arePiecesDraggable={viewingMoveIndex === null && !isSpectating}
            customDarkSquareStyle={{ backgroundColor: "#2D343E" }}
            customLightSquareStyle={{ backgroundColor: "#444C56" }}
            customSquareStyles={optionSquares}
            customBoardStyle={{
              borderRadius: "4px",
              boxShadow: "0 5px 15px rgba(0, 0, 0, 0.5)",
            }}
            animationDuration={200}
          />
        </div>

        {/* Self player info card bottom of board */}
        <div className="w-full max-w-[540px] p-3 rounded-b-xl bg-slate-950 border-b border-x border-slate-900 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Avatar 
              sizeClassName="h-7 w-7 rounded-md" 
              config={bottomAvatarConfig || { type: "text", text: bottomFallbackText }} 
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-100 flex items-center gap-1">
                {(() => {
                  const p = parsePlayerName(bottomPlayerName);
                  if (p.username === "Waiting...") return "Waiting...";
                  return (
                    <>
                      <span className="truncate max-w-[160px]">{p.username}</span>
                      <UserBadge username={p.username} size="sm" />
                      <span className="text-[10px] text-slate-450 font-normal">({p.rating})</span>
                    </>
                  );
                })()}
              </span>
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{bottomPlayerLabel}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {bottomThinking && matchActive && (
              <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded animate-pulse">
                THINKING
              </span>
            )}
            <div className={`px-3 py-1 rounded text-sm font-mono font-black border ${
              bottomThinking && matchActive
                ? "bg-red-500/20 text-red-405 border-red-500/30 text-rose-400"
                : "bg-slate-900 text-slate-405 border-slate-850 text-slate-350"
            }`}>
              {formatTime(bottomTime)}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR PANEL: MOVES LIST & CHAT ROOM */}
      <div className={cn(
        "w-full xl:w-[420px] h-full xl:h-screen bg-slate-950 border-t xl:border-t-0 xl:border-l border-slate-900 p-4 md:p-5 flex flex-col justify-between gap-4 overflow-hidden xl:overflow-hidden min-h-0 shrink-0",
        activeMobileTab === "info" ? "flex" : "hidden xl:flex"
      )}>
        
        {/* UPPER PANEL: Match Info & Live Moves list */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 xl:min-h-0 overflow-hidden">

          <button
            onClick={() => setShowGameInfoModal(true)}
            className="w-full py-2 bg-slate-900 border border-slate-850 rounded-lg text-xs font-bold text-sky-450 hover:text-sky-400 hover:bg-slate-850 flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer uppercase font-mono shadow-sm shrink-0"
          >
            <Info className="w-3.5 h-3.5" />
            View Game Info
          </button>
          
          {/* Match Info & Invite Code UI - REMOVED after finished matchmaking (once status !== 'waiting') */}
          {gameRecord.status === "waiting" && (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-900 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Invite Code:</span>
                <button
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? "COPIED" : "COPY CODE"}
                </button>
              </div>
              <input
                type="text"
                readOnly
                value={id}
                className="w-full bg-slate-950/80 px-2.5 py-1.5 border border-slate-900 rounded font-mono text-[10px] text-slate-400 focus:outline-none"
              />
            </div>
          )}

          {/* Gameplay Status Alerts */}
          <div className="flex flex-col gap-2 shrink-0">
            {!matchActive && gameRecord.status === "waiting" && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-400 leading-normal font-mono">
                <Users className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Waiting for a player to join. Share the invite code above to start!
                </span>
              </div>
            )}

            {/* Abandonment / Disconnected banner */}
            {!opponentOnline && matchActive && (
              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex flex-col gap-2 animate-pulse font-mono animate-in fade-in duration-300">
                <div className="flex items-center gap-2 text-xs text-orange-400 font-bold uppercase">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-orange-400" />
                  <span>Opponent Disconnected!</span>
                </div>
                <div className="text-[11px] text-slate-350 leading-relaxed">
                  Waiting for opponent to reconnect. You will automatically claim victory in <strong className="text-orange-400 font-black text-sm">{abandonmentCountdown}s</strong>.
                </div>
              </div>
            )}
            
            {gameRecord.draw_offer && gameRecord.draw_offer === myColor && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-400 font-mono animate-in fade-in duration-300">
                <span className="flex items-center gap-1.5 leading-none">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin-slow shrink-0" />
                  Draw offer sent. Waiting...
                </span>
                <button
                  onClick={handleCancelDrawOffer}
                  className="px-2 py-1 text-[10px] text-red-400 bg-red-950/20 hover:bg-red-950/40 border border-red-950/30 rounded font-semibold transition-all cursor-pointer"
                >
                  CANCEL
                </button>
              </div>
            )}

            {/* Accept Draw Challenge Banner - displayed beautifully above the Move History and playable */}
            {gameRecord.draw_offer && gameRecord.draw_offer !== myColor && myColor !== "spectator" && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 animate-in border-amber-550/20 duration-300">
                <span className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5 uppercase tracking-wide leading-none select-none">
                  <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin-slow" />
                  Accept Draw?
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleAcceptDraw}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 hover:scale-103 text-white text-[10px] font-black font-mono rounded cursor-pointer transition-all uppercase tracking-wide"
                  >
                    Yes
                  </button>
                  <button
                    onClick={handleDeclineDraw}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 hover:scale-103 text-white text-[10px] font-black font-mono rounded cursor-pointer transition-all uppercase tracking-wide"
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {gameRecord.status === "finished" && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-col gap-1.5 text-xs text-emerald-400 leading-normal font-mono animate-in fade-in duration-300">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4.5 h-4.5 shrink-0 mt-0.5 text-emerald-400" />
                  <div className="flex flex-col">
                    {(() => {
                      const resignedPlayerId = gameRecord.resigned_player_id;
                      const winnerId = gameRecord.winner_id;
                      
                      if (resignedPlayerId) {
                        const isIWon = myColor !== "spectator" && winnerId === myPlayerId;
                        const winnerColorName = resignedPlayerId === gameRecord.white_player_id ? "Black" : "White";
                        
                        return (
                          <>
                            <span className="font-black text-sm uppercase tracking-wider block mb-0.5">
                              {isIWon ? "You won!" : `${winnerColorName} won`}
                            </span>
                            <span className="text-[11px] text-emerald-500/80 font-medium">
                              by resignation
                            </span>
                          </>
                        );
                      } else if (gameRecord.result_reason === "timeout") {
                        const winnerColorName = winnerId === gameRecord.white_player_id ? "White" : "Black";
                        const isIWon = myColor !== "spectator" && winnerId === myPlayerId;
                        return (
                          <>
                            <span className="font-black text-sm uppercase tracking-wider block mb-0.5">
                              {isIWon ? "You won!" : `${winnerColorName} won`}
                            </span>
                            <span className="text-[11px] text-emerald-500/80 font-medium">
                              on time
                            </span>
                          </>
                        );
                      } else if (gameRecord.result_reason === "abandonment") {
                        const winnerColorName = winnerId === gameRecord.white_player_id ? "White" : "Black";
                        const isIWon = myColor !== "spectator" && winnerId === myPlayerId;
                        return (
                          <>
                            <span className="font-black text-sm uppercase tracking-wider block mb-0.5">
                              {isIWon ? "You won!" : `${winnerColorName} won`}
                            </span>
                            <span className="text-[11px] text-emerald-500/80 font-medium">
                              by abandonment
                            </span>
                          </>
                        );
                      } else {
                        const winnerColorName = chessGame.turn() === "w" ? "Black" : "White";
                        const isIWon = myColor !== "spectator" && chessGame.turn() !== myColor;
                        return (
                          <>
                            <span className="font-black text-sm uppercase tracking-wider block mb-0.5">
                              {isIWon ? "You won!" : `${winnerColorName} won`}
                            </span>
                            <span className="text-[11px] text-emerald-500/80 font-medium">
                              by checkmate
                            </span>
                          </>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}

            {gameRecord.status === "draw" && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col gap-1.5 text-xs text-amber-400 leading-normal font-mono animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-start gap-2.5">
                  <RefreshCw className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-500 animate-spin-slow" />
                  <div className="flex flex-col">
                    {gameRecord.result_reason === "agreement" ? (
                      <>
                        <span className="font-black text-sm uppercase tracking-wider block mb-0.5">Draw</span>
                        <span className="text-[11px] text-amber-500/80 font-medium whitespace-pre-line">
                          by agreement
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-sm uppercase tracking-wide block mb-0.5">Match Concluded as Draw</span>
                        <span className="text-[10px] text-slate-400 mt-1">
                          Reason: {
                            chessGame.isStalemate() ? "stalemate" :
                            currentPositionCount >= 3 || chessGame.isThreefoldRepetition() ? "threefold repetition" :
                            chessGame.isInsufficientMaterial() ? "insufficient material" :
                            "50-move rule"
                          }
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(gameRecord.status === "finished" || gameRecord.status === "draw") && (
              <div className="mt-1 p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start gap-2.5 text-xs text-sky-400 font-semibold font-mono leading-normal">
                  <Sparkles className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>
                    Deterministic game analysis matrix is ready. Let our engines review each ply accuracy!
                  </span>
                </div>
                <button
                  onClick={handleStartGameReview}
                  className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 font-mono"
                >
                  <Compass className="w-3.5 h-3.5" />
                  Run Game Review
                </button>
              </div>
            )}

            {matchActive && myColor !== "spectator" && (
              <div className="flex gap-2">
                <button
                  onClick={handleOfferDraw}
                  disabled={!!gameRecord.draw_offer}
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-bold text-amber-500 flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer uppercase font-mono shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  Offer Draw
                </button>
                <button
                  onClick={handleResign}
                  className="flex-1 py-2 bg-red-950/40 hover:bg-red-900/35 border border-red-900/40 hover:border-red-900/60 rounded-lg text-xs font-bold text-red-400 flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer uppercase font-mono shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  Resign
                </button>
              </div>
            )}

            {eloChange && (
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Elo Rating Adjustment</span>
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-black ${
                    eloChange.outcome === "win" 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" 
                      : eloChange.outcome === "loss" 
                      ? "bg-red-500/10 text-red-400 border border-red-500/25" 
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/25"
                  }`}>
                    {eloChange.outcome}
                  </span>
                </div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-xs text-slate-300 capitalize">{eloChange.type} Rating:</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-slate-450">{eloChange.oldRating}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-white font-black">{eloChange.newRating}</span>
                    <span className={`text-xs ml-1.5 font-black ${eloChange.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      ({eloChange.change >= 0 ? "+" : ""}{eloChange.change})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Moves History Tracker list - flex-1 min-h-0 so it expands and scrolls dynamically */}
          <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
            <span className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-1.5 uppercase font-display shrink-0 select-none">
              <Compass className="w-4 h-4 text-sky-500" />
              MOVE HISTORY
            </span>
            <div className="flex-1 min-h-0 relative border border-slate-900 bg-slate-950 rounded-xl overflow-hidden flex flex-col shadow-inner justify-between">
              <div className="grid grid-cols-[3rem_1fr_1fr] text-[10px] font-bold text-slate-500 px-4 py-2 uppercase border-b border-slate-900 shrink-0 bg-slate-900/20 select-none">
                <span>#</span>
                <span>White</span>
                <span>Black</span>
              </div>
              <div className="flex-1 overflow-y-auto p-1 text-xs">
                {!(gameRecord.moves) || gameRecord.moves.length === 0 ? (
                  <div className="text-slate-700 h-full flex items-center justify-center text-center text-[11px] py-10 font-mono">
                    No moves played yet.
                  </div>
                ) : (
                  <div className="space-y-0.5 px-1">
                    {(() => {
                      const movePairs = [];
                      for (let i = 0; i < gameRecord.moves.length; i += 2) {
                        movePairs.push({
                          white: gameRecord.moves[i],
                          black: gameRecord.moves[i + 1] || null,
                          whiteIdx: i + 1,
                          blackIdx: i + 2,
                          index: Math.floor(i / 2) + 1
                        });
                      }
                      return movePairs.map((pair, idx) => {
                        const isWhiteViewing = viewingMoveIndex === pair.whiteIdx;
                        const isBlackViewing = viewingMoveIndex === pair.blackIdx;

                        return (
                          <div key={idx} className="grid grid-cols-[3rem_1fr_1fr] items-center hover:bg-slate-800/20 transition-colors rounded-md py-0.5">
                            <div className="text-slate-600 font-mono text-[10px] px-4 font-bold select-none">{pair.index}.</div>
                            <div className="p-0.5 flex">
                              <button
                                onClick={() => {
                                  setViewingMoveIndex(pair.whiteIdx);
                                  setIsAutoPlaying(false);
                                }}
                                className={`text-left text-xs transition-all cursor-pointer font-mono ${
                                  isWhiteViewing
                                    ? "bg-sky-500/25 text-sky-400 font-black px-2 py-0.5 rounded border border-sky-500/20 flex-1 shadow-sm"
                                    : "hover:bg-slate-800 hover:text-white text-slate-300 px-2 py-0.5 rounded flex-1 font-semibold"
                                }`}
                              >
                                {pair.white}
                              </button>
                            </div>
                            <div className="p-0.5 flex">
                              {pair.black ? (
                                <button
                                  onClick={() => {
                                    setViewingMoveIndex(pair.blackIdx);
                                    setIsAutoPlaying(false);
                                  }}
                                  className={`text-left text-xs transition-all cursor-pointer font-mono ${
                                    isBlackViewing
                                      ? "bg-sky-500/25 text-sky-400 font-black px-2 py-0.5 rounded border border-sky-500/20 flex-1 shadow-sm"
                                      : "hover:bg-slate-800 hover:text-white text-slate-300 px-2 py-0.5 rounded flex-1 font-semibold"
                                  }`}
                                >
                                  {pair.black}
                                </button>
                              ) : (
                                <div className="flex-1" />
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Move Analysis Playback Controls row */}
              <div className="flex items-center justify-between border-t border-slate-900 bg-slate-950/60 p-2 gap-1 shrink-0 font-mono select-none">
                <button
                  onClick={() => {
                    setViewingMoveIndex(0);
                    setIsAutoPlaying(false);
                  }}
                  disabled={!(gameRecord?.moves) || gameRecord.moves.length === 0}
                  title="Start Position"
                  className="p-1.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded transition-all flex items-center justify-center cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" strokeWidth="2.5" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const totalMoves = gameRecord?.moves?.length || 0;
                    const currentIndex = viewingMoveIndex !== null ? viewingMoveIndex : totalMoves;
                    const nextIdx = Math.max(0, currentIndex - 1);
                    setViewingMoveIndex(nextIdx);
                    setIsAutoPlaying(false);
                  }}
                  disabled={!(gameRecord?.moves) || gameRecord.moves.length === 0}
                  title="Previous Move"
                  className="p-1.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded transition-all flex items-center justify-center cursor-pointer font-bold"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" strokeWidth="2.5" />
                  </svg>
                </button>
                <button
                  onClick={() => setIsAutoPlaying(prev => !prev)}
                  disabled={!(gameRecord?.moves) || gameRecord.moves.length === 0}
                  title={isAutoPlaying ? "Pause" : "Auto-Play"}
                  className="p-1.5 px-4.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-sky-400 hover:text-sky-350 disabled:opacity-30 disabled:pointer-events-none rounded transition-all flex items-center justify-center gap-1 cursor-pointer font-bold"
                >
                  {isAutoPlaying ? (
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 fill-current animate-pulse" viewBox="0 0 24 24">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    const totalMoves = gameRecord?.moves?.length || 0;
                    const currentIndex = viewingMoveIndex !== null ? viewingMoveIndex : totalMoves;
                    const nextIdx = Math.min(totalMoves, currentIndex + 1);
                    if (nextIdx === totalMoves) {
                      setViewingMoveIndex(null);
                    } else {
                      setViewingMoveIndex(nextIdx);
                    }
                    setIsAutoPlaying(false);
                  }}
                  disabled={!(gameRecord?.moves) || gameRecord.moves.length === 0}
                  title="Next Move"
                  className="p-1.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded transition-all flex items-center justify-center cursor-pointer font-bold"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" strokeWidth="2.5" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setViewingMoveIndex(null);
                    setIsAutoPlaying(false);
                  }}
                  disabled={viewingMoveIndex === null}
                  title="View Live Position"
                  className="p-1 px-3 bg-sky-950 hover:bg-sky-900 border border-sky-900 hover:border-sky-850 text-sky-400 hover:text-sky-300 disabled:opacity-30 disabled:pointer-events-none rounded text-[10px] font-black font-mono tracking-widest uppercase cursor-pointer"
                >
                  Live
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* MIDDLE PANEL: REAL TIME CHAT ROOM - shrink-0 with compact smaller height */}
        {!(gameRecord?.status === "finished" || gameRecord?.status === "draw") && (
          <div className="h-[170px] shrink-0 border-t border-slate-900 pt-3 flex flex-col gap-1.5 overflow-hidden">
            <span className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-1.5 uppercase font-display shrink-0 select-none">
              <MessageSquare className="w-4 h-4 text-sky-500" />
              LOBBY & MATCH CHAT
            </span>
            <div className="flex-1 flex flex-col bg-slate-950 border border-slate-900 rounded-xl overflow-hidden min-h-0">
              {/* Scroll messages window */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2 font-sans min-h-0">
                {chatMessages.length === 0 ? (
                  <div className="text-slate-500 h-full flex items-center justify-center text-center text-[10px] font-mono leading-none">
                    Lobby chat active. Send a message to get started!
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className="text-xs flex flex-col">
                        <div className="flex items-center gap-1 inline-flex select-none">
                          <span className={`font-mono text-[9px] uppercase font-black flex items-center gap-1 ${
                            msg.color === "w" ? "text-slate-400" : msg.color === "b" ? "text-amber-500" : "text-sky-400"
                          }`}>
                            <span>{msg.sender}</span>
                            {msg.sender !== "System" && <UserBadge username={msg.sender} size="sm" />}
                          </span>
                          <span className="text-[8px] font-mono text-slate-600">
                            {msg.timestamp}
                          </span>
                        </div>
                        <p className="text-slate-300 font-sans leading-relaxed break-words pl-1 border-l border-slate-800">
                          {msg.text}
                        </p>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>
              
              {/* Message input bar */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="p-1.5 border-t border-slate-900 flex items-center gap-1.5 shrink-0 bg-slate-950"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-slate-950 border border-slate-850 rounded px-2 py-0.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-sky-500/50 transition-all font-sans"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-1 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sky-450 hover:text-sky-400 disabled:bg-transparent disabled:text-slate-700 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Send className="w-3 h-3" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* BOTTOM PANEL: GRANDMASTER LENS AI POSITION COMMENTARY CARD - REMOVED TO PREVENT ADVICE/COACHING IN MATCHES */}
        {false && (
          <div className="pt-4 border-t border-slate-900 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest font-display">
                   GRANDMASTER LENS
                </h4>
              </div>
              
              <button
                onClick={handleRequestAiCommentary}
                disabled={isAiLoading}
                className="px-3 py-1 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-medium rounded text-[10px] tracking-wide uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                {isAiLoading ? (
                  <div className="w-2.5 h-2.5 border-1.5 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {isAiLoading ? "Analyzing..." : "Analyze Board"}
              </button>
            </div>

            <div className="h-44 bg-slate-900/35 border border-slate-900 rounded-xl p-3 text-xs text-slate-300 overflow-y-auto leading-relaxed relative font-sans">
              {isAiLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-500 font-mono text-[9px] uppercase">
                  <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  <p>Peering through the tactical lens...</p>
                </div>
              ) : aiCommentary ? (
                <div className="space-y-3 prose prose-invert select-text">
                  {aiCommentary.split("\n\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 px-6 gap-2 font-mono text-[10px]">
                  <Compass className="w-5 h-5 text-slate-800" />
                  <p>Click "Analyze Board" to have our AI Grandmaster assess the FEN coordinates and evaluate tactical lines.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* PAWN PROMOTION PICKER DIALOG */}
      <Dialog open={!!pendingPromotion} onOpenChange={(open) => !open && setPendingPromotion(null)}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white font-sans">
          <DialogHeader>
            <DialogTitle className="font-headline font-bold text-xl text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-400 animate-pulse" />
              Pawn Promotion
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-sans">
              Select the piece you'd like to promote your pawn into.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4 py-6 font-sans">
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('q')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white cursor-pointer"
            >
              <Crown className="w-8 h-8 text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-tighter font-mono">Queen</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('r')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white cursor-pointer"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-xl text-sky-450 font-mono">R</div>
              <span className="text-xs font-bold uppercase tracking-tighter font-mono">Rook</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('b')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white cursor-pointer"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-xl text-sky-455 font-mono">B</div>
              <span className="text-xs font-bold uppercase tracking-tighter font-mono">Bishop</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handlePromotionSelect('n')}
              className="flex flex-col gap-2 h-24 w-20 bg-slate-900 border-slate-800 hover:bg-sky-500/20 hover:border-sky-500 text-white cursor-pointer"
            >
              <div className="w-8 h-8 flex items-center justify-center font-bold text-xl text-sky-455 font-mono font-bold">N</div>
              <span className="text-xs font-bold uppercase tracking-tighter font-mono font-bold">Knight</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* GAME SCORE AND ELO INFO MODAL */}
      <Dialog open={showGameInfoModal} onOpenChange={setShowGameInfoModal}>
        <DialogContent className="bg-slate-950 border border-slate-900 text-slate-100 max-w-sm rounded-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              Game Rating Info
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1 font-sans">
              Rating updates use standard Elo mechanics based on player skill ratings.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2 font-mono text-xs text-slate-300">
            <div className="p-3 bg-slate-900/60 border border-slate-900 rounded-xl space-y-2">
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold">Outcome</span>
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold">Rating change example</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-emerald-400 flex items-center gap-1">Win</span>
                <span className="text-emerald-400">+10 ELO</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-amber-400 flex items-center gap-1">Draw</span>
                <span className="text-amber-400">+1 ELO</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-red-400 flex items-center gap-1">Lose</span>
                <span className="text-red-400">-3 ELO</span>
              </div>
            </div>
            
            <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-400 bg-sky-950/10 border border-sky-950/20 p-3 rounded-xl font-sans">
              <p>
                💡 <strong>How ELO works:</strong> Points are calculated depending on the rating difference between you and your opponent. Winning against a higher rated opponent grants more points, whereas losing to a lower rated opponent results in a larger loss.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-2 font-sans">
            <Button
              variant="outline"
              onClick={() => setShowGameInfoModal(false)}
              className="px-4 py-1.5 bg-slate-900 text-slate-300 hover:text-white border-slate-850 hover:bg-slate-850 text-xs rounded-lg cursor-pointer font-bold uppercase"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ACCEPT DRAW PROMPT MODAL */}
      <Dialog 
        open={!!(gameRecord?.draw_offer && gameRecord.draw_offer !== myColor && myColor !== "spectator")} 
        onOpenChange={(open) => {
          if (!open) {
            handleDeclineDraw();
          }
        }}
      >
        <DialogContent className="bg-slate-950 border border-slate-900 rounded-xl p-6 text-center max-w-sm flex flex-col items-center justify-center space-y-4 font-sans">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-full animate-pulse">
            <RefreshCw className="w-8 h-8 shrink-0" />
          </div>
          <DialogTitle className="text-lg font-black text-white font-mono uppercase tracking-wider">
            Accept Draw?
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 font-sans max-w-[250px]">
            Your opponent has offered a draw. Would you like to accept it?
          </DialogDescription>
          <div className="flex gap-4 w-full font-mono">
            <button
              onClick={handleAcceptDraw}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg transition-all cursor-pointer uppercase shadow-md hover:scale-103"
            >
              Yes
            </button>
            <button
              onClick={handleDeclineDraw}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-lg transition-all cursor-pointer uppercase shadow-md hover:scale-103"
            >
              No
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
