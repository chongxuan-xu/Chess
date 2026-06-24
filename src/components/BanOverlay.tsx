"use client";

import React, { useEffect, useState } from "react";
import { checkUserBanStatus, BanRecord } from "@/lib/bans";
import { ShieldAlert, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BanOverlay() {
  const [banRecord, setBanRecord] = useState<BanRecord | null>(null);
  const [currentUser, setCurrentUser] = useState<{ username: string; email: string } | null>(null);
  const [guestName, setGuestName] = useState<string>("Guest");

  const checkBan = () => {
    if (typeof window === "undefined") return;

    // Load logged-in user
    let loggedUser: any = null;
    const savedUser = localStorage.getItem("gml_user");
    if (savedUser) {
      try {
        loggedUser = JSON.parse(savedUser);
        setCurrentUser(loggedUser);
      } catch {}
    } else {
      setCurrentUser(null);
    }

    // Load guest name
    const guest = localStorage.getItem("gml_guest_name") || "Guest";
    setGuestName(guest);

    // Prioritize logged-in user username
    const usernameToCheck = loggedUser?.username || guest;
    
    if (usernameToCheck && usernameToCheck.toLowerCase() !== "guest") {
      const activeBan = checkUserBanStatus(usernameToCheck);
      setBanRecord(activeBan);
    } else {
      setBanRecord(null);
    }
  };

  useEffect(() => {
    checkBan();

    const handleSync = () => {
      checkBan();
    };

    window.addEventListener("storage", handleSync);
    window.addEventListener("gml_auth_change", handleSync);
    window.addEventListener("gml_bans_updated", handleSync);
    window.addEventListener("gml_roles_updated", handleSync);

    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("gml_auth_change", handleSync);
      window.removeEventListener("gml_bans_updated", handleSync);
      window.removeEventListener("gml_roles_updated", handleSync);
    };
  }, []);

  if (!banRecord) return null;

  // Let banned user log out or clear guest name so they don't get locked out of the site entirely under different aliases
  const handleBanishReset = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("gml_user");
    localStorage.removeItem("gml_player_id");
    localStorage.setItem("gml_guest_name", "Guest_" + Math.floor(1000 + Math.random() * 9000));
    window.dispatchEvent(new Event("gml_auth_change"));
    window.dispatchEvent(new Event("storage"));
    setBanRecord(null);
  };

  // Convert "1 day", "1 week", "1 month" to day count if suitable, or format elegantly as user-specified
  const displayDuration = banRecord.duration === "forever" ? "forever" : banRecord.duration;

  return (
    <div id="ban-overlay" className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-4 md:p-6 select-none animate-fade-in">
      {/* Sleek tech trim */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-rose-600 via-red-500 to-rose-600" />

      <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-slate-850 shadow-2xl relative overflow-hidden text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 shadow-lg shadow-red-500/5">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black font-display text-white tracking-widest uppercase">
            Access Terminated
          </h1>
          <p className="text-xs text-slate-500 font-mono tracking-wider uppercase">
            Grandmaster Protocol Violation
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-900 text-left space-y-3.5">
          <div className="text-xs space-y-1">
            <span className="text-slate-500 font-mono uppercase block text-[10px]">INFRINGING IDENTITY</span>
            <span className="text-slate-200 font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              {currentUser?.username || guestName}
            </span>
          </div>

          <div className="w-full h-[1px] bg-slate-900" />

          <div className="text-xs space-y-1">
            <span className="text-slate-500 font-mono uppercase block text-[10px]">BAN DURATION</span>
            <span className="text-rose-450 font-bold">
              You have been banned {banRecord.duration === "forever" ? "forever" : `for ${displayDuration}`}
            </span>
          </div>

          <div className="w-full h-[1px] bg-slate-900" />

          <div className="text-xs space-y-1.5">
            <span className="text-slate-500 font-mono uppercase block text-[10px]">REASON FOR PROTOCOL BLOCK</span>
            <p className="text-slate-300 font-sans leading-relaxed text-xs italic bg-slate-900/50 p-2.5 rounded border border-slate-850">
              Reason: {banRecord.reason || "Unspecified behavior violation checked by regulatory council."}
            </p>
          </div>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleBanishReset}
            variant="outline"
            size="sm"
            className="w-full border-slate-800 hover:border-slate-700 bg-transparent hover:bg-slate-950 text-slate-400 hover:text-slate-200 text-xs font-mono py-5 rounded-xl cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Switch Account / Register New
          </Button>
        </div>
      </div>
    </div>
  );
}
