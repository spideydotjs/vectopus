import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VetopusLogo } from "./VetopusLogo";
import { vectorizePng, type Mode, type Smoothing, type VectorizeOptions } from "@/lib/vectorize";
import { preprocessImage, type PreprocessOptions } from "@/lib/preprocessor";
import {
  Upload,
  Sliders,
  Play,
  Download,
  Copy,
  Check,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Palette,
  Sparkles,
  Scissors,
  FileCode,
  Layers,
  Image as ImageIcon,
  Expand,
  Settings,
  Grid,
  Info,
  Maximize,
} from "lucide-react";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type ViewMode = "compare" | "split" | "svg-only" | "original";
type PresetType = "logo" | "detailed" | "silhouette" | "outline" | "pixel" | "custom";

export function Vetopus() {
  // File upload states
  const [file, setFile] = useState<File | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);

  // Preprocessor states
  const [removeBgMode, setRemoveBgMode] = useState<"none" | "auto" | "color">("none");
  const [bgRemoveColor, setBgRemoveColor] = useState<string>("#ffffff");
  const [bgTolerance, setBgTolerance] = useState<number>(20);
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [binarize, setBinarize] = useState<boolean>(false);
  const [binarizeThreshold, setBinarizeThreshold] = useState<number>(128);
  const [preprocessedUrl, setPreprocessedUrl] = useState<string | null>(null);

  // Vectorizer states
  const [preset, setPreset] = useState<PresetType>("logo");
  const [mode, setMode] = useState<Mode>("color");
  const [colors, setColors] = useState<number>(8);
  const [smoothing, setSmoothing] = useState<Smoothing>("medium");
  const [despeckle, setDespeckle] = useState<number>(8);
  const [rightAngleEnhance, setRightAngleEnhance] = useState<boolean>(false);
  const [roundCoords, setRoundCoords] = useState<number>(1);

  // SVG states
  const [svg, setSvg] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // Interactive Viewport states
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sliderPos, setSliderPos] = useState<number>(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isSplitDraggingRef = useRef<boolean>(false);

  // Code inspection states
  const [showCode, setShowCode] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [dragging, setDragging] = useState<boolean>(false);

  const originalSize = file?.size || 0;
  const svgSize = useMemo(() => (svg ? new Blob([svg]).size : 0), [svg]);
  const pathCount = useMemo(() => (svg ? (svg.match(/<path/g) || []).length : 0), [svg]);

  // Load image once pngUrl changes
  useEffect(() => {
    if (!pngUrl) {
      setLoadedImage(null);
      setPreprocessedUrl(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setLoadedImage(img);
    };
    img.onerror = () => {
      setErr("Failed to load uploaded image.");
    };
    img.src = pngUrl;
  }, [pngUrl]);

  // Run Canvas Preprocessor in real-time
  useEffect(() => {
    if (!loadedImage) return;

    try {
      const { dataUrl, detectedColor } = preprocessImage(loadedImage, {
        removeBgMode,
        bgRemoveColor,
        bgTolerance,
        brightness,
        contrast,
        binarize,
        binarizeThreshold,
      });
      setPreprocessedUrl(dataUrl);
      if (detectedColor && removeBgMode === "auto") {
        setBgRemoveColor(detectedColor);
      }
      setErr(null);
    } catch (e) {
      console.error(e);
      setErr("Failed during image preprocessing.");
    }
  }, [
    loadedImage,
    removeBgMode,
    bgRemoveColor,
    bgTolerance,
    brightness,
    contrast,
    binarize,
    binarizeThreshold,
  ]);

  // Sync SVG blob URL
  useEffect(() => {
    if (!svg) {
      setSvgUrl(null);
      return;
    }
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);

  // Preset Applicator
  const applyPreset = (p: PresetType) => {
    setPreset(p);
    if (p === "logo") {
      setMode("color");
      setColors(8);
      setSmoothing("medium");
      setDespeckle(8);
      setRightAngleEnhance(false);
      setBinarize(false);
    } else if (p === "detailed") {
      setMode("color");
      setColors(24);
      setSmoothing("high");
      setDespeckle(2);
      setRightAngleEnhance(false);
      setBinarize(false);
    } else if (p === "silhouette") {
      setMode("bw");
      setColors(2);
      setSmoothing("medium");
      setDespeckle(12);
      setRightAngleEnhance(false);
      setBinarize(true);
      setBinarizeThreshold(128);
    } else if (p === "outline") {
      setMode("outline");
      setColors(2);
      setSmoothing("medium");
      setDespeckle(6);
      setRightAngleEnhance(false);
      setBinarize(false);
    } else if (p === "pixel") {
      setMode("color");
      setColors(12);
      setSmoothing("low");
      setDespeckle(0);
      setRightAngleEnhance(true);
      setBinarize(false);
    }
  };

  // Click-to-pick color from original image preview
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!loadedImage || removeBgMode !== "color") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Scale click to natural resolution
    const naturalX = Math.floor((x / rect.width) * loadedImage.naturalWidth);
    const naturalY = Math.floor((y / rect.height) * loadedImage.naturalHeight);

    // Safeguard coordinates
    if (
      naturalX >= 0 &&
      naturalX < loadedImage.naturalWidth &&
      naturalY >= 0 &&
      naturalY < loadedImage.naturalHeight
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = loadedImage.naturalWidth;
      canvas.height = loadedImage.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(loadedImage, 0, 0);

      const pixel = ctx.getImageData(naturalX, naturalY, 1, 1).data;
      const hex =
        "#" +
        Array.from(pixel.slice(0, 3))
          .map((c) => c.toString(16).padStart(2, "0"))
          .join("");
      setBgRemoveColor(hex);
    }
  };

  const acceptFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!/image\/(png|jpeg|webp)/i.test(f.type) && !/\.(png|jpg|jpeg|webp)$/i.test(f.name)) {
      setErr("Please upload an image (PNG, JPG, or WEBP).");
      return;
    }
    setErr(null);
    setSvg(null);
    setFile(f);
    setPngUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    // Reset view options
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleConvert = async () => {
    if (!preprocessedUrl) return;
    setErr(null);
    setIsTracing(true);
    // Yield to render progress indicator
    await new Promise((r) => setTimeout(r, 50));

    try {
      const opts: VectorizeOptions = {
        mode,
        colors,
        threshold: 5, // constant threshold internally for path detail
        smoothing,
        despeckle,
        rightAngleEnhance,
        roundCoords,
      };
      const out = await vectorizePng(preprocessedUrl, opts);
      setSvg(out);
      // Switch view mode to show the result
      setViewMode("split");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setIsTracing(false);
    }
  };

  const handleDownload = () => {
    if (!svg || !file) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.[^/.]+$/, "") + ".svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = () => {
    if (!svg) return;
    navigator.clipboard.writeText(svg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Zoom and Pan Drag Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSplitDraggingRef.current) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSplitDraggingRef.current) {
      handleSplitMove(e.clientX);
      return;
    }
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    isSplitDraggingRef.current = false;
  };

  const handleSplitMove = (clientX: number) => {
    if (!splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.min(100, Math.max(0, pos)));
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!file) return;
    e.preventDefault();
    const factor = 1.15;
    const nextZoom = e.deltaY < 0 ? zoom * factor : zoom / factor;
    setZoom(Math.min(12, Math.max(0.75, nextZoom)));
  };

  const adjustZoom = (type: "in" | "out" | "reset") => {
    if (type === "in") setZoom((z) => Math.min(12, z * 1.3));
    else if (type === "out") setZoom((z) => Math.max(0.75, z / 1.3));
    else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  const clearFile = () => {
    setFile(null);
    setPngUrl(null);
    setLoadedImage(null);
    setPreprocessedUrl(null);
    setSvg(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-pink/20">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <VetopusLogo className="h-8 w-8 text-pink animate-pulse" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              vetopus{" "}
              <span className="text-xs bg-pink/10 text-pink px-2 py-0.5 rounded-[4px] font-mono">
                v2.0
              </span>
            </h1>
            <p className="text-[10px] font-mono text-muted-foreground">
              professional image to vector studio
            </p>
          </div>
        </div>

        {file && (
          <button
            onClick={clearFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-mono bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            clear workspace
          </button>
        )}
      </header>

      {/* Main Studio Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-[calc(100vh-69px)]">
        {/* Left Control Sidebar */}
        <section className="lg:col-span-4 border-r border-border/40 p-6 overflow-y-auto space-y-6 flex flex-col bg-card/10">
          {/* File uploader */}
          {!file ? (
            <label
              htmlFor="dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex-1 min-h-[300px] flex flex-col items-center justify-center rounded-[12px] border-2 border-dashed transition-all p-8 text-center cursor-pointer ${
                dragging
                  ? "border-pink bg-pink/5 scale-[0.98]"
                  : "border-border/60 hover:border-pink/40 hover:bg-card/30"
              }`}
            >
              <input
                id="dropzone"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
              <div className="p-4 rounded-full bg-card mb-4 border border-border/40">
                <Upload className="w-8 h-8 text-pink" />
              </div>
              <h3 className="font-bold text-white mb-1">drop image here</h3>
              <p className="text-xs text-muted-foreground font-mono max-w-[200px] mx-auto mb-4">
                supports PNG, JPG, or WEBP up to 10MB
              </p>
              <div className="px-4 py-2 bg-pink text-pink-foreground text-xs font-mono rounded-[8px] hover:opacity-90 transition-opacity">
                select file
              </div>
            </label>
          ) : (
            <div className="space-y-6">
              {/* Image Preprocessor Tools */}
              <div className="bg-card/40 border border-border/40 rounded-[10px] p-4 space-y-4">
                <div className="flex items-center gap-2 text-white border-b border-border/30 pb-2">
                  <Scissors className="w-4 h-4 text-pink" />
                  <h3 className="text-xs uppercase font-bold tracking-wider font-mono">
                    1. Image Preprocessor
                  </h3>
                </div>

                {/* Background Removal */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                    background removal
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-background p-0.5 rounded-[6px] border border-border/30">
                    {(["none", "auto", "color"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setRemoveBgMode(m)}
                        className={`py-1.5 text-[10px] font-mono rounded-[4px] capitalize transition-colors ${
                          removeBgMode === m
                            ? "bg-pink text-pink-foreground"
                            : "text-muted-foreground hover:text-white"
                        }`}
                      >
                        {m === "none" ? "none" : m === "auto" ? "auto detect" : "eyedropper"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Eyedropper Color Picker Controls */}
                {removeBgMode === "color" && (
                  <div className="animate-in fade-in slide-in-from-top-1 duration-200 border-l-2 border-pink pl-3 space-y-2 py-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Target Background:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={bgRemoveColor}
                          onChange={(e) => setBgRemoveColor(e.target.value)}
                          className="w-5 h-5 rounded-full border border-border/60 bg-transparent cursor-pointer p-0 overflow-hidden"
                        />
                        <span className="text-[10px] font-mono text-white uppercase">
                          {bgRemoveColor}
                        </span>
                      </div>
                    </div>
                    <p className="text-[9px] font-mono text-pink/80 leading-snug">
                      💡 Tip: Click anywhere on the left preview image to pick a specific color.
                    </p>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">Tolerance</span>
                        <span className="text-white">{bgTolerance}%</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={80}
                        value={bgTolerance}
                        onChange={(e) => setBgTolerance(Number(e.target.value))}
                        className="w-full accent-pink"
                      />
                    </div>
                  </div>
                )}

                {removeBgMode === "auto" && (
                  <div className="animate-in fade-in duration-200 border-l-2 border-pink pl-3 space-y-2 py-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">Detected Color:</span>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-4 h-4 rounded-full border border-border"
                          style={{ backgroundColor: bgRemoveColor }}
                        />
                        <span className="text-white uppercase">{bgRemoveColor}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">Tolerance</span>
                        <span className="text-white">{bgTolerance}%</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={85}
                        value={bgTolerance}
                        onChange={(e) => setBgTolerance(Number(e.target.value))}
                        className="w-full accent-pink"
                      />
                    </div>
                  </div>
                )}

                {/* Adjustments */}
                <div className="space-y-3 pt-2 border-t border-border/20">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">Brightness</span>
                        <span className="text-white">
                          {brightness > 0 ? `+${brightness}` : brightness}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        value={brightness}
                        onChange={(e) => setBrightness(Number(e.target.value))}
                        className="w-full accent-pink"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">Contrast</span>
                        <span className="text-white">
                          {contrast > 0 ? `+${contrast}` : contrast}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        value={contrast}
                        onChange={(e) => setContrast(Number(e.target.value))}
                        className="w-full accent-pink"
                      />
                    </div>
                  </div>

                  {/* Silhouette Binarization option */}
                  <div className="space-y-2 border-t border-border/10 pt-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Binarize Silhouette (Black & White)
                      </span>
                      <input
                        type="checkbox"
                        checked={binarize}
                        onChange={(e) => {
                          setBinarize(e.target.checked);
                          if (e.target.checked) applyPreset("silhouette");
                        }}
                        className="h-3.5 w-3.5 accent-pink rounded border-border"
                      />
                    </label>

                    {binarize && (
                      <div className="space-y-1 pl-2 border-l border-border/30 animate-in slide-in-from-top-1 duration-150">
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="text-muted-foreground">Threshold Cutoff</span>
                          <span className="text-white">{binarizeThreshold}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={230}
                          value={binarizeThreshold}
                          onChange={(e) => setBinarizeThreshold(Number(e.target.value))}
                          className="w-full accent-pink"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Vectorization Engine Presets */}
              <div className="bg-card/40 border border-border/40 rounded-[10px] p-4 space-y-4">
                <div className="flex items-center gap-2 text-white border-b border-border/30 pb-2">
                  <Palette className="w-4 h-4 text-pink" />
                  <h3 className="text-xs uppercase font-bold tracking-wider font-mono">
                    2. Vector Engine Presets
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "logo", label: "Logo/Graphic", desc: "Clean solid areas" },
                      { id: "detailed", label: "Detailed Vector", desc: "Complex colors/shapes" },
                      { id: "silhouette", label: "Silhouette", desc: "Solid contrast mask" },
                      { id: "outline", label: "Outline Sketch", desc: "Stroke contours only" },
                      { id: "pixel", label: "Retro Pixel Art", desc: "Sharp pixel borders" },
                      { id: "custom", label: "Custom Controls", desc: "Manual parameters" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={`text-left p-2.5 rounded-[8px] border transition-all ${
                        preset === p.id
                          ? "border-pink bg-pink/5 text-white shadow-[0_0_12px_rgba(236,72,153,0.15)]"
                          : "border-border/30 bg-card/20 text-muted-foreground hover:border-border hover:bg-card/50"
                      }`}
                    >
                      <div className="text-[10px] font-bold font-mono tracking-tight text-white capitalize">
                        {p.label}
                      </div>
                      <div className="text-[9px] font-mono text-muted-foreground leading-normal mt-0.5">
                        {p.desc}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Collapsible Advanced settings */}
                <div className="border-t border-border/20 pt-2">
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between py-1.5 text-[10px] font-mono text-muted-foreground hover:text-white transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      <Sliders className="w-3 h-3 text-pink" />
                      {showAdvanced ? "hide advanced configs" : "show advanced configs"}
                    </span>
                    <span className="text-xs">{showAdvanced ? "▲" : "▼"}</span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 space-y-3 pl-1 animate-in fade-in duration-200">
                      {/* Mode selection */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                          Trace Mode
                        </label>
                        <select
                          value={mode}
                          onChange={(e) => {
                            setMode(e.target.value as Mode);
                            setPreset("custom");
                          }}
                          className="w-full bg-background border border-border/40 rounded-[6px] p-1.5 text-xs font-mono focus:outline-none focus:border-pink text-white"
                        >
                          <option value="color">Full Color Map</option>
                          <option value="bw">Black &amp; White Map</option>
                          <option value="outline">Outlines (Strokes only)</option>
                        </select>
                      </div>

                      {/* Color count */}
                      {mode === "color" && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-mono">
                            <span className="uppercase text-muted-foreground">Color Count</span>
                            <span className="text-white font-bold">{colors} colors</span>
                          </div>
                          <input
                            type="range"
                            min={2}
                            max={32}
                            value={colors}
                            onChange={(e) => {
                              setColors(Number(e.target.value));
                              setPreset("custom");
                            }}
                            className="w-full accent-pink"
                          />
                        </div>
                      )}

                      {/* Curve Smoothing */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                          Spline Smoothing
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-background p-0.5 rounded-[6px] border border-border/30">
                          {(["low", "medium", "high"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                setSmoothing(s);
                                setPreset("custom");
                              }}
                              className={`py-1 text-[9px] font-mono rounded-[4px] capitalize transition-colors ${
                                smoothing === s
                                  ? "bg-pink/20 text-pink border border-pink/40"
                                  : "text-muted-foreground hover:text-white"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Despeckle Noise */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="uppercase text-muted-foreground">
                            Noise Despeckle (Filter paths)
                          </span>
                          <span className="text-white font-bold">{despeckle} px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={40}
                          value={despeckle}
                          onChange={(e) => {
                            setDespeckle(Number(e.target.value));
                            setPreset("custom");
                          }}
                          className="w-full accent-pink"
                        />
                      </div>

                      {/* Right Angle Enhancements */}
                      <label className="flex items-center justify-between cursor-pointer py-1">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                          Sharp Corner Enhance (Right-angles)
                        </span>
                        <input
                          type="checkbox"
                          checked={rightAngleEnhance}
                          onChange={(e) => {
                            setRightAngleEnhance(e.target.checked);
                            setPreset("custom");
                          }}
                          className="h-3.5 w-3.5 accent-pink rounded border-border"
                        />
                      </label>

                      {/* Size Optimization decimals */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono">
                          <span className="uppercase text-muted-foreground">
                            Coordinate Decimals (Size optimization)
                          </span>
                          <span className="text-white font-bold">{roundCoords} dec</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          value={roundCoords}
                          onChange={(e) => {
                            setRoundCoords(Number(e.target.value));
                            setPreset("custom");
                          }}
                          className="w-full accent-pink"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversion Launcher */}
              <button
                type="button"
                onClick={handleConvert}
                disabled={isTracing}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-[10px] bg-pink text-pink-foreground hover:opacity-95 disabled:opacity-50 transition-all font-bold uppercase tracking-wider text-xs font-mono shadow-[0_4px_20px_rgba(236,72,153,0.3)] hover:shadow-[0_4px_25px_rgba(236,72,153,0.4)] disabled:shadow-none"
              >
                {isTracing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    tracing vectors...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    convert to svg
                  </>
                )}
              </button>
            </div>
          )}
        </section>

        {/* Right Sandbox Viewport */}
        <section className="lg:col-span-8 flex flex-col bg-background overflow-hidden relative">
          {!file ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground font-mono">
              <ImageIcon className="w-16 h-16 text-muted/20 mb-4 animate-pulse" />
              <p className="text-sm max-w-[280px]">
                Upload an image in the sidebar to start vectorizing.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Viewport Toolbar */}
              <div className="border-b border-border/40 px-6 py-3 bg-card/20 flex flex-wrap items-center justify-between gap-4 z-10">
                {/* View Mode Switcher */}
                <div className="flex items-center gap-1 bg-background p-0.5 rounded-[8px] border border-border/40">
                  {(
                    [
                      { id: "split", label: "Split curtain" },
                      { id: "compare", label: "Side-by-side" },
                      { id: "svg-only", label: "SVG Vector" },
                      { id: "original", label: "Preprocessed PNG" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setViewMode(m.id)}
                      disabled={m.id !== "original" && !svg}
                      className={`px-3 py-1.5 rounded-[6px] text-xs font-mono transition-colors ${
                        viewMode === m.id
                          ? "bg-pink text-pink-foreground font-bold"
                          : "text-muted-foreground hover:text-white disabled:opacity-40 disabled:hover:text-muted-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => adjustZoom("out")}
                    className="p-1.5 rounded-[6px] bg-card hover:bg-card-hover border border-border/40 text-muted-foreground hover:text-white"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono min-w-[50px] text-center text-white">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => adjustZoom("in")}
                    className="p-1.5 rounded-[6px] bg-card hover:bg-card-hover border border-border/40 text-muted-foreground hover:text-white"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => adjustZoom("reset")}
                    className="px-2.5 py-1 rounded-[6px] bg-card hover:bg-card hover:border-border border border-border/40 text-[10px] font-mono text-muted-foreground hover:text-white"
                  >
                    reset
                  </button>
                </div>
              </div>

              {/* Viewport Canvas container */}
              <div className="flex-1 overflow-hidden relative checkerboard flex items-center justify-center p-6 select-none">
                {/* Drag-to-pan helper instructions */}
                <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-[6px] border border-border/30 text-[9px] font-mono text-muted-foreground pointer-events-none flex items-center gap-2">
                  <Info className="w-3 h-3 text-pink" />
                  Drag workspace to pan · Scroll to zoom
                </div>

                {/* Main Interactive Screen */}
                <div
                  ref={splitContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  className={`relative w-full h-full flex items-center justify-center overflow-hidden ${
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                >
                  {/* Outer transformed wrapper containing the image panels */}
                  <div
                    className="relative transition-transform duration-75 ease-out flex items-center justify-center"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: "center center",
                      width: "80%",
                      height: "80%",
                    }}
                  >
                    {/* View: Split Screen Curtain Mode */}
                    {viewMode === "split" && (
                      <div className="relative w-full h-full max-h-[500px] flex items-center justify-center">
                        {/* Layer 1: Preprocessed image */}
                        {preprocessedUrl && (
                          <img
                            src={preprocessedUrl}
                            alt="Original source"
                            draggable={false}
                            className="max-w-full max-h-[500px] object-contain select-none shadow-2xl pointer-events-auto"
                            onClick={handleImageClick}
                            style={{ cursor: removeBgMode === "color" ? "crosshair" : "grab" }}
                          />
                        )}

                        {/* Layer 2: Clipped SVG */}
                        {svgUrl && (
                          <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{
                              clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)`,
                            }}
                          >
                            <img
                              src={svgUrl}
                              alt="Vector SVG"
                              draggable={false}
                              className="max-w-full max-h-[500px] object-contain select-none pointer-events-none filter drop-shadow-xl"
                            />
                          </div>
                        )}

                        {/* Split curtain Slider bar */}
                        {svgUrl && (
                          <div
                            className="absolute top-0 bottom-0 w-[2px] bg-pink cursor-ew-resize flex items-center justify-center z-20"
                            style={{ left: `${sliderPos}%` }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              isSplitDraggingRef.current = true;
                            }}
                          >
                            <div className="w-7 h-7 rounded-full bg-pink border-4 border-background flex items-center justify-center shadow-lg text-[10px] text-pink-foreground font-mono font-bold select-none pointer-events-none scale-95">
                              ↔
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* View: Side-by-side mode */}
                    {viewMode === "compare" && (
                      <div className="grid grid-cols-2 gap-6 w-full h-full max-h-[500px]">
                        {/* Original panel */}
                        <div className="relative border border-border/20 rounded-[8px] bg-black/30 backdrop-blur-sm p-4 flex flex-col items-center justify-center h-full">
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-[4px] bg-background/80 text-[8px] font-mono text-muted-foreground uppercase border border-border/20">
                            Preprocessed PNG
                          </span>
                          {preprocessedUrl && (
                            <img
                              src={preprocessedUrl}
                              alt="Source"
                              draggable={false}
                              className="max-w-full max-h-[400px] object-contain select-none pointer-events-auto"
                              onClick={handleImageClick}
                              style={{ cursor: removeBgMode === "color" ? "crosshair" : "grab" }}
                            />
                          )}
                        </div>

                        {/* SVG Vector panel */}
                        <div className="relative border border-border/20 rounded-[8px] bg-black/30 backdrop-blur-sm p-4 flex flex-col items-center justify-center h-full">
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-[4px] bg-background/80 text-[8px] font-mono text-pink uppercase border border-pink/20">
                            Scalable Vector
                          </span>
                          {svgUrl && (
                            <img
                              src={svgUrl}
                              alt="SVG Vector"
                              draggable={false}
                              className="max-w-full max-h-[400px] object-contain select-none pointer-events-none"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* View: SVG Only */}
                    {viewMode === "svg-only" && svgUrl && (
                      <img
                        src={svgUrl}
                        alt="SVG Vector"
                        draggable={false}
                        className="max-w-full max-h-[500px] object-contain select-none pointer-events-none filter drop-shadow-xl"
                      />
                    )}

                    {/* View: Original/Preprocessed Only */}
                    {viewMode === "original" && preprocessedUrl && (
                      <img
                        src={preprocessedUrl}
                        alt="Source preprocessed"
                        draggable={false}
                        className="max-w-full max-h-[500px] object-contain select-none pointer-events-auto"
                        onClick={handleImageClick}
                        style={{ cursor: removeBgMode === "color" ? "crosshair" : "grab" }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Card and Code Panel */}
              <div className="border-t border-border/40 p-6 bg-card/10 space-y-4">
                {svg && (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Stats columns */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                      <div className="p-3 bg-background border border-border/30 rounded-[8px] font-mono">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          Original Size
                        </div>
                        <div className="text-sm font-bold text-white">
                          {formatBytes(originalSize)}
                        </div>
                      </div>

                      <div className="p-3 bg-background border border-border/30 rounded-[8px] font-mono">
                        <div className="text-[9px] uppercase tracking-wider text-pink mb-0.5">
                          Vector SVG Size
                        </div>
                        <div className="text-sm font-bold text-pink">{formatBytes(svgSize)}</div>
                      </div>

                      <div className="p-3 bg-background border border-border/30 rounded-[8px] font-mono">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          Vector Complexity
                        </div>
                        <div className="text-sm font-bold text-white">{pathCount} paths</div>
                      </div>

                      <div className="p-3 bg-background border border-border/30 rounded-[8px] font-mono">
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          Optimization
                        </div>
                        <div
                          className={`text-sm font-bold ${svgSize <= originalSize ? "text-green-400" : "text-amber-400"}`}
                        >
                          {svgSize <= originalSize
                            ? `${Math.round(((originalSize - svgSize) / originalSize) * 100)}% lighter`
                            : `${Math.round(((svgSize - originalSize) / originalSize) * 100)}% heavier`}
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowCode(!showCode)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-[8px] text-xs font-mono border transition-all ${
                          showCode
                            ? "bg-pink/10 border-pink text-pink"
                            : "bg-card border-border/40 text-muted-foreground hover:text-white"
                        }`}
                      >
                        <FileCode className="w-4 h-4" />
                        {showCode ? "hide code" : "inspect code"}
                      </button>

                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-[8px] text-xs font-mono bg-white text-background hover:bg-white/90 transition-colors font-bold"
                      >
                        <Download className="w-4 h-4" />
                        download svg
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsible raw code display */}
                {svg && showCode && (
                  <div className="animate-in fade-in duration-300 border border-border/40 rounded-[8px] bg-background overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5 bg-card/30">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        svg markup code
                      </span>
                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-white px-2 py-1 bg-card rounded transition-all"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-400" />
                            copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            copy code
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={svg}
                      className="w-full h-44 p-4 font-mono text-[11px] text-muted-foreground bg-transparent border-none focus:outline-none resize-none select-text whitespace-pre overflow-auto"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Progress Line */}
      {isTracing && (
        <div className="fixed bottom-0 left-0 right-0 h-1 bg-border progress-bar z-50">
          <div className="progress-bar-fill" />
        </div>
      )}
    </div>
  );
}
