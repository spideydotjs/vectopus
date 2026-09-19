import { NextRequest, NextResponse } from "next/server";
import { cleanMermaidCode } from "@/lib/diagrams";
import { checkOllamaHealth, generateWithOllama } from "@/lib/ollama";
import { checkRateLimit, llmConcurrencyLimiter } from "@/lib/rate-limit";

export async function GET() {
  const ollamaHealth = await checkOllamaHealth();

  return NextResponse.json({
    provider: "ollama",
    model: ollamaHealth.model,
    isOnline: ollamaHealth.isOnline,
    hasModel: ollamaHealth.hasModel,
    models: ollamaHealth.models,
    baseUrl: ollamaHealth.baseUrl,
    hasServerKey: ollamaHealth.isOnline && ollamaHealth.hasModel,
    serverKeyMasked: `Ollama (${ollamaHealth.model})`,
  });
}

export async function POST(req: NextRequest) {
  // Rate limiting by client IP
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const rateLimitResult = checkRateLimit(`diagram_${clientIp}`, 20, 60000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Please wait a minute before generating more diagrams." },
      { status: 429 }
    );
  }

  // Concurrency check
  if (!llmConcurrencyLimiter.acquire()) {
    return NextResponse.json(
      { success: false, error: "Server is currently busy generating another diagram. Please try again in a few seconds." },
      { status: 503 }
    );
  }

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
      compact = false,
    } = body;

    // Validate inputs
    if (!prompt && action !== "expand_node") {
      return NextResponse.json(
        { success: false, error: "Prompt is required." },
        { status: 400 }
      );
    }

    if (prompt && typeof prompt === "string" && prompt.length > 2000) {
      return NextResponse.json(
        { success: false, error: "Prompt exceeds maximum allowed length of 2,000 characters." },
        { status: 400 }
      );
    }

    if (existingCode && typeof existingCode === "string" && existingCode.length > 50000) {
      return NextResponse.json(
        { success: false, error: "Existing diagram code exceeds size limit." },
        { status: 400 }
      );
    }

    const safeOrientation = ["TD", "TB", "LR", "RL", "BT"].includes(orientation) ? orientation : "TD";
    const safeType = type === "mindmap" ? "mindmap" : "flowchart";

    // Build the AI instruction prompt
    let userPrompt = "";

    if (action === "expand_node" && nodeToExpand) {
      const safeLabel = String(nodeToExpand.label || "").slice(0, 200).replace(/[<>\\]/g, "");
      const safeId = String(nodeToExpand.id || "").slice(0, 100).replace(/[^a-zA-Z0-9_-]/g, "");

      if (safeType === "mindmap") {
        userPrompt = `You are an expert visual knowledge architect and programmer.
Given this existing Mermaid mindmap:
\`\`\`mermaid
${existingCode}
\`\`\`

The user wants to EXPAND the specific node/topic: "${safeLabel}".
Provide 3 to 5 specific, high-value sub-branches or detailed subtopics for "${safeLabel}".
Rules:
- NEVER use emojis in topic labels. Use clean, professional text.
Respond with a JSON object in this exact format:
{
  "expandedChildren": ["Subtopic 1", "Subtopic 2", "Subtopic 3", "Subtopic 4"]
}
Do NOT include markdown, commentary, or text outside the JSON object.`;
      } else {
        // Flowchart node expansion
        userPrompt = `You are a senior software and systems architect.
Given this existing Mermaid flowchart:
\`\`\`mermaid
${existingCode}
\`\`\`

Expand the step/node: "${safeLabel}" (id: ${safeId}).
Break down this step into a detailed, robust sub-process or subgraph with 3 to 5 internal steps, error handling, and decision branches.
Return the COMPLETE, UPDATED, VALID Mermaid flowchart (${safeOrientation}) code.
Requirements:
1. Start with 'flowchart ${safeOrientation}'.
2. Replace or enclose "${safeId}" inside a detailed subgraph or sequence.
3. Every node label must be enclosed in double quotes: id["Label"].
4. NEVER use emojis in node labels. Use clean, executive-ready technical wording.
5. Output ONLY the raw Mermaid code block. No explanations.`;
      }
    } else {
      // Standard generation
      const safeUserPrompt = String(prompt || "").replace(/[`\\]/g, "");
      if (safeType === "mindmap") {
        userPrompt = `You are an elite visual information architect and executive diagram designer.
Create a clean, professional, richly structured Mermaid.js mindmap about:
"${safeUserPrompt}"

Complexity level: ${complexity}.

Strict Rules for the Mermaid Mindmap:
1. Start with the line: 'mindmap'
2. Define the central root with a double circle:
   '  root((Main Subject Title))'
3. Provide 4 to 6 primary branches with rounded or hexagonal shapes:
   e.g. '    ("Core Architecture")', '    {{"Security and Governance"}}', '    ("Data Infrastructure")'
4. Provide 3 to 5 detailed sub-branches under each category:
   e.g. '      )"Distributed Consensus"(' or '      ("Edge Synchronization")'
5. Provide 2 to 4 specific, high-value leaves with square shapes containing concrete metrics, protocols, or tools:
   e.g. '        ["Raft State Machine"]', '        ["Sub-5ms Latency SLA"]'
6. Use diverse shapes across levels:
   - Root: (("Title"))
   - Level 1: ("Category") or {{"Category"}}
   - Level 2: )"Subtopic"( or ("Subtopic")
   - Level 3+: ["Detail"]
7. ABSOLUTE REQUIREMENT: NEVER use any emojis or icons. Use strictly clean, professional text labels.
8. Wrap every label in double quotes. NEVER leave raw unquoted colons, backslashes, or unquoted parentheses inside labels.
9. Output ONLY the raw Mermaid mindmap code block. Do NOT include explanations or markdown outside the code block.`;
      } else {
        // Flowchart
        const pptGuide = compact
          ? "COMPACT PRESENTATION (PPT) MODE: Optimize for 16:9 slides. Keep node labels short and impactful (max 4-5 words per step). Maintain clear sequential flow that fits onto a single presentation slide without sprawling."
          : "";

        const complexityGuide =
          complexity === "overview"
            ? "Keep it high-level with 5 to 7 main stages."
            : complexity === "deep"
              ? "Provide a deep, production-grade architecture with subgraphs, validation steps, databases, caches, queues, and failure/retry paths."
              : "Provide a balanced, clear workflow with 8 to 12 steps including decision points and alternative paths.";

        userPrompt = `You are a principal systems architect and software engineer. Create a professional, clear Mermaid.js flowchart about:
"${safeUserPrompt}"

Flowchart orientation: ${safeOrientation}
${complexityGuide}
${pptGuide}

Strict Rules for Mermaid Flowchart:
1. Start with the line: 'flowchart ${safeOrientation}'
2. Use alphanumeric node IDs (e.g. Start, Auth, Check, DB, End).
3. Format nodes with quotes immediately adjacent to brackets without spaces:
   - Start(["Start Terminal"]) for start/end terminals.
   - Process["Operation Step"] for process steps.
   - Decision{"Decision Condition?"} for decisions.
   - Database[("Database / Store")] for storage.
4. CRITICAL: NEVER insert spaces between brackets and quotation marks. Write id["Text"], never id[ "Text" ].
5. ABSOLUTE REQUIREMENT: NEVER use any emojis or icons. Use clean, executive-ready, professional technical text.
6. Include conditional decision branches with clear edge labels: -->|Yes| NextStep and -->|No| FallbackStep.
7. Use subgraphs to organize sections (e.g. subgraph Auth ["1. Authentication"] ... end).
8. Ensure 100% valid Mermaid syntax that renders cleanly.
9. Output ONLY the Mermaid flowchart code. Do NOT include explanations.`;
      }
    }

    const ollamaResult = await generateWithOllama({
      prompt: userPrompt,
      system:
        "You are an expert Qwen 2.5 Coder diagram architect specializing in Mermaid.js and clean software architectures. Output ONLY valid Mermaid syntax or requested JSON. No preamble or markdown outside code blocks.",
      format: action === "expand_node" && safeType === "mindmap" ? "json" : undefined,
      temperature: 0.15,
    });

    const responseText = ollamaResult.text;
    const usedModel = ollamaResult.model;

    // If expanding mindmap, parse JSON children
    if (action === "expand_node" && safeType === "mindmap") {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.expandedChildren) && parsed.expandedChildren.length > 0) {
            return NextResponse.json({
              success: true,
              action: "expand_node",
              expandedChildren: parsed.expandedChildren.map((item: unknown) => String(item).slice(0, 100)),
              provider: "ollama",
              model: usedModel,
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
        .filter((l) => l.length > 1 && !l.startsWith("{") && !l.startsWith("}") && !l.startsWith("```"));

      return NextResponse.json({
        success: true,
        action: "expand_node",
        expandedChildren: cleanLines.slice(0, 5).map((l) => l.slice(0, 100)),
        provider: "ollama",
        model: usedModel,
      });
    }

    const cleanedCode = cleanMermaidCode(responseText);

    return NextResponse.json({
      success: true,
      code: cleanedCode,
      raw: responseText,
      type: safeType,
      provider: "ollama",
      model: usedModel,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Diagram generation error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate diagram with Ollama. Please check that the local AI service is online and try again.",
      },
      { status: 500 }
    );
  } finally {
    llmConcurrencyLimiter.release();
  }
}
