"use client";

import { useState } from "react";
import {
  Crosshair,
  RotateCcw,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Layers,
  Move,
  AlignCenter,
} from "lucide-react";
import type { ScanFile } from "./ScanLoader";

interface OcclusalAlignmentProps {
  maxillaFile: ScanFile | null;
  mandibleFile: ScanFile | null;
  onAlignmentComplete: () => void;
  onBack: () => void;
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
    label: "Occlusal Plane Detection",
    description: "Detect and level the occlusal plane (OCS)",
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

// ─── Alignment metric card ────────────────────────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function OcclusalAlignment({
  maxillaFile,
  mandibleFile,
  onAlignmentComplete,
  onBack,
}: OcclusalAlignmentProps) {
  const [steps, setSteps] = useState<AlignStep[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [alignDone, setAlignDone] = useState(false);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // Simulated alignment metrics (shown after completion)
  const [metrics] = useState({
    rmsError: "0.08",
    maxError: "0.21",
    contactPoints: "47",
    overbite: "2.3",
  });

  const allDone = steps.every((s) => s.status === "done");

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

  const hasBothJaws = maxillaFile !== null && mandibleFile !== null;
  const hasCombined = maxillaFile?.jaw === "combined";

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
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
            Register & superimpose dental arches
          </p>
        </div>
      </div>

      {/* Loaded scans summary */}
      <div
        className="flex flex-col gap-2 p-3 rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Layers size={11} style={{ color: "var(--text-muted)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Loaded Scans
          </span>
        </div>

        {hasCombined ? (
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#8b5cf6" }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              Combined: {maxillaFile?.name}
            </span>
          </div>
        ) : (
          <>
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
                ⚠ Only one jaw loaded — alignment will use single-arch mode
              </div>
            )}
          </>
        )}
      </div>

      {/* Alignment method */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Method
        </span>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "auto", icon: <AlignCenter size={14} />, label: "Auto ICP", desc: "Fully automatic" },
            { id: "manual", icon: <Move size={14} />, label: "Manual", desc: "Pick 3 landmarks" },
          ].map((m) => (
            <button
              key={m.id}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
              style={{
                background: m.id === "auto" ? "rgba(37,99,235,0.08)" : "var(--bg-secondary)",
                border: `1.5px solid ${m.id === "auto" ? "rgba(37,99,235,0.35)" : "var(--border-subtle)"}`,
              }}
            >
              <span style={{ color: m.id === "auto" ? "#2563eb" : "var(--text-muted)" }}>
                {m.icon}
              </span>
              <div>
                <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {m.label}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {m.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-1.5">
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
                  <CheckCircle2 size={14} style={{ color: "#10b981" }} />
                ) : step.status === "running" ? (
                  <Loader2
                    size={14}
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
                size={12}
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

      {/* Metrics (shown after alignment) */}
      {alignDone && (
        <div className="flex flex-col gap-2">
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Alignment Metrics
          </span>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="RMS Error"
              value={metrics.rmsError}
              unit="mm"
              color="#10b981"
            />
            <MetricCard
              label="Max Error"
              value={metrics.maxError}
              unit="mm"
              color="#f59e0b"
            />
            <MetricCard
              label="Contact Points"
              value={metrics.contactPoints}
              unit="pts"
              color="#2563eb"
            />
            <MetricCard
              label="Overbite"
              value={metrics.overbite}
              unit="mm"
              color="#7c3aed"
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {!allDone ? (
          <button
            onClick={runAlignment}
            disabled={isRunning}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background: isRunning
                ? "var(--bg-card)"
                : "linear-gradient(135deg, #7c3aed, #2563eb)",
              color: isRunning ? "var(--text-muted)" : "#fff",
              border: `1px solid ${isRunning ? "var(--border-subtle)" : "transparent"}`,
              cursor: isRunning ? "not-allowed" : "pointer",
              boxShadow: isRunning ? "none" : "0 4px 16px rgba(124,58,237,0.3)",
            }}
          >
            {isRunning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Aligning…
              </>
            ) : (
              <>
                <Crosshair size={14} />
                Run Alignment
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
          style={{
            color: "var(--text-muted)",
          }}
        >
          ← Back to Scan Loading
        </button>
      </div>
    </div>
  );
}
