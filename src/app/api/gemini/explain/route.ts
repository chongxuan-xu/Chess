import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const { fen, moves, playerColor } = await req.json();

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `
      You are a world-class Chess Grandmaster and seasoned analyst acting as the "Grandmaster Lens" AI.
      Analyze this chess position and give a tactical commentary.
      
      Current FEN: ${fen}
      History of moves played: ${JSON.stringify(moves)}
      User plays as: ${playerColor || "spectator"}
      
      Provide a concise commentary in 2-3 short, highly engaging paragraphs, highlighting:
      1. The tactical evaluation of the position (who is better, what are the core weaknesses).
      2. Recommended plans or lines of play for the user's color.
      3. A slightly witty, instructive, and motivating comment.
      
      Do not output any raw system logs or JSON. Keep your tone encouraging, sharp, and highly strategic.
    `;

    // System instruction says we can use gemini-3.5-flash. Let's use the standard gemini-3.5-flash model.
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const text = response.text || "No commentary generated.";
    return NextResponse.json({ commentary: text });
  } catch (error: any) {
    console.error("Error in Gemini explain route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze position." },
      { status: 500 }
    );
  }
}
