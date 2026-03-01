"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Settings,
  HelpCircle,
  Zap,
  User,
  Bell,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import ToothChart from "./ToothChart";
import SegmentationPanel from "./SegmentationPanel";
import BracketProperties from "./BracketProperties";
import ViewerToolbar from "./ViewerToolbar";

// Dynamic import for Three.js viewer (client-side only)
const ThreeViewer = dynamic(() => import("./ThreeViewer"), { ssr: false });

interface BracketData {
  toothId: number;
  torque: number;
  angulation: number;
  inOut: number;
  system: string;
  position: THREE.Vector3;
}

type SidebarTab = "segmentation" | "teeth" | "properties";

export default function OrthoApp() {
  const [activeJaw, setActiveJaw] = useState<"upper" | "lower">("upper");
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [brackets, setBrackets] = useState<Map<number, BracketData>>(new Map());
  const [viewMode, setViewMode] = useState<"perspective" | "front" | "top" | "side">("perspective");
  const [showGrid, setShowGrid] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [activeTool, setActiveTool] = useState<"select" | "place" | "move">("select");
  const [leftTab, setLeftTab] = useState<SidebarTab>("segmentation");
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [segmentationDone, setSegmentationDone] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleToothClick = useCallback(
    (toothId: number, position: THREE.Vector3) => {
      setSelectedTooth(toothId);
      if (activeTool === "place" && !brackets.has(toothId)) {
        const prescription: Record<number, { torque: number; angulation: number }> = {
          11: { torque: 17, angulation: 5 }, 12: { torque: 10, angulation: 9 },
          13: { torque: -7, angulation: 11 }, 14: { torque: -7, angulation: 2 },
          15: { torque: -7, angulation: 2 }, 16: { torque: -14, angulation: 5 },
          17: { torque: -14, angulation: 5 }, 21: { torque: 17, angulation: 5 },
          22: { torque: 10, angulation: 9 }, 23: { torque: -7, angulation: 11 },
          24: { torque: -7, angulation: 2 }, 25: { torque: -7, angulation: 2 },
          26: { torque: -14, angulation: 5 }, 27: { torque: -14, angulation: 5 },
          41: { torque: -1, angulation: 2 }, 42: { torque: -1, angulation: 2 },
          43: { torque: -11, angulation: 5 }, 44: { torque: -17, angulation: 2 },
          45: { torque: -17, angulation: 2 }, 46: { torque: -20, angulation: 2 },
          47: { torque: -10, angulation: 2 }, 31: { torque: -1, angulation: 2 },
          32: { torque: -1, angulation: 2 }, 33: { torque: -11, angulation: 5 },
          34: { torque: -17, angulation: 2 }, 35: { torque: -17, angulation: 2 },
          36: { torque: -20, angulation: 2 }, 37: { torque: -10, angulation: 2 },
        };
        const p = prescription[toothId] || { torque: 0, angulation: 0 };
        setBrackets((prev) => {
          const next = new Map(prev);
          next.set(toothId, {
            toothId,
            torque: p.torque,
            angulation: p.angulation,
            inOut: 0,
            system: "MBT 0.022\"",
            position,
          });
          return next;
        });
        showNotification(`Bracket placed on tooth ${toothId}`);
      }
    },
    [activeTool, brackets]
  );

  const handlePlaceBracket = () => {
    if (!selectedTooth) return;
    const pos = new THREE.Vector3(0, 0, 0);
    handleToothClick(selectedTooth, pos);
  };

  const handleRemoveBracket = () => {
    if (!selectedTooth) return;
    setBrackets((prev) => {
      const next = new Map(prev);
      next.delete(selectedTooth);
      return next;
    });
    showNotification(`Bracket removed from tooth ${selectedTooth}`);
  };

  const handleUpdateBracket = (data: Partial<BracketData>) => {
    if (!selectedTooth) return;
    setBrackets((prev) => {
      const next = new Map(prev);
      const existing = next.get(selectedTooth);
      if (existing) {
        next.set(selectedTooth, { ...existing, ...data });
      }
      return next;
    });
  };

  const placedBracketsList = Array.from(brackets.values()).map((b) => ({
    toothId: b.toothId,
    position: b.position,
    normal: new THREE.Vector3(0, 1, 0),
  }));

  const placedBracketIds = Array.from(brackets.keys());
  const selectedBracket = selectedTooth ? brackets.get(selectedTooth) || null : null;

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Top Navigation Bar */}
      <header
        className="flex items-center gap-4 px-4 h-12 flex-shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))",
              boxShadow: "0 0 12px rgba(37, 99, 235, 0.5)",
            }}
          >
            <Activity size={14} color="#fff" />
          </div>
          <div>
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              OrthoScan
            </span>
            <span className="text-xs ml-1" style={{ color: "var(--accent-cyan)" }}>
              Pro
            </span>
          </div>
        </div>

        {/* Breadcrumb */}
        <div
          className="flex items-center gap-1.5 text-xs ml-2"
          style={{ color: "var(--text-muted)" }}
        >
          <span>Patients</span>
          <ChevronRight size={10} />
          <span>Ahmet Yılmaz</span>
          <ChevronRight size={10} />
          <span style={{ color: "var(--text-secondary)" }}>Bracket Planning</span>
        </div>

        {/* Center - Workflow Steps */}
        <div className="flex items-center gap-1 mx-auto">
          {[
            { step: 1, label: "Import", done: true },
            { step: 2, label: "Segment", done: segmentationDone },
            { step: 3, label: "Plan", done: false, active: true },
            { step: 4, label: "Review", done: false },
            { step: 5, label: "Export", done: false },
          ].map((item, idx) => (
            <div key={item.step} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: item.done
                      ? "var(--accent-green)"
                      : item.active
                      ? "var(--accent-blue)"
                      : "var(--bg-card)",
                    border: `1px solid ${
                      item.done
                        ? "var(--accent-green)"
                        : item.active
                        ? "var(--accent-blue)"
                        : "var(--border-subtle)"
                    }`,
                    color: item.done || item.active ? "#fff" : "var(--text-muted)",
                    fontSize: "9px",
                  }}
                >
                  {item.done ? "✓" : item.step}
                </div>
                <span
                  className="text-xs"
                  style={{
                    color: item.active
                      ? "var(--text-primary)"
                      : item.done
                      ? "var(--accent-green)"
                      : "var(--text-muted)",
                  }}
                >
                  {item.label}
                </span>
              </div>
              {idx < 4 && (
                <div
                  className="w-6 h-px mx-1"
                  style={{
                    background: item.done ? "var(--accent-green)" : "var(--border-subtle)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            <Upload size={12} />
            Import
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: "linear-gradient(135deg, var(--accent-blue), #1d4ed8)",
              color: "#fff",
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.4)",
            }}
          >
            <Download size={12} />
            Export Plan
          </button>
          <div
            className="w-px h-5"
            style={{ background: "var(--border-subtle)" }}
          />
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            <Bell size={14} />
          </button>
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            <Settings size={14} />
          </button>
          <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            <HelpCircle size={14} />
          </button>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: "var(--accent-blue)", color: "#fff" }}
          >
            <User size={13} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className="flex flex-col flex-shrink-0 transition-all duration-300"
          style={{
            width: leftCollapsed ? "40px" : "260px",
            background: "var(--bg-panel)",
            borderRight: "1px solid var(--border-subtle)",
          }}
        >
          {leftCollapsed ? (
            <button
              onClick={() => setLeftCollapsed(false)}
              className="flex items-center justify-center h-10 w-full"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronRight size={16} />
            </button>
          ) : (
            <>
              {/* Sidebar Tabs */}
              <div
                className="flex border-b"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {(["segmentation", "teeth"] as SidebarTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setLeftTab(tab)}
                    className="flex-1 py-2.5 text-xs font-semibold capitalize transition-all"
                    style={{
                      color: leftTab === tab ? "var(--accent-blue-light)" : "var(--text-muted)",
                      borderBottom: `2px solid ${leftTab === tab ? "var(--accent-blue)" : "transparent"}`,
                      background: "transparent",
                    }}
                  >
                    {tab === "segmentation" ? "Segment" : "Teeth"}
                  </button>
                ))}
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="px-2 flex items-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  <ChevronLeft size={14} />
                </button>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto p-3">
                {leftTab === "segmentation" && (
                  <SegmentationPanel
                    onSegmentationComplete={() => {
                      setSegmentationDone(true);
                      showNotification("Segmentation complete! 14 teeth detected.");
                    }}
                  />
                )}
                {leftTab === "teeth" && (
                  <ToothChart
                    activeJaw={activeJaw}
                    selectedTooth={selectedTooth}
                    placedBrackets={placedBracketIds}
                    onToothSelect={setSelectedTooth}
                    onJawChange={setActiveJaw}
                  />
                )}
              </div>
            </>
          )}
        </aside>

        {/* 3D Viewport */}
        <main className="flex-1 relative overflow-hidden">
          {/* Viewer */}
          <ThreeViewer
            activeJaw={activeJaw}
            selectedTooth={selectedTooth}
            placedBrackets={placedBracketsList}
            onToothClick={handleToothClick}
            viewMode={viewMode}
            showGrid={showGrid}
            showWireframe={showWireframe}
          />

          {/* Toolbar - floating at top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <ViewerToolbar
              viewMode={viewMode}
              showGrid={showGrid}
              showWireframe={showWireframe}
              activeTool={activeTool}
              onViewModeChange={setViewMode}
              onToggleGrid={() => setShowGrid((v) => !v)}
              onToggleWireframe={() => setShowWireframe((v) => !v)}
              onToolChange={setActiveTool}
              onResetView={() => setViewMode("perspective")}
              onScreenshot={() => showNotification("Screenshot saved!")}
            />
          </div>

          {/* Active Tool Indicator */}
          <div
            className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{
              background: "rgba(15, 20, 32, 0.85)",
              border: "1px solid var(--border-subtle)",
              backdropFilter: "blur(8px)",
              color: "var(--text-muted)",
            }}
          >
            <Zap size={11} style={{ color: "var(--accent-cyan)" }} />
            <span>
              Tool:{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                {activeTool === "select"
                  ? "Select"
                  : activeTool === "place"
                  ? "Place Bracket"
                  : "Move Bracket"}
              </span>
            </span>
            {activeTool === "place" && (
              <span style={{ color: "var(--accent-cyan)" }}>
                — Click tooth to place
              </span>
            )}
          </div>

          {/* Stats overlay */}
          <div
            className="absolute bottom-4 right-4 flex flex-col gap-1.5 text-xs"
            style={{
              background: "rgba(15, 20, 32, 0.85)",
              border: "1px solid var(--border-subtle)",
              backdropFilter: "blur(8px)",
              padding: "10px 14px",
              borderRadius: "10px",
              color: "var(--text-muted)",
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent-green)" }}
              />
              <span>Jaw: <span style={{ color: "var(--text-secondary)" }}>{activeJaw === "upper" ? "Upper" : "Lower"}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent-cyan)" }}
              />
              <span>Brackets: <span style={{ color: "var(--accent-cyan)" }}>{placedBracketIds.length}/14</span></span>
            </div>
            {selectedTooth && (
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--accent-blue-light)" }}
                />
                <span>Selected: <span style={{ color: "var(--accent-blue-light)" }}>#{selectedTooth}</span></span>
              </div>
            )}
          </div>

          {/* Notification Toast */}
          {notification && (
            <div
              className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium fade-in"
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                backdropFilter: "blur(12px)",
                color: "var(--accent-green)",
                boxShadow: "0 4px 20px rgba(16, 185, 129, 0.2)",
              }}
            >
              <CheckCircle2 size={13} />
              {notification}
            </div>
          )}

          {/* Segmentation Warning */}
          {!segmentationDone && (
            <div
              className="absolute top-20 right-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "var(--accent-amber)",
                maxWidth: "220px",
              }}
            >
              <AlertTriangle size={12} />
              <span>Run segmentation to enable bracket placement</span>
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <aside
          className="flex flex-col flex-shrink-0 transition-all duration-300"
          style={{
            width: rightCollapsed ? "40px" : "260px",
            background: "var(--bg-panel)",
            borderLeft: "1px solid var(--border-subtle)",
          }}
        >
          {rightCollapsed ? (
            <button
              onClick={() => setRightCollapsed(false)}
              className="flex items-center justify-center h-10 w-full"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <>
              {/* Header */}
              <div
                className="flex items-center justify-between px-3 py-2.5 border-b"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  BRACKET PROPERTIES
                </span>
                <button
                  onClick={() => setRightCollapsed(true)}
                  style={{ color: "var(--text-muted)" }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Properties Content */}
              <div className="flex-1 overflow-y-auto p-3">
                <BracketProperties
                  selectedTooth={selectedTooth}
                  bracketData={selectedBracket}
                  onUpdate={handleUpdateBracket}
                  onRemove={handleRemoveBracket}
                  onPlace={handlePlaceBracket}
                  hasBracket={selectedTooth ? brackets.has(selectedTooth) : false}
                />
              </div>

              {/* Bottom Quick Actions */}
              <div
                className="p-3 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                    onClick={() => {
                      // Place all brackets with default prescription
                      const allTeeth = activeJaw === "upper"
                        ? [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27]
                        : [41, 42, 43, 44, 45, 46, 47, 31, 32, 33, 34, 35, 36, 37];
                      setBrackets((prev) => {
                        const next = new Map(prev);
                        allTeeth.forEach((id) => {
                          if (!next.has(id)) {
                            next.set(id, {
                              toothId: id,
                              torque: 0,
                              angulation: 0,
                              inOut: 0,
                              system: "MBT 0.022\"",
                              position: new THREE.Vector3(0, 0, 0),
                            });
                          }
                        });
                        return next;
                      });
                      showNotification("All brackets placed with MBT prescription");
                    }}
                  >
                    <Zap size={11} />
                    Auto-Place All
                  </button>
                  <button
                    className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                    style={{
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      color: "var(--accent-red)",
                    }}
                    onClick={() => {
                      setBrackets(new Map());
                      showNotification("All brackets cleared");
                    }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
