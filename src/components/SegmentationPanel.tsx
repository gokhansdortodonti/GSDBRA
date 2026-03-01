"use client";

import { useState } from "react";
import {
  Layers,
  Cpu,
  CheckCircle2,
  Circle,
  ChevronRight,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface SegmentationStep {
  id: string;
  label: string;
  description: string;
  status: "pending" | "processing" | "done" | "error";
  progress?: number;
}

interface SegmentationPanelProps {
  onSegmentationComplete: () => void;
}

const INITIAL_STEPS: SegmentationStep[] = [
  {
    id: "load",
    label: "Load Scan",
    description: "Import STL/PLY/OBJ file",
    status: "done",
    progress: 100,
  },
  {
    id: "preprocess",
    label: "Pre-processing",
    description: "Noise reduction & mesh repair",
    status: "done",
    progress: 100,
  },
  {
    id: "detect",
    label: "Arch Detection",
    description: "Identify dental arch geometry",
    status: "done",
    progress: 100,
  },
  {
    id: "segment",
    label: "Tooth Segmentation",
    description: "AI-based individual tooth isolation",
    status: "processing",
    progress: 67,
  },
  {
    id: "label",
    label: "FDI Labeling",
    description: "Automatic tooth numbering",
    status: "pending",
    progress: 0,
  },
  {
    id: "landmark",
    label: "Landmark Detection",
    description: "Bracket placement reference points",
    status: "pending",
    progress: 0,
  },
];

export default function SegmentationPanel({ onSegmentationComplete }: SegmentationPanelProps) {
  const [steps, setSteps] = useState<SegmentationStep[]>(INITIAL_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const allDone = steps.every((s) => s.status === "done");
  const currentStep = steps.find((s) => s.status === "processing");

  const runSegmentation = () => {
    setIsRunning(true);
    let stepIndex = steps.findIndex((s) => s.status === "processing");
    if (stepIndex === -1) stepIndex = steps.findIndex((s) => s.status === "pending");

    const simulateProgress = (idx: number) => {
      if (idx >= steps.length) {
        setIsRunning(false);
        onSegmentationComplete();
        return;
      }

      setSteps((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, status: "processing", progress: 0 } : s
        )
      );

      let progress = steps[idx].progress || 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setSteps((prev) =>
            prev.map((s, i) =>
              i === idx ? { ...s, status: "done", progress: 100 } : s
            )
          );
          setTimeout(() => simulateProgress(idx + 1), 300);
        } else {
          setSteps((prev) =>
            prev.map((s, i) =>
              i === idx ? { ...s, progress: Math.round(progress) } : s
            )
          );
        }
      }, 150);
    };

    simulateProgress(stepIndex);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(37, 99, 235, 0.2)", border: "1px solid rgba(37, 99, 235, 0.4)" }}
        >
          <Cpu size={14} style={{ color: "var(--accent-blue-light)" }} />
        </div>
        <div>
          <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            AI Segmentation
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {allDone ? "Complete" : currentStep ? `Running: ${currentStep.label}` : "Ready"}
          </div>
        </div>
        {isRunning && (
          <Loader2
            size={14}
            className="ml-auto animate-spin"
            style={{ color: "var(--accent-blue-light)" }}
          />
        )}
      </div>

      {/* Overall Progress */}
      <div>
        <div className="flex justify-between mb-1.5">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Overall Progress</span>
          <span className="text-xs font-semibold" style={{ color: "var(--accent-cyan)" }}>
            {Math.round((steps.filter((s) => s.status === "done").length / steps.length) * 100)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(steps.filter((s) => s.status === "done").length / steps.length) * 100}%`,
              background: "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))",
            }}
          />
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
                  step.status === "processing"
                    ? "rgba(37, 99, 235, 0.1)"
                    : showDetails === step.id
                    ? "var(--bg-card)"
                    : "transparent",
                border: `1px solid ${
                  step.status === "processing"
                    ? "rgba(37, 99, 235, 0.3)"
                    : "transparent"
                }`,
              }}
              onClick={() => setShowDetails(showDetails === step.id ? null : step.id)}
            >
              {/* Status Icon */}
              <div className="flex-shrink-0">
                {step.status === "done" ? (
                  <CheckCircle2 size={14} style={{ color: "var(--accent-green)" }} />
                ) : step.status === "processing" ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                    style={{ color: "var(--accent-blue-light)" }}
                  />
                ) : step.status === "error" ? (
                  <AlertCircle size={14} style={{ color: "var(--accent-red)" }} />
                ) : (
                  <Circle size={14} style={{ color: "var(--text-muted)" }} />
                )}
              </div>

              {/* Step Info */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-medium"
                  style={{
                    color:
                      step.status === "done"
                        ? "var(--text-primary)"
                        : step.status === "processing"
                        ? "var(--accent-blue-light)"
                        : "var(--text-muted)",
                  }}
                >
                  {step.label}
                </div>
                {step.status === "processing" && (
                  <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${step.progress}%`,
                        background: "var(--accent-blue)",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Step Number */}
              <div
                className="text-xs flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {idx + 1}/{steps.length}
              </div>

              <ChevronRight
                size={12}
                style={{
                  color: "var(--text-muted)",
                  transform: showDetails === step.id ? "rotate(90deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>

            {/* Details Dropdown */}
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
                  <div className="mt-1 flex items-center gap-1" style={{ color: "var(--accent-green)" }}>
                    <CheckCircle2 size={10} />
                    <span>Completed successfully</span>
                  </div>
                )}
                {step.status === "processing" && (
                  <div className="mt-1" style={{ color: "var(--accent-blue-light)" }}>
                    Progress: {step.progress}%
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Button */}
      {!allDone && (
        <button
          onClick={runSegmentation}
          disabled={isRunning}
          className="w-full py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2"
          style={{
            background: isRunning
              ? "var(--bg-card)"
              : "linear-gradient(135deg, var(--accent-blue), #1d4ed8)",
            color: isRunning ? "var(--text-muted)" : "#fff",
            border: `1px solid ${isRunning ? "var(--border-subtle)" : "transparent"}`,
            cursor: isRunning ? "not-allowed" : "pointer",
            boxShadow: isRunning ? "none" : "0 4px 12px rgba(37, 99, 235, 0.4)",
          }}
        >
          {isRunning ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Cpu size={12} />
              Run Segmentation
            </>
          )}
        </button>
      )}

      {allDone && (
        <div
          className="flex items-center gap-2 p-2.5 rounded-lg"
          style={{
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          <CheckCircle2 size={14} style={{ color: "var(--accent-green)" }} />
          <div>
            <div className="text-xs font-semibold" style={{ color: "var(--accent-green)" }}>
              Segmentation Complete
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              14 teeth detected & labeled
            </div>
          </div>
        </div>
      )}

      {/* Model Info */}
      <div
        className="p-2.5 rounded-lg"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <Layers size={11} style={{ color: "var(--text-muted)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            SCAN INFO
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {[
            { label: "File", value: "scan_upper.stl" },
            { label: "Vertices", value: "124,832" },
            { label: "Faces", value: "249,664" },
            { label: "Resolution", value: "0.05mm" },
          ].map((item) => (
            <div key={item.label} className="flex justify-between">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {item.label}
              </span>
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
