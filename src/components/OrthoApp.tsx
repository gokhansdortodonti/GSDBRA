"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ChevronRight,
  ChevronDown,
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
import SegmentationPanel from "./SegmentationPanel";
import ToothExportPanel from "./ToothExportPanel";
import type { ThreeViewerHandle, OcclusalPlaneData, ViewPreset, SegmentationResult } from "./ThreeViewer";

// Dynamic import — Three.js is client-side only
const ThreeViewer = dynamic(() => import("./ThreeViewer"), { ssr: false });

// ─── Arc shape options ────────────────────────────────────────────────────────
const ARC_SHAPES = [
  { value: "auto", label: "Auto selection" },
  { value: "tapered", label: "Tapered (Daralan)" },
  { value: "ovoid", label: "Ovoid (Oval)" },
  { value: "square", label: "Square (Kare)" },
  { value: "round", label: "Round (Yuvarlak)" },
];

// ─── Tooth SVG icon ───────────────────────────────────────────────────────────
function ToothIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
      <path
        d="M9 1C6.5 1 4 3 4 5.5C4 7 4.5 8.5 5 10L6.5 20.5C6.7 21.3 7.2 21.5 7.8 21.5C8.4 21.5 8.8 21.1 9 20.5C9.2 21.1 9.6 21.5 10.2 21.5C10.8 21.5 11.3 21.3 11.5 20.5L13 10C13.5 8.5 14 7 14 5.5C14 3 11.5 1 9 1Z"
        fill={color}
        fillOpacity="0.75"
      />
      <path
        d="M5.5 5C5.5 3.5 7 2.5 9 2.5C11 2.5 12.5 3.5 12.5 5"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.5"
        fill="none"
      />
    </svg>
  );
}

// ─── Workflow stages ──────────────────────────────────────────────────────────
type Stage = "load" | "align" | "segment" | "plan";

const STAGES: { id: Stage; label: string }[] = [
  { id: "load", label: "Load Scan" },
  { id: "align", label: "Occlusal Alignment" },
  { id: "segment", label: "Segmentation" },
  { id: "plan", label: "Bracket Planning" },
];

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function OrthoApp() {
  const [stage, setStage] = useState<Stage>("load");
  const [maxillaFile, setMaxillaFile] = useState<ScanFile | null>(null);
  const [mandibleFile, setMandibleFile] = useState<ScanFile | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [viewMode, setViewMode] = useState<ViewPreset>("perspective");
  const [orthographic, setOrthographic] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Occlusal plane state
  const [occlusalPlane, setOcclusalPlane] = useState<OcclusalPlaneData | null>(null);
  const [alignmentApplied, setAlignmentApplied] = useState(false);
  const [alignmentSaved, setAlignmentSaved] = useState(false);
  const [autoComputeStatus, setAutoComputeStatus] = useState<"idle" | "computing" | "done" | "error">("idle");

  const viewerRef = useRef<ThreeViewerHandle>(null);

  // Model visibility / opacity / color
  const [maxillaVisible, setMaxillaVisible] = useState(true);
  const [mandibleVisible, setMandibleVisible] = useState(true);
  const [maxillaOpacity, setMaxillaOpacity] = useState(1);
  const [mandibleOpacity, setMandibleOpacity] = useState(1);
  const [maxillaColor, setMaxillaColor] = useState("#fff3e0");
  const [mandibleColor, setMandibleColor] = useState("#e3f2fd");

  // Scene lighting
  const [sceneBrightness, setSceneBrightness] = useState(1);

  // Segmentation results (per jaw)
  const [segResults, setSegResults] = useState<
    Partial<Record<"maxilla" | "mandible", SegmentationResult>>
  >({});

  const [segmentedCounts, setSegmentedCounts] = useState<
    Partial<Record<"maxilla" | "mandible", number>>
  >({});

  // Bracket planning state
  const [selectedJaw, setSelectedJaw] = useState<"maxilla" | "mandible" | "both">("maxilla");
  const [startingJaw, setStartingJaw] = useState<"maxilla" | "mandible">("maxilla");
  const [sameArcShape, setSameArcShape] = useState(false);
  const [maxillaArcShape, setMaxillaArcShape] = useState("auto");
  const [mandibleArcShape, setMandibleArcShape] = useState("auto");
  const toothCount = (segmentedCounts.maxilla ?? 0) + (segmentedCounts.mandible ?? 0);

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
      setSegResults((prev) => ({ ...prev, maxilla: undefined }));
      setSegmentedCounts((prev) => ({ ...prev, maxilla: 0 }));
    } else {
      setMandibleFile(scan);
      setSegResults((prev) => ({ ...prev, mandible: undefined }));
      setSegmentedCounts((prev) => ({ ...prev, mandible: 0 }));
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
    setSegResults((prev) => ({ ...prev, [jaw]: undefined }));
    setSegmentedCounts((prev) => ({ ...prev, [jaw]: 0 }));
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
  const handleAutoCompute = useCallback(() => {
    setAutoComputeStatus("computing");
    // Use requestAnimationFrame to allow UI to show spinner before heavy computation
    requestAnimationFrame(() => {
      try {
        // Use ICP-enhanced plane detection for higher accuracy
        const result = viewerRef.current?.computeAutoOcclusalPlaneWithICP();
        if (!result) {
          setAutoComputeStatus("error");
          notify("Overlap noktası bulunamadı", 5000);
          return;
        }
        const planeData: OcclusalPlaneData = {
          normal: result.normal,
          center: result.center,
        };
        setOcclusalPlane(planeData);
        setAutoComputeStatus("done");

        // Immediately apply alignment
        viewerRef.current?.applyOcclusalAlignment(planeData);
        setAlignmentApplied(true);
        setAlignmentSaved(false);

        // Switch to top view
        setTimeout(() => {
          viewerRef.current?.setView("top");
          setViewMode("top");
        }, 50);

        // Include ICP convergence info in notification
        const icpInfo = result.icp
          ? ` — ICP: ${result.icp.iterations} iterasyon, RMS ${result.icp.rmsError.toFixed(3)} mm${result.icp.converged ? " ✓" : ""}`
          : "";
        notify(`Oklüzal düzlem hesaplandı ve hizalandı${icpInfo}`, 6000);
      } catch {
        setAutoComputeStatus("error");
        notify("Hesaplama hatası", 5000);
      }
    });
  }, [notify]);

  const handleResetAlignment = useCallback(() => {
    viewerRef.current?.resetAlignment();
    viewerRef.current?.clearLandmarks();
    setOcclusalPlane(null);
    setAlignmentApplied(false);
    setAlignmentSaved(false);
    setAutoComputeStatus("idle");
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

  const handleSetGizmoAxis = useCallback(
    (axis: "all" | "x" | "y" | "z") => {
      viewerRef.current?.setGizmoAxis(axis);
    },
    []
  );

  const handleSaveAlignmentMatrix = useCallback(() => {
    viewerRef.current?.saveAlignmentMatrix();
    setAlignmentSaved(true);
    notify("Final position saved");
  }, [notify]);

  const handleFlipNormal = useCallback(() => {
    viewerRef.current?.flipAlignmentNormal();
  }, []);

  const handleFlipX = useCallback(() => {
    viewerRef.current?.flipAlignmentX();
  }, []);

  const handleFlipFrontBack = useCallback(() => {
    viewerRef.current?.flipFrontBack();
  }, []);

  // Export handlers
  const handleExportJSON = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.downloadTeethJSON("teeth_segmentation.json");
    }
  }, []);

  const handleToggleLCS = useCallback((visible: boolean) => {
    if (viewerRef.current) {
      viewerRef.current.setLCSVisible(visible);
    }
  }, []);

  const handleResetView = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.resetCamera();
    }
  }, []);

  const transitionToStage = useCallback((nextStage: Stage) => {
    if (nextStage === "align") {
      setMaxillaVisible(true);
      setMandibleVisible(true);
      setViewMode("perspective");
    } else if (nextStage === "segment") {
      setMandibleVisible(true);
      setViewMode("perspective");
    }

    setStage(nextStage);
  }, []);

  // Stage transition side-effects
  useEffect(() => {
    if (stage === "align") {
      // Both jaws visible for auto overlap detection
      viewerRef.current?.setMeshVisible("maxilla", true);
      viewerRef.current?.setMeshVisible("mandible", true);
      const t = setTimeout(() => {
        viewerRef.current?.setView("perspective");
      }, 150);
      return () => clearTimeout(t);
    }
    if (stage === "segment") {
      viewerRef.current?.setMeshVisible("maxilla", true);
      viewerRef.current?.setMeshVisible("mandible", true);
      // Reset opacities to full when entering segment stage
      viewerRef.current?.setMeshOpacity("maxilla", 1);
      viewerRef.current?.setMeshOpacity("mandible", 1);
      setMaxillaOpacity(1);
      setMandibleOpacity(1);

      // Auto-compute occlusal alignment if not done yet and both jaws present
      if (!alignmentApplied && maxillaFile && mandibleFile) {
        setTimeout(() => {
          try {
            const result = viewerRef.current?.computeAutoOcclusalPlane();
            if (result) {
              const planeData: OcclusalPlaneData = {
                normal: result.normal,
                center: result.center,
              };
              setOcclusalPlane(planeData);
              setAutoComputeStatus("done");
              viewerRef.current?.applyOcclusalAlignment(planeData);
              setAlignmentApplied(true);
            }
          } catch { /* silently fail — user can still segment without alignment */ }
        }, 200);
      }

      const t = setTimeout(() => {
        viewerRef.current?.setView("perspective");
        viewerRef.current?.detachGizmo();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [stage]);

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
              onProceed={() => transitionToStage("align")}
            />
          )}

          {stage === "align" && (
            <OcclusalAlignment
              maxillaFile={maxillaFile}
              mandibleFile={mandibleFile}
              onAlignmentComplete={() => {
                notify("Alignment complete!");
                transitionToStage("segment");
              }}
              onBack={() => transitionToStage("load")}
              onAutoCompute={handleAutoCompute}
              autoComputeStatus={autoComputeStatus}
              onSetGizmoMode={handleSetGizmoMode}
              onSetGizmoAxis={handleSetGizmoAxis}
              onSetOrthographic={handleSetOrthographic}
              onSetView={handleSetView}
              onSaveAlignmentMatrix={handleSaveAlignmentMatrix}
              onFlipNormal={handleFlipNormal}
              onFlipX={handleFlipX}
              onFlipFrontBack={handleFlipFrontBack}
              onResetAlignment={handleResetAlignment}
              alignmentApplied={alignmentApplied}
              occlusalPlane={occlusalPlane}
            />
          )}


          {stage === "segment" && (
            <SegmentationPanel
              maxillaFile={maxillaFile}
              mandibleFile={mandibleFile}
              onFileLoaded={handleFileLoaded}
              onBack={() => {
                viewerRef.current?.clearSegmentation();
                setSegResults({});
                setSegmentedCounts({});
                transitionToStage("align");
              }}
              onProceed={() => transitionToStage("plan")}
              onSegmentResult={(jaw, result) => {
                setSegResults((prev) => ({ ...prev, [jaw]: result }));
                const segmentedToothCount =
                  viewerRef.current?.applySegmentation(result, jaw) ?? 0;
                setSegmentedCounts((prev) => ({ ...prev, [jaw]: segmentedToothCount }));

                // Auto-dim the OTHER jaw to reduce visual clutter in occlusion
                const otherJaw = jaw === "maxilla" ? "mandible" : "maxilla";
                viewerRef.current?.setMeshOpacity(otherJaw, 0.15);
                if (jaw === "maxilla") setMandibleOpacity(0.15);
                else setMaxillaOpacity(0.15);

                if (segmentedToothCount > 0) {
                  notify(
                    `${jaw === "maxilla" ? "Maxilla" : "Mandible"} icin ${segmentedToothCount} dis olusturuldu`
                  );
                  // Auto-switch to frontal view after successful segmentation
                  handleSetView("front");
                } else {
                  notify(
                    `${jaw === "maxilla" ? "Maxilla" : "Mandible"} segmentasyonu gorsel dis parcasi uretemedi`,
                    5000
                  );
                }
              }}
            />
          )}

          {stage === "segment" && toothCount > 0 && (
            <ToothExportPanel
              toothCount={toothCount}
              onExportJSON={handleExportJSON}
              onToggleLCS={handleToggleLCS}
              onResetView={handleResetView}
            />
          )}

          {stage === "plan" && (
            <div className="flex flex-col h-full">
              {/* Panel header */}
              <div
                className="px-5 pt-5 pb-4 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  Bracket Placement
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Çeneleri seç
                </div>
              </div>

              <div className="p-5 flex flex-col gap-5 overflow-y-auto flex-1">
                {/* ── Jaw selection ────────────────────────── */}
                <div className="flex flex-col gap-3">
                  <div
                    className="text-xs font-semibold tracking-wide"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    BRAKETLERİ ŞURAYA YERLEŞTİR
                  </div>
                  <div className="flex flex-col gap-2">
                    {([
                      { value: "maxilla", label: "Üst çene" },
                      { value: "mandible", label: "Alt çene" },
                      { value: "both", label: "Her iki çene" },
                    ] as const).map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2.5 cursor-pointer"
                        onClick={() => setSelectedJaw(opt.value)}
                      >
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            borderColor: selectedJaw === opt.value ? "#2563eb" : "var(--border-subtle)",
                          }}
                        >
                          {selectedJaw === opt.value && (
                            <div className="w-2 h-2 rounded-full" style={{ background: "#2563eb" }} />
                          )}
                        </div>
                        <span
                          className="text-xs"
                          style={{
                            color: selectedJaw === opt.value ? "var(--text-primary)" : "var(--text-secondary)",
                            fontWeight: selectedJaw === opt.value ? 500 : 400,
                          }}
                        >
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* Sub-options when "both" is selected */}
                  {selectedJaw === "both" && (
                    <div
                      className="ml-6 flex flex-col gap-1.5 pl-3"
                      style={{ borderLeft: "2px solid var(--border-subtle)" }}
                    >
                      {([
                        { value: "maxilla", label: "Üst çene ile başla" },
                        { value: "mandible", label: "Alt çene ile başla" },
                      ] as const).map((opt) => (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2 cursor-pointer"
                          onClick={() => setStartingJaw(opt.value)}
                        >
                          <div
                            className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              borderColor: startingJaw === opt.value ? "#7c3aed" : "var(--border-subtle)",
                            }}
                          >
                            {startingJaw === opt.value && (
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#7c3aed" }} />
                            )}
                          </div>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Arc shape ────────────────────────────── */}
                <div className="flex flex-col gap-3">
                  <div
                    className="text-xs font-semibold tracking-wide"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ARC SHAPE
                  </div>

                  {/* Maxilla arc shape */}
                  {(selectedJaw === "maxilla" || selectedJaw === "both") && (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Arch shape for Maxilla
                      </div>
                      <div className="relative">
                        <select
                          value={maxillaArcShape}
                          onChange={(e) => {
                            setMaxillaArcShape(e.target.value);
                            if (sameArcShape) setMandibleArcShape(e.target.value);
                          }}
                          className="w-full appearance-none px-3 py-2 rounded-lg text-xs pr-8 outline-none"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {ARC_SHAPES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Same arch shape checkbox — only shown when "both" */}
                  {selectedJaw === "both" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                        style={{
                          background: sameArcShape ? "#2563eb" : "transparent",
                          border: `1.5px solid ${sameArcShape ? "#2563eb" : "var(--border-subtle)"}`,
                        }}
                        onClick={() => {
                          const next = !sameArcShape;
                          setSameArcShape(next);
                          if (next) setMandibleArcShape(maxillaArcShape);
                        }}
                      >
                        {sameArcShape && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6 8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Same arch shape for Antagonist
                      </span>
                    </label>
                  )}

                  {/* Mandible arc shape */}
                  {(selectedJaw === "mandible" || selectedJaw === "both") && (
                    <div className="flex flex-col gap-1.5">
                      <div
                        className="text-xs"
                        style={{ color: sameArcShape ? "var(--text-muted)" : "var(--text-muted)", opacity: sameArcShape ? 0.5 : 1 }}
                      >
                        Arch shape for Mandible
                      </div>
                      <div className="relative" style={{ opacity: sameArcShape ? 0.5 : 1 }}>
                        <select
                          value={sameArcShape ? maxillaArcShape : mandibleArcShape}
                          onChange={(e) => setMandibleArcShape(e.target.value)}
                          disabled={sameArcShape}
                          className="w-full appearance-none px-3 py-2 rounded-lg text-xs pr-8 outline-none"
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {ARC_SHAPES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Back button ──────────────────────────── */}
                <button
                  onClick={() => transitionToStage("segment")}
                  className="text-xs py-2 rounded-lg transition-colors"
                  style={{
                    color: "var(--text-muted)",
                    border: "1px solid var(--border-subtle)",
                    marginTop: "auto",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  ← Segmentasyona Geri Dön
                </button>
              </div>
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
            onLandmarkPicked={() => { }}
            onLandmarkUndone={(newCount) => {
              if (newCount < 3) setOcclusalPlane(null);
            }}
            onSetView={(view) => setViewMode(view)}
            onPickError={(msg) => notify(msg, 5000)}
            onOcclusalPlaneDefined={(plane) => {
              setOcclusalPlane(plane);
            }}
          />

          {/* View mode buttons — floating bottom-left */}
          <div
            className="absolute bottom-4 left-4 flex gap-1"
            style={{ zIndex: 10 }}
          >
            {([
              { mode: "perspective" as const, label: "3D" },
              { mode: "front" as const, label: "Frontal" },
              { mode: "top" as const, label: "Oklüzal" },
              { mode: "sideLeft" as const, label: "Sol Lateral" },
              { mode: "sideRight" as const, label: "Sağ Lateral" },
              { mode: "bottom" as const, label: "Apikal" },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => handleSetView(mode)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: viewMode === mode ? "#2563eb" : "rgba(255,255,255,0.88)",
                  color: viewMode === mode ? "#fff" : "var(--text-muted)",
                  border: `1px solid ${viewMode === mode ? "#2563eb" : "var(--border-subtle)"}`,
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                }}
              >
                {label}
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

          {/* Scan legend — floating bottom-right — hidden; moved to right panel */}
          {false && (maxillaFile || mandibleFile) && (
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
                    {maxillaFile?.jaw === "combined" ? "Combined" : "Maxilla"}

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

        {/* ── Right panel — Model visibility ─────────────────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col overflow-y-auto"
          style={{
            width: "208px",
            background: "var(--bg-panel)",
            borderLeft: "1px solid var(--border-subtle)",
            boxShadow: "-2px 0 8px rgba(0,0,0,0.04)",
          }}
        >
          <div className="px-4 pt-4 pb-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>
              MODELLER
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4 flex-1">
            {/* Maxilla */}
            {maxillaFile ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #fff3e0, #ffe0b2)",
                      border: "1.5px solid rgba(245,158,11,0.3)",
                    }}
                  >
                    <ToothIcon color="#f59e0b" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Maxilla</div>
                      {/* Color picker */}
                      <label className="cursor-pointer flex-shrink-0" title="Renk seç">
                        <div
                          className="w-4 h-4 rounded border"
                          style={{ background: maxillaColor, borderColor: "rgba(0,0,0,0.18)" }}
                        />
                        <input
                          type="color"
                          value={maxillaColor}
                          onChange={(e) => {
                            setMaxillaColor(e.target.value);
                            viewerRef.current?.setMeshColor("maxilla", e.target.value);
                          }}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>Üst çene</div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !maxillaVisible;
                      setMaxillaVisible(next);
                      viewerRef.current?.setMeshVisible("maxilla", next);
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                    style={{
                      color: maxillaVisible ? "#f59e0b" : "var(--text-muted)",
                      background: maxillaVisible ? "rgba(245,158,11,0.1)" : "transparent",
                      border: "1px solid " + (maxillaVisible ? "rgba(245,158,11,0.3)" : "var(--border-subtle)"),
                    }}
                    title={maxillaVisible ? "Gizle" : "Göster"}
                  >
                    {maxillaVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
                {/* Opacity slider */}
                <div
                  className="flex items-center gap-2 px-1"
                  style={{ opacity: maxillaVisible ? 1 : 0.35, transition: "opacity 0.2s" }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "#f59e0b", opacity: maxillaOpacity }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(maxillaOpacity * 100)}
                    disabled={!maxillaVisible}
                    onChange={(e) => {
                      const o = Number(e.target.value) / 100;
                      setMaxillaOpacity(o);
                      viewerRef.current?.setMeshOpacity("maxilla", o);
                    }}
                    className="flex-1 h-1 cursor-pointer"
                    style={{ accentColor: "#f59e0b" }}
                  />
                  <span className="text-xs w-7 text-right flex-shrink-0" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                    {Math.round(maxillaOpacity * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-1.5 py-3 rounded-lg"
                style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border-subtle)" }}
              >
                <ToothIcon color="#94a3b8" />
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Maxilla yok</div>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: "1px", background: "var(--border-subtle)" }} />

            {/* Mandible */}
            {mandibleFile ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #e3f2fd, #bbdefb)",
                      border: "1.5px solid rgba(37,99,235,0.25)",
                    }}
                  >
                    <ToothIcon color="#2563eb" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Mandible</div>
                      {/* Color picker */}
                      <label className="cursor-pointer flex-shrink-0" title="Renk seç">
                        <div
                          className="w-4 h-4 rounded border"
                          style={{ background: mandibleColor, borderColor: "rgba(0,0,0,0.18)" }}
                        />
                        <input
                          type="color"
                          value={mandibleColor}
                          onChange={(e) => {
                            setMandibleColor(e.target.value);
                            viewerRef.current?.setMeshColor("mandible", e.target.value);
                          }}
                          className="sr-only"
                        />
                      </label>
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>Alt çene</div>
                  </div>
                  <button
                    onClick={() => {
                      const next = !mandibleVisible;
                      setMandibleVisible(next);
                      viewerRef.current?.setMeshVisible("mandible", next);
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
                    style={{
                      color: mandibleVisible ? "#2563eb" : "var(--text-muted)",
                      background: mandibleVisible ? "rgba(37,99,235,0.08)" : "transparent",
                      border: "1px solid " + (mandibleVisible ? "rgba(37,99,235,0.25)" : "var(--border-subtle)"),
                    }}
                    title={mandibleVisible ? "Gizle" : "Göster"}
                  >
                    {mandibleVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
                <div
                  className="flex items-center gap-2 px-1"
                  style={{ opacity: mandibleVisible ? 1 : 0.35, transition: "opacity 0.2s" }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: "#2563eb", opacity: mandibleOpacity }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(mandibleOpacity * 100)}
                    disabled={!mandibleVisible}
                    onChange={(e) => {
                      const o = Number(e.target.value) / 100;
                      setMandibleOpacity(o);
                      viewerRef.current?.setMeshOpacity("mandible", o);
                    }}
                    className="flex-1 h-1 cursor-pointer"
                    style={{ accentColor: "#2563eb" }}
                  />
                  <span className="text-xs w-7 text-right flex-shrink-0" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                    {Math.round(mandibleOpacity * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-1.5 py-3 rounded-lg"
                style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border-subtle)" }}
              >
                <ToothIcon color="#94a3b8" />
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Mandible yok</div>
              </div>
            )}

            {/* Lighting controls */}
            <div
              className="flex flex-col gap-2 pt-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--text-secondary)" }}>
                IŞIK AYARLARI
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>☀</span>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={Math.round(sceneBrightness * 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    setSceneBrightness(v);
                    viewerRef.current?.setSceneBrightness(v);
                  }}
                  className="flex-1 h-1 cursor-pointer"
                  style={{ accentColor: "#f59e0b" }}
                />
                <span className="text-xs w-7 text-right flex-shrink-0" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                  {Math.round(sceneBrightness * 100)}%
                </span>
              </div>
            </div>

            {/* Mouse controls hint */}
            <div
              className="mt-auto pt-3 flex flex-col gap-1"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="text-xs font-semibold tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>
                KONTROLLER
              </div>
              {[
                { icon: "◎", label: "Sol tık — Döndür" },
                { icon: "⊕", label: "Tekerlek — Zoom" },
                { icon: "⊗", label: "Orta tuş — Kaydır" },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="text-xs w-4 text-center flex-shrink-0" style={{ color: "var(--text-muted)" }}>{c.icon}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)", fontSize: "10px" }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
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
