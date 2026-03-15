"use client";

import { useState } from "react";
import {
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Move3d,
  FlipHorizontal2,
  FlipVertical2,
  ArrowUpDown,
  Zap,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { ScanFile } from "./ScanLoader";
import type { OcclusalPlaneData } from "./ThreeViewer";

interface OcclusalAlignmentProps {
  maxillaFile: ScanFile | null;
  mandibleFile: ScanFile | null;
  onAlignmentComplete: () => void;
  onBack: () => void;
  // Auto-compute
  onAutoCompute: () => void;
  autoComputeStatus: "idle" | "computing" | "done" | "error";
  // Viewer control callbacks
  onSetGizmoMode: (mode: "translate" | "rotate") => void;
  onSetGizmoAxis: (axis: "all" | "x" | "y" | "z") => void;
  onSetOrthographic: (v: boolean) => void;
  onSetView: (view: "perspective" | "front" | "top" | "side" | "sideRight" | "bottom") => void;
  onSaveAlignmentMatrix: () => void;
  // Post-alignment flip corrections
  onFlipNormal: () => void;     // Flip up/down
  onFlipX: () => void;          // Flip left/right
  onFlipFrontBack: () => void;  // Flip front/back
  onResetAlignment: () => void;
  alignmentApplied: boolean;
  occlusalPlane: OcclusalPlaneData | null;
}

export default function OcclusalAlignment({
  maxillaFile,
  mandibleFile,
  onAlignmentComplete,
  onAutoCompute,
  autoComputeStatus,
  onSetGizmoMode,
  onSetGizmoAxis,
  onSetOrthographic,
  onSetView,
  onSaveAlignmentMatrix,
  onFlipNormal,
  onFlipX,
  onFlipFrontBack,
  onResetAlignment,
  alignmentApplied,
  occlusalPlane,
}: OcclusalAlignmentProps) {
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("rotate");
  const [gizmoAxis, setGizmoAxis] = useState<"all" | "x" | "y" | "z">("all");

  // Suppress unused-variable warnings
  void onSetOrthographic;
  void occlusalPlane;
  void onSaveAlignmentMatrix;

  const handleGizmoMode = (mode: "translate" | "rotate") => {
    setGizmoMode(mode);
    onSetGizmoMode(mode);
  };

  const handleGizmoAxis = (axis: "all" | "x" | "y" | "z") => {
    setGizmoAxis(axis);
    onSetGizmoAxis(axis);
  };

  const hasBothScans = !!maxillaFile && !!mandibleFile;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-white">Occlusal Alignment</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Auto-detect occlusal plane from overlap
        </p>
      </div>

      {/* Scan badges */}
      <div className="flex gap-2 flex-wrap">
        {maxillaFile && (
          <span className="text-xs px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 truncate max-w-[140px]">
            ↑ {maxillaFile.file.name}
          </span>
        )}
        {mandibleFile && (
          <span className="text-xs px-2 py-1 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 truncate max-w-[140px]">
            ↓ {mandibleFile.file.name}
          </span>
        )}
      </div>

      {/* ── Phase 1: Auto-compute ────────────────────────────────────────── */}
      {!alignmentApplied && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Auto Occlusal Plane
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Üst ve alt çene mesh&apos;lerinin en yakın bölgelerinden otomatik olarak
            oklüzal düzlemi hesaplar. Nokta seçmenize gerek yok.
          </p>

          {!hasBothScans && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Hesaplama için hem üst hem alt çene takınları gereklidir.</span>
            </div>
          )}

          {autoComputeStatus === "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Overlap noktası bulunamadı. Lütfen modelleri kontrol edin.</span>
            </div>
          )}

          <button
            onClick={onAutoCompute}
            disabled={!hasBothScans || autoComputeStatus === "computing"}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {autoComputeStatus === "computing" ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Hesaplanıyor...
              </>
            ) : (
              <>
                <Zap size={14} />
                Auto Compute
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Phase 2: Post-alignment corrections ───────────────────────────── */}
      {alignmentApplied && (
        <>
          {/* Success badge */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-300 text-xs">
            <CheckCircle2 size={14} className="shrink-0" />
            <span className="font-medium">
              Dünya koordinatlarına hizalandı
            </span>
          </div>

          {/* ── Direction correction panel ─────────────────────────────────── */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider">
                Yön Düzeltme
              </span>
              <span className="text-[10px] text-amber-500/50 italic">— yanlış ise tıkla</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <button
                  onClick={onFlipFrontBack}
                  title="Anterior/posterior yön yanlışsa kullan (180° sagittal)"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-amber-500/15 text-slate-300 hover:text-amber-200 border border-white/10 hover:border-amber-500/30 transition-colors"
                >
                  <ArrowUpDown size={12} />
                  Ön / Arka
                </button>
                <button
                  onClick={onFlipX}
                  title="Sağ-sol ters görünüyorsa kullan (transversal flip)"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-amber-500/15 text-slate-300 hover:text-amber-200 border border-white/10 hover:border-amber-500/30 transition-colors"
                >
                  <FlipHorizontal2 size={12} />
                  Sağ / Sol
                </button>
              </div>
              <button
                onClick={onFlipNormal}
                title="Oklüzal düzlem normal yönü yanlışsa kullan (vertikal flip)"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-amber-500/15 text-slate-300 hover:text-amber-200 border border-white/10 hover:border-amber-500/30 transition-colors"
              >
                <FlipVertical2 size={12} />
                Oklüzal Flip ↕
              </button>
            </div>
            <p className="text-[10px] text-amber-500/50 leading-relaxed">
              <strong className="text-amber-400/70">Oklüzal</strong> görünümde yüzeyler ters ise → Oklüzal Flip &nbsp;|&nbsp;
              <strong className="text-amber-400/70">Frontal</strong> görünümde ters ise → Ön/Arka veya Sağ/Sol
            </p>
          </div>

          {/* View shortcuts — dental terminology */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Görünüm
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { view: "perspective" as const, label: "3D", icon: "🔄" },
                { view: "front" as const, label: "Frontal", icon: "👤" },
                { view: "top" as const, label: "Oklüzal", icon: "⬇" },
                { view: "side" as const, label: "Sol Lateral", icon: "◀" },
                { view: "sideRight" as const, label: "Sağ Lateral", icon: "▶" },
                { view: "bottom" as const, label: "Apikal", icon: "⬆" },
              ]).map(({ view, label, icon }) => (
                <button
                  key={view}
                  onClick={() => onSetView(view)}
                  className="py-2 rounded-md text-[11px] font-medium bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors flex flex-col items-center gap-0.5"
                >
                  <span className="text-sm">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fine-tune gizmo controls */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Fine-tune
            </span>

            {/* Mode toggle */}
            <div className="flex gap-1.5">
              {(["rotate", "translate"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleGizmoMode(m)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${gizmoMode === m
                      ? "bg-violet-600/30 border-violet-500/50 text-violet-200"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                    }`}
                >
                  <Move3d size={12} />
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Axis selector — dental terms */}
            <div className="flex gap-1">
              {([
                { ax: "all" as const, label: "Hepsi", color: "white" },
                { ax: "x" as const, label: "Sağ-Sol", color: "red" },
                { ax: "y" as const, label: "Vertikal", color: "green" },
                { ax: "z" as const, label: "Ön-Arka", color: "blue" },
              ]).map(({ ax, label, color }) => (
                <button
                  key={ax}
                  onClick={() => handleGizmoAxis(ax)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border transition-colors ${gizmoAxis === ax
                      ? color === "red"
                        ? "bg-red-600/30 border-red-500/50 text-red-200"
                        : color === "green"
                          ? "bg-green-600/30 border-green-500/50 text-green-200"
                          : color === "blue"
                            ? "bg-blue-600/30 border-blue-500/50 text-blue-200"
                            : "bg-white/15 border-white/30 text-white"
                      : "bg-white/5 border-white/10 text-slate-500 hover:text-white"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset + Continue */}
          <div className="flex gap-2">
            <button
              onClick={onResetAlignment}
              title="Reset alignment and re-compute"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              <RotateCcw size={12} /> Reset
            </button>
            <button
              onClick={onAlignmentComplete}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white transition-all"
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
