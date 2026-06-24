"use client";

import { getSupabase } from "./supabase";

export type UserRole = "owner" | "admin" | "moderator" | "user";

/**
 * Gets the roles map from localStorage.
 */
export function getStoredUserRoles(): Record<string, UserRole> {
  if (typeof window === "undefined") {
    return {
      "goldyeti": "owner",
    };
  }
  try {
    const rolesJSON = localStorage.getItem("gml_user_roles");
    const roles = rolesJSON ? JSON.parse(rolesJSON) : {};
    
    // Always force GoldYeti to be owner
    roles["goldyeti"] = "owner";
    return roles;
  } catch (e) {
    console.error("Failed to parse user roles:", e);
    return {
      "goldyeti": "owner",
    };
  }
}

/**
 * Gets role for a specific username and email.
 */
export function getUserRole(username?: string, email?: string): UserRole {
  if (!username) return "user";
  
  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email?.trim().toLowerCase() || "";

  // Check manual override for the real owner
  if (cleanUsername === "goldyeti" || cleanEmail === "chongxuan.xu@outlook.com") {
    return "owner";
  }

  const storedRoles = getStoredUserRoles();
  return storedRoles[cleanUsername] || "user";
}

/**
 * Updates a user's role.
 */
export function updateUserRole(username: string, role: UserRole) {
  if (typeof window === "undefined") return;
  try {
    const cleanUsername = username.trim().toLowerCase();
    
    // Prevent overriding owner
    if (cleanUsername === "goldyeti") return;

    const storedRoles = getStoredUserRoles();
    if (role === "user") {
      delete storedRoles[cleanUsername];
    } else {
      storedRoles[cleanUsername] = role;
    }

    localStorage.setItem("gml_user_roles", JSON.stringify(storedRoles));
    
    // Sync to Supabase in the background
    getSupabase()
      .from("profiles")
      .update({ role: role })
      .eq("username", username.trim())
      .then(({ error }) => {
        if (error) {
          console.warn("Could not sync updated role to remote Supabase profiles:", error);
        }
      });

    // Also update existing stored profile avatar if we have role there
    const mockProfiles = JSON.parse(localStorage.getItem("gml_mock_table_profiles") || "[]");
    const matchIdx = mockProfiles.findIndex((p: any) => p.username?.toLowerCase() === cleanUsername);
    if (matchIdx > -1) {
      mockProfiles[matchIdx].role = role;
      try {
        let parsedAvatar = JSON.parse(mockProfiles[matchIdx].avatar_config || "{}");
        parsedAvatar.role = role;
        mockProfiles[matchIdx].avatar_config = JSON.stringify(parsedAvatar);
        
        // Push that updated avatar_config containing the role too
        getSupabase()
          .from("profiles")
          .update({ avatar_config: JSON.stringify(parsedAvatar) })
          .eq("username", username.trim())
          .then(() => {});
      } catch {}
      localStorage.setItem("gml_mock_table_profiles", JSON.stringify(mockProfiles));
      window.dispatchEvent(new Event("gml_avatar_updated"));
    }

    // Dispatch event to sync immediately across components
    window.dispatchEvent(new Event("gml_roles_updated"));
    window.dispatchEvent(new Event("storage"));
  } catch (e) {
    console.error("Failed to update user role:", e);
  }
}

