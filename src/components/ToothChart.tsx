"use client";

interface ToothChartProps {
  activeJaw: "upper" | "lower";
  selectedTooth: number | null;
  placedBrackets: number[];
  onToothSelect: (toothId: number) => void;
  onJawChange: (jaw: "upper" | "lower") => void;
}

const UPPER_TEETH = [
  { id: 17, label: "7" }, { id: 16, label: "6" }, { id: 15, label: "5" },
  { id: 14, label: "4" }, { id: 13, label: "3" }, { id: 12, label: "2" },
  { id: 11, label: "1" }, { id: 21, label: "1" }, { id: 22, label: "2" },
  { id: 23, label: "3" }, { id: 24, label: "4" }, { id: 25, label: "5" },
  { id: 26, label: "6" }, { id: 27, label: "7" },
];

const LOWER_TEETH = [
  { id: 47, label: "7" }, { id: 46, label: "6" }, { id: 45, label: "5" },
  { id: 44, label: "4" }, { id: 43, label: "3" }, { id: 42, label: "2" },
  { id: 41, label: "1" }, { id: 31, label: "1" }, { id: 32, label: "2" },
  { id: 33, label: "3" }, { id: 34, label: "4" }, { id: 35, label: "5" },
  { id: 36, label: "6" }, { id: 37, label: "7" },
];

const TOOTH_SHAPES: Record<string, string> = {
  "1": "M4,2 Q6,0 8,2 L9,10 Q6,12 3,10 Z",
  "2": "M3,2 Q6,0 9,2 L10,10 Q6,12 2,10 Z",
  "3": "M4,0 Q6,0 8,2 L7,12 Q6,13 5,12 L4,2 Z",
  "4": "M2,2 Q6,0 10,2 L11,10 Q6,12 1,10 Z",
  "5": "M2,2 Q6,0 10,2 L11,10 Q6,12 1,10 Z",
  "6": "M1,2 Q6,0 11,2 L12,10 Q6,13 0,10 Z",
  "7": "M1,2 Q6,0 11,2 L12,10 Q6,13 0,10 Z",
};

export default function ToothChart({
  activeJaw,
  selectedTooth,
  placedBrackets,
  onToothSelect,
  onJawChange,
}: ToothChartProps) {
  const teeth = activeJaw === "upper" ? UPPER_TEETH : LOWER_TEETH;

  return (
    <div className="flex flex-col gap-3">
      {/* Jaw Toggle */}
      <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          onClick={() => onJawChange("upper")}
          className="flex-1 py-2 text-xs font-semibold transition-all"
          style={{
            background: activeJaw === "upper" ? "var(--accent-blue)" : "var(--bg-card)",
            color: activeJaw === "upper" ? "#fff" : "var(--text-secondary)",
          }}
        >
          UPPER JAW
        </button>
        <button
          onClick={() => onJawChange("lower")}
          className="flex-1 py-2 text-xs font-semibold transition-all"
          style={{
            background: activeJaw === "lower" ? "var(--accent-blue)" : "var(--bg-card)",
            color: activeJaw === "lower" ? "#fff" : "var(--text-secondary)",
          }}
        >
          LOWER JAW
        </button>
      </div>

      {/* FDI Notation Header */}
      <div className="flex justify-between px-1">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {activeJaw === "upper" ? "UR" : "LR"}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {activeJaw === "upper" ? "UL" : "LL"}
        </span>
      </div>

      {/* Tooth Grid */}
      <div className="grid grid-cols-7 gap-1">
        {teeth.slice(0, 7).map((tooth) => (
          <ToothButton
            key={tooth.id}
            tooth={tooth}
            isSelected={selectedTooth === tooth.id}
            hasBracket={placedBrackets.includes(tooth.id)}
            onClick={() => onToothSelect(tooth.id)}
          />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {teeth.slice(7).map((tooth) => (
          <ToothButton
            key={tooth.id}
            tooth={tooth}
            isSelected={selectedTooth === tooth.id}
            hasBracket={placedBrackets.includes(tooth.id)}
            onClick={() => onToothSelect(tooth.id)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1.5 mt-2 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>No bracket</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--accent-blue)", opacity: 0.7 }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--accent-cyan)", opacity: 0.7 }} />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Bracket placed</span>
        </div>
      </div>

      {/* Stats */}
      <div
        className="rounded-lg p-3 mt-1"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
          BRACKET STATUS
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Placed</span>
          <span className="text-sm font-bold" style={{ color: "var(--accent-cyan)" }}>
            {placedBrackets.length} / 14
          </span>
        </div>
        <div className="mt-2 rounded-full overflow-hidden h-1.5" style={{ background: "var(--border-subtle)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(placedBrackets.length / 14) * 100}%`,
              background: "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ToothButton({
  tooth,
  isSelected,
  hasBracket,
  onClick,
}: {
  tooth: { id: number; label: string };
  isSelected: boolean;
  hasBracket: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-0.5 p-1 rounded transition-all duration-150"
      style={{
        background: isSelected
          ? "rgba(37, 99, 235, 0.3)"
          : hasBracket
          ? "rgba(6, 182, 212, 0.15)"
          : "var(--bg-card)",
        border: `1px solid ${
          isSelected
            ? "var(--accent-blue)"
            : hasBracket
            ? "var(--accent-cyan)"
            : "var(--border-subtle)"
        }`,
        boxShadow: isSelected ? "0 0 8px rgba(37, 99, 235, 0.4)" : "none",
      }}
    >
      {/* Tooth SVG */}
      <svg width="20" height="22" viewBox="0 0 14 14">
        <path
          d={TOOTH_SHAPES[tooth.label] || TOOTH_SHAPES["1"]}
          fill={
            isSelected
              ? "rgba(37, 99, 235, 0.25)"
              : hasBracket
              ? "rgba(8, 145, 178, 0.2)"
              : "#f1f5f9"
          }
          stroke={
            isSelected
              ? "var(--accent-blue)"
              : hasBracket
              ? "var(--accent-cyan)"
              : "#94a3b8"
          }
          strokeWidth="0.6"
        />
        {hasBracket && (
          <rect x="4" y="5" width="6" height="3" rx="0.5" fill="rgba(8, 145, 178, 0.7)" />
        )}
      </svg>
      <span
        className="text-xs leading-none"
        style={{
          color: isSelected
            ? "var(--accent-blue-light)"
            : hasBracket
            ? "var(--accent-cyan)"
            : "var(--text-muted)",
          fontSize: "9px",
        }}
      >
        {tooth.id}
      </span>
    </button>
  );
}
