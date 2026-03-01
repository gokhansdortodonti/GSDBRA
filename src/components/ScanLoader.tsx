"use client";

import { useRef, useState } from "react";
import { Upload, X, CheckCircle2, Layers, AlertCircle } from "lucide-react";

export interface ScanFile {
  file: File;
  jaw: "maxilla" | "mandible" | "combined";
  name: string;
  size: string;
}

interface ScanLoaderProps {
  maxillaFile: ScanFile | null;
  mandibleFile: ScanFile | null;
  onFileLoaded: (scan: ScanFile) => void;
  onFileRemoved: (jaw: "maxilla" | "mandible") => void;
  onProceed: () => void;
}

const ACCEPT = ".stl,.obj,.ply";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Single jaw drop zone ─────────────────────────────────────────────────────
function JawDropZone({
  jaw,
  label,
  sublabel,
  color,
  file,
  onFile,
  onRemove,
}: {
  jaw: "maxilla" | "mandible";
  label: string;
  sublabel: string;
  color: string;
  file: ScanFile | null;
  onFile: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (f: File): boolean => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["stl", "obj", "ply"].includes(ext ?? "")) {
      setError("Only STL, OBJ, PLY files are supported");
      return false;
    }
    setError(null);
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && validate(f)) onFile(f);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validate(f)) onFile(f);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Label */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ background: color }}
        />
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {sublabel}
        </span>
      </div>

      {/* Drop zone or loaded file */}
      {file ? (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            background: "rgba(16, 185, 129, 0.06)",
            border: "1.5px solid rgba(16, 185, 129, 0.35)",
          }}
        >
          <CheckCircle2 size={18} style={{ color: "#10b981", flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div
              className="text-sm font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {file.name}
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {file.size}
            </div>
          </div>
          <button
            onClick={onRemove}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-50 transition-colors"
            style={{ color: "#94a3b8" }}
            title="Remove"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          className="relative flex flex-col items-center justify-center gap-2 rounded-xl transition-all"
          style={{
            height: "120px",
            border: `2px dashed ${dragOver ? color : "#cbd5e1"}`,
            background: dragOver ? `${color}12` : "var(--bg-secondary)",
            cursor: "pointer",
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: `${color}18` }}
          >
            <Upload size={18} style={{ color }} />
          </div>
          <div className="text-center">
            <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Drop file or click to browse
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              STL · OBJ · PLY
            </div>
          </div>
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#ef4444" }}>
          <AlertCircle size={11} />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

// ─── Main ScanLoader ──────────────────────────────────────────────────────────
export default function ScanLoader({
  maxillaFile,
  mandibleFile,
  onFileLoaded,
  onFileRemoved,
  onProceed,
}: ScanLoaderProps) {
  const [mode, setMode] = useState<"separate" | "combined">("separate");
  const combinedInputRef = useRef<HTMLInputElement>(null);
  const [combinedDragOver, setCombinedDragOver] = useState(false);
  const [combinedError, setCombinedError] = useState<string | null>(null);

  const canProceed =
    mode === "separate"
      ? maxillaFile !== null || mandibleFile !== null
      : maxillaFile !== null; // combined stored as maxilla

  const handleCombinedFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["stl", "obj", "ply"].includes(ext ?? "")) {
      setCombinedError("Only STL, OBJ, PLY files are supported");
      return;
    }
    setCombinedError(null);
    onFileLoaded({
      file: f,
      jaw: "combined",
      name: f.name,
      size: formatSize(f.size),
    });
  };

  const handleSeparateFile = (jaw: "maxilla" | "mandible", f: File) => {
    onFileLoaded({
      file: f,
      jaw,
      name: f.name,
      size: formatSize(f.size),
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-lg mx-auto w-full">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #2563eb, #0891b2)",
            boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
          }}
        >
          <Layers size={18} color="#fff" />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            Load Dental Scan
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Import intraoral 3D scan files (STL · OBJ · PLY)
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div
        className="flex rounded-xl p-1 gap-1"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
      >
        {(["separate", "combined"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: mode === m ? "#2563eb" : "transparent",
              color: mode === m ? "#fff" : "var(--text-muted)",
              boxShadow: mode === m ? "0 2px 8px rgba(37,99,235,0.25)" : "none",
            }}
          >
            {m === "separate" ? "Separate Jaws" : "Combined Scan"}
          </button>
        ))}
      </div>

      {/* Separate mode */}
      {mode === "separate" && (
        <div className="flex flex-col gap-5">
          <JawDropZone
            jaw="maxilla"
            label="Maxilla"
            sublabel="Upper jaw"
            color="#f59e0b"
            file={maxillaFile}
            onFile={(f) => handleSeparateFile("maxilla", f)}
            onRemove={() => onFileRemoved("maxilla")}
          />
          <div
            className="h-px"
            style={{ background: "var(--border-subtle)" }}
          />
          <JawDropZone
            jaw="mandible"
            label="Mandible"
            sublabel="Lower jaw"
            color="#2563eb"
            file={mandibleFile}
            onFile={(f) => handleSeparateFile("mandible", f)}
            onRemove={() => onFileRemoved("mandible")}
          />
        </div>
      )}

      {/* Combined mode */}
      {mode === "combined" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: "#8b5cf6" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Full Arch Scan
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Both jaws in one file
            </span>
          </div>

          {maxillaFile && maxillaFile.jaw === "combined" ? (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: "rgba(16, 185, 129, 0.06)",
                border: "1.5px solid rgba(16, 185, 129, 0.35)",
              }}
            >
              <CheckCircle2 size={18} style={{ color: "#10b981", flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {maxillaFile.name}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {maxillaFile.size}
                </div>
              </div>
              <button
                onClick={() => onFileRemoved("maxilla")}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-50 transition-colors"
                style={{ color: "#94a3b8" }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              className="flex flex-col items-center justify-center gap-2 rounded-xl transition-all"
              style={{
                height: "140px",
                border: `2px dashed ${combinedDragOver ? "#8b5cf6" : "#cbd5e1"}`,
                background: combinedDragOver ? "#8b5cf618" : "var(--bg-secondary)",
                cursor: "pointer",
              }}
              onClick={() => combinedInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setCombinedDragOver(true); }}
              onDragLeave={() => setCombinedDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setCombinedDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleCombinedFile(f);
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "#8b5cf618" }}
              >
                <Upload size={20} style={{ color: "#8b5cf6" }} />
              </div>
              <div className="text-center">
                <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Drop combined scan or click to browse
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  STL · OBJ · PLY
                </div>
              </div>
            </button>
          )}

          {combinedError && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#ef4444" }}>
              <AlertCircle size={11} />
              {combinedError}
            </div>
          )}

          <input
            ref={combinedInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCombinedFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Info note */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
        style={{
          background: "rgba(37, 99, 235, 0.05)",
          border: "1px solid rgba(37, 99, 235, 0.15)",
          color: "var(--text-muted)",
        }}
      >
        <span style={{ color: "#2563eb", flexShrink: 0 }}>ℹ</span>
        <span>
          Intraoral scanner exports (iTero, 3Shape, Carestream) are supported.
          Files are processed locally — no data is uploaded.
        </span>
      </div>

      {/* Proceed button */}
      <button
        onClick={onProceed}
        disabled={!canProceed}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
        style={{
          background: canProceed
            ? "linear-gradient(135deg, #2563eb, #0891b2)"
            : "var(--bg-card)",
          color: canProceed ? "#fff" : "var(--text-muted)",
          border: `1px solid ${canProceed ? "transparent" : "var(--border-subtle)"}`,
          cursor: canProceed ? "pointer" : "not-allowed",
          boxShadow: canProceed ? "0 4px 16px rgba(37,99,235,0.3)" : "none",
        }}
      >
        Continue to Occlusal Alignment →
      </button>
    </div>
  );
}
