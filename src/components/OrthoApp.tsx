"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ChevronRight,
  Settings,
  HelpCircle,
  User,
  Bell,
  Grid3x3,
  RotateCcw,
  Eye,
  EyeOff,
  Box,
} from "lucide-react";
import ScanLoader, { type ScanFile } from "./ScanLoader";
import OcclusalAlignment from "./OcclusalAlignment";
import type { ThreeViewerHandle, OcclusalPlaneData, ViewPreset } from "./ThreeViewer";

// Dynamic import — Three.js is client-side only
const ThreeViewer = dynamic(() => import("./ThreeViewer"), { ssr: false });

// ─── Workflow stages ──────────────────────────────────────────────────────────
type Stage = "load" | "align" | "plan";

const STAGES: { id: Stage; label: string }[] = [
  { id: "load", label: "Load Scan" },
  { id: "align", label: "Occlusal Alignment" },
  { id: "plan", label: "Bracket Planning" },
];

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function OrthoApp() {
  const [stage, setStage] = useState<Stage>("load");
  const [maxillaFile, setMaxillaFile] = useState<ScanFile | null>(null);
  const [mandibleFile, setMandibleFile] = useState<ScanFile | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [viewMode, setViewMode] = useState<ViewPreset>("perspective");
  const [orthographic, setOrthographic] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Occlusal plane state (lifted from viewer)
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [occlusalPlane, setOcclusalPlane] = useState<OcclusalPlaneData | null>(null);

  const viewerRef = useRef<ThreeViewerHandle>(null);

  const notify = useCallback((msg: string, ms = 3000) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), ms);
  }, []);

  // ── Load mesh into viewer whenever a file is set ──────────────────────────
  useEffect(() => {
    if (!maxillaFile || !viewerRef.current) return;
    viewerRef.current
      .loadMesh(maxillaFile.file, "maxilla")
      .then(() => notify("Maxilla scan loaded"))
      .catch(() => notify("Failed to load scan"));
  }, [maxillaFile, notify]);

  useEffect(() => {
    if (!mandibleFile || !viewerRef.current) return;
    viewerRef.current
      .loadMesh(mandibleFile.file, "mandible")
      .then(() => notify("Mandible scan loaded"))
      .catch(() => notify("Failed to load scan"));
  }, [mandibleFile, notify]);

  // ── Scan loader callbacks ─────────────────────────────────────────────────
  const handleFileLoaded = (scan: ScanFile) => {
    if (scan.jaw === "maxilla" || scan.jaw === "combined") {
      setMaxillaFile(scan);
    } else {
      setMandibleFile(scan);
    }
  };

  const handleFileRemoved = (jaw: "maxilla" | "mandible") => {
    if (jaw === "maxilla") {
      setMaxillaFile(null);
      viewerRef.current?.clearMesh("maxilla");
    } else {
      setMandibleFile(null);
      viewerRef.current?.clearMesh("mandible");
    }
  };

  // ── Drag-and-drop from viewport (jaw assignment dialog) ───────────────────
  const [dropFile, setDropFile] = useState<File | null>(null);
  const [showJawPicker, setShowJawPicker] = useState(false);

  useEffect(() => {
    const el = document.getElementById("viewer-mount");
    if (!el) return;
    const handler = (e: Event) => {
      const file = (e as CustomEvent<{ file: File }>).detail.file;
      setDropFile(file);
      setShowJawPicker(true);
    };
    el.addEventListener("scanDrop", handler);
    return () => el.removeEventListener("scanDrop", handler);
  }, []);

  const assignDropFile = (jaw: "maxilla" | "mandible" | "combined") => {
    if (!dropFile) return;
    const scan: ScanFile = {
      file: dropFile,
      jaw,
      name: dropFile.name,
      size: `${(dropFile.size / (1024 * 1024)).toFixed(1)} MB`,
    };
    handleFileLoaded(scan);
    setDropFile(null);
    setShowJawPicker(false);
  };

  // ── Occlusal alignment callbacks ──────────────────────────────────────────
  const handleStartPicking = useCallback(() => {
    viewerRef.current?.setPickMode("landmark");
    notify("Click 3 points on the maxilla to define the occlusal plane", 5000);
  }, [notify]);

  const handleClearLandmarks = useCallback(() => {
    viewerRef.current?.clearLandmarks();
    setLandmarkCount(0);
    setOcclusalPlane(null);
  }, []);

  const handleSetGizmoMode = useCallback(
    (mode: "translate" | "rotate") => {
      viewerRef.current?.setGizmoMode(mode);
      notify(`Gizmo: ${mode} mode`);
    },
    [notify]
  );

  const handleSetOrthographic = useCallback((v: boolean) => {
    setOrthographic(v);
    viewerRef.current?.setOrthographic(v);
  }, []);

  const handleSetView = useCallback((view: ViewPreset) => {
    setViewMode(view);
    viewerRef.current?.setView(view);
  }, []);

  const stageIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-4 px-4 h-12 flex-shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #2563eb, #0891b2)",
              boxShadow: "0 0 10px rgba(37,99,235,0.3)",
            }}
          >
            <Activity size={14} color="#fff" />
          </div>
          <div>
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              OrthoScan
            </span>
            <span className="text-xs ml-1 font-semibold" style={{ color: "#2563eb" }}>
              Pro
            </span>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs ml-2" style={{ color: "var(--text-muted)" }}>
          <span>Patients</span>
          <ChevronRight size={10} />
          <span>Ahmet Yılmaz</span>
          <ChevronRight size={10} />
          <span style={{ color: "var(--text-secondary)" }}>Scan Import</span>
        </div>

        {/* Workflow steps */}
        <div className="flex items-center gap-1 mx-auto">
          {STAGES.map((s, idx) => {
            const done = idx < stageIndex;
            const active = s.id === stage;
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: done ? "#10b981" : active ? "#2563eb" : "#e2e8f0",
                      color: done || active ? "#fff" : "var(--text-muted)",
                      fontSize: "9px",
                    }}
                  >
                    {done ? "✓" : idx + 1}
                  </div>
                  <span
                    className="text-xs"
                    style={{
                      color: active
                        ? "var(--text-primary)"
                        : done
                        ? "#10b981"
                        : "var(--text-muted)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    className="w-6 h-px mx-1"
                    style={{ background: done ? "#10b981" : "var(--border-subtle)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setShowGrid((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
            style={{ color: showGrid ? "#2563eb" : "var(--text-muted)" }}
            title="Toggle grid"
          >
            <Grid3x3 size={14} />
          </button>
          <button
            onClick={() => {
              const next = !wireframe;
              setWireframe(next);
              viewerRef.current?.setWireframe(next);
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
            style={{ color: wireframe ? "#2563eb" : "var(--text-muted)" }}
            title="Toggle wireframe"
          >
            {wireframe ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={() => viewerRef.current?.resetCamera()}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
            style={{ color: "var(--text-muted)" }}
            title="Reset camera"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => {
              const next = !orthographic;
              handleSetOrthographic(next);
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
            style={{ color: orthographic ? "#2563eb" : "var(--text-muted)" }}
            title={orthographic ? "Switch to Perspective" : "Switch to Orthographic"}
          >
            <Box size={14} />
          </button>

          <div className="w-px h-5 mx-1" style={{ background: "var(--border-subtle)" }} />

          <button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: "var(--text-muted)" }}>
            <Bell size={14} />
          </button>
          <button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: "var(--text-muted)" }}>
            <Settings size={14} />
          </button>
          <button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: "var(--text-muted)" }}>
            <HelpCircle size={14} />
          </button>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "#2563eb", color: "#fff" }}
          >
            <User size={13} />
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside
          className="flex-shrink-0 overflow-y-auto"
          style={{
            width: "320px",
            background: "var(--bg-panel)",
            borderRight: "1px solid var(--border-subtle)",
            boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
          }}
        >
          {stage === "load" && (
            <ScanLoader
              maxillaFile={maxillaFile}
              mandibleFile={mandibleFile}
              onFileLoaded={handleFileLoaded}
              onFileRemoved={handleFileRemoved}
              onProceed={() => setStage("align")}
            />
          )}

          {stage === "align" && (
            <OcclusalAlignment
              maxillaFile={maxillaFile}
              mandibleFile={mandibleFile}
              onAlignmentComplete={() => {
                notify("Alignment complete!");
                setStage("plan");
              }}
              onBack={() => setStage("load")}
              onStartPicking={handleStartPicking}
              onClearLandmarks={handleClearLandmarks}
              onSetGizmoMode={handleSetGizmoMode}
              onSetOrthographic={handleSetOrthographic}
              onSetView={handleSetView}
              landmarkCount={landmarkCount}
              occlusalPlane={occlusalPlane}
            />
          )}

          {stage === "plan" && (
            <div className="p-5 flex flex-col gap-4">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Bracket Planning
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                Bracket planning tools will appear here.
              </div>
              <button
                onClick={() => setStage("align")}
                className="text-xs py-2 rounded-lg hover:bg-slate-100 transition-colors"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
              >
                ← Back to Alignment
              </button>
            </div>
          )}
        </aside>

        {/* 3D Viewport */}
        <main className="flex-1 relative overflow-hidden" id="viewer-mount">
          <ThreeViewer
            ref={viewerRef}
            showGrid={showGrid}
            wireframe={wireframe}
            viewMode={viewMode}
            orthographic={orthographic}
            onMeshLoaded={(jaw, name) => {
              notify(`${jaw === "maxilla" ? "Maxilla" : "Mandible"} loaded: ${name}`);
            }}
            onLandmarkPicked={(index) => {
              setLandmarkCount(index + 1);
            }}
            onOcclusalPlaneDefined={(plane) => {
              setOcclusalPlane(plane);
              setLandmarkCount(3);
              notify("Occlusal plane defined! Adjust with the gizmo if needed.");
            }}
          />

          {/* View mode buttons — floating bottom-left */}
          <div
            className="absolute bottom-4 left-4 flex gap-1"
            style={{ zIndex: 10 }}
          >
            {(["perspective", "front", "top", "side", "bottom"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleSetView(m)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: viewMode === m ? "#2563eb" : "rgba(255,255,255,0.88)",
                  color: viewMode === m ? "#fff" : "var(--text-muted)",
                  border: `1px solid ${viewMode === m ? "#2563eb" : "var(--border-subtle)"}`,
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                }}
              >
                {m === "perspective" ? "3D" : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Projection badge — floating top-right of viewport */}
          <div
            className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{
              background: orthographic ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.75)",
              color: orthographic ? "#2563eb" : "var(--text-muted)",
              border: `1px solid ${orthographic ? "rgba(37,99,235,0.3)" : "var(--border-subtle)"}`,
              backdropFilter: "blur(8px)",
              zIndex: 10,
            }}
          >
            {orthographic ? "Orthographic" : "Perspective"}
          </div>

          {/* Scan legend — floating bottom-right */}
          {(maxillaFile || mandibleFile) && (
            <div
              className="absolute bottom-4 right-4 flex flex-col gap-1.5 px-3 py-2.5 rounded-xl text-xs"
              style={{
                background: "rgba(255,255,255,0.88)",
                border: "1px solid var(--border-subtle)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                zIndex: 10,
              }}
            >
              {maxillaFile && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#f59e0b" }} />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {maxillaFile.jaw === "combined" ? "Combined" : "Maxilla"}
                  </span>
                </div>
              )}
              {mandibleFile && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#2563eb" }} />
                  <span style={{ color: "var(--text-secondary)" }}>Mandible</span>
                </div>
              )}
              {occlusalPlane && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#2563eb", opacity: 0.5 }} />
                  <span style={{ color: "var(--text-secondary)" }}>Occlusal Plane</span>
                </div>
              )}
            </div>
          )}

          {/* Empty state hint */}
          {!maxillaFile && !mandibleFile && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 5 }}
            >
              <div
                className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl text-center"
                style={{
                  background: "rgba(255,255,255,0.75)",
                  border: "1.5px dashed #cbd5e1",
                  backdropFilter: "blur(8px)",
                  maxWidth: "320px",
                }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(37,99,235,0.08)" }}
                >
                  <Activity size={22} style={{ color: "#2563eb" }} />
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    No scan loaded
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Load a dental scan from the panel on the left, or drag &amp; drop a file here
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Jaw picker modal (drag-and-drop from viewport) ─────────────────── */}
      {showJawPicker && dropFile && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.35)", zIndex: 50 }}
          onClick={() => setShowJawPicker(false)}
        >
          <div
            className="flex flex-col gap-4 p-6 rounded-2xl"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              minWidth: "280px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                Assign Jaw
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {dropFile.name}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {(["maxilla", "mandible", "combined"] as const).map((jaw) => (
                <button
                  key={jaw}
                  onClick={() => assignDropFile(jaw)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:bg-slate-50"
                  style={{ border: "1.5px solid var(--border-subtle)" }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      background:
                        jaw === "maxilla"
                          ? "#f59e0b"
                          : jaw === "mandible"
                          ? "#2563eb"
                          : "#8b5cf6",
                    }}
                  />
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {jaw === "maxilla"
                        ? "Maxilla (Upper)"
                        : jaw === "mandible"
                        ? "Mandible (Lower)"
                        : "Combined (Both)"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowJawPicker(false)}
              className="text-xs text-center py-1"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Notification toast ─────────────────────────────────────────────── */}
      {notification && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: "rgba(15,23,42,0.88)",
            color: "#fff",
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            zIndex: 60,
          }}
        >
          {notification}
        </div>
      )}
    </div>
  );
}
