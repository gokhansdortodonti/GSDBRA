"use client";

import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Box,
  Eye,
  Maximize2,
  Camera,
  Layers,
  Move3d,
  MousePointer2,
} from "lucide-react";

interface ViewerToolbarProps {
  viewMode: "perspective" | "front" | "top" | "side";
  showGrid: boolean;
  showWireframe: boolean;
  activeTool: "select" | "place" | "move";
  onViewModeChange: (mode: "perspective" | "front" | "top" | "side") => void;
  onToggleGrid: () => void;
  onToggleWireframe: () => void;
  onToolChange: (tool: "select" | "place" | "move") => void;
  onResetView: () => void;
  onScreenshot: () => void;
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-tooltip={label}
      className="tooltip w-8 h-8 rounded-lg flex items-center justify-center transition-all"
      style={{
        background: active ? "rgba(37, 99, 235, 0.3)" : "transparent",
        border: `1px solid ${active ? "var(--accent-blue)" : "transparent"}`,
        color: active ? "var(--accent-blue-light)" : "var(--text-muted)",
        boxShadow: active ? "0 0 8px rgba(37, 99, 235, 0.3)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-card)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }
      }}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="w-px h-5 mx-1"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}

export default function ViewerToolbar({
  viewMode,
  showGrid,
  showWireframe,
  activeTool,
  onViewModeChange,
  onToggleGrid,
  onToggleWireframe,
  onToolChange,
  onResetView,
  onScreenshot,
}: ViewerToolbarProps) {
  return (
    <div
      className="flex items-center gap-1 px-3 py-2 rounded-xl"
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid var(--border-subtle)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
      }}
    >
      {/* Tools */}
      <ToolButton
        icon={<MousePointer2 size={14} />}
        label="Select Tool"
        active={activeTool === "select"}
        onClick={() => onToolChange("select")}
      />
      <ToolButton
        icon={<Box size={14} />}
        label="Place Bracket"
        active={activeTool === "place"}
        onClick={() => onToolChange("place")}
      />
      <ToolButton
        icon={<Move3d size={14} />}
        label="Move Bracket"
        active={activeTool === "move"}
        onClick={() => onToolChange("move")}
      />

      <Divider />

      {/* View Modes */}
      <ToolButton
        icon={<span className="text-xs font-bold">3D</span>}
        label="Perspektif"
        active={viewMode === "perspective"}
        onClick={() => onViewModeChange("perspective")}
      />
      <ToolButton
        icon={<span className="text-xs font-bold">Ön</span>}
        label="Frontal Görünüm"
        active={viewMode === "front"}
        onClick={() => onViewModeChange("front")}
      />
      <ToolButton
        icon={<span className="text-xs font-bold">Ok</span>}
        label="Oklüzal Görünüm"
        active={viewMode === "top"}
        onClick={() => onViewModeChange("top")}
      />
      <ToolButton
        icon={<span className="text-xs font-bold">Yn</span>}
        label="Lateral Görünüm"
        active={viewMode === "side"}
        onClick={() => onViewModeChange("side")}
      />

      <Divider />

      {/* Display Options */}
      <ToolButton
        icon={<Grid3x3 size={14} />}
        label="Toggle Grid"
        active={showGrid}
        onClick={onToggleGrid}
      />
      <ToolButton
        icon={<Layers size={14} />}
        label="Toggle Wireframe"
        active={showWireframe}
        onClick={onToggleWireframe}
      />
      <ToolButton
        icon={<Eye size={14} />}
        label="Toggle Visibility"
        onClick={() => {}}
      />

      <Divider />

      {/* Actions */}
      <ToolButton
        icon={<ZoomIn size={14} />}
        label="Zoom In"
        onClick={() => {}}
      />
      <ToolButton
        icon={<ZoomOut size={14} />}
        label="Zoom Out"
        onClick={() => {}}
      />
      <ToolButton
        icon={<Maximize2 size={14} />}
        label="Fit to View"
        onClick={onResetView}
      />
      <ToolButton
        icon={<RotateCcw size={14} />}
        label="Reset View"
        onClick={onResetView}
      />

      <Divider />

      <ToolButton
        icon={<Camera size={14} />}
        label="Screenshot"
        onClick={onScreenshot}
      />
    </div>
  );
}
