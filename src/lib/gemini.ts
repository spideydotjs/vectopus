/**
 * Utilities for Mermaid diagram generation, parsing, tree manipulation,
 * and Gemini prompt construction.
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
    PromptBuilder --> GeminiLLM["Gemini 2.5 Pro / Flash"]
    GeminiLLM --> HallucinationGuard{"Factuality & Grounding Check"}
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
      title: "Modern Full-Stack Web Development 2026",
      description: "Comprehensive landscape covering Frontend, Backend, Cloud, and AI Integration.",
      code: `mindmap
  root((Full-Stack 2026))
    Frontend
      React 19 & Next.js 15
        Server Components
        Server Actions
        Streaming SSR
      Styling & UI
        Tailwind CSS v4
        Radix Primitives
        OKLCH Color Spaces
      Performance
        Edge Rendering
        Partial Prerendering
        Web Vitals
    Backend & Systems
      Runtimes
        Node.js LTS
        Bun Runtime
        Go Microservices
      Databases
        PostgreSQL & pgvector
        Redis Valkey
        Vector Databases
      APIs
        REST & OpenAPI
        GraphQL
        tRPC & gRPC
    AI & Intelligent UI
      LLM SDKs
        Google Gemini 2.5
        Vercel AI SDK
        Function Calling
      Vector Search
        Embeddings
        Semantic Search
        Hybrid Retrieval
    DevOps & Infra
      Containers
        Docker & Containerd
        Kubernetes
      Cloud Platforms
        Google Cloud Platform
        Vercel Edge
        Cloudflare Workers
      Observability
        OpenTelemetry
        Structured Logging`,
    },
    {
      id: "vectopus-architecture",
      title: "Vectopus Studio Architecture",
      description: "Internal architecture of Vectopus image vectorization and diagramming engine.",
      code: `mindmap
  root((Vectopus Studio))
    Vector Engine
      ImageTracerJS Pipeline
        Color Quantization
        Edge Detection
        Path Tracing
      Smoothing & Splines
        Bezier Optimization
        Noise Despeckling
        Coordinate Rounding
      Preset Tuning
        Logo & Silhouette
        Pixel Art Mode
        Outline Contours
    AI Diagram Studio
      Gemini Engine
        Flowchart Generator
        Mindmap Generator
        Branch Expansion
      Mermaid Renderer
        Dark Theme Variables
        Custom Styling
        Interactive SVG
      Collapsible Trees
        Depth Filtering
        Branch Folding
        AI Drill-down
    Viewport & Canvas
      Interactive Pan & Zoom
      Split Screen Curtain
      Side-by-Side Comparison
    Export & Output
      Scalable Vector SVG
      Retina 2x PNG
      Source Markup Inspector`,
    },
    {
      id: "ai-system-design",
      title: "AI System Design & LLM Architecture",
      description: "Design patterns for resilient, scalable production LLM applications.",
      code: `mindmap
  root((AI System Design))
    Model Serving
      Inference Engines
        vLLM & TensorRT-LLM
        Ollama & Local Models
      Optimizations
        PagedAttention
        Quantization AWQ FP8
        Speculative Decoding
    Prompt Engineering
      Context Management
        Sliding Window
        Context Compression
      Techniques
        Few-Shot Prompting
        Chain of Thought
        Structured Outputs
    Reliability & Safety
      Guardrails
        Input Sanitization
        PII Redaction
        Hallucination Detection
      Evaluation
        Ragas & DeepEval
        LLM-as-a-Judge
        Human in the Loop
    Agents & Workflows
      Orchestration
        Multi-Agent Networks
        Graph-based Routing
        Memory & Persistence
      Tools & Execution
        Code Execution Sandboxes
        MCP Protocols
        Web Search APIs`,
    },
  ],
};
