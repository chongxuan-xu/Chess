"use client";

import { getSupabase } from "./supabase";

export interface BanRecord {
  username: string;
  duration: "1 day" | "1 week" | "1 month" | "forever";
  bannedAt: number;
  expiresAt: number | null;
  reason: string;
}

export function getBannedUsers(): Record<string, BanRecord> {
  if (typeof window === "undefined") return {};
  try {
    const bansJSON = localStorage.getItem("gml_banned_users");
    return bansJSON ? JSON.parse(bansJSON) : {};
  } catch (e) {
    console.error("Failed to parse banned users:", e);
    return {};
  }
}

export function banUser(
  username: string,
  duration: "1 day" | "1 week" | "1 month" | "forever",
  reason: string
) {
  if (typeof window === "undefined") return;
  try {
    const cleanUsername = username.trim().toLowerCase();
    const bannedAt = Date.now();
    let expiresAt: number | null = null;

    if (duration === "1 day") {
      expiresAt = bannedAt + 24 * 60 * 60 * 1000;
    } else if (duration === "1 week") {
      expiresAt = bannedAt + 7 * 24 * 60 * 60 * 1000;
    } else if (duration === "1 month") {
      expiresAt = bannedAt + 30 * 24 * 60 * 60 * 1000;
    }

    const record: BanRecord = {
      username: username.trim(),
      duration,
      bannedAt,
      expiresAt,
      reason,
    };

    const bans = getBannedUsers();
    bans[cleanUsername] = record;

    localStorage.setItem("gml_banned_users", JSON.stringify(bans));

    // Sync to Supabase in the background
    const stringifiedRecord = JSON.stringify(record);
    getSupabase()
      .from("profiles")
      .update({ ban_record: stringifiedRecord })
      .eq("username", username.trim())
      .then(({ error }) => {
        if (error) {
          console.warn("Could not sync ban record to remote Supabase profiles:", error);
        }
      });

    // Also update existing stored profile if we have it
    const mockProfiles = JSON.parse(localStorage.getItem("gml_mock_table_profiles") || "[]");
    const matchIdx = mockProfiles.findIndex((p: any) => p.username?.toLowerCase() === cleanUsername);
    if (matchIdx > -1) {
      mockProfiles[matchIdx].ban_record = stringifiedRecord;
      try {
        let parsedAvatar = JSON.parse(mockProfiles[matchIdx].avatar_config || "{}");
        parsedAvatar.ban_record = record;
        mockProfiles[matchIdx].avatar_config = JSON.stringify(parsedAvatar);
        
        // Push that updated avatar_config containing the ban record too
        getSupabase()
          .from("profiles")
          .update({ avatar_config: JSON.stringify(parsedAvatar) })
          .eq("username", username.trim())
          .then(() => {});
      } catch {}
      localStorage.setItem("gml_mock_table_profiles", JSON.stringify(mockProfiles));
      window.dispatchEvent(new Event("gml_avatar_updated"));
    }

    window.dispatchEvent(new Event("gml_bans_updated"));
    window.dispatchEvent(new Event("storage"));
  } catch (e) {
    console.error("Failed to ban user:", e);
  }
}

export function unbanUser(username: string) {
  if (typeof window === "undefined") return;
  try {
    const cleanUsername = username.trim().toLowerCase();
    const bans = getBannedUsers();
    if (bans[cleanUsername]) {
      delete bans[cleanUsername];
      localStorage.setItem("gml_banned_users", JSON.stringify(bans));

      // Sync ban removal to Supabase in the background
      getSupabase()
        .from("profiles")
        .update({ ban_record: null })
        .eq("username", username.trim())
        .then(({ error }) => {
          if (error) {
            console.warn("Could not sync ban lift to remote Supabase profiles:", error);
          }
        });

      // Also update existing stored profile if we have it
      const mockProfiles = JSON.parse(localStorage.getItem("gml_mock_table_profiles") || "[]");
      const matchIdx = mockProfiles.findIndex((p: any) => p.username?.toLowerCase() === cleanUsername);
      if (matchIdx > -1) {
        mockProfiles[matchIdx].ban_record = null;
        try {
          let parsedAvatar = JSON.parse(mockProfiles[matchIdx].avatar_config || "{}");
          delete parsedAvatar.ban_record;
          mockProfiles[matchIdx].avatar_config = JSON.stringify(parsedAvatar);
          
          // Push that updated avatar_config containing the ban record too
          getSupabase()
            .from("profiles")
            .update({ avatar_config: JSON.stringify(parsedAvatar) })
            .eq("username", username.trim())
            .then(() => {});
        } catch {}
        localStorage.setItem("gml_mock_table_profiles", JSON.stringify(mockProfiles));
        window.dispatchEvent(new Event("gml_avatar_updated"));
      }

      window.dispatchEvent(new Event("gml_bans_updated"));
      window.dispatchEvent(new Event("storage"));
    }
  } catch (e) {
    console.error("Failed to unban user:", e);
  }
}

export function checkUserBanStatus(username?: string): BanRecord | null {
  if (!username) return null;
  const cleanUsername = username.trim().toLowerCase();
  const bans = getBannedUsers();
  const record = bans[cleanUsername];

  if (!record) return null;

  // Check if expired
  if (record.expiresAt !== null && Date.now() > record.expiresAt) {
    // Proactively clean up expired ban
    unbanUser(username);
    return null;
  }

  return record;
}
