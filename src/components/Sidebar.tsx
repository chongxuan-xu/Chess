"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Globe, 
  BarChart2, 
  LogIn, 
  Crown,
  LogOut,
  Menu,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Avatar } from '@/components/Avatar';
import { UserBadge } from '@/components/UserBadge';
import { getUserRole } from '@/lib/roles';
import { getSupabase } from '@/lib/supabase';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function Sidebar() {
  const pathname = usePathname();
  const { toast } = useToast();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ username: string; email: string } | null>(null);
  const [profileName, setProfileName] = useState("Guest");
  const [isMobile, setIsMobile] = useState(false);

  // Auto detect mobile screen width
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on path changes on mobile
  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(true);
    }
  }, [pathname, isMobile]);

  // Load user from localStorage on mount & listen to changes
  const loadUser = () => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('gml_user');
      if (savedUser) {
        try {
          const u = JSON.parse(savedUser);
          setCurrentUser(u);
          setProfileName(u.username || "Chess Master");
        } catch (e) {
          console.error(e);
        }
      } else {
        setCurrentUser(null);
        const guestName = localStorage.getItem('gml_guest_name') || "Guest";
        setProfileName(guestName);
      }
    }
  };

  useEffect(() => {
    loadUser();

    // Sync across tabs/pages when login state changes or custom event fires
    const handleSync = () => {
      loadUser();
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('gml_auth_change', handleSync);

    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('gml_auth_change', handleSync);
    };
  }, []);

  // Synchronize profiles, roles, and bans dynamically from Supabase database continuously
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Run cleanups for any "Guest..." or "Waiting..." accounts from local state once
    const purgeTemporaryAccountsOnce = () => {
      try {
        // Purge local roles
        const storedRoles = localStorage.getItem("gml_user_roles");
        if (storedRoles) {
          const parsed = JSON.parse(storedRoles);
          const cleaned: any = {};
          let changed = false;
          Object.keys(parsed).forEach((k) => {
            const kl = k.toLowerCase();
            if (kl.startsWith("guest") || kl.startsWith("waiting")) {
              changed = true;
            } else {
              cleaned[k] = parsed[k];
            }
          });
          if (changed) {
            localStorage.setItem("gml_user_roles", JSON.stringify(cleaned));
            window.dispatchEvent(new Event("gml_roles_updated"));
          }
        }

        // Purge local bans
        const storedBans = localStorage.getItem("gml_banned_users");
        if (storedBans) {
          const parsed = JSON.parse(storedBans);
          const cleaned: any = {};
          let changed = false;
          Object.keys(parsed).forEach((k) => {
            const kl = k.toLowerCase();
            if (kl.startsWith("guest") || kl.startsWith("waiting")) {
              changed = true;
            } else {
              cleaned[k] = parsed[k];
            }
          });
          if (changed) {
            localStorage.setItem("gml_banned_users", JSON.stringify(cleaned));
            window.dispatchEvent(new Event("gml_bans_updated"));
          }
        }

        // Purge local mock table profiles
        const storedProfiles = localStorage.getItem("gml_mock_table_profiles");
        if (storedProfiles) {
          const parsed = JSON.parse(storedProfiles);
          const cleaned = parsed.filter((p: any) => {
            const u = (p.username || "").toLowerCase();
            return !u.startsWith("guest") && !u.startsWith("waiting");
          });
          if (cleaned.length !== parsed.length) {
            localStorage.setItem("gml_mock_table_profiles", JSON.stringify(cleaned));
            window.dispatchEvent(new Event("gml_avatar_updated"));
          }
        }
      } catch (e) {
        console.warn("Local temporary accounts cleanups failed:", e);
      }
    };

    purgeTemporaryAccountsOnce();

    const syncDatabaseRolesAndBans = async () => {
      try {
        const supabase = getSupabase();
        
        // 1. Fetch profiles from database (using select("*") to be completely safe)
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("*");
        
        if (error) {
          console.warn("Could not fetch remote profiles for roles/bans sync:", error);
          return;
        }

        if (profiles) {
          // 2. Prepare merged local structures
          const localRoles = JSON.parse(localStorage.getItem("gml_user_roles") || "{}");
          const localBans = JSON.parse(localStorage.getItem("gml_banned_users") || "{}");
          let mockTableProfiles = JSON.parse(localStorage.getItem("gml_mock_table_profiles") || "[]");

          let rolesUpdated = false;
          let bansUpdated = false;
          let mockProfilesUpdated = false;

          // Standardize and filter guest/waiting accounts out of Supabase profiles as requested
          const cleanProfiles = profiles.filter((p: any) => {
            if (!p.username) return false;
            const unameLower = p.username.toLowerCase();
            const shouldRemove = unameLower.startsWith("guest") || unameLower.startsWith("waiting");
            if (shouldRemove) {
              supabase.from("profiles").delete().eq("id", p.id).then(() => {});
            }
            return !shouldRemove;
          });

          // Clean local mockTableProfiles list of guest/waiting accounts
          const prevLength = mockTableProfiles.length;
          mockTableProfiles = mockTableProfiles.filter((p: any) => {
            if (!p.username) return false;
            const unameLower = p.username.toLowerCase();
            return !unameLower.startsWith("guest") && !unameLower.startsWith("waiting");
          });
          if (mockTableProfiles.length !== prevLength) {
            mockProfilesUpdated = true;
          }

          cleanProfiles.forEach((p: any) => {
            const cleanUsername = p.username.trim().toLowerCase();

            // Attempt to parse avatar config to resolve fallback role or ban record
            let parsedAvatar: any = {};
            if (p.avatar_config) {
              try {
                parsedAvatar = typeof p.avatar_config === "string" ? JSON.parse(p.avatar_config) : p.avatar_config;
              } catch {}
            }

            // Determine role & ban status from either defined columns or json fallback
            const roleToUse = p.role || parsedAvatar?.role || "user";
            let banRecordToUse = p.ban_record || parsedAvatar?.ban_record || null;
            if (typeof banRecordToUse === "string") {
              try { banRecordToUse = JSON.parse(banRecordToUse); } catch {}
            }

            // Sync user role
            if (roleToUse && roleToUse !== "user") {
              if (localRoles[cleanUsername] !== roleToUse) {
                localRoles[cleanUsername] = roleToUse;
                rolesUpdated = true;
              }
            } else {
              if (localRoles[cleanUsername] && localRoles[cleanUsername] !== "user") {
                if (cleanUsername !== "goldyeti") {
                  delete localRoles[cleanUsername];
                  rolesUpdated = true;
                }
              }
            }

            // Sync ban record
            if (banRecordToUse) {
              const localRecord = localBans[cleanUsername];
              if (!localRecord || JSON.stringify(localRecord) !== JSON.stringify(banRecordToUse)) {
                localBans[cleanUsername] = banRecordToUse;
                bansUpdated = true;
              }
            } else {
              if (localBans[cleanUsername]) {
                delete localBans[cleanUsername];
                bansUpdated = true;
              }
            }

            // Sync profile to local gml_mock_table_profiles (helps profile pictures match perfectly!)
            const matchIdx = mockTableProfiles.findIndex((m: any) => m.username?.toLowerCase() === cleanUsername);
            const payload = {
              id: p.id,
              username: p.username,
              email: p.email,
              avatar_config: p.avatar_config,
              role: roleToUse,
              ban_record: banRecordToUse ? JSON.stringify(banRecordToUse) : null,
              updated_at: p.updated_at
            };

            if (matchIdx > -1) {
              const currentItem = mockTableProfiles[matchIdx];
              if (
                currentItem.avatar_config !== p.avatar_config || 
                currentItem.role !== roleToUse || 
                JSON.stringify(currentItem.ban_record) !== JSON.stringify(payload.ban_record)
              ) {
                mockTableProfiles[matchIdx] = { ...currentItem, ...payload };
                mockProfilesUpdated = true;
              }
            } else {
              mockTableProfiles.push(payload);
              mockProfilesUpdated = true;
            }
          });

          // 3. Save to localStorage if changes occurred & dispatch sync events
          if (rolesUpdated) {
            localRoles["goldyeti"] = "owner"; // Guarantee owner persistence
            localStorage.setItem("gml_user_roles", JSON.stringify(localRoles));
            window.dispatchEvent(new Event("gml_roles_updated"));
          }
          if (bansUpdated) {
            localStorage.setItem("gml_banned_users", JSON.stringify(localBans));
            window.dispatchEvent(new Event("gml_bans_updated"));
          }
          if (mockProfilesUpdated) {
            localStorage.setItem("gml_mock_table_profiles", JSON.stringify(mockTableProfiles));
            window.dispatchEvent(new Event("gml_avatar_updated"));
          }
        }
      } catch (e) {
        console.warn("Global profile sync logic failed:", e);
      }
    };

    // Run on startup
    syncDatabaseRolesAndBans();

    // Setup an interval to sync to guarantee "everything is LINKED with EVERY USER" dynamically in real-time
    const intervalId = setInterval(syncDatabaseRolesAndBans, 3500);
    return () => clearInterval(intervalId);
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gml_user');
      localStorage.removeItem('gml_nickname');
    }
    setCurrentUser(null);
    toast({ title: "Logged Out", description: "You have been logged out successfully." });
    
    // Dispatch events to instantly update active pages
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('gml_auth_change'));
  };

  // Check which tab is active
  const isPlayActive = pathname === '/' || pathname.startsWith('/game');
  const isAnalysisActive = pathname === '/analysis';
  const isPlayersActive = pathname === '/players';

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobile && !isCollapsed && (
        <div 
          onClick={() => setIsCollapsed(true)} 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 animate-in fade-in duration-200" 
        />
      )}

      {/* In-flow spacer when mobile drawer is expanded, preventing UI shifts */}
      {isMobile && !isCollapsed && (
        <div className="w-12 shrink-0 h-screen border-r border-transparent" />
      )}

      <aside className={
        isMobile && !isCollapsed
          ? `fixed inset-y-0 left-0 bg-slate-950 z-50 flex flex-col justify-between font-sans transition-all duration-300 ease-in-out w-64 p-4 border-r border-slate-850 shadow-2xl`
          : `h-screen shrink-0 border-r border-slate-850 bg-slate-950 flex flex-col justify-between font-sans relative z-30 transition-all duration-300 ease-in-out ${
              isCollapsed ? "w-12 md:w-16 p-1 md:p-2 py-4 items-center" : "w-64 p-4"
            }`
      }>
        {/* Shimmer line */}
        <div className="absolute top-0 right-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-sky-500/10 to-transparent" />

        {isCollapsed ? (
          /* Minimized/Collapsed View */
          <div className="flex flex-col items-center gap-6 md:gap-8 w-full">
            {/* Toggle Button / Menu (three horizontal lines) */}
            <div className="flex flex-col items-center gap-3 md:gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCollapsed(false)}
                className="text-slate-400 hover:text-white hover:bg-slate-900 h-8 w-8 md:h-10 md:w-10 rounded-xl"
                id="sidebar-expand-button"
              >
                <Menu className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
              
              {/* Compact Crown Logo Accent */}
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Crown className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
            </div>

            {/* Compact Navigation Items with nice Tooltips */}
            <div className="flex flex-col gap-2.5 md:gap-3 w-full items-center">
              <TooltipProvider>
                <Tooltip delayDuration={105}>
                  <TooltipTrigger asChild>
                    <Link href="/">
                      <div className={`flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-xl transition-all cursor-pointer ${
                        isPlayActive 
                          ? 'bg-sky-500/15 text-sky-400 border border-sky-450/40' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                      }`}>
                        <Globe className="w-4 h-4 md:w-4.5 md:h-4.5" />
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-slate-950 border-slate-800 text-slate-200">
                    <p className="font-semibold text-xs">Play Online</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip delayDuration={105}>
                  <TooltipTrigger asChild>
                    <Link href="/analysis">
                      <div className={`flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-xl transition-all cursor-pointer ${
                        isAnalysisActive 
                          ? 'bg-sky-500/15 text-sky-400 border border-sky-450/40' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                      }`}>
                        <BarChart2 className="w-4 h-4 md:w-4.5 md:h-4.5" />
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-slate-950 border-slate-800 text-slate-200">
                    <p className="font-semibold text-xs">Analysis</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip delayDuration={105}>
                  <TooltipTrigger asChild>
                    <Link href="/players">
                      <div className={`flex items-center justify-center h-8 w-8 md:h-10 md:w-10 rounded-xl transition-all cursor-pointer ${
                        isPlayersActive 
                          ? 'bg-sky-500/15 text-sky-400 border border-sky-450/40' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                      }`}>
                        <Users className="w-4 h-4 md:w-4.5 md:h-4.5" />
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-slate-950 border-slate-800 text-slate-200">
                    <p className="font-semibold text-xs">Search Players</p>
                  </TooltipContent>
                </Tooltip>

              </TooltipProvider>
            </div>
          </div>
        ) : (
          /* Fully Expanded View */
          <div className="flex flex-col gap-8 w-full">
            {/* Logo, Identity & Toggle Button */}
            <div className="flex items-center justify-between gap-2">
              <Link href="/">
                <div className="flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-slate-900/40 transition-colors group">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display font-black text-sm tracking-widest text-white leading-none">GRANDMASTER</span>
                    <span className="font-mono text-[10px] tracking-[0.25em] text-sky-400 font-bold uppercase mt-1">LENS ENGINE</span>
                  </div>
                </div>
              </Link>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCollapsed(true)}
                className="text-slate-400 hover:text-white hover:bg-slate-900 h-9 w-9 shrink-0"
                id="sidebar-collapse-button"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>

            {/* Navigation Items */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-slate-500 tracking-widest uppercase mb-2 px-2">Navigate</span>
              
              <Link href="/">
                <div className={`flex items-center justify-between px-3.5 py-3 rounded-xl transition-all cursor-pointer font-medium text-sm group ${
                  isPlayActive 
                    ? 'bg-sky-500/15 text-sky-400 font-semibold border-l-2 border-sky-450 pl-2.5' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}>
                  <div className="flex items-center gap-3">
                    <Globe className={`w-4 h-4 transition-colors ${isPlayActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                    <span>Play Online</span>
                  </div>
                  {isPlayActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                  )}
                </div>
              </Link>

              <Link href="/analysis">
                <div className={`flex items-center justify-between px-3.5 py-3 rounded-xl transition-all cursor-pointer font-medium text-sm group ${
                  isAnalysisActive 
                    ? 'bg-sky-500/15 text-sky-400 font-semibold border-l-2 border-sky-450 pl-2.5' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}>
                  <div className="flex items-center gap-3">
                    <BarChart2 className={`w-4 h-4 transition-colors ${isAnalysisActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                    <span>Analysis</span>
                  </div>
                  {isAnalysisActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                  )}
                </div>
              </Link>

              <Link href="/players">
                <div className={`flex items-center justify-between px-3.5 py-3 rounded-xl transition-all cursor-pointer font-medium text-sm group ${
                  isPlayersActive 
                    ? 'bg-sky-500/15 text-sky-400 font-semibold border-l-2 border-sky-450 pl-2.5' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}>
                  <div className="flex items-center gap-3">
                    <Users className={`w-4 h-4 transition-colors ${isPlayersActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                    <span>Search Players</span>
                  </div>
                  {isPlayersActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
                  )}
                </div>
              </Link>

            </div>
          </div>
        )}

        {/* Footer actions & users state */}
        <div className="flex flex-col gap-3 md:gap-4 w-full items-center">
          {isCollapsed ? (
            /* Collapsed Footer */
            <div className="flex flex-col gap-3 md:gap-4 w-full items-center">
              <div className="w-full h-[1px] bg-slate-900" />
              
              <Link href="/profile">
                <button 
                  className="h-8 w-8 md:h-10 md:w-10 rounded-full hover:scale-105 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  id="user-avatar-collapsed"
                  title="View Profile statistics & customise avatar"
                >
                  <Avatar sizeClassName="h-8 w-8 md:h-10 md:w-10" />
                </button>
              </Link>

              {currentUser && (
                <button 
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-450 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4 text-slate-400" />
                </button>
              )}

              <div className="text-[9px] font-mono text-slate-600 font-bold">
                GML
              </div>
            </div>
          ) : (
            /* Expanded Footer */
            <div className="flex flex-col gap-4 w-full">
              <div className="h-[1px] bg-slate-900" />
              
              <div className="flex flex-col gap-3 p-1.5 rounded-xl bg-slate-900/40 border border-slate-900">
                <Link href="/profile" className="block w-full">
                  <button className="flex items-center gap-3 px-2 py-1.5 hover:bg-slate-900/60 w-full rounded-lg text-left transition-all cursor-pointer group">
                    <Avatar sizeClassName="h-8 w-8" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-slate-100 truncate flex items-center gap-1 group-hover:text-white transition-colors">
                        {profileName}
                        <UserBadge username={profileName} email={currentUser?.email || ""} size="sm" />
                        {(!profileName || getUserRole(profileName, currentUser?.email || "") === "user") && (
                          <Crown className="w-3 h-3 text-sky-450 shrink-0" />
                        )}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 truncate">
                        {currentUser ? currentUser.email : "Anonymous Guest"}
                      </span>
                    </div>
                  </button>
                </Link>

                {currentUser ? (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleLogout}
                    className="w-full text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-2 h-8"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log Out
                  </Button>
                ) : (
                  <Link
                    href="/login"
                    className="w-full flex items-center justify-center gap-2 border border-slate-850 hover:bg-slate-900 h-8 text-xs text-sky-400 hover:text-sky-350 hover:border-slate-800 rounded-lg transition-all font-medium cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Login / Signup
                  </Link>
                )}
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 px-2 pb-1 uppercase font-bold">
                <span>ENG V2</span>
                <span>CHONGXUAN</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
