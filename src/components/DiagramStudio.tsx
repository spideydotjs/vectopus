"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import {
  Workflow,
  BrainCircuit,
  Sparkles,
  Plus,
  Minus,
  Download,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  FileCode,
  Layers,
  Key,
  RefreshCw,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Info,
  Sliders,
  AlertCircle,
  ExternalLink,
  Save,
  ArrowRight,
} from "lucide-react";
import {
  MindmapTreeNode,
  SAMPLE_DIAGRAMS,
  appendChildrenToNode,
  autoRepairMermaid,
  cleanMermaidCode,
  countDescendants,
  extractFlowchartNodes,
  parseMindmapToTree,
  setTreeCollapseByDepth,
  toggleNodeCollapseInTree,
  treeToMindmap,
} from "@/lib/gemini";

type DiagramType = "flowchart" | "mindmap";
type FlowchartOrientation = "TD" | "LR";
type ComplexityLevel = "overview" | "standard" | "deep";

export function DiagramStudio() {
  // Studio configuration states
  const [diagramType, setDiagramType] = useState<DiagramType>("flowchart");
  const [prompt, setPrompt] = useState<string>("");
  const [orientation, setOrientation] = useState<FlowchartOrientation>("TD");
  const [complexity, setComplexity] = useState<ComplexityLevel>("standard");

  // Code and tree states
  const [mermaidCode, setMermaidCode] = useState<string>(SAMPLE_DIAGRAMS.flowcharts[0].code);
  const [diagramTitle, setDiagramTitle] = useState<string>("E-Commerce Checkout & Payment Flow");
  const [mindmapTree, setMindmapTree] = useState<MindmapTreeNode | null>(null);
  const [mindmapMaxDepth, setMindmapMaxDepth] = useState<number | null>(null);

  // SVG rendering states
  const [svgContent, setSvgContent] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isExpandingNode, setIsExpandingNode] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState<boolean>(false);

  // Selection for AI expansion
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string } | null>(null);
  const [expandPrompt, setExpandPrompt] = useState<string>("");

  // Viewport states
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);

  // Inspection and export states
  const [activeTab, setActiveTab] = useState<"diagram" | "mermaid" | "svg">("diagram");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedSvg, setCopiedSvg] = useState<boolean>(false);

  // API Key management states
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [customKey, setCustomKey] = useState<string>("");
  const [savedKey, setSavedKey] = useState<string>("");
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [serverKeyMasked, setServerKeyMasked] = useState<string | null>(null);

  // Initialize Mermaid on mount
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: "transparent",
        mainBkg: "#18181d",
        nodeBorder: "#ec4899",
        clusterBkg: "#141418",
        clusterBorder: "#3f3f46",
        titleColor: "#ffffff",
        textColor: "#f4f4f5",
        lineColor: "#ec4899",
        primaryColor: "#27272a",
        primaryTextColor: "#ffffff",
        primaryBorderColor: "#ec4899",
        secondaryColor: "#1f1f23",
        secondaryTextColor: "#e4e4e7",
        secondaryBorderColor: "#db2777",
        tertiaryColor: "#16161a",
        tertiaryTextColor: "#d4d4d8",
        tertiaryBorderColor: "#3f3f46",
        fontFamily: '"Space Mono", monospace, ui-monospace, sans-serif',
        fontSize: "13px",
      },
    });

    // Check localStorage for user-provided key
    const local = localStorage.getItem("vectopus_gemini_api_key") || "";
    if (local) {
      setSavedKey(local);
      setCustomKey(local);
    }

    // Check server key availability
    fetch("/api/diagram")
      .then((r) => r.json())
      .then((data) => {
        setHasServerKey(!!data.hasServerKey);
        setServerKeyMasked(data.serverKeyMasked);
      })
      .catch((e) => console.warn("Could not check server API key status", e));
  }, []);

  // Parse mindmap tree whenever diagramType is mindmap and code changes
  useEffect(() => {
    if (diagramType === "mindmap") {
      const tree = parseMindmapToTree(mermaidCode);
      if (tree) {
        setMindmapTree(tree);
      }
    }
  }, [diagramType, mermaidCode]);

  // Render Mermaid code to SVG with self-healing auto-repair
  const renderMermaid = useCallback(async (codeToRender: string) => {
    if (!codeToRender || !codeToRender.trim()) return;

    // Clean any prior temporary mermaid error elements from document body
    if (typeof document !== "undefined") {
      document.querySelectorAll("[id^='dmermaid_diag_']").forEach((el) => el.remove());
    }

    const sanitized = cleanMermaidCode(codeToRender);

    try {
      setRenderError(null);
      const uniqueId = `mermaid_diag_${Date.now()}`;
      const { svg } = await mermaid.render(uniqueId, sanitized);
      setSvgContent(svg);
    } catch (err: unknown) {
      console.warn("Initial Mermaid render failed, attempting auto-repair:", err);

      // Clean up any error DOM elements Mermaid might have appended
      if (typeof document !== "undefined") {
        document.querySelectorAll("[id^='dmermaid_diag_']").forEach((el) => el.remove());
      }

      try {
        const repaired = autoRepairMermaid(codeToRender);
        const uniqueIdRepair = `mermaid_diag_rep_${Date.now()}`;
        const { svg } = await mermaid.render(uniqueIdRepair, repaired);
        setSvgContent(svg);
        setMermaidCode(repaired);
        setRenderError(null);
      } catch (err2: unknown) {
        console.error("Auto-repair also failed:", err2);
        if (typeof document !== "undefined") {
          document.querySelectorAll("[id^='dmermaid_diag_']").forEach((el) => el.remove());
        }
        setRenderError(err instanceof Error ? err.message : "Mermaid syntax error");
      }
    }
  }, []);

  // Re-render when mermaidCode changes
  useEffect(() => {
    renderMermaid(mermaidCode);
  }, [mermaidCode, renderMermaid]);

  // Flowchart node list for AI expansion
  const flowchartNodes = useMemo(() => {
    if (diagramType !== "flowchart") return [];
    return extractFlowchartNodes(mermaidCode);
  }, [diagramType, mermaidCode]);

  // Handle Switch Diagram Type
  const handleTypeChange = (newType: DiagramType) => {
    setDiagramType(newType);
    setSelectedNode(null);
    setRenderError(null);
    setApiError(null);

    if (newType === "flowchart") {
      const sample = SAMPLE_DIAGRAMS.flowcharts[0];
      setDiagramTitle(sample.title);
      setMermaidCode(sample.code);
      setOrientation(sample.orientation);
    } else {
      const sample = SAMPLE_DIAGRAMS.mindmaps[0];
      setDiagramTitle(sample.title);
      setMermaidCode(sample.code);
      const tree = parseMindmapToTree(sample.code);
      setMindmapTree(tree);
      setMindmapMaxDepth(null);
    }
    // Reset zoom
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Load sample template
  const loadSample = (sample: (typeof SAMPLE_DIAGRAMS.flowcharts)[0] | (typeof SAMPLE_DIAGRAMS.mindmaps)[0]) => {
    setDiagramTitle(sample.title);
    setMermaidCode(sample.code);
    setSelectedNode(null);
    setRenderError(null);
    setApiError(null);
    setPrompt("");

    if ("orientation" in sample) {
      setOrientation(sample.orientation);
    } else {
      const tree = parseMindmapToTree(sample.code);
      setMindmapTree(tree);
      setMindmapMaxDepth(null);
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Generate Diagram with Gemini
  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setApiError(null);
    setIsAuthError(false);

    try {
      const res = await fetch("/api/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          type: diagramType,
          action: "generate",
          orientation,
          complexity,
          customApiKey: savedKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setApiError(data.error || "Failed to generate diagram");
        if (data.isAuthError) {
          setIsAuthError(true);
        }
        return;
      }

      setDiagramTitle(prompt.slice(0, 45));
      setMermaidCode(data.code);

      if (diagramType === "mindmap") {
        const tree = parseMindmapToTree(data.code);
        setMindmapTree(tree);
        setMindmapMaxDepth(null);
      }

      setZoom(1);
      setPan({ x: 0, y: 0 });
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : "Network error calling Gemini");
    } finally {
      setIsGenerating(false);
    }
  };

  // Expand a specific node with Gemini AI
  const handleAiExpandNode = async () => {
    if (!selectedNode) return;

    setIsExpandingNode(true);
    setApiError(null);

    try {
      const res = await fetch("/api/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: expandPrompt || prompt || diagramTitle,
          type: diagramType,
          action: "expand_node",
          nodeToExpand: selectedNode,
          existingCode: mermaidCode,
          orientation,
          complexity: "deep",
          customApiKey: savedKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setApiError(data.error || "Failed to expand node");
        if (data.isAuthError) setIsAuthError(true);
        return;
      }

      if (diagramType === "mindmap" && data.expandedChildren && mindmapTree) {
        const updatedTree = appendChildrenToNode(
          mindmapTree,
          selectedNode.id,
          data.expandedChildren
        );
        setMindmapTree(updatedTree);
        const newCode = treeToMindmap(updatedTree);
        setMermaidCode(newCode);
      } else if (diagramType === "flowchart" && data.code) {
        setMermaidCode(data.code);
      }

      setExpandPrompt("");
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : "Failed to expand node");
    } finally {
      setIsExpandingNode(false);
    }
  };

  // Mindmap Expand / Collapse by depth
  const handleDepthFilter = (depth: number | null) => {
    setMindmapMaxDepth(depth);
    if (!mindmapTree) return;

    if (depth === null) {
      // Expand all
      const expandedTree = setTreeCollapseByDepth(mindmapTree, 99);
      setMindmapTree(expandedTree);
      setMermaidCode(treeToMindmap(expandedTree));
    } else {
      const collapsedTree = setTreeCollapseByDepth(mindmapTree, depth);
      setMindmapTree(collapsedTree);
      setMermaidCode(treeToMindmap(collapsedTree));
    }
  };

  // Mindmap toggle single node collapse
  const handleToggleNode = (nodeId: string) => {
    if (!mindmapTree) return;
    const updatedTree = toggleNodeCollapseInTree(mindmapTree, nodeId);
    setMindmapTree(updatedTree);
    setMermaidCode(treeToMindmap(updatedTree));
  };

  // Save custom key
  const handleSaveKey = () => {
    const trimmed = customKey.trim();
    if (trimmed) {
      localStorage.setItem("vectopus_gemini_api_key", trimmed);
      setSavedKey(trimmed);
    } else {
      localStorage.removeItem("vectopus_gemini_api_key");
      setSavedKey("");
    }
    setShowKeyModal(false);
    setApiError(null);
    setIsAuthError(false);
  };

  // Zoom and Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = 1.15;
    const nextZoom = e.deltaY < 0 ? zoom * factor : zoom / factor;
    setZoom(Math.min(5, Math.max(0.2, nextZoom)));
  };

  const adjustZoom = (type: "in" | "out" | "reset" | "fit") => {
    if (type === "in") setZoom((z) => Math.min(5, z * 1.3));
    else if (type === "out") setZoom((z) => Math.max(0.2, z / 1.3));
    else if (type === "fit") {
      setZoom(0.85);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  // Download SVG
  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${diagramTitle.toLowerCase().replace(/[^a-z0-9]/g, "_") || "diagram"}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Download high-res PNG (2x retina canvas)
  const handleDownloadPng = (scale = 2) => {
    if (!svgContent) return;

    // Parse SVG for dimensions
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return;

    let width = parseFloat(svgEl.getAttribute("width") || "0");
    let height = parseFloat(svgEl.getAttribute("height") || "0");

    if (!width || !height) {
      const viewBox = svgEl.getAttribute("viewBox");
      if (viewBox) {
        const parts = viewBox.split(/\s+/).map(Number);
        if (parts.length === 4) {
          width = parts[2];
          height = parts[3];
        }
      }
    }

    if (!width || width <= 0) width = 1200;
    if (!height || height <= 0) height = 800;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Dark canvas background matching theme
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `${diagramTitle.toLowerCase().replace(/[^a-z0-9]/g, "_") || "diagram"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setApiError("Failed to rasterize SVG into PNG. You can still download the SVG file.");
    };

    img.src = url;
  };

  // Copy helpers
  const handleCopyCode = () => {
    navigator.clipboard.writeText(mermaidCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopySvg = () => {
    navigator.clipboard.writeText(svgContent);
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 2000);
  };

  // Recursive mindmap tree navigator item
  const renderTreeItem = (node: MindmapTreeNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;
    const totalDescendants = countDescendants(node);

    return (
      <div key={node.id} className="space-y-0.5">
        <div
          className={`flex items-center justify-between py-1 px-1.5 rounded-[6px] text-[11px] font-mono transition-colors group cursor-pointer ${
            isSelected
              ? "bg-pink/20 text-white border border-pink/40"
              : "hover:bg-card/40 text-muted-foreground hover:text-white"
          }`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          onClick={() => setSelectedNode({ id: node.id, label: node.label })}
        >
          <div className="flex items-center gap-1.5 truncate">
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleNode(node.id);
                }}
                className="p-0.5 hover:text-pink transition-colors text-muted-foreground"
              >
                {node.isCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-pink" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            ) : (
              <span className="w-3 inline-block" />
            )}
            <span className="truncate">{node.label}</span>
          </div>

          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
            {hasChildren && node.isCollapsed && (
              <span className="text-[9px] px-1 py-0.2 bg-pink/20 text-pink rounded-[3px]">
                +{totalDescendants}
              </span>
            )}
            <button
              title="Expand with Gemini AI"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNode({ id: node.id, label: node.label });
              }}
              className="p-1 hover:text-pink text-muted-foreground transition-colors"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          </div>
        </div>

        {hasChildren && !node.isCollapsed && (
          <div className="border-l border-border/20 ml-2">
            {node.children.map((c) => renderTreeItem(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`flex-1 flex flex-col bg-background text-foreground overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-50 bg-background" : ""
      }`}
    >
      {/* Studio Top Control Strip */}
      <div className="border-b border-border/40 bg-card/10 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Diagram Type Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-background p-0.5 rounded-[8px] border border-border/40">
            <button
              onClick={() => handleTypeChange("flowchart")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-mono font-bold transition-all ${
                diagramType === "flowchart"
                  ? "bg-pink text-pink-foreground shadow-sm"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              Flowchart
            </button>
            <button
              onClick={() => handleTypeChange("mindmap")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-mono font-bold transition-all ${
                diagramType === "mindmap"
                  ? "bg-pink text-pink-foreground shadow-sm"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              Mindmap
            </button>
          </div>

          {/* Orientation switch for flowcharts */}
          {diagramType === "flowchart" && (
            <div className="flex items-center bg-background p-0.5 rounded-[6px] border border-border/30 text-[10px] font-mono">
              {(["TD", "LR"] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => {
                    setOrientation(dir);
                    setMermaidCode((prev) =>
                      prev.replace(/flowchart\s+(TD|LR)/, `flowchart ${dir}`)
                    );
                  }}
                  className={`px-2 py-1 rounded-[4px] font-mono transition-colors ${
                    orientation === dir
                      ? "bg-pink/20 text-pink border border-pink/40"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {dir === "TD" ? "Top ↓ Down" : "Left → Right"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Complexity Level */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground uppercase hidden sm:inline">
            Detail:
          </span>
          <div className="flex items-center bg-background p-0.5 rounded-[6px] border border-border/30 text-[10px] font-mono">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "standard", label: "Standard" },
                { id: "deep", label: "Deep System" },
              ] as const
            ).map((comp) => (
              <button
                key={comp.id}
                onClick={() => setComplexity(comp.id)}
                className={`px-2 py-1 rounded-[4px] capitalize transition-colors ${
                  complexity === comp.id
                    ? "bg-pink/20 text-pink border border-pink/40"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {comp.label}
              </button>
            ))}
          </div>

          {/* API Key Status Button */}
          <button
            onClick={() => setShowKeyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-mono border border-border/40 bg-card hover:bg-card/80 text-muted-foreground hover:text-white transition-all"
            title="Configure Gemini API Key"
          >
            <Key className="w-3.5 h-3.5 text-pink" />
            <span className="hidden md:inline">
              {savedKey ? "Custom Key" : hasServerKey ? "Env Key Active" : "Set API Key"}
            </span>
            <div
              className={`w-2 h-2 rounded-full ${
                savedKey || hasServerKey ? "bg-green-400 animate-pulse" : "bg-pink"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Control & Outline Sidebar */}
        <aside className="lg:col-span-4 border-r border-border/40 p-6 overflow-y-auto space-y-6 bg-card/10 flex flex-col">
          {/* Gemini AI Prompt Box */}
          <div className="space-y-3 bg-card/30 border border-border/40 rounded-[10px] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-pink animate-pulse" />
                Generate with Gemini
              </div>
              <span className="text-[9px] font-mono text-pink bg-pink/10 px-2 py-0.5 rounded-[4px]">
                gemini-2.5-flash
              </span>
            </div>

            <div className="space-y-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  diagramType === "flowchart"
                    ? "e.g. Distributed user authentication & OAuth2 flow with token refresh and redis caching..."
                    : "e.g. Complete roadmap for AI engineer in 2026 covering LLMs, agents, RAG, and fine-tuning..."
                }
                rows={3}
                className="w-full bg-background border border-border/40 rounded-[8px] p-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-pink resize-none"
              />

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-[8px] bg-pink text-pink-foreground hover:opacity-95 disabled:opacity-50 transition-all font-bold uppercase tracking-wider text-xs font-mono shadow-[0_2px_15px_rgba(236,72,153,0.25)]"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Generating with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    Generate {diagramType === "flowchart" ? "Flowchart" : "Mindmap"}
                  </>
                )}
              </button>
            </div>

            {/* Quick Template Pills */}
            <div className="space-y-1.5 pt-2 border-t border-border/20">
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Sample Prompts &amp; Templates:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(diagramType === "flowchart"
                  ? SAMPLE_DIAGRAMS.flowcharts
                  : SAMPLE_DIAGRAMS.mindmaps
                ).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSample(s)}
                    className="text-[10px] font-mono px-2 py-1 rounded-[4px] bg-background border border-border/40 text-muted-foreground hover:text-white hover:border-pink/50 transition-colors truncate max-w-full"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Auth / API Error Alert */}
          {apiError && (
            <div className="p-3.5 rounded-[8px] bg-destructive/10 border border-destructive/40 text-destructive text-xs font-mono space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{apiError}</div>
              </div>
              {isAuthError && (
                <button
                  onClick={() => setShowKeyModal(true)}
                  className="w-full text-center py-1 px-2 rounded-[4px] bg-destructive/20 hover:bg-destructive/30 text-white font-bold transition-colors"
                >
                  Configure Gemini API Key →
                </button>
              )}
            </div>
          )}

          {/* Expandable Controls Panel */}
          {diagramType === "mindmap" ? (
            <div className="bg-card/30 border border-border/40 rounded-[10px] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/20 pb-2">
                <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase tracking-wider">
                  <FolderTree className="w-4 h-4 text-pink" />
                  Expandable Depth
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {mindmapMaxDepth ? `Max Level ${mindmapMaxDepth}` : "All Expanded"}
                </span>
              </div>

              {/* Depth Filter Buttons */}
              <div className="grid grid-cols-4 gap-1 bg-background p-1 rounded-[6px] border border-border/30 text-[10px] font-mono">
                <button
                  onClick={() => handleDepthFilter(1)}
                  className={`py-1 rounded-[4px] transition-colors ${
                    mindmapMaxDepth === 1
                      ? "bg-pink text-pink-foreground font-bold"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Root Only
                </button>
                <button
                  onClick={() => handleDepthFilter(2)}
                  className={`py-1 rounded-[4px] transition-colors ${
                    mindmapMaxDepth === 2
                      ? "bg-pink text-pink-foreground font-bold"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Level 2
                </button>
                <button
                  onClick={() => handleDepthFilter(3)}
                  className={`py-1 rounded-[4px] transition-colors ${
                    mindmapMaxDepth === 3
                      ? "bg-pink text-pink-foreground font-bold"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Level 3
                </button>
                <button
                  onClick={() => handleDepthFilter(null)}
                  className={`py-1 rounded-[4px] transition-colors ${
                    mindmapMaxDepth === null
                      ? "bg-pink text-pink-foreground font-bold"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Expand All
                </button>
              </div>

              {/* Mindmap Hierarchy Outline */}
              <div className="space-y-1 pt-2">
                <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Branch Navigator (Click to select / fold):
                </span>
                <div className="max-h-[220px] overflow-y-auto bg-background/50 border border-border/20 rounded-[8px] p-2 space-y-1">
                  {mindmapTree ? (
                    renderTreeItem(mindmapTree)
                  ) : (
                    <div className="text-[10px] font-mono text-muted-foreground p-2">
                      No mindmap tree parsed yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Flowchart Node Selector */
            <div className="bg-card/30 border border-border/40 rounded-[10px] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/20 pb-2">
                <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase tracking-wider">
                  <Sliders className="w-4 h-4 text-pink" />
                  Expand Step with AI
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Select Step to Expand:
                </label>
                <select
                  value={selectedNode?.id || ""}
                  onChange={(e) => {
                    const found = flowchartNodes.find((n) => n.id === e.target.value);
                    if (found) setSelectedNode(found);
                  }}
                  className="w-full bg-background border border-border/40 rounded-[6px] p-2 text-xs font-mono text-white focus:outline-none focus:border-pink"
                >
                  <option value="">-- Choose a step in flowchart --</option>
                  {flowchartNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id}: {n.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* AI Node Expansion Execution Card */}
          {selectedNode && (
            <div className="bg-pink/5 border border-pink/30 rounded-[10px] p-4 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-1.5 text-pink font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Expand: &quot;{selectedNode.label}&quot;
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-muted-foreground hover:text-white"
                >
                  ✕
                </button>
              </div>

              <input
                type="text"
                value={expandPrompt}
                onChange={(e) => setExpandPrompt(e.target.value)}
                placeholder="Optional guidance (e.g. focus on security / retries)..."
                className="w-full bg-background border border-border/40 rounded-[6px] p-2 text-xs font-mono text-white placeholder:text-muted-foreground/60 focus:outline-none focus:border-pink"
              />

              <button
                onClick={handleAiExpandNode}
                disabled={isExpandingNode}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[6px] bg-pink text-pink-foreground hover:opacity-95 disabled:opacity-50 text-xs font-mono font-bold uppercase tracking-wider shadow-sm transition-all"
              >
                {isExpandingNode ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Expanding with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 fill-current" />
                    Expand with AI
                  </>
                )}
              </button>
            </div>
          )}
        </aside>

        {/* Right Sandbox Viewport */}
        <section className="lg:col-span-8 flex flex-col bg-background overflow-hidden relative">
          {/* Viewport Toolbar */}
          <div className="border-b border-border/40 px-6 py-3 bg-card/20 flex flex-wrap items-center justify-between gap-4 z-10">
            {/* View Tabs */}
            <div className="flex items-center gap-1 bg-background p-0.5 rounded-[8px] border border-border/40">
              {(
                [
                  { id: "diagram", label: "Interactive Diagram" },
                  { id: "mermaid", label: "Mermaid Code" },
                  { id: "svg", label: "SVG Source" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-[6px] text-xs font-mono transition-colors ${
                    activeTab === tab.id
                      ? "bg-pink text-pink-foreground font-bold"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Viewport Controls */}
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-background p-0.5 rounded-[6px] border border-border/30">
                <button
                  onClick={() => adjustZoom("out")}
                  className="p-1.5 rounded-[4px] text-muted-foreground hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono min-w-[45px] text-center text-white">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => adjustZoom("in")}
                  className="p-1.5 rounded-[4px] text-muted-foreground hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => adjustZoom("reset")}
                  className="px-2 py-1 rounded-[4px] text-[10px] font-mono text-muted-foreground hover:text-white transition-colors"
                  title="Reset Zoom"
                >
                  100%
                </button>
              </div>

              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-[6px] bg-card border border-border/40 text-muted-foreground hover:text-white transition-colors"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Tab 1: Interactive Canvas Viewport */}
          {activeTab === "diagram" && (
            <div
              ref={canvasContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              className={`flex-1 overflow-hidden relative checkerboard flex items-center justify-center select-none ${
                isDragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              {/* Floating Helper Tip */}
              <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-[6px] border border-border/30 text-[9px] font-mono text-muted-foreground pointer-events-none flex items-center gap-2">
                <Info className="w-3 h-3 text-pink" />
                Drag canvas to pan · Scroll to zoom
              </div>

              {/* Diagram Title Banner */}
              <div className="absolute top-4 right-4 z-10 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-[6px] border border-border/30 text-[10px] font-mono text-white pointer-events-none flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink animate-pulse" />
                {diagramTitle}
              </div>

              {/* Render Error Overlay */}
              {renderError ? (
                <div className="p-6 max-w-md bg-destructive/10 border border-destructive/30 rounded-[10px] text-destructive text-xs font-mono space-y-3 z-20">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertCircle className="w-4 h-4" />
                    Mermaid Syntax Error
                  </div>
                  <pre className="text-[10px] whitespace-pre-wrap leading-normal bg-black/40 p-3 rounded">
                    {renderError}
                  </pre>
                  <button
                    onClick={() => {
                      const sample =
                        diagramType === "flowchart"
                          ? SAMPLE_DIAGRAMS.flowcharts[0].code
                          : SAMPLE_DIAGRAMS.mindmaps[0].code;
                      setMermaidCode(sample);
                    }}
                    className="px-3 py-1.5 rounded-[6px] bg-destructive/20 hover:bg-destructive/30 text-white font-bold transition-colors"
                  >
                    Reset to working sample
                  </button>
                </div>
              ) : (
                /* Main Scalable SVG Container */
                <div
                  ref={svgWrapperRef}
                  className="transition-transform duration-75 ease-out flex items-center justify-center"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              )}
            </div>
          )}

          {/* Tab 2: Editable Mermaid Code */}
          {activeTab === "mermaid" && (
            <div className="flex-1 flex flex-col bg-background overflow-hidden p-6 space-y-3 font-mono">
              <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/30 pb-2">
                <span>Mermaid Diagram Syntax (Live Editable)</span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-card hover:bg-card/80 text-white transition-colors"
                >
                  {copiedCode ? (
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
                value={mermaidCode}
                onChange={(e) => setMermaidCode(e.target.value)}
                className="flex-1 w-full p-4 bg-card/20 border border-border/40 rounded-[8px] font-mono text-xs text-pink leading-relaxed focus:outline-none focus:border-pink resize-none whitespace-pre"
                spellCheck={false}
              />
            </div>
          )}

          {/* Tab 3: Raw SVG Markup */}
          {activeTab === "svg" && (
            <div className="flex-1 flex flex-col bg-background overflow-hidden p-6 space-y-3 font-mono">
              <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/30 pb-2">
                <span>Generated SVG Source Markup</span>
                <button
                  onClick={handleCopySvg}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-card hover:bg-card/80 text-white transition-colors"
                >
                  {copiedSvg ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      copy svg
                    </>
                  )}
                </button>
              </div>

              <textarea
                readOnly
                value={svgContent}
                className="flex-1 w-full p-4 bg-card/20 border border-border/40 rounded-[8px] font-mono text-[11px] text-muted-foreground leading-relaxed focus:outline-none resize-none whitespace-pre select-text"
              />
            </div>
          )}

          {/* Bottom Export & Actions Bar */}
          <div className="border-t border-border/40 p-6 bg-card/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
              <div>
                Type: <span className="text-white capitalize">{diagramType}</span>
              </div>
              <div className="hidden sm:inline">
                Orientation:{" "}
                <span className="text-white">
                  {diagramType === "flowchart" ? orientation : "radial"}
                </span>
              </div>
              <div className="hidden sm:inline">
                SVG: <span className="text-pink">{new Blob([svgContent]).size} B</span>
              </div>
            </div>

            {/* Download Buttons: SVG and PNG */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadSvg}
                disabled={!svgContent}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-xs font-mono border border-border/40 bg-card hover:bg-card/80 text-white transition-all font-bold disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 text-pink" />
                download svg
              </button>

              <button
                onClick={() => handleDownloadPng(2)}
                disabled={!svgContent}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-xs font-mono bg-pink text-pink-foreground hover:opacity-95 transition-all font-bold shadow-[0_2px_15px_rgba(236,72,153,0.3)] disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 fill-current" />
                download png (2x)
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Gemini API Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border/60 rounded-[12px] p-6 max-w-lg w-full space-y-5 shadow-2xl font-mono">
            <div className="flex items-center justify-between border-b border-border/30 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Key className="w-4 h-4 text-pink" />
                Gemini API Key Settings
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-muted-foreground hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Server Environment Key Info */}
            <div className="space-y-1.5 text-xs">
              <span className="text-muted-foreground uppercase text-[10px] tracking-wider">
                System Bash Environment Key:
              </span>
              <div className="p-3 bg-background border border-border/30 rounded-[6px] flex items-center justify-between">
                <div>
                  {hasServerKey ? (
                    <span className="text-green-400 font-bold">
                      Detected ({serverKeyMasked})
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not found in process.env / ~/.bashrc</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">GEMINI_API_KEY</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Vectopus automatically scans <code className="text-pink">process.env.GEMINI_API_KEY</code> and{" "}
                <code className="text-pink">~/.bashrc</code>.
              </p>
            </div>

            {/* Custom Key Override */}
            <div className="space-y-2 text-xs">
              <label className="text-muted-foreground uppercase text-[10px] tracking-wider">
                Override with Custom API Key:
              </label>
              <input
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-background border border-border/40 rounded-[6px] p-2.5 text-xs font-mono text-white focus:outline-none focus:border-pink"
              />
              <p className="text-[10px] text-muted-foreground">
                Get a free key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink hover:underline inline-flex items-center gap-1"
                >
                  Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
                </a>
                . Keys start with <code className="text-white">AIzaSy...</code>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
              {savedKey && (
                <button
                  onClick={() => {
                    localStorage.removeItem("vectopus_gemini_api_key");
                    setSavedKey("");
                    setCustomKey("");
                  }}
                  className="px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-[6px] transition-colors"
                >
                  Clear Custom Key
                </button>
              )}
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 text-xs text-muted-foreground hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKey}
                className="flex items-center gap-1.5 px-4 py-2 rounded-[6px] bg-pink text-pink-foreground text-xs font-bold hover:opacity-90 transition-all shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
