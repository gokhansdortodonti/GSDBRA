"use client";

import { useState } from "react";
import { Settings2, RotateCcw, Trash2, Copy, ChevronDown } from "lucide-react";

interface BracketData {
  toothId: number;
  torque: number;
  angulation: number;
  inOut: number;
  system: string;
}

interface BracketPropertiesProps {
  selectedTooth: number | null;
  bracketData: BracketData | null;
  onUpdate: (data: Partial<BracketData>) => void;
  onRemove: () => void;
  onPlace: () => void;
  hasBracket: boolean;
}

const BRACKET_SYSTEMS = [
  "MBT 0.022\"",
  "Roth 0.022\"",
  "Andrews 0.022\"",
  "MBT 0.018\"",
  "Damon Q",
  "In-Ovation R",
  "Speed System",
];

const TOOTH_PRESCRIPTIONS: Record<number, { torque: number; angulation: number; inOut: number }> = {
  11: { torque: 17, angulation: 5, inOut: 0 },
  12: { torque: 10, angulation: 9, inOut: 0 },
  13: { torque: -7, angulation: 11, inOut: 0 },
  14: { torque: -7, angulation: 2, inOut: 0 },
  15: { torque: -7, angulation: 2, inOut: 0 },
  16: { torque: -14, angulation: 5, inOut: 0 },
  17: { torque: -14, angulation: 5, inOut: 0 },
  21: { torque: 17, angulation: 5, inOut: 0 },
  22: { torque: 10, angulation: 9, inOut: 0 },
  23: { torque: -7, angulation: 11, inOut: 0 },
  24: { torque: -7, angulation: 2, inOut: 0 },
  25: { torque: -7, angulation: 2, inOut: 0 },
  26: { torque: -14, angulation: 5, inOut: 0 },
  27: { torque: -14, angulation: 5, inOut: 0 },
  41: { torque: -1, angulation: 2, inOut: 0 },
  42: { torque: -1, angulation: 2, inOut: 0 },
  43: { torque: -11, angulation: 5, inOut: 0 },
  44: { torque: -17, angulation: 2, inOut: 0 },
  45: { torque: -17, angulation: 2, inOut: 0 },
  46: { torque: -20, angulation: 2, inOut: 0 },
  47: { torque: -10, angulation: 2, inOut: 0 },
  31: { torque: -1, angulation: 2, inOut: 0 },
  32: { torque: -1, angulation: 2, inOut: 0 },
  33: { torque: -11, angulation: 5, inOut: 0 },
  34: { torque: -17, angulation: 2, inOut: 0 },
  35: { torque: -17, angulation: 2, inOut: 0 },
  36: { torque: -20, angulation: 2, inOut: 0 },
  37: { torque: -10, angulation: 2, inOut: 0 },
};

function SliderInput({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
        >
          <span className="text-xs font-mono font-semibold" style={{ color: "var(--accent-cyan)" }}>
            {value > 0 ? `+${value}` : value}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {unit}
          </span>
        </div>
      </div>
      <div className="relative h-4 flex items-center">
        <div
          className="absolute w-full h-1 rounded-full"
          style={{ background: "var(--border-subtle)" }}
        />
        <div
          className="absolute h-1 rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute w-full opacity-0 cursor-pointer h-4"
          style={{ zIndex: 1 }}
        />
        <div
          className="absolute w-3 h-3 rounded-full border-2 transition-all"
          style={{
            left: `calc(${pct}% - 6px)`,
            background: "var(--bg-primary)",
            borderColor: "var(--accent-cyan)",
            boxShadow: "0 0 6px rgba(6, 182, 212, 0.5)",
          }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-xs" style={{ color: "var(--text-muted)", fontSize: "9px" }}>
          {min}{unit}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)", fontSize: "9px" }}>
          {max}{unit}
        </span>
      </div>
    </div>
  );
}

export default function BracketProperties({
  selectedTooth,
  bracketData,
  onUpdate,
  onRemove,
  onPlace,
  hasBracket,
}: BracketPropertiesProps) {
  const [systemOpen, setSystemOpen] = useState(false);
  const prescription = selectedTooth ? TOOTH_PRESCRIPTIONS[selectedTooth] : null;

  if (!selectedTooth) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-8 rounded-lg"
        style={{ background: "var(--bg-secondary)", border: "1px dashed var(--border-subtle)" }}
      >
        <Settings2 size={24} style={{ color: "var(--text-muted)" }} />
        <div className="text-center">
          <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            No Tooth Selected
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Click a tooth in the 3D view or chart
          </div>
        </div>
      </div>
    );
  }

  const toothName = selectedTooth.toString();
  const quadrant = Math.floor(selectedTooth / 10);
  const quadrantNames: Record<number, string> = { 1: "UR", 2: "UL", 3: "LL", 4: "LR" };

  return (
    <div className="flex flex-col gap-3">
      {/* Tooth Header */}
      <div
        className="flex items-center gap-3 p-3 rounded-lg"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
          style={{
            background: hasBracket
              ? "rgba(6, 182, 212, 0.2)"
              : "rgba(37, 99, 235, 0.2)",
            border: `1px solid ${hasBracket ? "var(--accent-cyan)" : "var(--accent-blue)"}`,
            color: hasBracket ? "var(--accent-cyan)" : "var(--accent-blue-light)",
          }}
        >
          {toothName}
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Tooth {toothName}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {quadrantNames[quadrant]} — {hasBracket ? "Bracket Placed" : "No Bracket"}
          </div>
        </div>
        <div
          className="ml-auto w-2 h-2 rounded-full"
          style={{ background: hasBracket ? "var(--accent-green)" : "var(--text-muted)" }}
        />
      </div>

      {/* Bracket System */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          BRACKET SYSTEM
        </span>
        <div className="relative">
          <button
            onClick={() => setSystemOpen(!systemOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all"
            style={{
              background: "var(--bg-card)",
              border: `1px solid ${systemOpen ? "var(--accent-blue)" : "var(--border-subtle)"}`,
              color: "var(--text-primary)",
            }}
          >
            <span>{bracketData?.system || "MBT 0.022\""}</span>
            <ChevronDown
              size={12}
              style={{
                color: "var(--text-muted)",
                transform: systemOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
          </button>
          {systemOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {BRACKET_SYSTEMS.map((sys) => (
                <button
                  key={sys}
                  onClick={() => {
                    onUpdate({ system: sys });
                    setSystemOpen(false);
                  }}
                  className="w-full px-3 py-2 text-xs text-left transition-all"
                  style={{
                    color:
                      (bracketData?.system || "MBT 0.022\"") === sys
                        ? "var(--accent-cyan)"
                        : "var(--text-secondary)",
                    background:
                      (bracketData?.system || "MBT 0.022\"") === sys
                        ? "rgba(6, 182, 212, 0.1)"
                        : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = "var(--bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background =
                      (bracketData?.system || "MBT 0.022\"") === sys
                        ? "rgba(6, 182, 212, 0.1)"
                        : "transparent";
                  }}
                >
                  {sys}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Prescription Values */}
      {prescription && (
        <div
          className="p-2.5 rounded-lg"
          style={{ background: "rgba(37, 99, 235, 0.08)", border: "1px solid rgba(37, 99, 235, 0.2)" }}
        >
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--accent-blue-light)" }}>
            MBT PRESCRIPTION
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Torque", value: prescription.torque, unit: "°" },
              { label: "Angulation", value: prescription.angulation, unit: "°" },
              { label: "In/Out", value: prescription.inOut, unit: "mm" },
            ].map((p) => (
              <div key={p.label} className="text-center">
                <div className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                  {p.value > 0 ? `+${p.value}` : p.value}{p.unit}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)", fontSize: "9px" }}>
                  {p.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustments */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          FINE ADJUSTMENTS
        </span>
        <SliderInput
          label="Torque"
          value={bracketData?.torque ?? prescription?.torque ?? 0}
          min={-30}
          max={30}
          unit="°"
          onChange={(v) => onUpdate({ torque: v })}
        />
        <SliderInput
          label="Angulation"
          value={bracketData?.angulation ?? prescription?.angulation ?? 0}
          min={-15}
          max={15}
          unit="°"
          onChange={(v) => onUpdate({ angulation: v })}
        />
        <SliderInput
          label="In/Out"
          value={bracketData?.inOut ?? 0}
          min={-3}
          max={3}
          unit="mm"
          onChange={(v) => onUpdate({ inOut: v })}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {!hasBracket ? (
          <button
            onClick={onPlace}
            className="w-full py-2.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, var(--accent-blue), #1d4ed8)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
            }}
          >
            Place Bracket
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (prescription) onUpdate({ ...prescription });
              }}
              className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <RotateCcw size={11} />
              Reset
            </button>
            <button
              className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <Copy size={11} />
              Copy
            </button>
            <button
              onClick={onRemove}
              className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--accent-red)",
              }}
            >
              <Trash2 size={11} />
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
