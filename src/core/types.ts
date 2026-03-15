// src/core/types.ts
import * as THREE from "three";

export interface LandmarkPoint {
  class: string;
  coord: [number, number, number];
  score: number;
  tooth_id?: number;
  toothId?: number;
  label?: number;
  tooth_label?: number;
  segment_label?: number;
}

export interface ToothLandmarks {
  FA_point: THREE.Vector3;
  incisal_edge?: THREE.Vector3;
  mesial_contact?: THREE.Vector3;
  distal_contact?: THREE.Vector3;
}

export interface LocalCoordinateSystem {
  origin: THREE.Vector3;
  xAxis: THREE.Vector3;
  yAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
}

export interface ToothEntity {
  id: number;
  label: string;
  mesh: THREE.Mesh;
  landmarks: ToothLandmarks;
  rawLandmarks: LandmarkPoint[];
  lcs: LocalCoordinateSystem;
  localToWorld: THREE.Matrix4;
  worldToLocal: THREE.Matrix4;
}

export interface ToothExportJSON {
  tooth_id: number;
  label: string;
  landmarks: {
    FA_point: [number, number, number];
    incisal_edge?: [number, number, number];
    mesial_contact?: [number, number, number];
    distal_contact?: [number, number, number];
  };
  local_transformation_matrix: number[][];
  mesh_data: string;
}

/** Per-tooth coordinate frame from the backend (tooth_analysis.py) */
export interface ToothAnalysisData {
  fdi: number;
  name: string;
  vertex_count: number;
  centroid: [number, number, number];
  okluzogingival: [number, number, number];
  mesiodistal: [number, number, number];
  faciolingual: [number, number, number];
  fa_point: [number, number, number];
  facc_vector: [number, number, number];
  bbox_extent: number;
  eigenvalues: [number, number, number];
}

export interface TeethAnalysisResult {
  jaw_type: "upper" | "lower";
  arch_center: [number, number, number];
  teeth: ToothAnalysisData[];
}

export interface SegmentationResult {
  labels: number[];
  landmarks: LandmarkPoint[];
  teeth?: TeethAnalysisResult;
}

export const FDI_LABELS: Record<number, string> = {
  11: "Upper Right Central Incisor",
  12: "Upper Right Lateral Incisor",
  13: "Upper Right Canine",
  14: "Upper Right First Premolar",
  15: "Upper Right Second Premolar",
  16: "Upper Right First Molar",
  17: "Upper Right Second Molar",
  18: "Upper Right Third Molar",
  21: "Upper Left Central Incisor",
  22: "Upper Left Lateral Incisor",
  23: "Upper Left Canine",
  24: "Upper Left First Premolar",
  25: "Upper Left Second Premolar",
  26: "Upper Left First Molar",
  27: "Upper Left Second Molar",
  28: "Upper Left Third Molar",
  31: "Lower Left Central Incisor",
  32: "Lower Left Lateral Incisor",
  33: "Lower Left Canine",
  34: "Lower Left First Premolar",
  35: "Lower Left Second Premolar",
  36: "Lower Left First Molar",
  37: "Lower Left Second Molar",
  38: "Lower Left Third Molar",
  41: "Lower Right Central Incisor",
  42: "Lower Right Lateral Incisor",
  43: "Lower Right Canine",
  44: "Lower Right First Premolar",
  45: "Lower Right Second Premolar",
  46: "Lower Right First Molar",
  47: "Lower Right Second Molar",
  48: "Lower Right Third Molar",
};
