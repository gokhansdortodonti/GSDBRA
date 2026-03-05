// src/core/ToothSegmenter.ts
import * as THREE from "three";
import type {
  ToothEntity,
  ToothLandmarks,
  LandmarkPoint,
  SegmentationResult,
} from "./types";
import { FDI_LABELS } from "./types";
import { computeToothLCS, buildTransformationMatrix, buildInverseMatrix } from "./LocalCoordinateSystem";

// Per-tooth color palette
const TOOTH_PALETTE: number[] = [
  0xe63946, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x457b9d,
  0x6a4c93, 0x1982c4, 0xff595e, 0xffca3a, 0x8ac926,
  0xff924c, 0x52b788, 0x4361ee, 0xf72585, 0x7209b7,
  0x3a86ff, 0x06d6a0, 0xef233c, 0xfca311, 0x9b2226,
];

/**
 * Segment a mesh into individual tooth entities based on vertex labels
 */
export function segmentTeeth(
  geometry: THREE.BufferGeometry,
  segmentation: SegmentationResult,
  jaw: "maxilla" | "mandible"
): Map<number, ToothEntity> {
  const teeth = new Map<number, ToothEntity>();
  const labels = segmentation.labels;
  const landmarks = segmentation.landmarks;

  // Find unique tooth labels (exclude 0 = background)
  const uniqueLabels = Array.from(new Set(labels)).filter((l) => l > 0);

  // Group landmarks by tooth ID
  const landmarksByTooth = groupLandmarksByTooth(landmarks);

  // Create a mesh for each tooth
  uniqueLabels.forEach((toothId, index) => {
    const toothGeometry = extractToothGeometry(geometry, labels, toothId);

    if (!toothGeometry) {
      console.warn(`Failed to extract geometry for tooth ${toothId}`);
      return;
    }

    // Create mesh with color
    const color = TOOTH_PALETTE[index % TOOTH_PALETTE.length];
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.3,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(toothGeometry, material);

    // Get landmarks for this tooth
    const toothLandmarks = landmarksByTooth.get(toothId) || [];

    // Find FA point
    const faLandmark = toothLandmarks.find((l) => l.class === "FacialPoint");
    if (!faLandmark) {
      console.warn(`No FA point found for tooth ${toothId}`);
      return;
    }

    const faPoint = new THREE.Vector3(
      faLandmark.coord[0],
      faLandmark.coord[1],
      faLandmark.coord[2]
    );

    // Build landmarks object
    const landmarks: ToothLandmarks = {
      FA_point: faPoint,
    };

    // Add other landmarks
    toothLandmarks.forEach((l) => {
      const point = new THREE.Vector3(l.coord[0], l.coord[1], l.coord[2]);
      if (l.class === "Cusp" || l.class === "IncisalEdge") {
        landmarks.incisal_edge = point;
      } else if (l.class === "Mesial") {
        landmarks.mesial_contact = point;
      } else if (l.class === "Distal") {
        landmarks.distal_contact = point;
      }
    });

    // Compute LCS
    const lcs = computeToothLCS(mesh, faPoint);

    // Build transformation matrices
    const localToWorld = buildTransformationMatrix(lcs);
    const worldToLocal = buildInverseMatrix(lcs);

    // Create ToothEntity
    const entity: ToothEntity = {
      id: toothId,
      label: FDI_LABELS[toothId] || `Tooth ${toothId}`,
      mesh,
      landmarks,
      lcs,
      localToWorld,
      worldToLocal,
    };

    teeth.set(toothId, entity);
  });

  return teeth;
}

/**
 * Extract geometry for a single tooth from the full mesh
 */
function extractToothGeometry(
  fullGeometry: THREE.BufferGeometry,
  labels: number[],
  toothId: number
): THREE.BufferGeometry | null {
  const position = fullGeometry.getAttribute("position");
  const normal = fullGeometry.getAttribute("normal");

  if (!position) return null;

  // Check if geometry is indexed
  const indices = fullGeometry.getIndex();
  const triangleCount = indices ? indices.count / 3 : position.count / 3;

  // Collect faces where all three vertices belong to this tooth
  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newIndices: number[] = [];

  let vertexOffset = 0;

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

    // Check if all three vertices belong to this tooth
    if (
      labels[i0] === toothId &&
      labels[i1] === toothId &&
      labels[i2] === toothId
    ) {
      // Add vertices
      newPositions.push(
        position.getX(i0), position.getY(i0), position.getZ(i0),
        position.getX(i1), position.getY(i1), position.getZ(i1),
        position.getX(i2), position.getY(i2), position.getZ(i2)
      );

      // Add normals if available
      if (normal) {
        newNormals.push(
          normal.getX(i0), normal.getY(i0), normal.getZ(i0),
          normal.getX(i1), normal.getY(i1), normal.getZ(i1),
          normal.getX(i2), normal.getY(i2), normal.getZ(i2)
        );
      }

      // Add indices for this triangle
      newIndices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
      vertexOffset += 3;
    }
  }

  if (newPositions.length === 0) return null;

  // Create new geometry
  const newGeometry = new THREE.BufferGeometry();
  newGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(newPositions, 3)
  );

  if (newNormals.length > 0) {
    newGeometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(newNormals, 3)
    );
  } else {
    newGeometry.computeVertexNormals();
  }

  newGeometry.setIndex(newIndices);

  return newGeometry;
}

/**
 * Group landmarks by tooth ID
 */
function groupLandmarksByTooth(
  landmarks: LandmarkPoint[]
): Map<number, LandmarkPoint[]> {
  const grouped = new Map<number, LandmarkPoint[]>();

  landmarks.forEach((landmark) => {
    // Assuming landmark has a tooth_id field or we need to match by proximity
    // For now, we'll need to add tooth_id to the LandmarkPoint type
    // This is a placeholder - actual implementation depends on API response format
    const toothId = (landmark as any).tooth_id;
    if (toothId) {
      if (!grouped.has(toothId)) {
        grouped.set(toothId, []);
      }
      grouped.get(toothId)!.push(landmark);
    }
  });

  return grouped;
}

/**
 * Create a Three.js Group containing all tooth meshes
 */
export function createToothGroup(teeth: Map<number, ToothEntity>): THREE.Group {
  const group = new THREE.Group();
  group.name = "teeth";

  teeth.forEach((tooth) => {
    tooth.mesh.name = `tooth_${tooth.id}`;
    group.add(tooth.mesh);
  });

  return group;
}
