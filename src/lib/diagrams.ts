/**
 * Utilities for Mermaid diagram generation, parsing, tree manipulation,
 * and AI prompt construction.
 */

export interface MindmapTreeNode {
  id: string;
  label: string;
  shapeType?: "circle" | "round" | "rect" | "bang" | "cloud" | "hexagon" | "default";
  rawLine?: string;
  children: MindmapTreeNode[];
  isCollapsed?: boolean;
}

/**
 * Extract, sanitize, and normalize Mermaid code from model responses.
 */
export function cleanMermaidCode(raw: string): string {
  if (!raw) return "";

  let cleaned = raw.trim();

  // Extract from markdown code blocks if present
  const codeBlockRegex = /```(?:mermaid)?\s*([\s\S]*?)```/i;
  const match = cleaned.match(codeBlockRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  // Remove any remaining stray backticks or markdown headers
  cleaned = cleaned.replace(/^`+|`+$/g, "").trim();

  // Clean lines
  const lines = cleaned.split(/\r?\n/);
  const filteredLines: string[] = [];
  let foundDiagramStart = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!foundDiagramStart) {
      if (
        trimmed.startsWith("mindmap") ||
        trimmed.startsWith("flowchart") ||
        trimmed.startsWith("graph") ||
        trimmed.startsWith("sequenceDiagram") ||
        trimmed.startsWith("classDiagram") ||
        trimmed.startsWith("stateDiagram")
      ) {
        foundDiagramStart = true;
        filteredLines.push(line);
      }
      continue;
    }
    filteredLines.push(line);
  }

  if (filteredLines.length > 0) {
    cleaned = filteredLines.join("\n");
  }

  // Normalize legacy graph -> flowchart
  cleaned = cleaned.replace(/^graph\s+(TD|LR|TB|BT|RL)/m, "flowchart $1");

  // Fix spacing between opening brackets and quotes (causes Parse error got 'STR'):
  // e.g. ([ "text" ]) -> (["text"])
  cleaned = cleaned.replace(/\(\[\s*["']?\s*(.*?)\s*["']?\s*\]\)/g, '(["$1"])');
  cleaned = cleaned.replace(/\[\(\s*["']?\s*(.*?)\s*["']?\s*\)\]/g, '[("$1")]');
  cleaned = cleaned.replace(/\[\[\s*["']?\s*(.*?)\s*["']?\s*\]\]/g, '[["$1"]]');
  cleaned = cleaned.replace(/\{\{\s*["']?\s*(.*?)\s*["']?\s*\}\}/g, '{{"$1"}}');
  cleaned = cleaned.replace(/\(\(\s*["']?\s*(.*?)\s*["']?\s*\)\)/g, '(("$1"))');

  // Fix general bracket spacing before/after quotes
  cleaned = cleaned.replace(/(\(\[|\[\(|\[\[|\{\{|\(\(|\[|\(|\{)\s+["']/g, '$1"');
  cleaned = cleaned.replace(/["']\s+(\]\)|\)\]|\]\]|\}\}|\)\)|\]|\)|\})/g, '"$1');

  return cleaned;
}

/**
 * Robust fallback repair for Mermaid code when initial parsing fails.
 * Converts problematic shapes to standard rectangle ["..."] and diamond {"..."}.
 */
export function autoRepairMermaid(code: string): string {
  if (!code) return "";
  let repaired = cleanMermaidCode(code);

  // Convert stadium ([...]) to standard ["..."]
  repaired = repaired.replace(/([a-zA-Z0-9_-]+)\s*\(\[\s*["']?\s*([^\]]+?)\s*["']?\s*\]\)/g, '$1["$2"]');

  // Convert cylinder [("...")] to standard [("...")]
  repaired = repaired.replace(/([a-zA-Z0-9_-]+)\s*\[\(\s*["']?\s*([^\]]+?)\s*["']?\s*\)\]/g, '$1[("$2")]');

  // Convert subroutine [[...]] to standard ["..."]
  repaired = repaired.replace(/([a-zA-Z0-9_-]+)\s*\[\[\s*["']?\s*([^\]]+?)\s*["']?\s*\]\]/g, '$1["$2"]');

  // Ensure diamond shapes are clean: {"..."}
  repaired = repaired.replace(/([a-zA-Z0-9_-]+)\s*\{\s*["']?\s*([^}]+?)\s*["']?\s*\}/g, '$1{"$2"}');

  // Ensure standard rectangles are clean: ["..."]
  repaired = repaired.replace(/([a-zA-Z0-9_-]+)\s*\[\s*["']?\s*([^\]]+?)\s*["']?\s*\]/g, '$1["$2"]');

  // Trim edge labels: -->| Yes | -> -->|Yes|
  repaired = repaired.replace(/-->\|\s*(.*?)\s*\|/g, '-->|$1|');

  return repaired;
}

/**
 * Parse a Mermaid mindmap into a hierarchical tree data structure.
 */
export function parseMindmapToTree(mermaidCode: string): MindmapTreeNode | null {
  const lines = mermaidCode.split(/\r?\n/);
  const mindmapLines: { indent: number; text: string }[] = [];

  let isInsideMindmap = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) continue;

    if (trimmed.startsWith("mindmap")) {
      isInsideMindmap = true;
      continue;
    }

    if (isInsideMindmap) {
      // Calculate indent level (tabs count as 2 spaces)
      const leadingWhitespace = line.match(/^[\t ]*/)?.[0] || "";
      let indent = 0;
      for (const ch of leadingWhitespace) {
        indent += ch === "\t" ? 2 : 1;
      }
      mindmapLines.push({ indent, text: trimmed });
    }
  }

  if (mindmapLines.length === 0) return null;

  // Helper to parse node shape and label
  const parseNodeText = (raw: string, index: number) => {
    let label = raw;
    let shapeType: MindmapTreeNode["shapeType"] = "default";

    // Circle ((...))
    const circleMatch = raw.match(/\(\((.*?)\)\)/);
    if (circleMatch) {
      label = circleMatch[1];
      shapeType = "circle";
    } else {
      // Round rect (...)
      const roundMatch = raw.match(/\((.*?)\)/);
      if (roundMatch) {
        label = roundMatch[1];
        shapeType = "round";
      } else {
        // Square rect [...]
        const rectMatch = raw.match(/\[(.*?)\]/);
        if (rectMatch) {
          label = rectMatch[1];
          shapeType = "rect";
        } else {
          // Cloud ) ... (
          const cloudMatch = raw.match(/\)(.*?)\(/);
          if (cloudMatch) {
            label = cloudMatch[1];
            shapeType = "cloud";
          } else {
            // Hexagon {{ ... }}
            const hexMatch = raw.match(/\{\{(.*?)\}\}/);
            if (hexMatch) {
              label = hexMatch[1];
              shapeType = "hexagon";
            }
          }
        }
      }
    }

    // Clean up "root" keyword prefix if any
    label = label.replace(/^root\s+/i, "");

    return {
      id: `node_${index}_${label.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 15)}`,
      label: label.trim(),
      shapeType,
    };
  };

  // Build tree using stack
  const rootInfo = parseNodeText(mindmapLines[0].text, 0);
  const rootNode: MindmapTreeNode = {
    id: "root",
    label: rootInfo.label,
    shapeType: rootInfo.shapeType === "default" ? "circle" : rootInfo.shapeType,
    rawLine: mindmapLines[0].text,
    children: [],
    isCollapsed: false,
  };

  const stack: { node: MindmapTreeNode; indent: number }[] = [{ node: rootNode, indent: mindmapLines[0].indent }];

  for (let i = 1; i < mindmapLines.length; i++) {
    const { indent, text } = mindmapLines[i];
    const nodeInfo = parseNodeText(text, i);
    const newNode: MindmapTreeNode = {
      id: nodeInfo.id,
      label: nodeInfo.label,
      shapeType: nodeInfo.shapeType,
      rawLine: text,
      children: [],
      isCollapsed: false,
    };

    // Pop from stack until we find the parent with strictly less indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    parent.children.push(newNode);
    stack.push({ node: newNode, indent });
  }

  return rootNode;
}

/**
 * Count all descendant children of a node.
 */
export function countDescendants(node: MindmapTreeNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countDescendants(child);
  }
  return count;
}

/**
 * Format a node label with appropriate Mermaid shape.
 */
function formatNodeShape(label: string, shapeType?: MindmapTreeNode["shapeType"]): string {
  // Sanitize label to prevent broken syntax
  const safeLabel = label.replace(/["()[\]{}]/g, " ").trim();
  switch (shapeType) {
    case "circle":
      return `((${safeLabel}))`;
    case "round":
      return `("${safeLabel}")`;
    case "rect":
      return `["${safeLabel}"]`;
    case "cloud":
      return `)"${safeLabel}"(`;
    case "hexagon":
      return `{{"${safeLabel}"}}`;
    default:
      return `"${safeLabel}"`;
  }
}

/**
 * Convert MindmapTreeNode tree back into Mermaid mindmap syntax,
 * honoring collapsed states or max depth limits.
 */
export function treeToMindmap(root: MindmapTreeNode, maxDepth?: number): string {
  const lines: string[] = ["mindmap"];

  function traverse(node: MindmapTreeNode, currentDepth: number) {
    const indent = "  ".repeat(currentDepth);
    const isRoot = currentDepth === 1;

    let line = "";
    if (isRoot) {
      line = `${indent}root${formatNodeShape(node.label, "circle")}`;
    } else {
      const isExceedingDepth = maxDepth !== undefined && currentDepth >= maxDepth;
      const isFolded = node.isCollapsed || isExceedingDepth;

      if (isFolded && node.children.length > 0) {
        const descendantCount = countDescendants(node);
        const foldedLabel = `${node.label} [📁 +${descendantCount}]`;
        line = `${indent}${formatNodeShape(foldedLabel, node.shapeType)}`;
        lines.push(line);
        return; // Do not render children when folded!
      } else {
        line = `${indent}${formatNodeShape(node.label, node.shapeType)}`;
      }
    }

    lines.push(line);

    for (const child of node.children) {
      traverse(child, currentDepth + 1);
    }
  }

  traverse(root, 1);
  return lines.join("\n");
}

/**
 * Toggle collapse state for a node in the tree.
 */
export function toggleNodeCollapseInTree(root: MindmapTreeNode, targetId: string): MindmapTreeNode {
  const clone = JSON.parse(JSON.stringify(root)) as MindmapTreeNode;

  function findAndToggle(node: MindmapTreeNode): boolean {
    if (node.id === targetId) {
      node.isCollapsed = !node.isCollapsed;
      return true;
    }
    for (const child of node.children) {
      if (findAndToggle(child)) return true;
    }
    return false;
  }

  findAndToggle(clone);
  return clone;
}

/**
 * Set collapse state across the tree based on a maximum visible depth.
 */
export function setTreeCollapseByDepth(root: MindmapTreeNode, targetDepth: number): MindmapTreeNode {
  const clone = JSON.parse(JSON.stringify(root)) as MindmapTreeNode;

  function apply(node: MindmapTreeNode, depth: number) {
    if (depth >= targetDepth) {
      node.isCollapsed = node.children.length > 0;
    } else {
      node.isCollapsed = false;
    }
    for (const child of node.children) {
      apply(child, depth + 1);
    }
  }

  apply(clone, 1);
  return clone;
}

/**
 * Add child branches to a specific target node in the tree.
 */
export function appendChildrenToNode(
  root: MindmapTreeNode,
  targetId: string,
  newChildLabels: string[]
): MindmapTreeNode {
  const clone = JSON.parse(JSON.stringify(root)) as MindmapTreeNode;

  function findAndAdd(node: MindmapTreeNode): boolean {
    if (node.id === targetId || (targetId === "root" && node.id === "root")) {
      node.isCollapsed = false; // Expand it
      for (const label of newChildLabels) {
        const id = `node_exp_${Date.now()}_${label.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 12)}`;
        node.children.push({
          id,
          label: label.trim(),
          shapeType: "round",
          children: [],
          isCollapsed: false,
        });
      }
      return true;
    }
    for (const child of node.children) {
      if (findAndAdd(child)) return true;
    }
    return false;
  }

  findAndAdd(clone);
  return clone;
}

/**
 * Parse flowchart node IDs and labels for selection in AI Expand.
 */
export function extractFlowchartNodes(mermaidCode: string): { id: string; label: string }[] {
  const nodes: { id: string; label: string }[] = [];
  const lines = mermaidCode.split(/\r?\n/);
  const seen = new Set<string>();

  // Matches node definitions like: A["Label"] or B{"Decision"} or C(["Start"]) or D[("DB")]
  const nodeRegex = /\b([a-zA-Z0-9_-]+)\s*(\[\(|\{\{|\(\(|\(\[|\[\[|\[|\(|\{|\>)\s*["']?([^"'\]\)\}>]+)["']?\s*(\]\)|\}\}|\)\)|\)\]|\]\]|\]|\)|\}|\>)/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("flowchart") || trimmed.startsWith("graph") || trimmed.startsWith("subgraph") || trimmed.startsWith("%%")) {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = nodeRegex.exec(trimmed)) !== null) {
      const id = match[1];
      const label = match[3].trim();
      if (!seen.has(id) && id !== "end" && id !== "subgraph") {
        seen.add(id);
        nodes.push({ id, label });
      }
    }
  }

  return nodes;
}

/**
 * Curated templates for instant preview and offline usage.
 */
export const SAMPLE_DIAGRAMS = {
  flowcharts: [
    {
      id: "ecommerce-checkout",
      title: "E-Commerce Checkout & Payment Flow",
      description: "Interactive checkout workflow with fraud validation, payment gateways, and order fulfillment.",
      orientation: "TD" as const,
      code: `flowchart TD
  Start(["Cart: Proceed to Checkout"]) --> AuthCheck{"User Authenticated?"}
  
  AuthCheck -->|No| LoginModal["Prompt Sign-In / Guest Mode"]
  LoginModal --> AuthCheck
  
  AuthCheck -->|Yes| Address["Select Shipping Address & Carrier"]
  Address --> InventoryCheck{"Inventory Reserved?"}
  
  InventoryCheck -->|Out of Stock| OutOfStockAlert["Notify User & Suggest Alternatives"]
  OutOfStockAlert --> CartReview["Return to Cart"]
  
  InventoryCheck -->|Available| PaymentSelect["Select Payment Method (Card, Apple Pay, Crypto)"]
  PaymentSelect --> FraudScan{"Fraud & 3DS Check"}
  
  FraudScan -->|High Risk| ReviewHold["Flag for Manual Security Audit"]
  FraudScan -->|Clear| ProcessPay["Submit to Payment Gateway"]
  
  ProcessPay --> PayResult{"Transaction Succeeded?"}
  PayResult -->|Failed| RetryPrompt["Display Gateway Error & Retry"]
  RetryPrompt --> PaymentSelect
  
  PayResult -->|Success| OrderCreate["Generate Order Record & Invoice"]
  OrderCreate --> DispatchWarehouse["Trigger Warehouse Fulfillment Event"]
  DispatchWarehouse --> Confirmation(["Order Confirmed & Email Sent"])`,
    },
    {
      id: "rag-ai-pipeline",
      title: "LLM Retrieval-Augmented Generation (RAG)",
      description: "End-to-end RAG architecture with vector embedding, hybrid search, reranking, and citation generation.",
      orientation: "LR" as const,
      code: `flowchart LR
  subgraph Ingestion ["1. Data Ingestion Pipeline"]
    RawDocs["Raw Documents (PDF, Web, DB)"] --> Chunker["Semantic Text Chunking"]
    Chunker --> EmbedModel["Embedding Model (e.g. text-embedding-3)"]
    EmbedModel --> VectorDB[("Vector DB (Pinecone / Qdrant)")]
  end

  subgraph QueryPipeline ["2. Query & Retrieval Pipeline"]
    UserQuery(["User Query"]) --> QueryEmbed["Query Embedding"]
    QueryEmbed --> HybridSearch["Hybrid Search: Dense Vector + BM25"]
    VectorDB -.-> HybridSearch
    HybridSearch --> Reranker["Cross-Encoder Reranker"]
    Reranker --> TopK["Top-K Context Chunks"]
  end

  subgraph Generation ["3. Synthesis & Verification"]
    TopK --> PromptBuilder["System & Grounded Context Builder"]
    UserQuery --> PromptBuilder
    PromptBuilder --> CoderLLM["Qwen 2.5 Coder Model"]
    CoderLLM --> HallucinationGuard{"Factuality & Grounding Check"}
    HallucinationGuard -->|Passed| FinalResponse(["Answer with Source Citations"])
    HallucinationGuard -->|Failed| RefineQuery["Fallback or Clarification Request"]
  end`,
    },
    {
      id: "microservices-auth",
      title: "Microservices Authentication & API Gateway",
      description: "JWT validation, rate limiting, and zero-trust service mesh communication.",
      orientation: "TD" as const,
      code: `flowchart TD
  Client(["Web / Mobile Client"]) --> Cloudflare["Cloudflare Edge & WAF"]
  Cloudflare --> ApiGateway["Kong API Gateway & Rate Limiter"]
  
  ApiGateway --> AuthVerify{"Validate JWT & Signature"}
  AuthVerify -->|Invalid / Expired| RefreshToken{"Refresh Token Valid?"}
  RefreshToken -->|Yes| IssueNew["Issue New JWT via Auth0"]
  IssueNew --> ApiGateway
  RefreshToken -->|No| Reject(["401 Unauthorized"])
  
  AuthVerify -->|Valid| ServiceRouter["Service Mesh Router"]
  
  subgraph InternalServices ["Internal Kubernetes Cluster"]
    ServiceRouter --> UserService["User Service"]
    ServiceRouter --> CatalogService["Catalog Service"]
    ServiceRouter --> OrderService["Order Service"]
    
    UserService --> UserCache[("Redis Cache")]
    OrderService --> Kafka["Kafka Event Bus"]
    Kafka --> NotificationService["Notification Worker"]
  end`,
    },
  ],
  mindmaps: [
    {
      id: "web-dev-roadmap",
      title: "Full-Stack AI Engineer Architecture",
      description: "Comprehensive modern architectural landscape covering Frontend, Agentic AI, Cloud, and Zero-Trust Infra.",
      code: `mindmap
  root((Full-Stack AI System))
    ("Modern Frontend")
      )"React 19 & Next.js 15"(
        ["Server Actions & Form Hooks"]
        ["Streaming SSR & PPR"]
        ["Turbopack Fast Refresh"]
      )"Styling & Design System"(
        ["Tailwind CSS v4 & OKLCH"]
        ["Radix Accessible Primitives"]
        ["Dynamic SVG Canvas Shader"]
      )"Edge & Web Vitals"(
        ["Cloudflare V8 Isolates"]
        ["Core Web Vitals INP and LCP"]
    ("Agentic AI Architecture")
      {{"LLM Foundations & Models"}}
        ["Qwen 2.5 Coder & Ollama"]
        ["DeepSeek & Open Weights"]
        ["Local High-Speed Inference"]
      {{"Orchestration & Agents"}}
        ["Autonomous Function Calling"]
        ["Model Context Protocol MCP"]
        ["Multi-Agent Swarm Networks"]
      {{"Vector & RAG Systems"}}
        ["Dense Vector Embeddings"]
        ["Cross-Encoder Reranking"]
        ["GraphRAG Semantic Knowledge"]
    ("Zero-Trust Cloud Infra")
      )"Compute & Containers"(
        ["Kubernetes & KNative"]
        ["Serverless GPU Clusters"]
        ["Docker Distroless Images"]
      )"Polyglot Persistence"(
        ["PostgreSQL with pgvector"]
        ["Redis Valkey High-Speed Cache"]
        ["Distributed ClickHouse OLAP"]
      )"Observability & Chaos"(
        ["OpenTelemetry Traces & Metrics"]
        ["eBPF Network Profiling"]
        ["Chaos Engineering Resiliency"]`,
    },
    {
      id: "vectopus-architecture",
      title: "Vectopus Vector & Diagram Studio",
      description: "Deep internal system architecture of Vectopus image vectorization, AI refinement, and diagramming engine.",
      code: `mindmap
  root((Vectopus Studio))
    ("Raster Tracing Pipeline")
      )"Canvas Preprocessor"(
        ["Chroma Key Background Eraser"]
        ["Interactive Eyedropper Color Extraction"]
        ["Silhouette Binarization Filter"]
      )"ImageTracerJS Engine"(
        ["Color Quantization & Palettes"]
        ["Sub-pixel Edge Detection"]
        ["Bezier Optimization & Spline Smoothing"]
      )"Engine Presets"(
        ["Crisp Logo & Icon Mode"]
        ["Detailed Gradient Mapping"]
        ["Retro Pixel-Art Right-Angle Alignment"]
    ("Ollama AI Refinement")
      {{"Vector Enhancement"}}
        ["Path Smoothing & Noise Elimination"]
        ["Harmonized Modern Color Palettes"]
        ["Cyberpunk Neon Glow & Gradients"]
      {{"Markup Optimization"}}
        ["Semantic SVG Layer Grouping"]
        ["Path Complexity Reduction"]
        ["XML Namespace & ViewBox Standardization"]
    ("Diagram & Flow Engine")
      )"Mermaid.js Integration"(
        ["Self-Healing Syntax Auto-Repair"]
        ["Real-time Dark OKLCH Theme"]
        ["Foldable Multi-Depth Mindmaps"]
      )"Interactive Canvas Viewport"(
        ["Unlimited 25000% Focal Mouse Zoom"]
        ["Zero-Friction Pan & Drag"]
        ["High-Res 2x Retina PNG & SVG Export"]`,
    },
    {
      id: "ai-system-design",
      title: "Production LLM & Neural Systems Design",
      description: "Enterprise design patterns for resilient, high-throughput production LLM applications.",
      code: `mindmap
  root((Production AI Systems))
    ("High-Throughput Inference")
      )"Serving Engines"(
        ["vLLM with PagedAttention"]
        ["TensorRT-LLM NVIDIA Kernels"]
        ["TGI Hugging Face Runtime"]
      )"Model Optimization"(
        ["AWQ & FP8 Quantization"]
        ["Speculative Decoding Verification"]
        ["Prefix Caching for Multi-Turn Dialog"]
    ("Reliability & Guardrails")
      {{"Security & Compliance"}}
        ["LlamaGuard Content Moderation"]
        ["PII Anonymization & Masking"]
        ["Prompt Injection Defense Filters"]
      {{"Evaluation & Testing"}}
        ["Ragas RAG Triad Metrics"]
        ["LLM-as-a-Judge Automated Benchmarks"]
        ["Human-in-the-Loop Feedback Loops"]
    ("Autonomous Workflows")
      )"State & Memory"(
        ["Hierarchical Context Compression"]
        ["Persistent Vector Memory Stores"]
        ["Episodic & Semantic Buffers"]
      )"Tool Execution"(
        ["Sandboxed Docker Code Runner"]
        ["Web Browsing & Scraper Agents"]
        ["Enterprise SQL Agent with Validation"]`,
    },
    {
      id: "distributed-cloud-arch",
      title: "Distributed Cloud & Microservices Mesh",
      description: "High-scale enterprise distributed architecture with Kafka streaming, gRPC, multi-region Kubernetes, and eBPF.",
      code: `mindmap
  root((Distributed Cloud Architecture))
    ("Event Stream Mesh")
      )"Kafka Cluster 3.6"(
        ["Partitioning & Consumer Groups"]
        ["Strict Exactly-Once Semantics EOS"]
        ["Dead-Letter Topics & Schema Registry"]
      )"Async gRPC Pipelines"(
        ["Protobuf v3 Typed Contracts"]
        ["Multiplexed HTTP/2 Streams"]
        ["Bi-Directional Event Channels"]
    ("Zero-Trust Security")
      {{"Identity & Workloads"}}
        ["mTLS WireGuard Mesh Encryption"]
        ["OAuth2 / OIDC + JWT Claims"]
        ["Ephemeral SPIFFE/SPIRE Workload IDs"]
      {{"WAF & Threat Mitigation"}}
        ["eBPF Layer 7 Packet Inspection"]
        ["Adaptive Rate Limiting with Redis Token Bucket"]
        ["DDoS Scrubbing & Cloudflare Magic Transit"]
    ("Polyglot Persistence")
      )"Transactional Core"(
        ["PostgreSQL Aurora Multi-AZ with pgvector"]
        ["Distributed Spanner Consensus Replication"]
      )"Cache & Analytical Layer"(
        ["Redis Valkey In-Memory KV Cluster"]
        ["ClickHouse Columnar Real-Time Analytics"]
    ("Kubernetes Multi-Region")
      {{"Orchestration Core"}}
        ["KEDA Event-Driven Horizontal Autoscaling"]
        ["ArgoCD GitOps Declarative Deployment"]
        ["Istio Ambient Service Mesh Zero Sidecar"]
      {{"Observability Triad"}}
        ["OpenTelemetry Unified Tracing & Spans"]
        ["Prometheus & Grafana Mimir Metrics"]
        ["Tempo Distributed Trace Search"]`,
    },
    {
      id: "multi-agent-swarm",
      title: "Multi-Agent Autonomous Swarm Systems",
      description: "Next-gen agentic system design featuring cognitive reasoning loops, Model Context Protocol (MCP), and microVM sandboxes.",
      code: `mindmap
  root((Multi-Agent Swarm Systems))
    ("Planner & Cognitive Core")
      )"Hierarchical Task Decomposition"(
        ["ReAct: Reasoning + Acting Loops"]
        ["Tree-of-Thoughts Exploration & Pruning"]
        ["Self-Correction & Automated Reflection"]
      )"Memory Architecture"(
        ["Short-Term Working Memory Buffers"]
        ["Episodic Semantic Long-Term Vector Memory"]
        ["Summary Memory Context Compression"]
    ("Tool Protocol & Sandbox")
      {{"Model Context Protocol MCP"}}
        ["Dynamic JSON-RPC Schema Negotiation"]
        ["Bidirectional Client-Server Tool Dispatch"]
        ["Resource & Prompt Template Providers"]
      {{"Isolated Compute Sandboxes"}}
        ["gVisor & Firecracker MicroVM Execution"]
        ["Wasm Edge Runtime for Untrusted Code"]
        ["Ephemeral Dockerized Code Interpreters"]
    ("Swarm Collaboration")
      )"Agent Topologies"(
        ["Supervisor-Worker Hierarchical Delegation"]
        ["Peer-to-Peer Consensus Swarm Debate"]
        ["Specialist Pipeline Handoff Routing"]
      )"State Coordination"(
        ["Shared Blackboard State Machine"]
        ["CRDT Distributed Conflict Resolution"]
        ["Human-in-the-Loop Interrupt & Approval"]
    ("Evaluation & Guardrails")
      {{"Safety Alignment"}}
        ["Prompt Injection & Jailbreak Filters"]
        ["Hallucination Grounding Verification"]
        ["Deterministic JSON Schema Enforcers"]
      {{"Performance Telemetry"}}
        ["Token Cost & Latency Budget Tracking"]
        ["Trajectory Step Quality Evaluation"]
        ["Automated Regression Test Suites"]`,
    },
  ],
};
