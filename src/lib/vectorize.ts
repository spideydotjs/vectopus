// @ts-expect-error - imagetracerjs ships no types
import ImageTracer from "imagetracerjs";

export type Mode = "color" | "bw" | "outline";
export type Smoothing = "low" | "medium" | "high";

export interface VectorizeOptions {
  mode: Mode;
  colors: number; // 2-32
  threshold: number; // 1-10 (determines details)
  smoothing: Smoothing;
  despeckle: number; // 0-50 (ignores paths below this pixel size)
  rightAngleEnhance: boolean; // sharp corners for text / pixel art
  roundCoords: number; // decimal places (0-3) for SVG size optimization
}

function smoothingParams(s: Smoothing) {
  switch (s) {
    case "low":
      return { ltres: 1.5, qtres: 1.5 };
    case "high":
      return { ltres: 0.1, qtres: 0.1 };
    default:
      return { ltres: 0.6, qtres: 0.6 };
  }
}

export async function vectorizePng(
  preprocessedDataUrl: string,
  opts: VectorizeOptions,
): Promise<string> {
  const imageData = await new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error("Failed to decode image data"));
    img.src = preprocessedDataUrl;
  });

  const smooth = smoothingParams(opts.smoothing);

  const baseOpts: Record<string, unknown> = {
    ...smooth,
    pathomit: opts.despeckle,
    rightangleenhance: opts.rightAngleEnhance,
    strokewidth: 1.25,
    linefilter: opts.smoothing !== "low",
    scale: 1,
    roundcoords: opts.roundCoords,
    viewbox: true,
    desc: false,
  };

  if (opts.mode === "color") {
    Object.assign(baseOpts, {
      numberofcolors: opts.colors,
      colorquantcycles: 4,
      colorsampling: 2,
      mincolorratio: 0,
    });
  } else if (opts.mode === "bw") {
    Object.assign(baseOpts, {
      numberofcolors: 2,
      colorquantcycles: 1,
      colorsampling: 0,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
      ],
    });
  } else {
    // outline only
    Object.assign(baseOpts, {
      numberofcolors: 2,
      colorquantcycles: 1,
      colorsampling: 0,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 0 },
      ],
      strokewidth: 1.5,
    });
  }

  // Yield to UI
  await new Promise((r) => setTimeout(r, 20));

  let svg: string = ImageTracer.imagedataToSVG(imageData, baseOpts);

  if (opts.mode === "outline") {
    // Strip fills, keep strokes and style them nicely
    svg = svg
      .replace(/fill="[^"]*"/g, 'fill="none"')
      .replace(/stroke="[^"]*"/g, 'stroke="currentColor"')
      .replace(
        /<path /g,
        '<path stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ',
      );
  }

  return svg;
}
