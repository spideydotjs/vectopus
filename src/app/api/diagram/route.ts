import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { GoogleGenAI } from "@google/genai";
import { cleanMermaidCode } from "@/lib/gemini";

/**
 * Helper to discover Gemini API key from environment or local ~/.bashrc
 */
function resolveGeminiApiKey(customKey?: string): string | null {
  if (customKey && customKey.trim().length > 0) {
    return customKey.trim();
  }
  // Check ~/.bashrc on Unix first to pick up any recent bash exports dynamically
  try {
    const bashrc = path.join(os.homedir(), ".bashrc");
    if (fs.existsSync(bashrc)) {
      const text = fs.readFileSync(bashrc, "utf-8");
      const match = text.match(/export\s+GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/i);
      if (match && match[1] && match[1].trim().length > 0) {
        return match[1].trim();
      }
    }
  } catch {
    // ignore
  }

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return process.env.GEMINI_API_KEY.trim();
  }
  if (process.env.gemini_api_key && process.env.gemini_api_key.trim().length > 0) {
    return process.env.gemini_api_key.trim();
  }

  return null;
}

export async function GET() {
  const key = resolveGeminiApiKey();
  if (!key) {
    return NextResponse.json({
      hasServerKey: false,
      serverKeyMasked: null,
    });
  }

  // Mask key: first 6 chars ... last 4 chars
  const masked =
    key.length > 10 ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : "******";

  return NextResponse.json({
    hasServerKey: true,
    serverKeyMasked: masked,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      type = "flowchart",
      action = "generate",
      nodeToExpand,
      existingCode,
      orientation = "TD",
      complexity = "standard",
      customApiKey,
    } = body;

    const apiKey = resolveGeminiApiKey(customApiKey);

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No Gemini API key found. Please set GEMINI_API_KEY in your environment or enter your key in the settings.",
          isAuthError: true,
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build the AI instruction prompt
    let userPrompt = "";

    if (action === "expand_node" && nodeToExpand) {
      if (type === "mindmap") {
        userPrompt = `You are a visual knowledge architect.
Given this existing Mermaid mindmap:
\`\`\`mermaid
${existingCode}
\`\`\`

The user wants to EXPAND the specific node/topic: "${nodeToExpand.label}".
Provide 3 to 5 specific, high-value sub-branches or detailed subtopics for "${nodeToExpand.label}".
Respond with a JSON object in this exact format:
{
  "expandedChildren": ["Subtopic 1", "Subtopic 2", "Subtopic 3", "Subtopic 4"]
}
Do NOT include markdown, commentary, or text outside the JSON object.`;
      } else {
        // Flowchart node expansion
        userPrompt = `You are a senior systems engineer.
Given this existing Mermaid flowchart:
\`\`\`mermaid
${existingCode}
\`\`\`

Expand the step/node: "${nodeToExpand.label}" (id: ${nodeToExpand.id}).
Break down this step into a detailed, robust sub-process or subgraph with 3 to 5 internal steps, error handling, and decision branches.
Return the COMPLETE, UPDATED, VALID Mermaid flowchart (${orientation}) code.
Requirements:
1. Start with 'flowchart ${orientation}'.
2. Replace or enclose "${nodeToExpand.id}" inside a detailed subgraph or sequence.
3. Every node label must be enclosed in double quotes: id["Label"].
4. Output ONLY the raw Mermaid code block. No explanations.`;
      }
    } else {
      // Standard generation
      if (type === "mindmap") {
        userPrompt = `You are an elite visual information architect and executive diagram designer.
Create an exceptionally impressive, richly structured Mermaid.js mindmap about:
"${prompt}"

Complexity level: ${complexity} (make it expansive, deeply insightful, and visually stunning).

Strict Rules for an IMPRESSIVE Mermaid Mindmap:
1. Start with the line: 'mindmap'
2. Define the central root with a double circle and a relevant emoji:
   '  root((🚀 Main Subject Title))'
3. Provide 4 to 6 primary branches with emojis and rounded or hexagonal shapes:
   e.g. '    ("⚡ Core Engineering")', '    {{"🔒 Security & Zero-Trust"}}', '    ("🤖 AI & Autonomous Agents")'
4. Provide 3 to 5 detailed sub-branches under each category with cloud or rounded shapes:
   e.g. '      )"💡 Distributed Consensus"(' or '      ("Real-time Edge Sync")'
5. Provide 2 to 4 specific, high-value leaves with square shapes containing concrete metrics, protocols, or tools:
   e.g. '        ["📌 Raft & Paxos State Machine"]', '        ["⏱️ <5ms P99 Latency SLA"]'
6. Use diverse shapes across levels:
   - Root: (("Title"))
   - Level 1: ("Category") or {{"Category"}}
   - Level 2: )"Subtopic"( or ("Subtopic")
   - Level 3+: ["Detail"]
7. NEVER use raw unquoted colons, backslashes, or unquoted parentheses inside labels.
8. Output ONLY the raw Mermaid mindmap code block. Do NOT include explanations or markdown outside the code block.`;
      } else {
        // Flowchart
        const complexityGuide =
          complexity === "overview"
            ? "Keep it high-level with 5 to 7 main stages."
            : complexity === "deep"
              ? "Provide a deep, production-grade architecture with subgraphs, validation steps, databases, caches, queues, and failure/retry paths."
              : "Provide a balanced, clear workflow with 8 to 12 steps including decision points and alternative paths.";

        userPrompt = `You are a principal systems architect. Create an expandable, professional Mermaid.js flowchart about:
"${prompt}"

Flowchart orientation: ${orientation}
${complexityGuide}

Strict Rules for Mermaid Flowchart:
1. Start with the line: 'flowchart ${orientation}'
2. Use alphanumeric node IDs (e.g. Start, Auth, Check, DB, End).
3. Format nodes with quotes immediately adjacent to brackets without spaces:
   - Start(["Start Terminal"]) for start/end terminals (NEVER write ([ "text" ])).
   - Process["Operation Step"] for process steps (NEVER write [ "text" ]).
   - Decision{"Decision Condition?"} for decisions (NEVER write { "text" }).
   - Database[("Database / Store")] for storage.
4. CRITICAL: NEVER insert spaces between brackets and quotation marks. Write id["Text"], never id[ "Text" ].
5. Include conditional decision branches with clear edge labels: -->|Yes| NextStep and -->|No| FallbackStep.
6. Use subgraphs to organize sections (e.g. subgraph Auth ["1. Authentication"] ... end).
7. Ensure 100% valid Mermaid syntax that renders cleanly with dark theme.
8. Output ONLY the Mermaid flowchart code. Do NOT include explanations.`;
      }
    }

    // Call Gemini models with automatic fallback
    let responseText = "";
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
        });
        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Attempt with ${modelName} failed:`, lastError.message);
        // If it is an auth error, trying another model will not help
        if (
          lastError.message.includes("401") ||
          lastError.message.includes("UNAUTHENTICATED") ||
          lastError.message.includes("API_KEY_INVALID") ||
          lastError.message.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED")
        ) {
          throw lastError;
        }
      }
    }

    if (!responseText) {
      throw lastError || new Error("Gemini returned an empty response.");
    }

    // If expanding mindmap, parse JSON children
    if (action === "expand_node" && type === "mindmap") {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.expandedChildren) && parsed.expandedChildren.length > 0) {
            return NextResponse.json({
              success: true,
              action: "expand_node",
              expandedChildren: parsed.expandedChildren,
            });
          }
        }
      } catch (e) {
        console.warn("JSON parse failed for expanded children, falling back to line parsing", e);
      }
      // Fallback: extract lines
      const cleanLines = responseText
        .split(/\r?\n/)
        .map((l) => l.replace(/^[-*•0-9.)\s]+/, "").trim())
        .filter((l) => l.length > 1 && !l.startsWith("{") && !l.startsWith("}"));

      return NextResponse.json({
        success: true,
        action: "expand_node",
        expandedChildren: cleanLines.slice(0, 5),
      });
    }

    const cleanedCode = cleanMermaidCode(responseText);

    return NextResponse.json({
      success: true,
      code: cleanedCode,
      raw: responseText,
      type,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Gemini diagram generation error:", errorMsg);

    const isAuth =
      errorMsg.includes("401") ||
      errorMsg.includes("UNAUTHENTICATED") ||
      errorMsg.includes("API_KEY_INVALID") ||
      errorMsg.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED") ||
      errorMsg.includes("invalid_token");

    let userFriendly = errorMsg;
    if (isAuth) {
      userFriendly =
        "Invalid or rejected Gemini API key. Google AI Studio keys typically start with 'AIzaSy...'. Please verify or update your key in the settings.";
    }

    return NextResponse.json(
      {
        success: false,
        error: userFriendly,
        isAuthError: isAuth,
      },
      { status: isAuth ? 401 : 500 }
    );
  }
}
