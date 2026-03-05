"use client";

import { useState } from "react";
import { Download, Eye, EyeOff, FileJson, RotateCcw } from "lucide-react";

interface ToothExportPanelProps {
  toothCount: number;
  onExportJSON: () => void;
  onToggleLCS: (visible: boolean) => void;
  onResetView: () => void;
}

export default function ToothExportPanel({
  toothCount,
  onExportJSON,
  onToggleLCS,
  onResetView,
}: ToothExportPanelProps) {
  const [showLCS, setShowLCS] = useState(false);

  const handleToggleLCS = () => {
    const newValue = !showLCS;
    setShowLCS(newValue);
    onToggleLCS(newValue);
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="text-xs font-semibold mb-3 tracking-wide"
        style={{ color: "var(--text-secondary)" }}
      >
        DIS VERILERI
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-4">
        <div
          className="flex-1 rounded-lg px-3 py-2 text-center"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-lg font-bold" style={{ color: "#2563eb" }}>
            {toothCount}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Segmentelenen Dis
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {/* Toggle LCS */}
        <button
          onClick={handleToggleLCS}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            background: showLCS ? "rgba(37,99,235,0.1)" : "var(--bg-primary)",
            color: showLCS ? "#2563eb" : "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {showLCS ? <Eye size={14} /> : <EyeOff size={14} />}
          {showLCS ? "LCS Eksenlerini Gizle" : "LCS Eksenlerini Goster"}
        </button>

        {/* Export JSON */}
        <button
          onClick={onExportJSON}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: "#2563eb", color: "#fff" }}
        >
          <Download size={14} />
          JSON Olarak Indir
        </button>

        {/* Reset View */}
        <button
          onClick={onResetView}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs transition-all"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <RotateCcw size={12} />
          Gorunumu Sifirla
        </button>
      </div>

      {/* Format info */}
      <div
        className="mt-4 text-xs rounded-lg px-3 py-2"
        style={{
          background: "rgba(37,99,235,0.05)",
          color: "var(--text-muted)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <FileJson size={12} style={{ color: "#2563eb" }} />
          <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
            Export Formatı
          </span>
        </div>
        Her dis icin: landmarks, 4x4 transformation matrix, mesh data (base64 STL)
      </div>
    </div>
  );
}
