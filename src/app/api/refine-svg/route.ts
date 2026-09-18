import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { GoogleGenAI } from "@google/genai";

function resolveGeminiApiKey(customKey?: string): string | null {
  if (customKey && customKey.trim().length > 0) {
    return customKey.trim();
  }

  // Check ~/.bashrc on Unix first to pick up any recent bash exports
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      svg,
      prompt = "Clean up paths, smooth contours, and harmonize colors.",
      preset = "smooth",
      customApiKey,
    } = body;

    if (!svg || typeof svg !== "string") {
      return NextResponse.json(
        { success: false, error: "SVG content is required for refinement." },
        { status: 400 }
      );
    }

    const apiKey = resolveGeminiApiKey(customApiKey);

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "No Gemini API key found. Please set GEMINI_API_KEY in your environment or enter your key in settings.",
          isAuthError: true,
        },
        { status: 401 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Preset guidance
    let presetGuidance = "";
    if (preset === "smooth") {
      presetGuidance = "Focus on smoothing noisy jagged raster edges into elegant, flowing vector bezier curves. Remove microscopic noise specks.";
    } else if (preset === "cyberpunk") {
      presetGuidance = "Apply a striking dark cyberpunk aesthetic: deep contrast, vibrant hot-pink, cyan, and purple linear/radial gradients, and glowing contours.";
    } else if (preset === "palette") {
      presetGuidance = "Harmonize the color palette into a cohesive, high-end modern brand palette with balanced shades and complementary highlights.";
    } else if (preset === "minimal") {
      presetGuidance = "Convert into a crisp, flat geometric minimalism. Simplify complex path clusters into iconic, bold vector shapes.";
    } else if (preset === "enhance") {
      presetGuidance = "Enhance vector clarity, add subtle depth, organize layers with semantic <g> elements, and optimize geometry.";
    }

    // Truncate SVG if overly massive (> 300KB) to prevent token limits
    let svgPayload = svg.trim();
    if (svgPayload.length > 250000) {
      // Keep headers and first portion of paths
      svgPayload = svgPayload.slice(0, 250000) + "\n</svg>";
    }

    const userPrompt = `You are a world-class SVG vector designer and graphics engineer.
You are tasked with refining and elevating this traced SVG image.

Refinement Style / Goal:
${presetGuidance}

User Instructions:
${prompt}

Original SVG:
\`\`\`xml
${svgPayload}
\`\`\`

Strict Rules:
1. Retain the core recognizable subject and silhouette of the original graphic.
2. Clean up redundant, ragged, or noisy path fragments into clean vector paths.
3. Use modern SVG techniques (e.g. <defs>, <linearGradient>, <radialGradient>, clean fills, clean strokes) where appropriate.
4. Ensure the output is 100% VALID, self-contained SVG with xmlns="http://www.w3.org/2000/svg" and viewBox.
5. Return ONLY the raw SVG code inside an \`\`\`xml ... \`\`\` code block. Do NOT include markdown commentary before or after.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
    });

    const responseText = response.text || "";

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
      throw new Error("Gemini did not return a valid SVG structure.");
    }

    return NextResponse.json({
      success: true,
      refinedSvg,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("SVG refinement error:", errorMsg);

    const isAuth =
      errorMsg.includes("401") ||
      errorMsg.includes("UNAUTHENTICATED") ||
      errorMsg.includes("API_KEY_INVALID") ||
      errorMsg.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED");

    return NextResponse.json(
      {
        success: false,
        error: isAuth
          ? "Gemini API authentication failed. Please verify your GEMINI_API_KEY in ~/.bashrc or settings."
          : errorMsg,
        isAuthError: isAuth,
      },
      { status: isAuth ? 401 : 500 }
    );
  }
}
