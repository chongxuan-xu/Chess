"use client";

// Standard Chess Elo rating system utilities

export type EloType = "bullet" | "blitz" | "rapid";

export interface EloState {
  bullet: number;
  blitz: number;
  rapid: number;
  history: {
    bullet: number[];
    blitz: number[];
    rapid: number[];
  };
}

// Initial defaults
const DEFAULT_ELO = 1200;

export function getEloState(): EloState {
  if (typeof window === "undefined") {
    return {
      bullet: DEFAULT_ELO,
      blitz: DEFAULT_ELO,
      rapid: DEFAULT_ELO,
      history: {
        bullet: [DEFAULT_ELO],
        blitz: [DEFAULT_ELO],
        rapid: [DEFAULT_ELO]
      }
    };
  }

  try {
    const rawState = localStorage.getItem("gml_elo_state_v2");
    if (rawState) {
      const parsed = JSON.parse(rawState);
      // Validate structure matches
      if (
        parsed && 
        typeof parsed.bullet === "number" && 
        parsed.history && 
        Array.isArray(parsed.history.bullet)
      ) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error reading Elo state from storage, falling back to defaults.", e);
  }

  // Create clean initial state
  const initialState: EloState = {
    bullet: DEFAULT_ELO,
    blitz: DEFAULT_ELO,
    rapid: DEFAULT_ELO,
    history: {
      bullet: [DEFAULT_ELO],
      blitz: [DEFAULT_ELO],
      rapid: [DEFAULT_ELO]
    }
  };

  saveEloState(initialState);
  return initialState;
}

export function saveEloState(state: EloState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("gml_elo_state_v2", JSON.stringify(state));
    // Trigger global synchronization events
    window.dispatchEvent(new Event("gml_elo_updated"));
  } catch (e) {
    console.error("Failed to persist Elo ratings:", e);
  }
}

/**
 * Updates a player rating using standard Elo formula:
 * expected = 1 / (1 + 10^((opp - player) / 400))
 * change = K * (outcome - expected)
 */
export function updatePlayerRating(
  type: EloType,
  outcome: "win" | "loss" | "draw",
  opponentRating: number
): { oldRating: number; newRating: number; change: number } {
  const state = getEloState();
  const playerRating = state[type] || DEFAULT_ELO;

  const actualScore = outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5;
  const K = 32; // Standard rating K-factor

  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const change = Math.round(K * (actualScore - expectedScore));
  
  // Ensure Elo doesn't go below 100
  const newRating = Math.max(100, playerRating + change);

  // Append history
  const historyList = [...(state.history[type] || [DEFAULT_ELO])];
  historyList.push(newRating);

  // Update original state object
  state[type] = newRating;
  state.history[type] = historyList;

  saveEloState(state);

  return {
    oldRating: playerRating,
    newRating,
    change
  };
}

export function classifyCustomControl(totalSeconds: number): EloType {
  if (totalSeconds < 180) {
    return "bullet"; // Under 3 mins
  } else if (totalSeconds < 600) {
    return "blitz";  // Under 10 mins
  } else {
    return "rapid";  // 10 mins or greater
  }
}

export interface ParsedPlayer {
  username: string;
  rating: number;
  mode: string;
}

export function parsePlayerName(fullName: string): ParsedPlayer {
  if (!fullName) return { username: "Guest", rating: 1200, mode: "" };
  
  // E.g. "ChongXuan (1235) [blitz]" or "ChongXuan (1000) [bullet]"
  const ratingMatch = fullName.match(/\((\d+)\)/);
  const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 1200;

  const modeMatch = fullName.match(/\[([^\]]+)\]/);
  const mode = modeMatch ? modeMatch[1] : "";

  // Extract raw username: everything before the first space or parenthesis
  let username = fullName;
  const parenIdx = fullName.indexOf("(");
  if (parenIdx !== -1) {
    username = fullName.substring(0, parenIdx).trim();
  }

  return { username, rating, mode };
}

