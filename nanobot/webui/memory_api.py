"""Memory graph API for the WebUI.

Reads the MemFS layout under ``workspace/memory`` and renders it as a graph:

- Nodes: every ``*.md`` block under ``memory/system`` and any semantic subdir
  (``memory/projects``, ``memory/user``, ``memory/habits``, ``memory/infra``, ...).
- Edges: ``[[path]]`` Memory links found inside block bodies (Letta-style
  "references as synapses").

Also provides single-file read/write so the WebUI can preview and edit a
memory block directly.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# [[path/to/file]] or [[path/to/file|display]] or [[label]]
LINK_RE = re.compile(r"\[\[([^\[\]|]+)(?:\|[^\]]*)?\]\]")

# Subdirectories under memory/ that are treated as memory blocks. Discovered
# dynamically so new semantic categories (projects/, user/, habits/, infra/,
# ...) work without code changes; ``system`` is listed first (always injected).
def _memory_subdirs(workspace: Path) -> list[str]:
    m = workspace / "memory"
    if not m.is_dir():
        return []
    dirs = [
        d.name for d in sorted(m.iterdir())
        if d.is_dir() and not d.name.startswith(".") and any(d.glob("*.md"))
    ]
    return sorted(dirs, key=lambda x: (x != "system", x))


MEMORY_SUBDIRS = _memory_subdirs  # callable(workspace) for backward compat


def _safe_memory_dir(workspace: Path, subdir: str) -> Path:
    return (workspace / "memory" / subdir).resolve()


def _is_inside(base: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(base)
        return True
    except ValueError:
        return False


def list_memory_files(workspace: Path) -> list[dict[str, Any]]:
    """Return all memory block files across MemFS subdirectories."""
    out: list[dict[str, Any]] = []
    for subdir in _memory_subdirs(workspace):
        d = _safe_memory_dir(workspace, subdir)
        if not d.is_dir():
            continue
        for path in sorted(d.glob("*.md")):
            rel = path.relative_to(workspace)
            label = path.stem
            description = _read_description(path)
            out.append({
                "path": rel.as_posix(),
                "name": path.name,
                "label": label,
                "subdir": subdir,
                "description": description,
            })
    return out


def _read_description(path: Path) -> str:
    """Read the YAML frontmatter ``description:`` of a memory block file."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    if not text.startswith("---\n"):
        return ""
    end = text.find("\n---\n", 4)
    if end == -1:
        return ""
    for line in text[4:end].splitlines():
        if line.startswith("description:"):
            return line.split(":", 1)[1].strip().strip('"').strip("'")
    return ""


def _extract_links(text: str) -> list[str]:
    """Extract ``[[path]]`` targets from a memory block body."""
    return [m.group(1).strip() for m in LINK_RE.finditer(text) if m.group(1).strip()]


def _resolve_link_target(workspace: Path, raw: str) -> str | None:
    """Map a ``[[path]]`` target to a real memory file path (if any).

    Accepts ``memory/projects/keycoboard`` (full path), ``projects/keycoboard``,
    ``reference/foo.md``, ``system/human``, ``keycoboard`` (bare label, resolved
    against memory subdirs).
    """
    raw = raw.strip()
    if raw.endswith(".md"):
        raw = raw[:-3]
    candidates: list[Path] = []
    if raw.startswith("memory/"):
        # Full path form: memory/<subdir>/<name>
        candidates.append(workspace / f"{raw}.md")
    else:
        p = workspace / "memory" / f"{raw}.md"
        candidates.append(p)
        if "/" not in raw:
            for subdir in _memory_subdirs(workspace):
                candidates.append(workspace / "memory" / subdir / f"{raw}.md")
    for candidate in candidates:
        if candidate.is_file() and _is_inside(workspace / "memory", candidate):
            return candidate.relative_to(workspace).as_posix()
    return None


def build_memory_graph(workspace: Path) -> dict[str, Any]:
    """Build the full graph payload for the WebUI memory view."""
    files = list_memory_files(workspace)
    by_path = {f["path"]: f for f in files}
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    node_id_by_path: dict[str, str] = {}
    edge_keys: set[frozenset[str]] = set()

    for f in files:
        node_id = f["path"]
        node_id_by_path[node_id] = node_id
        nodes.append({
            "data": {
                "id": node_id,
                "label": f["label"],
                "subdir": f["subdir"],
                "description": f["description"],
                "path": node_id,
            }
        })

    # Edges from [[links]] inside each block body.
    for f in files:
        path = (workspace / f["path"])
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for raw in _extract_links(text):
            target = _resolve_link_target(workspace, raw)
            if target is None or target not in by_path:
                continue
            source, target_id = f["path"], target
            # Undirected edge: frozenset so (A,B) and (B,A) are the same
            key = frozenset([source, target_id])
            if key in edge_keys:
                continue
            edge_keys.add(key)
            edges.append({
                "data": {
                    "id": f"e-{len(edge_keys)}",
                    "source": source,
                    "target": target_id,
                    "label": "links",
                }
            })

    return {
        "nodes": nodes,
        "edges": edges,
        "files": files,
    }


def read_memory_file(workspace: Path, raw_path: str) -> dict[str, Any] | None:
    """Read a single memory file (path relative to workspace)."""
    p = (workspace / raw_path).resolve()
    if not _is_inside(workspace, p) or not p.is_file():
        return None
    try:
        content = p.read_text(encoding="utf-8")
    except OSError:
        return None
    return {
        "path": p.relative_to(workspace).as_posix(),
        "content": content,
    }


def write_memory_file(workspace: Path, raw_path: str, content: str) -> dict[str, Any] | None:
    """Write a single memory file (path relative to workspace).

    Only files inside the workspace memory tree (``memory/**/*.md``) are
    writable; anything else is rejected.
    """
    p = (workspace / raw_path).resolve()
    memory_root = (workspace / "memory").resolve()
    if not _is_inside(memory_root, p):
        return None
    if p.suffix != ".md":
        return None
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    except OSError:
        return None
    return {
        "path": p.relative_to(workspace).as_posix(),
        "content": content,
    }


def memory_history(workspace: Path, limit: int = 30) -> list[dict[str, Any]]:
    """Return recent git history of the memory tree (best-effort)."""
    try:
        from nanobot.agent.memory import MemoryStore

        store = MemoryStore(workspace)
        entries = store.git.log(max_entries=limit)
        return [
            {"sha": e.sha, "subject": e.subject(), "timestamp": e.timestamp}
            for e in entries
        ]
    except Exception:
