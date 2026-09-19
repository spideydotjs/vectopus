import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanMermaidCode,
  autoRepairMermaid,
  parseMindmapToTree,
  countDescendants,
  treeToMindmap,
} from "./diagrams.ts";

test("cleanMermaidCode extracts diagram from markdown fence and normalizes syntax", () => {
  const rawInput = `Here is the diagram:
\`\`\`mermaid
flowchart TD
  A([ "Start" ]) --> B[ "Process" ]
  B --> C(( "End" ))
\`\`\`
Hope this helps!`;

  const cleaned = cleanMermaidCode(rawInput);
  assert.ok(cleaned.startsWith("flowchart TD"));
  assert.ok(cleaned.includes('A(["Start"])'));
  assert.ok(cleaned.includes('B["Process"]'));
  assert.ok(cleaned.includes('C(("End"))'));
  assert.ok(!cleaned.includes("Here is the diagram"));
});

test("autoRepairMermaid converts problematic brackets into safe shapes", () => {
  const problematic = `flowchart TD
  Node1([ "Welcome" ]) --> Node2[ "Action" ]`;

  const repaired = autoRepairMermaid(problematic);
  assert.ok(repaired.includes('Node1["Welcome"]'));
  assert.ok(repaired.includes('Node2["Action"]'));
});

test("parseMindmapToTree and treeToMindmap preserve structure", () => {
  const mindmapCode = `mindmap
  root((System Root))
    ("Branch One")
      ["Leaf A"]
      ["Leaf B"]
    ("Branch Two")
      ["Leaf C"]`;

  const tree = parseMindmapToTree(mindmapCode);
  assert.ok(tree !== null);
  assert.equal(tree?.label, "System Root");
  assert.equal(tree?.children.length, 2);
  assert.equal(tree?.children[0].label, "Branch One");
  assert.equal(tree?.children[0].children.length, 2);

  const totalDescendants = countDescendants(tree!);
  assert.equal(totalDescendants, 5);

  const serialized = treeToMindmap(tree!);
  assert.ok(serialized.startsWith("mindmap"));
  assert.ok(serialized.includes("System Root"));
  assert.ok(serialized.includes("Branch One"));
});
