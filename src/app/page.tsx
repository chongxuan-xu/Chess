"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { 
  Play, 
  Sparkles, 
  Timer,
  Zap, 
  Flame, 
  Award,
  Crown,
  Search,
  Users,
  Compass,
  ChevronDown,
  ChevronUp,
  Sliders,
} from "lucide-react";
import { BulletIcon } from "@/components/chess/BulletIcon";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "@/hooks/use-toast";
import { getEloState, classifyCustomControl, parsePlayerName } from "@/lib/elo";
import { PageLoader } from "@/components/PageLoader";

export interface TimePreset {
  id: string;
  name: string;
  label: string;
  duration: string;
  type: "bullet" | "blitz" | "rapid";
  icon: any;
}

export const BULLET_PRESETS: TimePreset[] = [
  { id: "1m", name: "1m Bullet", label: "1 min", duration: "1+0", type: "bullet", icon: BulletIcon },
  { id: "1_1", name: "1|1 Bullet", label: "1 | 1", duration: "1+1", type: "bullet", icon: BulletIcon },
  { id: "2_1", name: "2|1 Bullet", label: "2 | 1", duration: "2+1", type: "bullet", icon: BulletIcon },
];

export const BLITZ_PRESETS: TimePreset[] = [
  { id: "3m", name: "3m Blitz", label: "3 min", duration: "3+0", type: "blitz", icon: Zap },
  { id: "3_2", name: "3|2 Blitz", label: "3 | 2", duration: "3+2", type: "blitz", icon: Zap },
  { id: "5m", name: "5m Blitz", label: "5 min", duration: "5+0", type: "blitz", icon: Zap },
];

export const RAPID_PRESETS: TimePreset[] = [
  { id: "10m", name: "10m Rapid", label: "10 min", duration: "10+0", type: "rapid", icon: Timer },
  { id: "10_5", name: "10|5 Rapid", label: "10 | 5", duration: "10+5", type: "rapid", icon: Timer },
  { id: "15_10", name: "15|10 Rapid", label: "15 | 10", duration: "15+10", type: "rapid", icon: Timer },
];

export const ALL_PRESETS = [...BULLET_PRESETS, ...BLITZ_PRESETS, ...RAPID_PRESETS];

export default function LobbyPage() {
  const router = useRouter();
  const { toast } = useJestToastSafe();
  const [nickname, setNickname] = useState("");
  const [userIdState, setUserIdState] = useState("");
  const [currentUser, setCurrentUser] = useState<{ username: string; email: string } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  // Sizing selection
  const [selectedPresetId, setSelectedPresetId] = useState("10m");
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeElapsed, setSearchTimeElapsed] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [showMoreTimeControls, setShowMoreTimeControls] = useState(false);
  const [customMin, setCustomMin] = useState("5");
  const [customSec, setCustomSec] = useState("0");
  const [customInc, setCustomInc] = useState("3");
  const [eloRatings, setEloRatings] = useState({ bullet: 1200, blitz: 1200, rapid: 1200 });
  const [hostedGameId, setHostedGameId] = useState<string | null>(null);
  const hostedGameIdRef = useRef<string | null>(null);

  const updateHostedGameId = (id: string | null) => {
    setHostedGameId(id);
    hostedGameIdRef.current = id;
  };

  useEffect(() => {
    const loadElo = () => {
      const state = getEloState();
      setEloRatings({
        bullet: state.bullet,
        blitz: state.blitz,
        rapid: state.rapid
      });
    };
    loadElo();
    window.addEventListener("gml_elo_updated", loadElo);
    return () => window.removeEventListener("gml_elo_updated", loadElo);
  }, []);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = getSupabase();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fallback toast utility
  function useJestToastSafe(): any {
    try {
      return useToast();
    } catch {
      return { toast: (props: any) => console.log("Toast:", props) };
    }
  }

  // Load nickname and user from Storage on mount
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gml_page_ready"));
      const savedUser = localStorage.getItem("gml_user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setCurrentUser(parsed);
          setNickname(parsed.username);
        } catch (e) {
          console.error(e);
        }
      } else {
        let guest = localStorage.getItem("gml_guest_name");
        if (!guest) {
          guest = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
          localStorage.setItem("gml_guest_name", guest);
        }
        setNickname(guest);
        localStorage.setItem("gml_nickname", guest);
      }

      let pid = localStorage.getItem("gml_player_id");
      if (!pid) {
        pid = crypto.randomUUID();
        localStorage.setItem("gml_player_id", pid);
      }
      setUserIdState(pid);
    }
  }, []);

  // Listen to custom authentication storage changes
  useEffect(() => {
    const handleSync = () => {
      const savedUser = localStorage.getItem("gml_user");
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setCurrentUser(parsed);
          setNickname(parsed.username);
        } catch (e) {
          console.error(e);
        }
      } else {
        setCurrentUser(null);
        let guest = localStorage.getItem("gml_guest_name");
        if (!guest) {
          guest = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
          localStorage.setItem("gml_guest_name", guest);
        }
        setNickname(guest);
        localStorage.setItem("gml_nickname", guest);
      }
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("gml_auth_change", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("gml_auth_change", handleSync);
    };
  }, []);

  const handleSaveNickname = (val: string) => {
    setNickname(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("gml_nickname", val);
    }
  };

  // Matchmaking stopwatch
  useEffect(() => {
    if (isSearching) {
      intervalRef.current = setInterval(() => {
        setSearchTimeElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSearchTimeElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSearching]);

  const checkForGame = async () => {
    let presetType: "bullet" | "blitz" | "rapid" = "blitz";
    
    if (selectedPresetId === "custom") {
      const mins = parseInt(customMin, 10) || 5;
      const secs = parseInt(customSec, 10) || 0;
      const totalSecs = mins * 60 + secs;
      presetType = classifyCustomControl(totalSecs);
    } else {
      const presetObj = ALL_PRESETS.find(p => p.id === selectedPresetId) || ALL_PRESETS[6];
      presetType = presetObj.type;
    }

    const currentId = hostedGameIdRef.current;

    try {
      if (!currentId) {
        // Step A: Look for an existing game with status='waiting'
        const { data: waitingGames, error: fetchError } = await supabase
          .from("games")
          .select("*")
          .eq("status", "waiting")
          .is("black_player_id", null)
          .order("created_at", { ascending: false })
          .limit(10);

        if (fetchError) throw fetchError;

        // Filter and verify that BOTH players are actively matchmaking
        // The host must have heartbeated (updated created_at) within the last 12 seconds
        const now = new Date();
        const activeGames = waitingGames ? waitingGames.filter((game) => {
          const isNotMe = game.white_player_id !== userIdState;
          const parsedHost = parsePlayerName(game.white_player_name);
          const isCorrectPreset = parsedHost.mode === presetType;
          
          const gameTime = new Date(game.created_at);
          const diffSeconds = (now.getTime() - gameTime.getTime()) / 1000;
          const isRecentHostHeartbeat = diffSeconds < 12; // Host must be actively polling

          return isNotMe && isCorrectPreset && isRecentHostHeartbeat;
        }) : [];

        const openGame = activeGames.length > 0 ? activeGames[0] : null;

        if (openGame) {
          const hostInfo = parsePlayerName(openGame.white_player_name);
          const currentElo = eloRatings[presetType] || 1200;
          const nameToUse = nickname || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
          const formattedMyName = `${nameToUse} (${currentElo}) [${presetType}]`;

          // Atomic check ensuring that we are the sole joiner
          const { data: joinedGame, error: joinError } = await supabase
            .from("games")
            .update({
              black_player_id: userIdState || crypto.randomUUID(),
              black_player_name: formattedMyName,
              status: "active",
              // Keep timestamp fresh for room load
              created_at: new Date().toISOString()
            })
            .eq("id", openGame.id)
            .is("black_player_id", null)
            .select()
            .maybeSingle();

          if (joinError) throw joinError;

          if (joinedGame) {
            toast({
              title: "Opponent Found!",
              description: `Joining match against ${hostInfo.username} (${hostInfo.rating})...`,
            });
            setIsSearching(false);
            updateHostedGameId(null); // CRITICAL: Clear to prevent unmount deletion
            router.push(`/game/${joinedGame.id}`);
            return true;
          }
        }

        // Step B: No waiting game exists yet. Host a game so others can find us, but wait at the waiting screen!
        const newGameId = crypto.randomUUID();
        const currentElo = eloRatings[presetType] || 1200;
        const nameToUse = nickname || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
        const formatName = `${nameToUse} (${currentElo}) [${presetType}]`;

        const { error: insertError } = await supabase
          .from("games")
          .insert([
            {
              id: newGameId,
              fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
              white_player_id: userIdState || crypto.randomUUID(),
              white_player_name: formatName,
              black_player_id: null,
              black_player_name: "Waiting...",
              status: "waiting",
              moves: [],
              created_at: new Date().toISOString()
            }
          ]);

        if (insertError) throw insertError;
        updateHostedGameId(newGameId);
      } else {
        // Step C: We already hosted the game. Check if someone joined it!
        // First, update heartbeat to show we are actively matchmaking
        await supabase
          .from("games")
          .update({
            created_at: new Date().toISOString()
          })
          .eq("id", currentId);

        const { data: myGame, error: gameError } = await supabase
          .from("games")
          .select("*")
          .eq("id", currentId)
          .maybeSingle();

        if (gameError) throw gameError;

        if (myGame && (myGame.black_player_id || myGame.status === "active")) {
          const blackParsed = parsePlayerName(myGame.black_player_name || "");
          toast({
            title: "Opponent Connected!",
            description: `Player ${blackParsed.username || "Anonymous"} (${blackParsed.rating || 1200}) joined. Good luck!`,
          });
          setIsSearching(false);
          updateHostedGameId(null); // CRITICAL: Clear to prevent unmount deletion
          router.push(`/game/${myGame.id}`);
          return true;
        }
      }
    } catch (err: any) {
      console.error("Matchmaking process failed:", err);
    }
    return false;
  };

  // Matchmaking polling logic
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (isSearching) {
      // Check immediately
      checkForGame();

      // Poll periodically
      pollInterval = setInterval(() => {
        checkForGame();
      }, 2500);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isSearching, selectedPresetId, customMin, customSec, customInc, currentUser, userIdState]);

  // Cleanup matchmaking game space on unmount
  useEffect(() => {
    return () => {
      const currentId = hostedGameIdRef.current;
      if (currentId) {
        getSupabase()
          .from("games")
          .delete()
          .eq("id", currentId)
          .eq("status", "waiting")
          .then(({ error }) => {
            if (error) console.error("Error cleaning up matchmaking game on unmount:", error);
          });
      }
    };
  }, []);

  // Actual matchmaking trigger!
  const handleStartMatchmaking = async () => {
    updateHostedGameId(null);
    if (typeof window !== "undefined") {
      localStorage.setItem("gml_active_matchmaking", "true");
    }
    setIsSearching(true);
    toast({
      title: "Entering Match Queue",
      description: "Searching for active chess lobbies...",
    });
  };

  const handleCancelMatchmaking = async () => {
    setIsSearching(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("gml_active_matchmaking", "false");
    }
    const currentId = hostedGameIdRef.current;
    if (currentId) {
      updateHostedGameId(null);
      try {
        await supabase
          .from("games")
          .delete()
          .eq("id", currentId);
      } catch (e) {
        console.error("Failed to delete queued game on cancel:", e);
      }
    }
    toast({
      title: "Queue Cancelled",
      description: "Left matchmaking lobby.",
    });
  };

  if (!isMounted) {
    return (
      <PageLoader 
        message="Booting Grandmaster Hub..." 
        submessage="Connecting securely to real-time matchmakers and tuning analytical engines." 
      />
    );
  }

  return (
    <div className="flex-1 min-h-full relative overflow-y-auto overflow-x-hidden bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.11),rgba(255,255,255,0))] flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 py-6">
      {/* Upper Tech Border Ornament */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-sky-500/25 to-transparent animate-pulse" />

      {/* Main Structural Twin Columns (Board Left, Controls Right) */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto relative z-10">
        
        {/* LEFT COLUMN: STATIC STARTING CHESS BOARD (moves disabled) */}
        <div className="hidden lg:flex lg:col-span-7 flex-col items-center justify-center gap-4 relative">
          {/* Decorative faint grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

          {/* Sibling Board Label Frame */}
          <div className="w-full max-w-[460px] flex items-center justify-between px-2 text-slate-400 font-mono text-xs">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-[10px]">
              <Compass className="w-3.5 h-3.5 text-sky-400 animate-spin-slow" />
              Starting Position Matrix
            </span>
            <span className="text-[10px] text-slate-650 font-bold uppercase">Ready Side: White</span>
          </div>

          {/* Outer high precision chess board container */}
          <div className="w-full max-w-[460px] aspect-square rounded-2xl p-2 bg-slate-950/90 border border-slate-900/80 shadow-[0_0_50px_rgba(14,165,233,0.08)] relative group">
            {/* Highlight corner lines */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-sky-500/30 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-sky-500/30 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-sky-500/30 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-sky-500/30 rounded-br-xl" />
            
            <div className="pointer-events-none select-none opacity-80 rounded-xl overflow-hidden h-full">
              <ChessBoard 
                fen="start" 
                isDraggable={false} 
              />
            </div>

            {/* Overlaid watermark informing moves disabled */}
            <div className="absolute inset-x-8 bottom-8 py-2 bg-slate-950/80 backdrop-blur-sm border border-slate-900 rounded-xl text-center text-[10px] font-mono text-slate-400 leading-normal select-none shadow-md">
              Start matchmaking on the right to play active moves against opponents.
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TIME SELECTION, IDENTITY & MATCH PLAY TRIGGER */}
        <div className="col-span-1 lg:col-span-5 flex flex-col justify-center gap-6 p-3 sm:p-6 lg:p-0">
          
          {/* Header & App Title */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/10 border border-sky-500/20 rounded-full text-[10px] font-mono text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.1)] mb-1">
              <Sparkles className="w-3.5 h-3.5 text-sky-450 animate-pulse" />
              GLOBAL CHESS MATCH PORTAL
            </div>
            
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white font-display leading-tight">
              PLAY ONLINE
            </h1>
            
            <p className="text-slate-400 text-sm leading-relaxed font-sans">
              Connect instantly with online players. Select your tactical pace and launch matchmaking to query the active Supabase lobbies.
            </p>
          </div>

          <div className="h-[1px] bg-slate-900" />

          {/* Time Controls Sizing Dropdown Component */}
          <div className="space-y-2.5 relative" ref={dropdownRef}>
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest pl-1 font-bold flex items-center justify-between">
              <span>Time Selection</span>
              <span className="text-slate-600 text-[10px]">Bullet, Blitz or Rapid</span>
            </label>

            {/* Custom styled select box trigger */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full p-3 px-4 rounded-xl border bg-slate-950/40 border-slate-900 hover:border-slate-800 text-slate-200 hover:text-white text-left flex items-center justify-between transition-all cursor-pointer shadow-md group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-400/30 text-sky-400">
                  {selectedPresetId === "custom" ? (
                    <Sliders className="w-4 h-4" />
                  ) : (
                    (() => {
                      const activePreset = ALL_PRESETS.find(p => p.id === selectedPresetId) || ALL_PRESETS[6];
                      const PresIcon = activePreset.icon;
                      return <PresIcon className="w-4 h-4" />;
                    })()
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold font-sans">
                    {selectedPresetId === "custom" ? (
                      `Custom Preset (${classifyCustomControl(parseInt(customMin, 10)*60 + parseInt(customSec, 10)).toUpperCase()})`
                    ) : (
                      ALL_PRESETS.find(p => p.id === selectedPresetId)?.name || "Select Speed"
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {selectedPresetId === "custom" ? (
                      `${customMin} | ${customInc}`
                    ) : (
                      ALL_PRESETS.find(p => p.id === selectedPresetId)?.label || ""
                    )}
                  </span>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-sky-400' : ''}`} />
            </button>

            {/* Floating custom dropdown menu panel */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 mt-1 bg-slate-950 border border-slate-900 rounded-xl shadow-2xl overflow-hidden z-50 p-3.5 space-y-4 max-h-[380px] overflow-y-auto"
                >
                  {/* BULLET CATEGORY */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-mono font-bold tracking-wider text-amber-500/80 px-1 border-b border-slate-900/40 pb-1 flex items-center justify-between">
                      <span>Bullet</span>
                      <span className="text-[9px] text-slate-500 font-normal">Elo: {eloRatings.bullet}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {BULLET_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPresetId(preset.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg text-center font-mono text-xs font-bold transition-all cursor-pointer ${
                            selectedPresetId === preset.id
                              ? "bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                              : "bg-slate-900 border border-slate-900/40 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* BLITZ CATEGORY */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-mono font-bold tracking-wider text-red-500/80 px-1 border-b border-slate-900/40 pb-1 flex items-center justify-between">
                      <span>Blitz</span>
                      <span className="text-[9px] text-slate-500 font-normal">Elo: {eloRatings.blitz}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {BLITZ_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPresetId(preset.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg text-center font-mono text-xs font-bold transition-all cursor-pointer ${
                            selectedPresetId === preset.id
                              ? "bg-red-500/15 border border-red-500/30 text-red-450 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                              : "bg-slate-900 border border-slate-900/40 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* RAPID CATEGORY */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-mono font-bold tracking-wider text-sky-500/80 px-1 border-b border-slate-900/40 pb-1 flex items-center justify-between">
                      <span>Rapid</span>
                      <span className="text-[9px] text-slate-500 font-normal">Elo: {eloRatings.rapid}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {RAPID_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPresetId(preset.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg text-center font-mono text-xs font-bold transition-all cursor-pointer ${
                            selectedPresetId === preset.id
                              ? "bg-sky-500/15 border border-sky-500/30 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.15)]"
                              : "bg-slate-900 border border-slate-900/40 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Horizontal visual separator */}
                  <div className="h-[1px] bg-slate-900/80 my-1" />

                  {/* Custom accordian slider drawer */}
                  <div className="space-y-2 pt-1 border-t border-slate-900">
                    <button
                      type="button"
                      onClick={() => setShowMoreTimeControls(!showMoreTimeControls)}
                      className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer uppercase tracking-wider"
                    >
                      <span className="flex items-center gap-1.5 font-mono">
                        <Sliders className="w-3.5 h-3.5 text-sky-405" />
                        More Time Controls
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${showMoreTimeControls ? "rotate-180 text-sky-400" : ""}`} />
                    </button>

                    {showMoreTimeControls && (
                      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-850 space-y-3.5 animate-in fade-in slide-in-from-top-1.5 duration-150">
                        <div className="text-[9px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                          Custom Preset Sizing
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-slate-500 pl-0.5">Min</label>
                            <input
                              type="number"
                              min="0"
                              max="180"
                              placeholder="Min"
                              value={customMin}
                              onChange={(e) => setCustomMin(e.target.value)}
                              className="w-full p-2 text-center text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-sky-500 font-black"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-slate-500 pl-0.5">Sec</label>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              placeholder="Sec"
                              value={customSec}
                              onChange={(e) => setCustomSec(e.target.value)}
                              className="w-full p-2 text-center text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-sky-500 font-black"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono text-slate-500 pl-0.5 font-black">Inc</label>
                            <input
                              type="number"
                              min="0"
                              max="60"
                              placeholder="Inc"
                              value={customInc}
                              onChange={(e) => setCustomInc(e.target.value)}
                              className="w-full p-2 text-center text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-sky-500 font-black"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPresetId("custom");
                            setIsDropdownOpen(false);
                          }}
                          className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-[11px] font-mono uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                        >
                          Apply Custom Control
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Play Match Action Row */}
          <div>
            <AnimatePresence mode="wait">
              {isSearching ? (
                /* Matches searching / pulsing matching scanner view */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-5 rounded-2xl bg-sky-500/5 border border-sky-500/20 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden"
                >
                  {/* Subtle repeating spinning sweep background */}
                  <div className="absolute w-64 h-64 border border-dashed border-sky-500/10 rounded-full animate-spin-slow pointer-events-none" />

                  {/* Radiating radar core */}
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-12 h-12 rounded-full bg-sky-500/20 animate-ping" />
                    <div className="w-10 h-10 rounded-full bg-sky-950 border-2 border-sky-500 flex items-center justify-center">
                      <Search className="w-4 h-4 text-sky-400 animate-pulse" />
                    </div>
                  </div>

                  <div className="space-y-1 relative z-15">
                    <h4 className="text-sm font-bold text-sky-400 animate-pulse">Finding Opponent Master...</h4>
                    <p className="text-[10px] font-mono text-slate-500 pl-1 uppercase tracking-wider">
                      SEARCHING CO-PRESET • TIME QUEUE: {Math.floor(searchTimeElapsed / 60)}:{(searchTimeElapsed % 60).toString().padStart(2, '0')}
                    </p>
                  </div>

                  <button
                    onClick={handleCancelMatchmaking}
                    className="px-6 py-2 bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 rounded-xl text-xs font-mono text-slate-400 transition-colors cursor-pointer relative z-20"
                  >
                    Cancel Matchmaking
                  </button>
                </motion.div>
              ) : (
                /* Primary Play Button card */
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={handleStartMatchmaking}
                  className="w-full h-14 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-extrabold rounded-2xl shadow-xl shadow-sky-500/10 hover:shadow-sky-500/25 transition-all flex items-center justify-center gap-3 cursor-pointer border border-sky-400/20 font-display group"
                >
                  <Play className="w-5 h-5 text-sky-100 group-hover:scale-110 transition-transform" />
                  PLAY NOW
                </motion.button>
              )}
            </AnimatePresence>
          </div>

        </div>

      </div>

      {/* Lobby stats / minor signature */}
      <div className="text-[10px] font-mono text-slate-700 mt-16 max-w-sm text-center leading-normal">
        GRANDMASTER LENS CHESS ENGINE V2 • ACTIVE MUTATION MATRIX PERSISTENCE
      </div>
    </div>
  );
}
