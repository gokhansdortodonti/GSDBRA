// src/utils/toothExport.ts
import * as THREE from "three";
import type { ToothEntity, ToothExportJSON } from "../core/types";
import { matrixToArray } from "../core/LocalCoordinateSystem";

/**
 * Export single tooth to JSON format
 */
export function exportToothToJSON(tooth: ToothEntity): ToothExportJSON {
  // Convert landmarks to tuples
  const landmarks: ToothExportJSON["landmarks"] = {
    FA_point: [tooth.landmarks.FA_point.x, tooth.landmarks.FA_point.y, tooth.landmarks.FA_point.z],
  };

  if (tooth.landmarks.incisal_edge) {
    landmarks.incisal_edge = [
      tooth.landmarks.incisal_edge.x,
      tooth.landmarks.incisal_edge.y,
      tooth.landmarks.incisal_edge.z,
    ];
  }

  if (tooth.landmarks.mesial_contact) {
    landmarks.mesial_contact = [
      tooth.landmarks.mesial_contact.x,
      tooth.landmarks.mesial_contact.y,
      tooth.landmarks.mesial_contact.z,
    ];
  }

  if (tooth.landmarks.distal_contact) {
    landmarks.distal_contact = [
      tooth.landmarks.distal_contact.x,
      tooth.landmarks.distal_contact.y,
      tooth.landmarks.distal_contact.z,
    ];
  }

  // Get transformation matrix as 2D array
  const local_transformation_matrix = matrixToArray(tooth.localToWorld);

  // Serialize mesh to base64 (STL format)
  const mesh_data = geometryToBase64(tooth.mesh.geometry);

  return {
    tooth_id: tooth.id,
    label: tooth.label,
    landmarks,
    angles: tooth.angles,
    local_transformation_matrix,
    mesh_data,
  };
}

/**
 * Export all teeth to JSON array
 */
export function exportAllTeethToJSON(teeth: Map<number, ToothEntity>): ToothExportJSON[] {
  const result: ToothExportJSON[] = [];
  teeth.forEach((tooth) => {
    result.push(exportToothToJSON(tooth));
  });

  // Sort by tooth ID
  result.sort((a, b) => a.tooth_id - b.tooth_id);

  return result;
}

/**
 * Convert BufferGeometry to base64-encoded STL
 */
function geometryToBase64(geometry: THREE.BufferGeometry): string {
  const stlData = generateSTL(geometry);
  return btoa(stlData);
}

/**
 * Generate ASCII STL from geometry
 */
function generateSTL(geometry: THREE.BufferGeometry): string {
  let stl = "solid tooth\n";

  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");

  if (!position) return stl + "endsolid tooth\n";

  const indices = geometry.getIndex();
  const triangleCount = indices ? indices.count / 3 : position.count / 3;

  for (let i = 0; i < triangleCount; i++) {
    let i0: number, i1: number, i2: number;

    if (indices) {
      i0 = indices.getX(i * 3);
      i1 = indices.getX(i * 3 + 1);
      i2 = indices.getX(i * 3 + 2);
    } else {
      i0 = i * 3;
      i1 = i * 3 + 1;
      i2 = i * 3 + 2;
    }

    // Get face normal
    let nx = 0, ny = 0, nz = 1;
    if (normal) {
      // Compute face normal as average of vertex normals
      nx = (normal.getX(i0) + normal.getX(i1) + normal.getX(i2)) / 3;
      ny = (normal.getY(i0) + normal.getY(i1) + normal.getY(i2)) / 3;
      nz = (normal.getZ(i0) + normal.getZ(i1) + normal.getZ(i2)) / 3;
    }

    stl += `  facet normal ${nx} ${ny} ${nz}\n`;
    stl += "    outer loop\n";
    stl += `      vertex ${position.getX(i0)} ${position.getY(i0)} ${position.getZ(i0)}\n`;
    stl += `      vertex ${position.getX(i1)} ${position.getY(i1)} ${position.getZ(i1)}\n`;
    stl += `      vertex ${position.getX(i2)} ${position.getY(i2)} ${position.getZ(i2)}\n`;
    stl += "    endloop\n";
    stl += "  endfacet\n";
  }

  stl += "endsolid tooth\n";
  return stl;
}

/**
 * Download teeth data as JSON file
 */
export function downloadTeethJSON(teeth: Map<number, ToothEntity>, filename: string = "teeth_export.json"): void {
  const data = exportAllTeethToJSON(teeth);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
