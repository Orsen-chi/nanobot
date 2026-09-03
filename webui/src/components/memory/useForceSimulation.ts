import { useEffect, useRef } from "react";
import type { Core, NodeSingular } from "cytoscape";

/**
 * Obsidian-style live force simulation for a Cytoscape graph.
 *
 * Kept intentionally standalone (no extra npm dependency, no upstream file
 * touched) so this patch stays easy to re-apply after nanobot upgrades.
 *
 * Physics: pairwise repulsion + edge springs + weak group cohesion + centering.
 * Grabbed nodes are pinned to the pointer so dragging one node visibly pulls
 * its neighbours, which is the "elastic" feel of Obsidian's graph view.
 */

export interface ForceOptions {
  /** Node-node repulsion strength. */
  repulsion?: number;
  /** Edge spring stiffness. */
  stiffness?: number;
  /** Natural edge length in graph units. */
  linkDistance?: number;
  /** Pull of each node toward the centroid of its group (same `subdir`). */
  groupCohesion?: number;
  /** Pull toward the graph origin, keeps things from drifting away. */
  gravity?: number;
  /** Ambient "wind": slow drift force so the graph keeps flowing when idle. */
  wind?: number;
  /** Velocity retained per tick (0..1). */
  damping?: number;
  /** Simulation sleeps when total kinetic energy drops below this. */
  sleepEnergy?: number;
}

const DEFAULTS: Required<ForceOptions> = {
  repulsion: 35_000,
  stiffness: 0.008,
  linkDistance: 200,
  groupCohesion: 0.002,
  gravity: 0.003,
  wind: 0.04,
  damping: 0.88,
  sleepEnergy: 0.05,
};

interface Velocity {
  vx: number;
  vy: number;
}

export function useForceSimulation(
  cy: Core | null,
  enabled: boolean,
  options?: ForceOptions,
): { kick: () => void } {
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!cy || !enabled) return;
    const opts = { ...DEFAULTS, ...options };

    const velocities = new Map<string, Velocity>();
    let frame = 0;
    let sleeping = false;
    let disposed = false;

    const leaves = () => cy.nodes().filter((n) => n.isChildless());

    const step = () => {
      frame = 0;
      if (disposed) return;

      const nodes = leaves();
      const count = nodes.length;
      if (!count) return;

      const forces = new Map<string, { fx: number; fy: number }>();
      const read = (id: string) => {
        let f = forces.get(id);
        if (!f) {
          f = { fx: 0, fy: 0 };
          forces.set(id, f);
        }
        return f;
      };

      // Pairwise repulsion.
      for (let i = 0; i < count; i += 1) {
        const a = nodes[i] as NodeSingular;
        const pa = a.position();
        for (let j = i + 1; j < count; j += 1) {
          const b = nodes[j] as NodeSingular;
          const pb = b.position();
          let dx = pa.x - pb.x;
          let dy = pa.y - pb.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 1) {
            // Deterministic nudge so co-located nodes separate.
            dx = (i % 2 === 0 ? 1 : -1) * 0.5;
            dy = (j % 2 === 0 ? 1 : -1) * 0.5;
            distSq = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(distSq);
          const mag = opts.repulsion / distSq;
          const fx = (dx / dist) * mag;
          const fy = (dy / dist) * mag;
          const fa = read(a.id());
          const fb = read(b.id());
          fa.fx += fx;
          fa.fy += fy;
          fb.fx -= fx;
          fb.fy -= fy;
        }
      }

      // Edge springs.
      cy.edges().forEach((edge) => {
        const source = edge.source();
        const target = edge.target();
        if (!source.isChildless() || !target.isChildless()) return;
        const ps = source.position();
        const pt = target.position();
        const dx = pt.x - ps.x;
        const dy = pt.y - ps.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const mag = (dist - opts.linkDistance) * opts.stiffness;
        const fx = (dx / dist) * mag;
        const fy = (dy / dist) * mag;
        const fs = read(source.id());
        const ft = read(target.id());
        fs.fx += fx;
        fs.fy += fy;
        ft.fx -= fx;
        ft.fy -= fy;
      });

      // Group cohesion: keep same-category blocks clustered.
      const groups = new Map<string, NodeSingular[]>();
      nodes.forEach((n) => {
        const key = String((n as NodeSingular).data("subdir") ?? "");
        const bucket = groups.get(key);
        if (bucket) bucket.push(n as NodeSingular);
        else groups.set(key, [n as NodeSingular]);
      });
      groups.forEach((members) => {
        if (members.length < 2) return;
        let cx = 0;
        let cy0 = 0;
        members.forEach((n) => {
          const p = n.position();
          cx += p.x;
          cy0 += p.y;
        });
        cx /= members.length;
        cy0 /= members.length;
        members.forEach((n) => {
          const p = n.position();
          const f = read(n.id());
          f.fx += (cx - p.x) * opts.groupCohesion;
          f.fy += (cy0 - p.y) * opts.groupCohesion;
        });
      });

      // Ambient wind: a slowly rotating global force plus a soft spatial
      // ripple, so the whole graph keeps flowing gently even when idle.
      // Grabbed nodes are skipped during integration, so dragging stays crisp.
      if (opts.wind > 0) {
        const t = performance.now() / 1000;
        const angle = t * 0.07;
        const baseX = Math.cos(angle) * opts.wind;
        const baseY = Math.sin(angle * 1.3) * opts.wind;
        nodes.forEach((node) => {
          const n = node as NodeSingular;
          const p = n.position();
          const ripple =
            Math.sin(p.x * 0.006 + t * 0.35) * 0.45 +
            Math.cos(p.y * 0.006 + t * 0.28) * 0.45;
          const f = read(n.id());
          f.fx += baseX * (1 + ripple);
          f.fy += baseY * (1 - ripple);
        });
      }

      // Integrate.
      let energy = 0;
      cy.batch(() => {
        nodes.forEach((node) => {
          const n = node as NodeSingular;
          const id = n.id();
          if (n.grabbed()) {
            velocities.set(id, { vx: 0, vy: 0 });
            return;
          }
          const p = n.position();
          const f = forces.get(id) ?? { fx: 0, fy: 0 };
          f.fx -= p.x * opts.gravity;
          f.fy -= p.y * opts.gravity;

          const v = velocities.get(id) ?? { vx: 0, vy: 0 };
          v.vx = (v.vx + f.fx) * opts.damping;
          v.vy = (v.vy + f.fy) * opts.damping;
          // Clamp so a hard drag cannot fling nodes off-canvas.
          v.vx = Math.max(-25, Math.min(25, v.vx));
          v.vy = Math.max(-25, Math.min(25, v.vy));
          velocities.set(id, v);
          energy += v.vx * v.vx + v.vy * v.vy;
          n.position({ x: p.x + v.vx, y: p.y + v.vy });
        });
      });

      // With wind enabled the graph never fully sleeps — it keeps flowing.
      // Otherwise, stop when the layout settles.
      if (opts.wind > 0) {
        frame = requestAnimationFrame(step);
        return;
      }
      if (energy / count < opts.sleepEnergy) {
        sleeping = true;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const kick = () => {
      if (disposed) return;
      sleeping = false;
      if (!frame) frame = requestAnimationFrame(step);
    };
    kickRef.current = kick;

    const onGrab = () => kick();
    const onDrag = () => {
      if (sleeping) kick();
    };
    const onAdd = () => kick();

    cy.on("grab", "node", onGrab);
    cy.on("drag", "node", onDrag);
    cy.on("free", "node", onGrab);
    cy.on("add remove", onAdd);
    kick();

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      cy.removeListener("grab", "node", onGrab);
      cy.removeListener("drag", "node", onDrag);
      cy.removeListener("free", "node", onGrab);
      cy.removeListener("add remove", onAdd);
    };
  }, [cy, enabled, options]);

  return { kick: () => kickRef.current() };
}
