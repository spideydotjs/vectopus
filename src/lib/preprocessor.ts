export interface PreprocessOptions {
  removeBgMode: "none" | "auto" | "color";
  bgRemoveColor: string; // hex format, e.g. "#ffffff"
  bgTolerance: number; // 0 - 100
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  binarize: boolean;
  binarizeThreshold: number; // 0 - 255
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): [number, number, number] | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null;
}

// Helper to detect dominant edge color
function detectDominantEdgeColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const colorCounts: Record<string, number> = {};

  const samplePixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    // Ignore already transparent pixels
    if (a < 50) return;

    // Group colors slightly to handle noise
    const key = `${Math.round(r / 8) * 8},${Math.round(g / 8) * 8},${Math.round(b / 8) * 8}`;
    colorCounts[key] = (colorCounts[key] || 0) + 1;
  };

  // Sample top and bottom rows
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 50))) {
    samplePixel(x, 0);
    samplePixel(x, height - 1);
  }
  // Sample left and right columns
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 50))) {
    samplePixel(0, y);
    samplePixel(width - 1, y);
  }

  let maxCount = 0;
  let dominantColorKey = "255,255,255"; // Default fallback to white

  for (const [key, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantColorKey = key;
    }
  }

  const [r, g, b] = dominantColorKey.split(",").map(Number);
  return [r, g, b];
}

export function preprocessImage(
  imageEl: HTMLImageElement,
  opts: PreprocessOptions,
): { dataUrl: string; detectedColor?: string } {
  const canvas = document.createElement("canvas");
  canvas.width = imageEl.naturalWidth;
  canvas.height = imageEl.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get 2D context from canvas");
  }

  // Draw initial image
  ctx.drawImage(imageEl, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;

  let targetRgb: [number, number, number] | null = null;
  let detectedHex: string | undefined;

  // 1. Detect background color if mode is auto
  if (opts.removeBgMode === "auto") {
    const [dr, dg, db] = detectDominantEdgeColor(data, canvas.width, canvas.height);
    targetRgb = [dr, dg, db];
    detectedHex = "#" + [dr, dg, db].map((x) => x.toString(16).padStart(2, "0")).join("");
  } else if (opts.removeBgMode === "color") {
    targetRgb = hexToRgb(opts.bgRemoveColor);
  }

  // Pre-calculate brightness and contrast factors
  const brightness = opts.brightness; // -100 to 100
  const contrast = opts.contrast; // -100 to 100
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  const maxDistance = opts.bgTolerance * 2.55; // Normalize 0-100 tolerance to 0-255 color distance

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];

    // If pixel is already transparent, keep it
    if (a === 0) continue;

    // Apply color keying / background removal first
    if (targetRgb) {
      const [tr, tg, tb] = targetRgb;
      // Calculate Euclidean distance in RGB color space
      const dist = Math.sqrt(Math.pow(r - tr, 2) + Math.pow(g - tg, 2) + Math.pow(b - tb, 2));

      if (dist <= maxDistance) {
        // Simple smoothing near the tolerance edge
        const featherDist = maxDistance * 0.15;
        if (opts.bgTolerance > 0 && maxDistance - dist < featherDist) {
          const ratio = (maxDistance - dist) / featherDist;
          data[i + 3] = Math.round(a * (1 - ratio));
        } else {
          data[i + 3] = 0;
          continue; // Pixel is fully transparent, skip other filters
        }
      }
    }

    // Apply brightness
    if (brightness !== 0) {
      r = Math.min(255, Math.max(0, r + brightness));
      g = Math.min(255, Math.max(0, g + brightness));
      b = Math.min(255, Math.max(0, b + brightness));
    }

    // Apply contrast
    if (contrast !== 0) {
      r = Math.min(255, Math.max(0, contrastFactor * (r - 128) + 128));
      g = Math.min(255, Math.max(0, contrastFactor * (g - 128) + 128));
      b = Math.min(255, Math.max(0, contrastFactor * (b - 128) + 128));
    }

    // Apply binarization / thresholding
    if (opts.binarize) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = gray >= opts.binarizeThreshold ? 255 : 0;
      r = val;
      g = val;
      b = val;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imgData, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    detectedColor: detectedHex,
  };
}
