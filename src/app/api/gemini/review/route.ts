import { GoogleGenAI, Type } from "@google/genai";
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

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const body = await req.json();

    // 1. BATCH MODE: Reviews multiple moves in a single API call
    if (body.moves && Array.isArray(body.moves)) {
      const moves = body.moves;
      if (moves.length === 0) {
        return NextResponse.json({ explanations: [] });
      }

      // Format payload into a compact grid to minimize token usage
      const formattedMoves = moves.map((m: any, idx: number) => ({
        index: idx,
        san: m.playerMoveSan,
        classification: m.moveClassification,
        cpLoss: m.cpLoss,
        initialEval: m.initialEval,
        evalAfter: m.evalAfterPlayerMove,
        bestMove: m.engineBestMoveSan || "None",
        reasoningContext: m.reasoningContext || ""
      }));

      const prompt = `
        You are an expert Chess Grandmaster coach acting as the "Grandmaster Lens" AI.
        Below is a chronological sequence of chess moves from an actual game. Your goal is to review each move and create a highly engaging, custom, educational natural-language commentary about it.

        Instructions:
        1. Keep each commentary simple, easy to understand for beginners/intermediates, and highly educational.
        2. Focus on opening principles, tactical patterns, piece activity, material loss, checks, or blunders based on classification.
        3. Be extremely precise and concise (1-2 sentences maximum, e.g., "An excellent continuation that secures the center and opens diagonals for active bishop play.").
        4. Maintain a supportive, coaching, and encouraging tone for good moves, and constructive criticism or sharp warnings for mistakes/blunders.
        5. Output an array of objects containing the "index" (matching the input move index) and "explanation" (your grandmaster commentary).

        Move List to explain:
        ${JSON.stringify(formattedMoves, null, 2)}
      `;

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  explanation: { type: Type.STRING }
                },
                required: ["index", "explanation"]
              }
            }
          }
        });

        const text = response.text?.trim();
        if (text) {
          const parsed = JSON.parse(text);
          return NextResponse.json({ explanations: parsed });
        }
        return NextResponse.json({ explanations: [] });
      } catch (geminiError: any) {
        console.error("Gemini batch translation error:", geminiError);
        return NextResponse.json(
          { error: geminiError.message || "Failed to process batch commentary." },
          { status: 502 }
        );
      }
    }

    // 2. SINGLE MOVE FALLBACK COMPATIBILITY MODE
    const {
      moveClassification,
      playerMoveSan,
      fenBeforeMove,
      cpLoss,
      initialEval,
      evalAfterPlayerMove,
      engineBestMoveSan,
      reasoningContext,
    } = body;

    const prompt = `
      You are an expert Chess Grandmaster coach acting as the "Grandmaster Lens" AI.
      Create a highly engaging, concise, and educational natural language explanation for a chess move based on its classifications.

      Game Context:
      - Current board state FEN (before move): ${fenBeforeMove}
      - Player's Move: ${playerMoveSan}
      - Classification: ${moveClassification}
      - Centipawn loss: ${cpLoss}cp
      - Evaluation before move: ${initialEval}
      - Evaluation after player's move: ${evalAfterPlayerMove}
      ${engineBestMoveSan ? `- Engine's Recommended Best Move: ${engineBestMoveSan}` : ""}
      ${reasoningContext ? `- Additional tactical reasoning: ${reasoningContext}` : ""}

      Please explain why the move was classified as '${moveClassification}'. Your explanations should be:
      1. Very easy to understand for beginners/intermediate players.
      2. Educational, explaining why it's good (e.g., control, tactics, sacrifices) or what it misses.
      3. Precise and extremely concise (1-2 sentences maximum).

      Keep your tone highly encouraging and motivating, or sharp and helpful for mistakes/blunders, without any technical jargon or raw engine logs. Output only the natural language explanation.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const explanation = response.text?.trim() || "A solid continuation maintaining the balance.";
    return NextResponse.json({ explanation });
  } catch (error: any) {
    console.error("Error in Gemini review route:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate move commentary." },
      { status: 500 }
    );
  }
}
