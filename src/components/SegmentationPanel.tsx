"use client";

import { useState, useCallback } from "react";
import { Loader2, CheckCircle2, AlertCircle, ChevronRight, Activity } from "lucide-react";
import type { ScanFile } from "./ScanLoader";
import type { SegmentationResult, LandmarkPoint } from "./ThreeViewer";
import type { TeethAnalysisResult } from "../core/types";

// ─── API endpoint ─────────────────────────────────────────────────────────────
const SEGMENT_API =
  process.env.NEXT_PUBLIC_TOOTH_SEGMENT_API ??
  "http://localhost:8000/detect-landmarks";
const MIN_LANDMARK_SCORE = 0.3;

// ─── Types ────────────────────────────────────────────────────────────────────
type JawStatus = "idle" | "loading" | "done" | "error";

interface SegmentationSummary {
  uniquePositiveLabels: number;
  positiveCoverage: number;
  landmarkCount: number;
  suspicious: boolean;
  message: string | null;
}

interface JawAnalysis {
  status: JawStatus;
  result: SegmentationResult | null;
  error: string | null;
  summary: SegmentationSummary | null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLabels(rawLabels: unknown): number[] {
  if (!Array.isArray(rawLabels)) {
    return [];
  }

  return rawLabels.map((value) => {
    const numeric = toFiniteNumber(value);
    if (numeric === null) {
      return 0;
    }

    return Math.round(numeric);
  });
}

function normalizeLandmarkPoint(raw: unknown): LandmarkPoint | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const xyzObject =
    record.coord && typeof record.coord === "object" && !Array.isArray(record.coord)
      ? (record.coord as Record<string, unknown>)
      : record.position && typeof record.position === "object" && !Array.isArray(record.position)
        ? (record.position as Record<string, unknown>)
        : record.point && typeof record.point === "object" && !Array.isArray(record.point)
          ? (record.point as Record<string, unknown>)
          : null;
  const coords =
    Array.isArray(record.coord) ? record.coord :
    Array.isArray(record.position) ? record.position :
    Array.isArray(record.point) ? record.point :
    xyzObject ? [xyzObject.x, xyzObject.y, xyzObject.z] :
    [record.x, record.y, record.z];

  if (!coords || coords.length < 3) {
    return null;
  }

  const x = toFiniteNumber(coords[0]);
  const y = toFiniteNumber(coords[1]);
  const z = toFiniteNumber(coords[2]);

  if (x === null || y === null || z === null) {
    return null;
  }

  const toothId = toFiniteNumber(
    record.tooth_id ??
      record.toothId ??
      record.tooth_label ??
      record.segment_label ??
      record.label
  );

  return {
    class:
      typeof record.class === "string"
        ? record.class
        : typeof record.type === "string"
          ? record.type
          : "Unknown",
    coord: [x, y, z],
    score: toFiniteNumber(record.score) ?? 0,
    ...(toothId !== null ? { tooth_id: toothId } : {}),
  };
}

function normalizeLandmarks(rawLandmarks: unknown): LandmarkPoint[] {
  if (Array.isArray(rawLandmarks)) {
    return rawLandmarks
      .map((item) => normalizeLandmarkPoint(item))
      .filter((item): item is LandmarkPoint => item !== null);
  }

  return [];
}

function buildSegmentationSummary(
  labels: number[],
  landmarks: LandmarkPoint[]
): SegmentationSummary {
  const positiveLabels = labels.filter((label) => label > 0);
  const uniquePositiveLabels = new Set(positiveLabels).size;
  const positiveCoverage = labels.length > 0 ? positiveLabels.length / labels.length : 0;
  const landmarkCount = landmarks.length;

  let message: string | null = null;

  if (uniquePositiveLabels < 4) {
    message =
      "API yaniti tam dis-instance segmentasyonu gibi gorunmuyor; yalnizca az sayida pozitif label dondu.";
  } else if (uniquePositiveLabels > 32) {
    message =
      "API yaniti tooth-instance etiketleri yerine surekli/noisy label degerleri donuyor gibi gorunuyor.";
  } else if (positiveCoverage < 0.08) {
    message =
      "API yalnizca lokal bir ROI donuyor gibi gorunuyor; tum ark disleri segmente edilmedi.";
  } else if (landmarkCount > 0 && landmarkCount < uniquePositiveLabels) {
    message =
      "Landmark sayisi segment sayisina gore cok dusuk; endpoint landmark-only veya kismi ROI donuyor olabilir.";
  }

  return {
    uniquePositiveLabels,
    positiveCoverage,
    landmarkCount,
    suspicious: message !== null,
    message,
  };
}

export interface SegmentationPanelProps {
  maxillaFile: ScanFile | null;
  mandibleFile: ScanFile | null;
  onBack: () => void;
  onProceed: () => void;
  onSegmentResult: (jaw: "maxilla" | "mandible", result: SegmentationResult) => void;
  onFileLoaded?: (scan: ScanFile) => void;
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function SegmentationPanel({
  maxillaFile,
  mandibleFile,
  onBack,
  onProceed,
  onSegmentResult,
  onFileLoaded,
}: SegmentationPanelProps) {
  const [maxState, setMaxState] = useState<JawAnalysis>({
    status: "idle",
    result: null,
    error: null,
    summary: null,
  });
  const [mandState, setMandState] = useState<JawAnalysis>({
    status: "idle",
    result: null,
    error: null,
    summary: null,
  });

  const analyze = useCallback(
    async (jaw: "maxilla" | "mandible") => {
      const file = jaw === "maxilla" ? maxillaFile : mandibleFile;
      if (!file) return;

      const setState = jaw === "maxilla" ? setMaxState : setMandState;
      setState({ status: "loading", result: null, error: null, summary: null });

      try {
        const formData = new FormData();
        formData.append("file", file.file, file.name);

        const res = await fetch(SEGMENT_API, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Sunucu hatasi: ${res.status}`);

        const data = await res.json();
        const labels = normalizeLabels(data.segmentation?.labels);
        if (labels.length === 0) throw new Error("Gecersiz API yaniti");

        const rawObjects = Array.isArray(data.landmarks?.objects)
          ? data.landmarks.objects
          : data.landmarks;
        const landmarks = normalizeLandmarks(rawObjects).filter(
          (landmark) => landmark.score >= MIN_LANDMARK_SCORE
        );
        const summary = buildSegmentationSummary(labels, landmarks);

        // Parse per-tooth analysis data (coordinate frames, FACC, etc.)
        const teethData: TeethAnalysisResult | undefined =
          data.teeth && Array.isArray(data.teeth.teeth)
            ? (data.teeth as TeethAnalysisResult)
            : undefined;

        if (teethData) {
          console.log(
            `[Seg] ${jaw}: received ${teethData.teeth.length} teeth with coordinate frames (${teethData.jaw_type} jaw)`
          );
        }

        const result: SegmentationResult = {
          labels,
          landmarks,
          teeth: teethData,
        };

        setState({ status: "done", result, error: null, summary });
        onSegmentResult(jaw, result);
      } catch (err) {
        setState({
          status: "idle",
          result: null,
          error: (err as Error).message,
          summary: null,
        });
      }
    },
    [maxillaFile, mandibleFile, onSegmentResult]
  );

  const anyDone = maxState.status === "done" || mandState.status === "done";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-5 pt-5 pb-4 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Dis Segmentasyonu
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          AI ile disleri ayristir ve FA noktalarini tespit et
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
        {/* Info callout — hide once any segmentation is done */}
        {!anyDone && (
          <div
            className="rounded-xl p-3 text-xs"
            style={{
              background: "rgba(37,99,235,0.06)",
              border: "1px solid rgba(37,99,235,0.15)",
            }}
          >
            <div className="font-semibold mb-1" style={{ color: "#2563eb" }}>
              Nasil calisir?
            </div>
            <div style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
              Tarama dosyasi bulut API&apos;ye gonderilir. Her dis vertex
              duzeyinde etiketlenir; FA noktalari ve diger anatomik noktalar
              otomatik tespit edilir.
            </div>
          </div>
        )}

        {/* Maxilla card */}
        <JawCard
          label="Maxilla (Ust Cene)"
          jaw="maxilla"
          accentColor="#f59e0b"
          file={maxillaFile}
          state={maxState}
          onAnalyze={() => analyze("maxilla")}
          onFileUpload={onFileLoaded}
        />

        {/* Mandible card */}
        <JawCard
          label="Mandible (Alt Cene)"
          jaw="mandible"
          accentColor="#2563eb"
          file={mandibleFile}
          state={mandState}
          onAnalyze={() => analyze("mandible")}
          onFileUpload={onFileLoaded}
        />

        {/* Action buttons — right after jaw cards so they stay visible */}
        <div className="flex flex-col gap-2">
          {anyDone && (
            <button
              onClick={onProceed}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "#2563eb", color: "#fff" }}
            >
              Braket Planlamasina Gec
              <ChevronRight size={14} />
            </button>
          )}
          <button
            onClick={onBack}
            className="text-xs py-2 rounded-lg transition-colors"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(0,0,0,0.03)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            &larr; Hizalamaya Geri Don
          </button>
        </div>

        {/* Landmark legend — at the bottom, doesn't push cards off screen */}
        {anyDone && (
          <div
            className="rounded-xl p-3"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="text-xs font-semibold mb-2 tracking-wide"
              style={{ color: "var(--text-secondary)" }}
            >
              NOKTA ACIKLAMASI
            </div>
            {[
              { label: "FA Noktasi (Braket merkezi)", color: "#16a34a" },
              { label: "Mesial", color: "#ff4444" },
              { label: "Distal", color: "#4488ff" },
              { label: "Dis Nokta", color: "#f97316" },
              { label: "Ic Nokta", color: "#9333ea" },
              { label: "Tuberkul (Cusp)", color: "#eab308" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2 py-0.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Jaw analysis card ────────────────────────────────────────────────────────
interface JawCardProps {
  label: string;
  jaw: "maxilla" | "mandible";
  accentColor: string;
  file: ScanFile | null;
  state: JawAnalysis;
  onAnalyze: () => void;
  onFileUpload?: (scan: ScanFile) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function JawCard({ label, jaw, accentColor, file, state, onAnalyze, onFileUpload }: JawCardProps) {
  const uniqueTeeth = state.result
    ? [...new Set(state.result.labels.filter((l) => l !== 0))]
    : [];
  const faCount = state.result
    ? state.result.landmarks.filter((l) => l.class === "FacialPoint").length
    : 0;

  const disabled = !file || state.status === "loading";

  const handleInlineUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !onFileUpload) return;
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !["stl", "obj", "ply"].includes(ext)) return;
    onFileUpload({
      file: f,
      jaw,
      name: f.name,
      size: formatFileSize(f.size),
    });
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: `1.5px solid ${
          state.status === "done" ? accentColor + "50" : "var(--border-subtle)"
        }`,
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background:
            state.status === "done" ? accentColor + "12" : "var(--bg-secondary)",
        }}
      >
        <div>
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {file ? `${file.name} - ${file.size}` : "Tarama yuklenmedi"}
          </div>
        </div>
        {state.status === "done" && (
          <CheckCircle2 size={16} style={{ color: accentColor }} />
        )}
        {state.status === "loading" && (
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: accentColor }}
          />
        )}
        {state.status === "idle" && state.error && (
          <AlertCircle size={16} style={{ color: "#ef4444" }} />
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Error */}
        {state.status === "idle" && state.error && (
          <div
            className="text-xs rounded-lg px-3 py-2"
            style={{
              background: "rgba(239,68,68,0.08)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {state.error}
          </div>
        )}

        {/* Inline file upload when no file is loaded */}
        {!file && onFileUpload && (
          <label
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-xs cursor-pointer transition-all"
            style={{
              border: `1.5px dashed ${accentColor}40`,
              color: accentColor,
              background: `${accentColor}08`,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = `${accentColor}15`)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = `${accentColor}08`)
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Dosya Yukle (.stl, .obj, .ply)
            <input
              type="file"
              accept=".stl,.obj,.ply"
              onChange={handleInlineUpload}
              className="sr-only"
            />
          </label>
        )}

        {/* Result stats */}
        {(state.status === "done" && state.result) || state.summary ? (
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-lg px-3 py-2 text-center"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="text-sm font-bold" style={{ color: accentColor }}>
                {state.summary?.uniquePositiveLabels ?? uniqueTeeth.length}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                Label
              </div>
            </div>
            <div
              className="flex-1 rounded-lg px-3 py-2 text-center"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="text-sm font-bold" style={{ color: "#16a34a" }}>
                {state.summary
                  ? `${Math.round(state.summary.positiveCoverage * 100)}%`
                  : faCount}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {state.summary ? "Kapsama" : "FA Noktasi"}
              </div>
            </div>
          </div>
        ) : null}

        {/* Analyze button */}
        <button
          onClick={onAnalyze}
          disabled={disabled}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: disabled ? "var(--bg-secondary)" : accentColor,
            color: disabled ? "var(--text-muted)" : "#fff",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {state.status === "loading" ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Analiz ediliyor...
            </>
          ) : state.status === "done" ? (
            <>
              <Activity size={12} />
              Yeniden Analiz Et
            </>
          ) : (
            <>
              <Activity size={12} />
              Segmentasyon Baslat
            </>
          )}
        </button>
      </div>
    </div>
  );
}
