import {useMemo, useState} from "react";
import type {ThesisGraph, ThesisNode} from "./types";

type PositionedNode = ThesisNode & {x: number; y: number};

const columnFor = (kind: ThesisNode["kind"]) => {
  if (kind === "EVIDENCE" || kind === "ASSUMPTION") return 0;
  if (kind === "ESTIMATE" || kind === "SCENARIO" || kind === "FALSIFIER") return 1;
  return 2;
};

function spotlight(graph: ThesisGraph, selected: string | null) {
  if (!selected) return {nodes: new Set(graph.nodes.map((item) => item.node_id)), edges: graph.edges};
  const nodes = new Set([selected]);
  const edges: ThesisGraph["edges"] = [];
  const walk = (direction: "upstream" | "downstream") => {
    let current = selected;
    while (true) {
      const edge = graph.edges.find((item) => direction === "upstream" ? item.to === current : item.from === current);
      if (!edge) return;
      const next = direction === "upstream" ? edge.from : edge.to;
      if (nodes.has(next)) return;
      edges.push(edge);
      nodes.add(next);
      current = next;
    }
  };
  walk("upstream");
  walk("downstream");
  return {nodes, edges};
}

export function ThesisGraphView({graph}: {graph: ThesisGraph}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(graph.nodes[0]?.node_id ?? "");
  const positioned = useMemo(() => {
    const counts = [0, 0, 0];
    return graph.nodes.map((node) => {
      const column = columnFor(node.kind);
      const position = {...node, x: 30 + column * 350, y: 44 + counts[column] * 82};
      counts[column] += 1;
      return position;
    });
  }, [graph]);
  const byId = new Map(positioned.map((item) => [item.node_id, item]));
  const activePath = spotlight(graph, selected);
  const active = activePath.nodes;
  const height = Math.max(320, ...positioned.map((item) => item.y + 64));
  const selectedNode = selected ? byId.get(selected) : undefined;
  const selectedEdges = selected ? activePath.edges : [];
  const focusNode = (nodeId: string) => {
    setFocused(nodeId);
    requestAnimationFrame(() => {
      document.querySelector<SVGGElement>(`[data-node-id="${nodeId}"]`)?.focus();
    });
  };
  const choose = (nodeId: string) => {
    setFocused(nodeId);
    setSelected((current) => current === nodeId ? null : nodeId);
  };
  const navigate = (nodeId: string, direction: "upstream" | "downstream") => {
    const edge = graph.edges.find((item) => direction === "upstream" ? item.to === nodeId : item.from === nodeId);
    const nextId = edge ? (direction === "upstream" ? edge.from : edge.to) : null;
    if (!nextId) return;
    setSelected(nextId);
    focusNode(nextId);
  };
  const navigateSequence = (nodeId: string, delta: number) => {
    const index = positioned.findIndex((item) => item.node_id === nodeId);
    const next = positioned[Math.max(0, Math.min(positioned.length - 1, index + delta))];
    if (next) focusNode(next.node_id);
  };
  return <div className="dag-shell">
    <div className="dag-column-labels"><span>Evidence + assumptions</span><span>Estimates + scenarios</span><span>Decision + action</span></div>
    <div className="dag-scroll" tabIndex={0} aria-label="Scrollable thesis dependency graph">
      <svg className="thesis-dag" viewBox={`0 0 1040 ${height}`} role="tree" aria-label="Evidence to decision dependency graph" data-node-count={graph.nodes.length} data-edge-count={graph.edges.length}>
        <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker></defs>
        <g className="dag-edges">{(selected ? selectedEdges : graph.edges).map((edge) => {const from = byId.get(edge.from); const to = byId.get(edge.to); if (!from || !to) return null; return <line key={`${edge.from}-${edge.to}-${edge.relationship}`} x1={from.x + 275} y1={from.y + 27} x2={to.x - 10} y2={to.y + 27} className="active" markerEnd="url(#arrow)"><title>{edge.relationship}</title></line>;})}</g>
        <g className="dag-nodes">
          {positioned.map((node: PositionedNode) => (
            <g
              key={node.node_id}
              data-node-id={node.node_id}
              transform={`translate(${node.x} ${node.y})`}
              role="treeitem"
              tabIndex={focused === node.node_id ? 0 : -1}
              aria-selected={selected === node.node_id}
              className={`dag-node ${node.kind.toLowerCase()} ${active.has(node.node_id) ? "active" : "muted"}`}
              onClick={() => choose(node.node_id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  choose(node.node_id);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  navigate(node.node_id, "upstream");
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  navigate(node.node_id, "downstream");
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  navigateSequence(node.node_id, -1);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  navigateSequence(node.node_id, 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusNode(positioned[0].node_id);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusNode(positioned[positioned.length - 1].node_id);
                }
              }}
            >
              <rect width="275" height="64" rx="2" />
              <text x="12" y="18" className="dag-kind">{node.kind}</text>
              <foreignObject x="12" y="25" width="251" height="34"><div className="dag-label">{node.label}</div></foreignObject>
              <title>{node.label} · {node.status}</title>
            </g>
          ))}
        </g>
      </svg>
    </div>
    <ol className="dag-mobile-list" aria-label="Thesis dependency list">{positioned.filter((node) => active.has(node.node_id)).map((node) => <li key={node.node_id}><button aria-pressed={selected === node.node_id} onClick={() => choose(node.node_id)}><span>{node.kind}</span><strong>{node.label}</strong><small>{node.status}</small></button></li>)}</ol>
    <div className="dag-detail" aria-live="polite">{selectedNode ? <><div><p className="kicker">Selected dependency</p><strong>{selectedNode.label}</strong><small>{selectedNode.kind} · {selectedNode.status} · Left/right follows a dependency · Up/down traverses every node</small></div><ul>{selectedEdges.map((edge) => <li key={`${edge.from}-${edge.to}`}><code>{edge.from}</code> {edge.relationship.replaceAll("_", " ")} <code>{edge.to}</code></li>)}</ul><button onClick={() => setSelected(null)}>Clear path</button></> : <p>Select any node to isolate its connected evidence-to-action path. Left/right follows dependencies; up/down, Home, and End provide a complete roving-keyboard traversal. All {graph.nodes.length} nodes and {graph.edges.length} typed edges are rendered.</p>}</div>
  </div>;
}
