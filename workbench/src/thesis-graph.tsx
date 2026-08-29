import {useMemo, useState} from "react";
import type {ThesisGraph, ThesisNode} from "./types";

type PositionedNode = ThesisNode & {x: number; y: number};

const columnFor = (kind: ThesisNode["kind"]) => {
  if (kind === "EVIDENCE" || kind === "ASSUMPTION") return 0;
  if (kind === "ESTIMATE" || kind === "SCENARIO" || kind === "FALSIFIER") return 1;
  return 2;
};

function connected(graph: ThesisGraph, selected: string | null): Set<string> {
  if (!selected) return new Set(graph.nodes.map((item) => item.node_id));
  const result = new Set([selected]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (result.has(edge.from) || result.has(edge.to)) {
        if (!result.has(edge.from)) { result.add(edge.from); changed = true; }
        if (!result.has(edge.to)) { result.add(edge.to); changed = true; }
      }
    }
  }
  return result;
}

export function ThesisGraphView({graph}: {graph: ThesisGraph}) {
  const [selected, setSelected] = useState<string | null>(null);
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
  const active = connected(graph, selected);
  const height = Math.max(320, ...positioned.map((item) => item.y + 64));
  const selectedNode = selected ? byId.get(selected) : undefined;
  const selectedEdges = selected ? graph.edges.filter((edge) => edge.from === selected || edge.to === selected) : [];
  const choose = (nodeId: string) => setSelected((current) => current === nodeId ? null : nodeId);
  return <div className="dag-shell">
    <div className="dag-column-labels"><span>Evidence + assumptions</span><span>Estimates + scenarios</span><span>Decision + action</span></div>
    <div className="dag-scroll" tabIndex={0} aria-label="Scrollable thesis dependency graph">
      <svg className="thesis-dag" viewBox={`0 0 1040 ${height}`} role="tree" aria-label="Evidence to decision dependency graph">
        <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker></defs>
        <g className="dag-edges">{graph.edges.map((edge) => {const from = byId.get(edge.from); const to = byId.get(edge.to); if (!from || !to) return null; const highlighted = !selected || active.has(edge.from) && active.has(edge.to); return <line key={`${edge.from}-${edge.to}-${edge.relationship}`} x1={from.x + 275} y1={from.y + 27} x2={to.x - 10} y2={to.y + 27} className={highlighted ? "active" : "muted"} markerEnd="url(#arrow)"><title>{edge.relationship}</title></line>;})}</g>
        <g className="dag-nodes">{positioned.map((node: PositionedNode) => <g key={node.node_id} transform={`translate(${node.x} ${node.y})`} role="treeitem" tabIndex={0} aria-selected={selected === node.node_id} className={`dag-node ${node.kind.toLowerCase()} ${active.has(node.node_id) ? "active" : "muted"}`} onClick={() => choose(node.node_id)} onKeyDown={(event) => {if (event.key === "Enter" || event.key === " ") {event.preventDefault(); choose(node.node_id);}}}><rect width="275" height="56" rx="2" /><text x="12" y="18" className="dag-kind">{node.kind}</text><text x="12" y="39" className="dag-label">{node.label.length > 38 ? `${node.label.slice(0, 37)}…` : node.label}</text><title>{node.label} · {node.status}</title></g>)}</g>
      </svg>
    </div>
    <div className="dag-detail" aria-live="polite">{selectedNode ? <><div><p className="kicker">Selected dependency</p><strong>{selectedNode.label}</strong><small>{selectedNode.kind} · {selectedNode.status}</small></div><ul>{selectedEdges.map((edge) => <li key={`${edge.from}-${edge.to}`}><code>{edge.from}</code> {edge.relationship.replaceAll("_", " ")} <code>{edge.to}</code></li>)}</ul><button onClick={() => setSelected(null)}>Clear path</button></> : <p>Select any node to isolate its connected evidence-to-action path. All {graph.nodes.length} nodes and {graph.edges.length} typed edges are rendered.</p>}</div>
  </div>;
}
