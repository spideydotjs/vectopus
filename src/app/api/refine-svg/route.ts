import { NextRequest, NextResponse } from "next/server";
import { generateWithOllama } from "@/lib/ollama";
import { checkRateLimit, llmConcurrencyLimiter } from "@/lib/rate-limit";

const MAX_SVG_BYTES = 250 * 1024; // 250KB

export async function POST(req: NextRequest) {
  // Rate limiting by client IP
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const rateLimitResult = checkRateLimit(`refine_${clientIp}`, 15, 60000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Please wait a minute before requesting more refinements." },
      { status: 429 }
    );
  }

  // Concurrency check
  if (!llmConcurrencyLimiter.acquire()) {
    return NextResponse.json(
      { success: false, error: "Server is currently busy refining another graphic. Please try again in a few seconds." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const {
      svg,
      prompt = "Clean up paths, smooth contours, and harmonize colors.",
      preset = "smooth",
    } = body;

    if (!svg || typeof svg !== "string") {
      return NextResponse.json(
        { success: false, error: "SVG content is required for refinement." },
        { status: 400 }
      );
    }

    if (svg.length > MAX_SVG_BYTES) {
      return NextResponse.json(
        { success: false, error: "SVG exceeds the maximum allowed size (250KB) for AI refinement. Please simplify the SVG first." },
        { status: 413 }
      );
    }

    if (prompt && typeof prompt === "string" && prompt.length > 1000) {
      return NextResponse.json(
        { success: false, error: "Prompt exceeds maximum allowed length of 1,000 characters." },
        { status: 400 }
      );
    }

    // Preset guidance
    let presetGuidance = "";
    if (preset === "smooth") {
      presetGuidance =
        "Focus on smoothing noisy jagged raster edges into elegant, flowing vector bezier curves. Remove microscopic noise specks.";
    } else if (preset === "cyberpunk") {
      presetGuidance =
        "Apply a striking dark cyberpunk aesthetic: deep contrast, vibrant hot-pink, cyan, and purple linear/radial gradients, and glowing contours.";
    } else if (preset === "palette") {
      presetGuidance =
        "Harmonize the color palette into a cohesive, high-end modern brand palette with balanced shades and complementary highlights.";
    } else if (preset === "minimal") {
      presetGuidance =
        "Convert into a crisp, flat geometric minimalism. Simplify complex path clusters into iconic, bold vector shapes.";
    } else if (preset === "enhance") {
      presetGuidance =
        "Enhance vector clarity, add subtle depth, organize layers with semantic <g> elements, and optimize geometry.";
    }

    const safePrompt = String(prompt).replace(/[`\\]/g, "");
    const userPrompt = `You are a world-class SVG vector designer and graphics engineer.
You are tasked with refining and elevating this traced SVG image.

Refinement Style / Goal:
${presetGuidance}

User Instructions:
${safePrompt}

Original SVG:
\`\`\`xml
${svg.trim()}
\`\`\`

Strict Rules:
1. Retain the core recognizable subject and silhouette of the original graphic.
2. Clean up redundant, ragged, or noisy path fragments into clean vector paths.
3. Use modern SVG techniques (e.g. <defs>, <linearGradient>, <radialGradient>, clean fills, clean strokes) where appropriate.
4. Ensure the output is 100% VALID, self-contained SVG with xmlns="http://www.w3.org/2000/svg" and viewBox.
5. Return ONLY the raw SVG code inside an \`\`\`xml ... \`\`\` code block. Do NOT include markdown commentary before or after.`;

    const ollamaResult = await generateWithOllama({
      prompt: userPrompt,
      system:
        "You are an expert Qwen 2.5 Coder vector graphics engineer. Output ONLY valid XML SVG code within ```xml ``` code fences.",
      temperature: 0.2,
    });

    const responseText = ollamaResult.text;
    const usedModel = ollamaResult.model;

    // Extract SVG from code block or raw text
    let refinedSvg = "";
    const xmlMatch = responseText.match(/```(?:xml|svg)?\s*([\s\S]*?)```/i);
    if (xmlMatch && xmlMatch[1]) {
      refinedSvg = xmlMatch[1].trim();
    } else {
      const svgTagMatch = responseText.match(/<svg[\s\S]*<\/svg>/i);
      if (svgTagMatch) {
        refinedSvg = svgTagMatch[0].trim();
      }
    }

    if (!refinedSvg || !refinedSvg.includes("<svg")) {
      throw new Error("Ollama did not return a valid SVG structure. Please try again with a simpler prompt.");
    }

    return NextResponse.json({
      success: true,
      refinedSvg,
      provider: "ollama",
      model: usedModel,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("SVG refinement error:", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to refine SVG with Ollama. Please verify the AI service is reachable and try again.",
      },
      { status: 500 }
    );
  } finally {
    llmConcurrencyLimiter.release();
  }
}
