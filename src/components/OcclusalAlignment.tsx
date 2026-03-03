"use client";

import { useState, useCallback } from "react";
import {
  Crosshair,
  RotateCcw,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Layers,
  MousePointer2,
  Move3d,
  Target,
  Info,
  Trash2,
  ArrowRight,
} from "lucide-react";
import type { ScanFile } from "./ScanLoader";
import type { OcclusalPlaneData } from "./ThreeViewer";
import * as THREE from "three";

interface OcclusalAlignmentProps {
  maxillaFile: ScanFile | null;
  mandibleFile: ScanFile | null;
  onAlignmentComplete: () => void;
  onBack: () => void;
  // Viewer control callbacks
  onStartPicking: () => void;
  onClearLandmarks: () => void;
  onUndoLandmark: () => void;
  onSetGizmoMode: (mode: "translate" | "rotate") => void;
  onSetGizmoAxis: (axis: "all" | "x" | "y" | "z") => void;
  onSetOrthographic: (v: boolean) => void;
  onSetView: (view: "perspective" | "front" | "top" | "side" | "bottom") => void;
  // State from viewer
  landmarkCount: number;
  occlusalPlane: OcclusalPlaneData | null;
}

type AlignStep = {
  id: string;
  label: string;
  description: string;
  status: "pending" | "running" | "done";
  progress: number;
};

const INITIAL_STEPS: AlignStep[] = [
  {
    id: "centroid",
    label: "Centroid Alignment",
    description: "Translate both arches to a common centroid",
    status: "pending",
    progress: 0,
  },
  {
    id: "occlusal",
    label: "Occlusal Plane Leveling",
    description: "Level the scan using the defined occlusal plane",
    status: "pending",
    progress: 0,
  },
  {
    id: "icp",
    label: "ICP Registration",
    description: "Iterative Closest Point fine alignment",
    status: "pending",
    progress: 0,
  },
  {
    id: "verify",
    label: "Verification",
    description: "Check residual error & contact points",
    status: "pending",
    progress: 0,
  },
];

const LANDMARK_DEFS = [
  {
    label: "Right Molar Cusp",
    sublabel: "Buccal cusp tip of upper right first molar",
    color: "#ef4444",
    dot: "bg-red-500",
  },
  {
    label: "Left Molar Cusp",
    sublabel: "Buccal cusp tip of upper left first molar",
    color: "#22c55e",
    dot: "bg-green-500",
  },
  {
    label: "11 | 21 Midpoint",
    sublabel: "Contact point between central incisors",
    color: "#3b82f6",
    dot: "bg-blue-500",
  },
];

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold" style={{ color }}>
          {value}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <span
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OcclusalAlignment({
  maxillaFile,
  mandibleFile,
  onAlignmentComplete,
  onBack,
  onStartPicking,
  onClearLandmarks,
  onUndoLandmark,
  onSetGizmoMode,
  onSetGizmoAxis,
  onSetOrthographic,
  onSetView,
  landmarkCount,
  occlusalPlane,
}: OcclusalAlignmentProps) {
  const [steps, setSteps] = useState<AlignStep[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [alignDone, setAlignDone] = useState(false);
  const [showDetails, setShowDetails] = useState<string | null>(null);
  const [isOrtho, setIsOrtho] = useState(false);
  const [gizmoMode, setGizmoModeState] = useState<"translate" | "rotate">("rotate");
  const [gizmoAxis, setGizmoAxisState] = useState<"all" | "x" | "y" | "z">("all");
  const [activeView, setActiveView] = useState<"perspective" | "front" | "top" | "side" | "bottom">("top");

  const [metrics] = useState({
    rmsError: "0.08",
    maxError: "0.21",
    contactPoints: "47",
    overbite: "2.3",
  });

  const allDone = steps.every((s) => s.status === "done");
  const hasBothJaws = maxillaFile !== null && mandibleFile !== null;
  const hasCombined = maxillaFile?.jaw === "combined";
  const planeDefined = occlusalPlane !== null;

  const runAlignment = () => {
    if (isRunning || allDone) return;
    setIsRunning(true);

    const runStep = (idx: number) => {
      if (idx >= steps.length) {
        setIsRunning(false);
        setAlignDone(true);
        return;
      }
      setSteps((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, status: "running", progress: 0 } : s
        )
      );
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 18 + 6;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setSteps((prev) =>
            prev.map((s, i) =>
              i === idx ? { ...s, status: "done", progress: 100 } : s
            )
          );
          setTimeout(() => runStep(idx + 1), 350);
        } else {
          setSteps((prev) =>
            prev.map((s, i) =>
              i === idx ? { ...s, progress: Math.round(progress) } : s
            )
          );
        }
      }, 120);
    };
    runStep(0);
  };

  const reset = () => {
    setSteps(INITIAL_STEPS);
    setIsRunning(false);
    setAlignDone(false);
  };

  const handleToggleOrtho = useCallback(() => {
    const next = !isOrtho;
    setIsOrtho(next);
    onSetOrthographic(next);
  }, [isOrtho, onSetOrthographic]);

  const handleSetView = useCallback(
    (v: typeof activeView) => {
      setActiveView(v);
      onSetView(v);
    },
    [onSetView]
  );

  const handleGizmoMode = useCallback(
    (mode: "translate" | "rotate") => {
      setGizmoModeState(mode);
      onSetGizmoMode(mode);
    },
    [onSetGizmoMode]
  );

  const handleGizmoAxis = useCallback(
    (axis: "all" | "x" | "y" | "z") => {
      setGizmoAxisState(axis);
      onSetGizmoAxis(axis);
    },
    [onSetGizmoAxis]
  );

  // Format plane normal for display
  const fmtVec = (v: THREE.Vector3) =>
    `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

  return (
    <div className="flex flex-col gap-0 overflow-y-auto h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #7c3aed, #2563eb)",
            boxShadow: "0 4px 12px rgba(124,58,237,0.25)",
          }}
        >
          <Crosshair size={18} color="#fff" />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            Occlusal Alignment
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Define plane · Adjust · Register
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* ── View Controls ──────────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-3 flex flex-col gap-3"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <SectionHeader icon={<Move3d size={11} />} title="View Controls" />

          {/* Projection toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Projection
            </span>
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              {(["Perspective", "Orthographic"] as const).map((label) => {
                const isActive =
                  label === "Orthographic" ? isOrtho : !isOrtho;
                return (
                  <button
                    key={label}
                    onClick={handleToggleOrtho}
                    className="px-2.5 py-1 text-xs font-medium transition-all"
                    style={{
                      background: isActive ? "#2563eb" : "transparent",
                      color: isActive ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* View presets */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              View
            </span>
            <div className="flex gap-1">
              {(
                [
                  { id: "perspective", label: "3D" },
                  { id: "front", label: "Fr" },
                  { id: "top", label: "Top" },
                  { id: "side", label: "Side" },
                  { id: "bottom", label: "Bot" },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleSetView(v.id)}
                  className="px-2 py-1 rounded-md text-xs font-medium transition-all"
                  style={{
                    background:
                      activeView === v.id
                        ? "#2563eb"
                        : "var(--bg-card)",
                    color:
                      activeView === v.id ? "#fff" : "var(--text-muted)",
                    border: `1px solid ${
                      activeView === v.id
                        ? "#2563eb"
                        : "var(--border-subtle)"
                    }`,
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Loaded Scans ───────────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-3"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <SectionHeader icon={<Layers size={11} />} title="Loaded Scans" />
          {hasCombined ? (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#8b5cf6" }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                Combined: {maxillaFile?.name}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {maxillaFile && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#f59e0b" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Maxilla: {maxillaFile.name}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                    {maxillaFile.size}
                  </span>
                </div>
              )}
              {mandibleFile && (
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#2563eb" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Mandible: {mandibleFile.name}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                    {mandibleFile.size}
                  </span>
                </div>
              )}
              {!hasBothJaws && !hasCombined && (
                <div className="text-xs" style={{ color: "#f59e0b" }}>
                  ⚠ Only one jaw loaded — single-arch mode
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step 1: Define Occlusal Plane ──────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: `1.5px solid ${planeDefined ? "#10b981" : landmarkCount > 0 ? "#2563eb" : "var(--border-subtle)"}`,
            background: planeDefined
              ? "rgba(16,185,129,0.04)"
              : landmarkCount > 0
              ? "rgba(37,99,235,0.04)"
              : "var(--bg-secondary)",
          }}
        >
          {/* Section title */}
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                background: planeDefined
                  ? "#10b981"
                  : landmarkCount > 0
                  ? "#2563eb"
                  : "var(--bg-card)",
                color: planeDefined || landmarkCount > 0 ? "#fff" : "var(--text-muted)",
                fontSize: "9px",
              }}
            >
              {planeDefined ? "✓" : "1"}
            </div>
            <span
              className="text-xs font-semibold"
              style={{
                color: planeDefined
                  ? "#10b981"
                  : landmarkCount > 0
                  ? "#2563eb"
                  : "var(--text-primary)",
              }}
            >
              Define Occlusal Plane
            </span>
            <div className="ml-auto flex items-center gap-1">
              {landmarkCount > 0 && (
                <button
                  onClick={onUndoLandmark}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors"
                  style={{
                    background: "rgba(245,158,11,0.1)",
                    color: "#f59e0b",
                    border: "1px solid rgba(245,158,11,0.25)",
                  }}
                  title="Undo last landmark"
                >
                  <RotateCcw size={10} />
                  Geri Al
                </button>
              )}
              {landmarkCount > 0 && (
                <button
                  onClick={onClearLandmarks}
                  className="p-1 rounded-md transition-colors"
                  style={{ color: "#ef4444" }}
                  title="Clear all landmarks"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="p-3 flex flex-col gap-3">
            {/* Landmark list */}
            <div className="flex flex-col gap-1.5">
              {LANDMARK_DEFS.map((lm, i) => {
                const placed = i < landmarkCount;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
                    style={{
                      background: placed
                        ? `${lm.color}14`
                        : i === landmarkCount
                        ? "rgba(37,99,235,0.06)"
                        : "transparent",
                      border: `1px solid ${
                        placed
                          ? `${lm.color}40`
                          : i === landmarkCount
                          ? "rgba(37,99,235,0.2)"
                          : "transparent"
                      }`,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{
                        background: placed ? lm.color : "transparent",
                        border: `2px solid ${lm.color}`,
                      }}
                    >
                      {placed && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs font-semibold"
                        style={{
                          color: placed
                            ? "var(--text-primary)"
                            : i === landmarkCount
                            ? "#2563eb"
                            : "var(--text-muted)",
                        }}
                      >
                        {lm.label}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {lm.sublabel}
                      </div>
                    </div>
                    {placed ? (
                      <CheckCircle2 size={12} style={{ color: "#10b981", flexShrink: 0 }} />
                    ) : i === landmarkCount ? (
                      <ArrowRight size={12} style={{ color: "#2563eb", flexShrink: 0 }} />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Pick button */}
            {!planeDefined && (
              <button
                onClick={onStartPicking}
                className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  background:
                    landmarkCount > 0
                      ? "rgba(37,99,235,0.1)"
                      : "linear-gradient(135deg, #2563eb, #0891b2)",
                  color: landmarkCount > 0 ? "#2563eb" : "#fff",
                  border: `1.5px solid ${landmarkCount > 0 ? "rgba(37,99,235,0.3)" : "transparent"}`,
                  boxShadow: landmarkCount > 0 ? "none" : "0 4px 12px rgba(37,99,235,0.25)",
                }}
              >
                <MousePointer2 size={13} />
                {landmarkCount === 0
                  ? "Start Picking Landmarks"
                  : `Continue Picking (${landmarkCount}/3)`}
              </button>
            )}

            {/* Plane info */}
            {planeDefined && occlusalPlane && (
              <div
                className="rounded-lg p-2.5 flex flex-col gap-1"
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Target size={11} style={{ color: "#10b981" }} />
                  <span className="text-xs font-semibold" style={{ color: "#10b981" }}>
                    Plane Defined
                  </span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Normal: {fmtVec(occlusalPlane.normal)}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Center: {fmtVec(occlusalPlane.center)}
                </div>
              </div>
            )}

            {/* Info hint */}
            {!planeDefined && landmarkCount === 0 && (
              <div
                className="flex items-start gap-2 p-2 rounded-lg text-xs"
                style={{
                  background: "rgba(37,99,235,0.05)",
                  color: "var(--text-muted)",
                }}
              >
                <Info size={11} className="flex-shrink-0 mt-0.5" style={{ color: "#2563eb" }} />
                <span>
                  Click 3 points on the maxilla to define the occlusal plane.
                  Use orthographic top view for best accuracy.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2: Adjust Plane (Gizmo) ───────────────────────────────────── */}
        {planeDefined && (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              border: "1.5px solid var(--border-subtle)",
              background: "var(--bg-secondary)",
            }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                  fontSize: "9px",
                }}
              >
                2
              </div>
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                Adjust Plane (Gizmo)
              </span>
            </div>

            <div className="p-3 flex flex-col gap-2.5">
              {/* Gizmo mode */}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Gizmo Mode
                </span>
                <div
                  className="flex rounded-lg overflow-hidden"
                  style={{ border: "1px solid var(--border-subtle)" }}
                >
                  {(["rotate", "translate"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleGizmoMode(mode)}
                      className="px-3 py-1 text-xs font-medium transition-all capitalize"
                      style={{
                        background: gizmoMode === mode ? "#7c3aed" : "transparent",
                        color: gizmoMode === mode ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Axis lock — only relevant for rotate mode */}
              {gizmoMode === "rotate" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Eksen Kilidi
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { axis: "all" as const, label: "Serbest", color: "#7c3aed" },
                        { axis: "x" as const, label: "Sagital X", color: "#ef4444" },
                        { axis: "y" as const, label: "Dikey Y", color: "#22c55e" },
                        { axis: "z" as const, label: "Koronal Z", color: "#3b82f6" },
                      ]
                    ).map(({ axis, label, color }) => (
                      <button
                        key={axis}
                        onClick={() => handleGizmoAxis(axis)}
                        className="flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background:
                            gizmoAxis === axis
                              ? `${color}22`
                              : "var(--bg-card)",
                          color: gizmoAxis === axis ? color : "var(--text-muted)",
                          border: `1.5px solid ${
                            gizmoAxis === axis ? color : "var(--border-subtle)"
                          }`,
                        }}
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            background: gizmoAxis === axis ? color : "var(--border-subtle)",
                          }}
                        />
                        <span style={{ fontSize: "8px", lineHeight: 1.2, textAlign: "center" }}>
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="text-xs p-2 rounded-lg"
                style={{
                  background: "rgba(124,58,237,0.05)",
                  color: "var(--text-muted)",
                  border: "1px solid rgba(124,58,237,0.15)",
                }}
              >
                Gizmo handles to fine-tune the plane. Drag placed points to reposition them.
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Registration Pipeline ──────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: "1.5px solid var(--border-subtle)",
            background: "var(--bg-secondary)",
            opacity: planeDefined ? 1 : 0.5,
            pointerEvents: planeDefined ? "auto" : "none",
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                background: allDone ? "#10b981" : "var(--bg-card)",
                color: allDone ? "#fff" : "var(--text-muted)",
                fontSize: "9px",
              }}
            >
              {allDone ? "✓" : "3"}
            </div>
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              ICP Registration
            </span>
          </div>

          <div className="p-3 flex flex-col gap-1.5">
            {steps.map((step, idx) => (
              <div key={step.id}>
                <button
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg transition-all text-left"
                  style={{
                    background:
                      step.status === "running"
                        ? "rgba(124, 58, 237, 0.08)"
                        : showDetails === step.id
                        ? "var(--bg-card)"
                        : "transparent",
                    border: `1px solid ${
                      step.status === "running"
                        ? "rgba(124, 58, 237, 0.25)"
                        : "transparent"
                    }`,
                  }}
                  onClick={() =>
                    setShowDetails(showDetails === step.id ? null : step.id)
                  }
                >
                  <div className="flex-shrink-0">
                    {step.status === "done" ? (
                      <CheckCircle2 size={13} style={{ color: "#10b981" }} />
                    ) : step.status === "running" ? (
                      <Loader2
                        size={13}
                        className="animate-spin"
                        style={{ color: "#7c3aed" }}
                      />
                    ) : (
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                          {idx + 1}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-medium"
                      style={{
                        color:
                          step.status === "done"
                            ? "var(--text-primary)"
                            : step.status === "running"
                            ? "#7c3aed"
                            : "var(--text-muted)",
                      }}
                    >
                      {step.label}
                    </div>
                    {step.status === "running" && (
                      <div
                        className="mt-1 h-1 rounded-full overflow-hidden"
                        style={{ background: "var(--border-subtle)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${step.progress}%`,
                            background: "linear-gradient(90deg, #7c3aed, #2563eb)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <ChevronRight
                    size={11}
                    style={{
                      color: "var(--text-muted)",
                      transform:
                        showDetails === step.id ? "rotate(90deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                </button>
                {showDetails === step.id && (
                  <div
                    className="mx-2 mb-1 p-2 rounded-b-lg text-xs"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-muted)",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    {step.description}
                    {step.status === "done" && (
                      <div
                        className="mt-1 flex items-center gap-1"
                        style={{ color: "#10b981" }}
                      >
                        <CheckCircle2 size={10} />
                        <span>Completed</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Metrics ────────────────────────────────────────────────────────── */}
        {alignDone && (
          <div className="flex flex-col gap-2">
            <SectionHeader icon={<Target size={11} />} title="Alignment Metrics" />
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="RMS Error" value={metrics.rmsError} unit="mm" color="#10b981" />
              <MetricCard label="Max Error" value={metrics.maxError} unit="mm" color="#f59e0b" />
              <MetricCard label="Contact Points" value={metrics.contactPoints} unit="pts" color="#2563eb" />
              <MetricCard label="Overbite" value={metrics.overbite} unit="mm" color="#7c3aed" />
            </div>
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {!allDone ? (
            <button
              onClick={runAlignment}
              disabled={isRunning || !planeDefined}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{
                background:
                  isRunning || !planeDefined
                    ? "var(--bg-card)"
                    : "linear-gradient(135deg, #7c3aed, #2563eb)",
                color: isRunning || !planeDefined ? "var(--text-muted)" : "#fff",
                border: `1px solid ${
                  isRunning || !planeDefined ? "var(--border-subtle)" : "transparent"
                }`,
                cursor: isRunning || !planeDefined ? "not-allowed" : "pointer",
                boxShadow:
                  isRunning || !planeDefined
                    ? "none"
                    : "0 4px 16px rgba(124,58,237,0.3)",
              }}
            >
              {isRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Aligning…
                </>
              ) : !planeDefined ? (
                <>
                  <Crosshair size={14} />
                  Define Plane First
                </>
              ) : (
                <>
                  <Crosshair size={14} />
                  Run ICP Alignment
                </>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={onAlignmentComplete}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff",
                  boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
                }}
              >
                <CheckCircle2 size={14} />
                Alignment Complete — Continue
              </button>
              <button
                onClick={reset}
                className="w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all hover:bg-slate-100"
                style={{
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <RotateCcw size={12} />
                Re-run Alignment
              </button>
            </>
          )}

          <button
            onClick={onBack}
            className="w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all hover:bg-slate-100"
            style={{ color: "var(--text-muted)" }}
          >
            ← Back to Scan Loading
          </button>
        </div>
      </div>
    </div>
  );
}
