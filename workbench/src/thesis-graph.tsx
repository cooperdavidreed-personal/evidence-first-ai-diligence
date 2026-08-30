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
  const walk = (start: string, direction: "upstream" | "downstream") => {
    const pending = [start];
    while (pending.length) {
      const current = pending.pop()!;
      for (const edge of graph.edges) {
        const next = direction === "downstream" && edge.from === current
          ? edge.to
          : direction === "upstream" && edge.to === current ? edge.from : null;
        if (next && !result.has(next)) {result.add(next); pending.push(next);}
      }
    }
  };
  walk(selected, "upstream");
  walk(selected, "downstream");
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
  const selectedEdges = selected ? graph.edges.filter((edge) => active.has(edge.from) && active.has(edge.to)) : [];
  const choose = (nodeId: string) => setSelected((current) => current === nodeId ? null : nodeId);
  const navigate = (nodeId: string, direction: "upstream" | "downstream") => {
    const edge = graph.edges.find((item) => direction === "upstream" ? item.to === nodeId : item.from === nodeId);
    const nextId = edge ? (direction === "upstream" ? edge.from : edge.to) : null;
    if (!nextId) return;
    setSelected(nextId);
    requestAnimationFrame(() => {
      document.querySelector<SVGGElement>(`[data-node-id="${nextId}"]`)?.focus();
    });
  };
  return <div className="dag-shell">
    <div className="dag-column-labels"><span>Evidence + assumptions</span><span>Estimates + scenarios</span><span>Decision + action</span></div>
    <div className="dag-scroll" tabIndex={0} aria-label="Scrollable thesis dependency graph">
      <svg className="thesis-dag" viewBox={`0 0 1040 ${height}`} role="tree" aria-label="Evidence to decision dependency graph" data-node-count={graph.nodes.length} data-edge-count={graph.edges.length}>
        <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker></defs>
        <g className="dag-edges">{graph.edges.map((edge) => {const from = byId.get(edge.from); const to = byId.get(edge.to); if (!from || !to) return null; const highlighted = !selected || active.has(edge.from) && active.has(edge.to); return <line key={`${edge.from}-${edge.to}-${edge.relationship}`} x1={from.x + 275} y1={from.y + 27} x2={to.x - 10} y2={to.y + 27} className={highlighted ? "active" : "muted"} markerEnd="url(#arrow)"><title>{edge.relationship}</title></line>;})}</g>
        <g className="dag-nodes">
          {positioned.map((node: PositionedNode) => (
            <g
              key={node.node_id}
              data-node-id={node.node_id}
              transform={`translate(${node.x} ${node.y})`}
              role="treeitem"
              tabIndex={0}
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
    <div className="dag-detail" aria-live="polite">{selectedNode ? <><div><p className="kicker">Selected dependency</p><strong>{selectedNode.label}</strong><small>{selectedNode.kind} · {selectedNode.status} · Arrow Left upstream · Arrow Right downstream</small></div><ul>{selectedEdges.map((edge) => <li key={`${edge.from}-${edge.to}`}><code>{edge.from}</code> {edge.relationship.replaceAll("_", " ")} <code>{edge.to}</code></li>)}</ul><button onClick={() => setSelected(null)}>Clear path</button></> : <p>Select any node to isolate its connected evidence-to-action path. Use Arrow Left for an upstream dependency and Arrow Right for a downstream dependency. All {graph.nodes.length} nodes and {graph.edges.length} typed edges are rendered.</p>}</div>
  </div>;
}
