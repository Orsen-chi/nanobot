import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import cytoscape, {
  type Core,
  type ElementDefinition,
  type NodeSingular,
} from "cytoscape";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Eye,
  GitCommitHorizontal,
  Loader2,
  Pencil,
  Save,
} from "lucide-react";

import {
  fetchMemoryFile,
  fetchMemoryGraph,
  fetchMemoryHistory,
  saveMemoryFile,
} from "@/lib/api";
import type {
  MemoryGraphPayload,
  MemoryHistoryEntry,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import MarkdownTextRenderer from "@/components/MarkdownTextRenderer";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useThemeValue } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useForceSimulation } from "./useForceSimulation";

const SUBDIR_COLORS: Record<string, string> = {
  system: "#10b981",
  projects: "#8b5cf6",
  user: "#f59e0b",
  habits: "#ec4899",
  infra: "#0ea5e9",
};

function nodeColor(subdir: string): string {
  return SUBDIR_COLORS[subdir] ?? "#64748b";
}

interface MemoryGraphViewProps {
  getToken: () => string;
  base?: string;
}

export function MemoryGraphView({ getToken, base = "" }: MemoryGraphViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isDark = useThemeValue() === "dark";

  const [graph, setGraph] = useState<MemoryGraphPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [history, setHistory] = useState<MemoryHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<"file" | "history">("file");
  const [editMode, setEditMode] = useState<"preview" | "edit">("preview");

  const [sidebarWidth, setSidebarWidth] = useState(400);
  const sidebarWidthRef = useRef(sidebarWidth);

  // The Cytoscape instance is created inside an effect, so `cyRef.current` is
  // only populated *after* render. A ref change does not re-render, so the
  // force sim (keyed off the cy reference) would otherwise start late or wait
  // for an unrelated re-render. `simReady` explicitly kicks that re-render the
  // moment the instance and its initial layout exist.
  const [simReady, setSimReady] = useState(false);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMemoryGraph(getToken(), base);
      setGraph(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [base, getToken]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const payload = await fetchMemoryHistory(getToken(), 30, base);
      setHistory(payload.history);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [base, getToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graph) return [];
    return [
      ...graph.nodes.map((n) => ({ ...n })),
      ...graph.edges.map((e) => ({ ...e })),
    ];
  }, [graph]);

  // Build the Cytoscape instance once the graph data is available.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!elements.length) return;
    if (cyRef.current) {
      cyRef.current.elements().remove();
      cyRef.current.add(elements);
      // Initial preset layout then hand off to live force sim.
      cyRef.current.layout({
        name: "cose",
        animate: false,
        nodeRepulsion: 8000,
        idealEdgeLength: 120,
        edgeElasticity: 100,
        nestingFactor: 1.2,
        gravity: 0.8,
        numIter: 300,
        randomize: false,
      }).run();
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele: NodeSingular) => nodeColor(ele.data("subdir")),
            label: "data(label)",
            color: isDark ? "#e2e8f0" : "#334155",
            "font-size": 10,
            "font-weight": 500,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 8,
            "text-max-width": "96px",
            "text-wrap": "ellipsis",
            width: 28,
            height: 28,
            shape: "ellipse",
            "border-width": 0,
            "overlay-opacity": 0,
          },
        },
        {
          selector: "node:active",
          style: {
            "overlay-opacity": 0,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": isDark ? "rgba(148,163,184,0.3)" : "rgba(100,116,139,0.4)",
            "curve-style": "bezier",
            "target-arrow-shape": "none",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 3,
            "border-color": "#f59e0b",
            "border-opacity": 1,
            "overlay-opacity": 0,
          },
        },
      ],
      layout: {
        name: "preset",
      },
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.15,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    // Initial layout.
    cy.layout({
      name: "cose",
      animate: false,
      nodeRepulsion: 8000,
      idealEdgeLength: 120,
      edgeElasticity: 100,
      nestingFactor: 1.2,
      gravity: 0.8,
      numIter: 300,
      randomize: false,
    }).run();

    // Signal the force simulation that the instance is ready. This happens in
    // the same effect pass, right after the static layout settles, so the
    // graph starts bouncing immediately instead of after an arbitrary delay.
    setSimReady(true);

    cy.on("tap", "node", (event) => {
      const node = event.target;
      const path = node.data("path") as string;
      setSelectedPath(path);
      setEditMode("preview");
      void loadFile(path);
    });
    cy.on("tap", (event) => {
      if (event.target === cy) {
        setSelectedPath(null);
        setFileContent("");
        setDirty(false);
      }
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
      setSimReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements.length]);

  // Live force simulation (Obsidian-style). Options come from the hook's
  // defaults so the object identity stays stable across renders.
  useForceSimulation(cyRef.current, simReady);

  // Keep graph colors in sync with the WebUI light/dark theme.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const line = isDark ? "rgba(148,163,184,0.3)" : "rgba(100,116,139,0.4)";
    cy.style()
      .selector("node")
      .style({ color: isDark ? "#e2e8f0" : "#334155" })
      .selector("edge")
      .style({ "line-color": line })
      .update();
  }, [isDark, graph]);

  const loadFile = useCallback(
    async (path: string) => {
      setFileLoading(true);
      setSaveError(null);
      try {
        const payload = await fetchMemoryFile(getToken(), path, base);
        setFileContent(payload.content);
        setDirty(false);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
        setFileContent("");
      } finally {
        setFileLoading(false);
      }
    },
    [base, getToken],
  );

  const onSave = useCallback(async () => {
    if (!selectedPath) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = await saveMemoryFile(getToken(), selectedPath, fileContent, base);
      setFileContent(payload.content);
      setDirty(false);
      await loadGraph();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [base, fileContent, getToken, loadGraph, selectedPath]);

  // Resizable sidebar (desktop only).
  useEffect(() => {
    if (isMobile) return;
    const handle = resizeHandleRef.current;
    if (!handle) return;

    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = sidebarWidthRef.current;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const newWidth = Math.max(280, Math.min(820, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isMobile]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Center: infinite canvas graph */}
          <div
            className={cn(
              "relative min-h-0 flex-1 bg-settings-canvas",
              isMobile && selectedPath && "hidden lg:block",
            )}
          >
            {loading && !graph ? (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : elements.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                {t("memory.empty", {
                  defaultValue: "暂无记忆块。Dream 会自动把新事实写入 memory/system/。",
                })}
              </div>
            ) : null}
            <div
              ref={containerRef}
              className={cn(
                "absolute inset-0",
                (!graph || !elements.length) && "invisible",
              )}
              style={{ cursor: "default" }}
              data-testid="memory-graph-canvas"
            />
            {graph && (
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg border border-border/60 bg-card/90 p-2 text-[11px] text-muted-foreground backdrop-blur-sm">
                {Object.entries(SUBDIR_COLORS).map(([subdir, color]) => (
                  <div key={subdir} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span>
                      {t(`memory.subdir.${subdir}`, {
                        defaultValue: subdir,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: preview / edit / history */}
          <aside
            ref={sidebarRef}
            className={cn(
              "relative flex min-h-0 shrink-0 flex-col border-t border-border/50 bg-card lg:border-l lg:border-t-0",
              isMobile && !selectedPath && "hidden",
              isMobile && selectedPath && "flex-1",
              isMobile ? "w-full" : "",
            )}
            style={!isMobile ? { width: `${sidebarWidth}px` } : undefined}
          >
            {!isMobile && (
              <div
                ref={resizeHandleRef}
                className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-border active:bg-border"
                style={{ touchAction: "none" }}
              />
            )}
            <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-3 py-2">
              {isMobile && selectedPath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedPath(null);
                    setFileContent("");
                    setDirty(false);
                  }}
                  className="h-8 w-8 lg:hidden"
                  aria-label={t("memory.back", { defaultValue: "返回" })}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <button
                type="button"
                onClick={() => setActivePanel("file")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition",
                  activePanel === "file"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {editMode === "preview" ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                )}
                {t("memory.panel.file", { defaultValue: "文件" })}
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("history")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition",
                  activePanel === "history"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden />
                {t("memory.panel.history", { defaultValue: "历史" })}
              </button>
            </div>

            {activePanel === "file" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {selectedPath === null ? (
                  <div className="grid flex-1 place-items-center p-4 text-center text-[12.5px] text-muted-foreground">
                    {t("memory.selectHint", {
                      defaultValue: "点击画布中的节点查看记忆文件",
                    })}
                  </div>
                ) : fileLoading ? (
                  <div className="grid flex-1 place-items-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">
                        {selectedPath}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={editMode === "preview" ? "ghost" : "outline"}
                          onClick={() => setEditMode("preview")}
                          className="h-7 gap-1.5 px-2.5 text-[12px]"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                          {t("memory.preview", { defaultValue: "预览" })}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={editMode === "edit" ? "ghost" : "outline"}
                          onClick={() => setEditMode("edit")}
                          className="h-7 gap-1.5 px-2.5 text-[12px]"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          {t("memory.edit", { defaultValue: "编辑" })}
                        </Button>
                        {editMode === "edit" && (
                          <Button
                            type="button"
                            size="sm"
                            variant={dirty ? "default" : "outline"}
                            disabled={!dirty || saving}
                            onClick={() => void onSave()}
                            className="h-7 gap-1.5 px-2.5 text-[12px]"
                          >
                            {saving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" aria-hidden />
                            )}
                            {t("memory.save", { defaultValue: "保存" })}
                          </Button>
                        )}
                      </div>
                    </div>
                    {saveError ? (
                      <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 text-[12px] text-destructive">
                        {saveError}
                      </div>
                    ) : null}
                    {editMode === "preview" ? (
                      <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        <MarkdownTextRenderer className="prose prose-sm max-w-none dark:prose-invert">
                          {fileContent}
                        </MarkdownTextRenderer>
                      </div>
                    ) : (
                      <textarea
                        value={fileContent}
                        onChange={(e) => {
                          setFileContent(e.target.value);
                          setDirty(true);
                        }}
                        spellCheck={false}
                        aria-label={t("memory.editorLabel", {
                          defaultValue: "记忆文件内容",
                        })}
                        className="min-h-0 flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-foreground outline-none"
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {historyLoading ? (
                  <div className="grid place-items-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                    {t("memory.noHistory", { defaultValue: "暂无记忆提交记录" })}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((entry) => (
                      <li
                        key={entry.sha}
                        className="rounded-lg border border-border/60 bg-muted/40 p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {entry.sha}
                          </code>
                          <span className="text-[12px] text-muted-foreground">
                            {entry.timestamp}
                          </span>
                        </div>
                        <p className="mt-1 text-[12.5px] text-foreground">
                          {entry.subject}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
