import * as THREE from "three";
import type {
  LandmarkPoint,
  SegmentationResult,
  ToothEntity,
  ToothLandmarks,
  ToothAnalysisData,
} from "./types";
import { FDI_LABELS } from "./types";
import {
  buildInverseMatrix,
  buildTransformationMatrix,
  computeToothLCS,
} from "./LocalCoordinateSystem";

const TOOTH_PALETTE: number[] = [
  0xe63946, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x457b9d, 0x6a4c93, 0x1982c4,
  0xff595e, 0xffca3a, 0x8ac926, 0xff924c, 0x52b788, 0x4361ee, 0xf72585,
  0x7209b7, 0x3a86ff, 0x06d6a0, 0xef233c, 0xfca311, 0x9b2226,
];

const VALID_FDI_IDS = {
  maxilla: new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
  ]),
  mandible: new Set([
    31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
  ]),
} as const;

const RIGHT_FDI_SEQUENCE = {
  maxilla: [11, 12, 13, 14, 15, 16, 17, 18],
  mandible: [41, 42, 43, 44, 45, 46, 47, 48],
} as const;

const LEFT_FDI_SEQUENCE = {
  maxilla: [21, 22, 23, 24, 25, 26, 27, 28],
  mandible: [31, 32, 33, 34, 35, 36, 37, 38],
} as const;

type LabelMode = "vertex" | "face" | "corner";

interface TriangleLabelReader {
  mode: LabelMode;
  triangleCount: number;
  getLabel: (
    triangleIndex: number,
    i0: number,
    i1: number,
    i2: number,
  ) => number;
}

interface ToothSegmentCandidate {
  segmentLabel: number;
  fdiId: number;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  rawCenter: THREE.Vector3;
  alignedCenter: THREE.Vector3;
  bbox: THREE.Box3;
  landmarks: LandmarkPoint[];
}

export function segmentTeeth(
  sourceMesh: THREE.Mesh,
  segmentation: SegmentationResult,
  jaw: "maxilla" | "mandible",
): Map<number, ToothEntity> {
  const geometry = sourceMesh.geometry;
  const position = geometry.getAttribute("position");

  if (!position) {
    console.warn("[Seg] Geometry has no position attribute");
    return new Map();
  }

  sourceMesh.updateMatrixWorld(true);

  const labelReader = createTriangleLabelReader(
    geometry,
    segmentation.labels,
    jaw,
  );
  if (!labelReader) {
    return new Map();
  }

  const uniqueLabels = collectPositiveLabels(segmentation.labels);
  const scaledLandmarks = scaleLandmarks(
    segmentation.landmarks,
    getSourceUniformScale(sourceMesh),
  );

  const candidates = uniqueLabels.reduce<ToothSegmentCandidate[]>(
    (acc, segmentLabel, index) => {
      const toothGeometry = extractGeometryByPredicate(
        geometry,
        labelReader,
        (label) => label === segmentLabel,
      );

      if (!toothGeometry) {
        console.warn(
          `[Seg] Failed to extract geometry for label ${segmentLabel}`,
        );
        return acc;
      }

      const material = new THREE.MeshPhysicalMaterial({
        color: TOOTH_PALETTE[index % TOOTH_PALETTE.length],
        roughness: 0.3,
        metalness: 0.1,
        side: THREE.DoubleSide,
        clearcoat: 0.35,
        clearcoatRoughness: 0.22,
      });

      const mesh = new THREE.Mesh(toothGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const bbox = new THREE.Box3().setFromBufferAttribute(
        toothGeometry.getAttribute("position") as THREE.BufferAttribute,
      );
      const rawCenter = bbox.getCenter(new THREE.Vector3());
      const alignedCenter = rawCenter
        .clone()
        .applyMatrix4(sourceMesh.matrixWorld);

      acc.push({
        segmentLabel,
        fdiId: segmentLabel,
        mesh,
        rawCenter,
        alignedCenter,
        bbox,
        landmarks: [],
      });

      return acc;
    },
    [],
  );

  if (candidates.length === 0) {
    return new Map();
  }

  assignFDIIds(candidates, jaw);
  assignLandmarksToCandidates(candidates, scaledLandmarks);

  const teeth = new Map<number, ToothEntity>();

  // Build a lookup from FDI → API-provided tooth analysis data
  const apiTeethMap = new Map<number, ToothAnalysisData>();
  if (segmentation.teeth?.teeth) {
    for (const t of segmentation.teeth.teeth) {
      apiTeethMap.set(t.fdi, t);
    }
  }

  const uniformScale = getSourceUniformScale(sourceMesh);

  candidates
    .sort((a, b) => a.fdiId - b.fdiId)
    .forEach((candidate) => {
      const { landmarks, rawLandmarks } = buildCanonicalLandmarks(
        candidate,
        sourceMesh.matrixWorld,
      );

      // Use API-provided anatomical axes if available, otherwise fallback to PCA
      const apiTooth = apiTeethMap.get(candidate.fdiId);
      let lcs: import("./types").LocalCoordinateSystem;

      if (apiTooth) {
        // API provides axes in the aligned coordinate space used during inference.
        // Scale coordinates to match the mesh's local space.
        const s = uniformScale;
        const origin = new THREE.Vector3(
          apiTooth.fa_point[0] * s,
          apiTooth.fa_point[1] * s,
          apiTooth.fa_point[2] * s,
        );

        // Anatomical axis mapping:
        //   X = Mesiodistal (red)
        //   Y = Okluzogingival (green) — crown long axis
        //   Z = Faciolingual (blue) — buccal outward
        lcs = {
          origin,
          xAxis: new THREE.Vector3(...apiTooth.mesiodistal),
          yAxis: new THREE.Vector3(...apiTooth.okluzogingival),
          zAxis: new THREE.Vector3(...apiTooth.faciolingual),
        };

        // Override FA point in BOTH landmarks and rawLandmarks
        landmarks.FA_point = origin.clone();

        // Update rawLandmarks array too — this is what renders the spheres
        const faRaw = rawLandmarks.find(
          (lm) => lm.class === "FacialPoint" || lm.class === "FA_point",
        );
        if (faRaw) {
          faRaw.coord = [origin.x, origin.y, origin.z];
        }

        console.log(
          `[Seg] FDI ${candidate.fdiId}: using API axes (${apiTooth.name}), FA=[${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}, ${origin.z.toFixed(1)}]`,
        );
      } else {
        lcs = computeToothLCS(candidate.mesh, landmarks.FA_point);
      }

      const localToWorld = buildTransformationMatrix(lcs);
      const worldToLocal = buildInverseMatrix(lcs);

      teeth.set(candidate.fdiId, {
        id: candidate.fdiId,
        label: FDI_LABELS[candidate.fdiId] || `${jaw} Tooth ${candidate.fdiId}`,
        mesh: candidate.mesh,
        landmarks,
        rawLandmarks,
        lcs,
        localToWorld,
        worldToLocal,
      });
    });

  // Visually separate crowns from the gumline
  applyCrownSeparation(teeth, geometry);

  return teeth;
}

export function extractJawBaseMesh(
  sourceMesh: THREE.Mesh,
  segmentation: SegmentationResult,
  jaw: "maxilla" | "mandible",
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null {
  const labelReader = createTriangleLabelReader(
    sourceMesh.geometry,
    segmentation.labels,
    jaw,
  );

  if (!labelReader) {
    return createJawReferenceMesh(sourceMesh, jaw);
  }

  const baseGeometry = extractGeometryByPredicate(
    sourceMesh.geometry,
    labelReader,
    (label) => label <= 0,
  );

  if (!baseGeometry) {
    return createJawReferenceMesh(sourceMesh, jaw);
  }

  return createJawDisplayMesh(baseGeometry, jaw, "base");
}

function createTriangleLabelReader(
  geometry: THREE.BufferGeometry,
  labels: number[],
  jaw: "maxilla" | "mandible",
): TriangleLabelReader | null {
  const position = geometry.getAttribute("position");
  if (!position) {
    return null;
  }

  const indices = geometry.getIndex();
  const triangleCount = indices ? indices.count / 3 : position.count / 3;

  if (labels.length === triangleCount) {
    return {
      mode: "face",
      triangleCount,
      getLabel: (triangleIndex) => sanitizeLabel(labels[triangleIndex]),
    };
  }

  if (indices && labels.length === indices.count) {
    return {
      mode: "corner",
      triangleCount,
      getLabel: (triangleIndex) =>
        dominantLabel([
          labels[triangleIndex * 3],
          labels[triangleIndex * 3 + 1],
          labels[triangleIndex * 3 + 2],
        ]),
    };
  }

  if (labels.length === position.count) {
    return {
      mode: "vertex",
      triangleCount,
      getLabel: (_triangleIndex, i0, i1, i2) =>
        dominantLabel([labels[i0], labels[i1], labels[i2]]),
    };
  }

  console.warn(
    `[Seg] ${jaw}: unsupported label count ${labels.length}; expected ${triangleCount} faces, ${position.count} vertices${indices ? ` or ${indices.count} corners` : ""}`,
  );

  if (labels.length === 0) {
    return null;
  }

  return {
    mode: "vertex",
    triangleCount,
    getLabel: (_triangleIndex, i0, i1, i2) =>
      dominantLabel([labels[i0], labels[i1], labels[i2]]),
  };
}

function sanitizeLabel(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dominantLabel(values: Array<number | undefined>): number {
  const counts = new Map<number, number>();

  values.forEach((value) => {
    const label = sanitizeLabel(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  let bestLabel = 0;
  let bestCount = -1;

  counts.forEach((count, label) => {
    if (count > bestCount || (count === bestCount && label > bestLabel)) {
      bestLabel = label;
      bestCount = count;
    }
  });

  return bestLabel;
}

function collectPositiveLabels(labels: number[]): number[] {
  return Array.from(
    new Set(
      labels.map((label) => sanitizeLabel(label)).filter((label) => label > 0),
    ),
  ).sort((a, b) => a - b);
}

function getSourceUniformScale(sourceMesh: THREE.Mesh): number {
  const importScale =
    typeof sourceMesh.userData.importScale === "number" &&
    Number.isFinite(sourceMesh.userData.importScale)
      ? sourceMesh.userData.importScale
      : 1;

  const meshScale = Number.isFinite(sourceMesh.scale.x)
    ? sourceMesh.scale.x
    : 1;
  return importScale * meshScale;
}

function scaleLandmarks(
  landmarks: LandmarkPoint[],
  uniformScale: number,
): LandmarkPoint[] {
  if (Math.abs(uniformScale - 1) < 1e-6) {
    return landmarks.map((landmark) => ({
      ...landmark,
      coord: [...landmark.coord] as [number, number, number],
    }));
  }

  return landmarks.map((landmark) => ({
    ...landmark,
    coord: [
      landmark.coord[0] * uniformScale,
      landmark.coord[1] * uniformScale,
      landmark.coord[2] * uniformScale,
    ],
  }));
}

function extractGeometryByPredicate(
  fullGeometry: THREE.BufferGeometry,
  labelReader: TriangleLabelReader,
  predicate: (label: number) => boolean,
): THREE.BufferGeometry | null {
  const position = fullGeometry.getAttribute("position");
  const normal = fullGeometry.getAttribute("normal");

  if (!position) {
    return null;
  }

  const indices = fullGeometry.getIndex();

  const newPositions: number[] = [];
  const newNormals: number[] = [];
  const newIndices: number[] = [];

  let vertexOffset = 0;

  for (
    let triangleIndex = 0;
    triangleIndex < labelReader.triangleCount;
    triangleIndex++
  ) {
    const i0 = indices ? indices.getX(triangleIndex * 3) : triangleIndex * 3;
    const i1 = indices
      ? indices.getX(triangleIndex * 3 + 1)
      : triangleIndex * 3 + 1;
    const i2 = indices
      ? indices.getX(triangleIndex * 3 + 2)
      : triangleIndex * 3 + 2;

    const triangleLabel = labelReader.getLabel(triangleIndex, i0, i1, i2);
    if (!predicate(triangleLabel)) {
      continue;
    }

    newPositions.push(
      position.getX(i0),
      position.getY(i0),
      position.getZ(i0),
      position.getX(i1),
      position.getY(i1),
      position.getZ(i1),
      position.getX(i2),
      position.getY(i2),
      position.getZ(i2),
    );

    if (normal) {
      newNormals.push(
        normal.getX(i0),
        normal.getY(i0),
        normal.getZ(i0),
        normal.getX(i1),
        normal.getY(i1),
        normal.getZ(i1),
        normal.getX(i2),
        normal.getY(i2),
        normal.getZ(i2),
      );
    }

    newIndices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
    vertexOffset += 3;
  }

  if (newPositions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(newPositions, 3),
  );

  if (newNormals.length > 0) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(newNormals, 3),
    );
  } else {
    geometry.computeVertexNormals();
  }

  geometry.setIndex(newIndices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function createJawDisplayMesh(
  geometry: THREE.BufferGeometry,
  jaw: "maxilla" | "mandible",
  kind: "base" | "reference",
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> {
  const material = new THREE.MeshPhysicalMaterial({
    color: jaw === "maxilla" ? 0xe7dccd : 0xd8e3ec,
    roughness: kind === "base" ? 0.85 : 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: kind === "base" ? 0.35 : 0.16,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = kind === "base" ? `jaw_base_${jaw}` : `jaw_reference_${jaw}`;
  mesh.renderOrder = kind === "base" ? -1 : -2;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function createJawReferenceMesh(
  sourceMesh: THREE.Mesh,
  jaw: "maxilla" | "mandible",
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial> {
  return createJawDisplayMesh(sourceMesh.geometry, jaw, "reference");
}

function assignFDIIds(
  candidates: ToothSegmentCandidate[],
  jaw: "maxilla" | "mandible",
): void {
  const allLabelsAreFDI = candidates.every((candidate) =>
    VALID_FDI_IDS[jaw].has(candidate.segmentLabel),
  );

  if (allLabelsAreFDI) {
    candidates.forEach((candidate) => {
      candidate.fdiId = candidate.segmentLabel;
    });
    return;
  }

  const rightSide = candidates
    .filter((candidate) => candidate.alignedCenter.x >= 0)
    .sort(sortCandidatesForFDI);
  const leftSide = candidates
    .filter((candidate) => candidate.alignedCenter.x < 0)
    .sort(sortCandidatesForFDI);

  rightSide.forEach((candidate, index) => {
    candidate.fdiId = RIGHT_FDI_SEQUENCE[jaw][index] ?? candidate.segmentLabel;
  });

  leftSide.forEach((candidate, index) => {
    candidate.fdiId = LEFT_FDI_SEQUENCE[jaw][index] ?? candidate.segmentLabel;
  });
}

function sortCandidatesForFDI(
  a: ToothSegmentCandidate,
  b: ToothSegmentCandidate,
): number {
  if (Math.abs(a.alignedCenter.z - b.alignedCenter.z) > 0.001) {
    return b.alignedCenter.z - a.alignedCenter.z;
  }

  return Math.abs(a.alignedCenter.x) - Math.abs(b.alignedCenter.x);
}

function assignLandmarksToCandidates(
  candidates: ToothSegmentCandidate[],
  landmarks: LandmarkPoint[],
): void {
  candidates.forEach((candidate) => {
    candidate.landmarks = [];
  });

  landmarks.forEach((landmark) => {
    const point = new THREE.Vector3(...landmark.coord);
    const explicitToothId = getLandmarkToothId(landmark);

    let target =
      explicitToothId !== undefined
        ? candidates.find(
            (candidate) =>
              candidate.segmentLabel === explicitToothId ||
              candidate.fdiId === explicitToothId,
          )
        : undefined;

    if (!target) {
      target = findNearestCandidate(candidates, point);
    }

    if (!target) {
      return;
    }

    target.landmarks.push({
      ...landmark,
      tooth_id: target.fdiId,
      coord: [point.x, point.y, point.z],
    });
  });
}

function getLandmarkToothId(landmark: LandmarkPoint): number | undefined {
  const rawValue =
    landmark.tooth_id ??
    landmark.toothId ??
    landmark.tooth_label ??
    landmark.segment_label ??
    landmark.label;

  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return undefined;
  }

  return rawValue;
}

function findNearestCandidate(
  candidates: ToothSegmentCandidate[],
  point: THREE.Vector3,
): ToothSegmentCandidate | undefined {
  let bestCandidate: ToothSegmentCandidate | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestCenterDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    const bboxDistance = candidate.bbox.distanceToPoint(point);
    const centerDistance = candidate.rawCenter.distanceTo(point);

    if (
      bboxDistance < bestDistance ||
      (Math.abs(bboxDistance - bestDistance) < 1e-6 &&
        centerDistance < bestCenterDistance)
    ) {
      bestCandidate = candidate;
      bestDistance = bboxDistance;
      bestCenterDistance = centerDistance;
    }
  });

  return bestCandidate;
}

function buildCanonicalLandmarks(
  candidate: ToothSegmentCandidate,
  alignmentMatrix: THREE.Matrix4,
): { landmarks: ToothLandmarks; rawLandmarks: LandmarkPoint[] } {
  const fallback = computeFallbackLandmarks(candidate, alignmentMatrix);

  const faPoint =
    getLandmarkPoint(candidate.landmarks, [
      "FacialPoint",
      "FA_point",
      "OuterPoint",
    ]) ?? fallback.faPoint;
  const incisalEdge =
    getLandmarkPoint(candidate.landmarks, [
      "IncisalEdge",
      "incisal_edge",
      "Cusp",
    ]) ?? fallback.incisalEdge;
  const mesialContact =
    getLandmarkPoint(candidate.landmarks, ["Mesial", "mesial_contact"]) ??
    fallback.mesialContact;
  const distalContact =
    getLandmarkPoint(candidate.landmarks, ["Distal", "distal_contact"]) ??
    fallback.distalContact;

  const landmarks: ToothLandmarks = {
    FA_point: faPoint,
    incisal_edge: incisalEdge,
    mesial_contact: mesialContact,
    distal_contact: distalContact,
  };

  return {
    landmarks,
    rawLandmarks: [
      toLandmarkPoint("FacialPoint", faPoint, candidate.fdiId),
      toLandmarkPoint("IncisalEdge", incisalEdge, candidate.fdiId),
      toLandmarkPoint("Mesial", mesialContact, candidate.fdiId),
      toLandmarkPoint("Distal", distalContact, candidate.fdiId),
    ],
  };
}

function computeFallbackLandmarks(
  candidate: ToothSegmentCandidate,
  alignmentMatrix: THREE.Matrix4,
): {
  faPoint: THREE.Vector3;
  incisalEdge: THREE.Vector3;
  mesialContact: THREE.Vector3;
  distalContact: THREE.Vector3;
} {
  const outwardDirection = candidate.alignedCenter.clone();
  outwardDirection.y = 0;
  if (outwardDirection.lengthSq() < 1e-6) {
    outwardDirection.set(0, 0, 1);
  } else {
    outwardDirection.normalize();
  }

  const isRightSide = candidate.alignedCenter.x >= 0;
  const mesialDirection = new THREE.Vector3(isRightSide ? -1 : 1, 0, 0);
  const distalDirection = mesialDirection.clone().negate();
  const occlusalDirection = new THREE.Vector3(0, 1, 0);

  return {
    faPoint:
      pickLocalExtremum(candidate.mesh.geometry, alignmentMatrix, (aligned) =>
        aligned.dot(outwardDirection),
      ) ?? candidate.rawCenter.clone(),
    incisalEdge:
      pickLocalExtremum(candidate.mesh.geometry, alignmentMatrix, (aligned) =>
        aligned.dot(occlusalDirection),
      ) ?? candidate.rawCenter.clone(),
    mesialContact:
      pickLocalExtremum(candidate.mesh.geometry, alignmentMatrix, (aligned) =>
        aligned.dot(mesialDirection),
      ) ?? candidate.rawCenter.clone(),
    distalContact:
      pickLocalExtremum(candidate.mesh.geometry, alignmentMatrix, (aligned) =>
        aligned.dot(distalDirection),
      ) ?? candidate.rawCenter.clone(),
  };
}

function pickLocalExtremum(
  geometry: THREE.BufferGeometry,
  alignmentMatrix: THREE.Matrix4,
  score: (alignedPoint: THREE.Vector3) => number,
): THREE.Vector3 | undefined {
  const position = geometry.getAttribute("position");
  if (!position) {
    return undefined;
  }

  let bestPoint: THREE.Vector3 | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index++) {
    const localPoint = new THREE.Vector3(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    );
    const alignedPoint = localPoint.clone().applyMatrix4(alignmentMatrix);
    const nextScore = score(alignedPoint);

    if (nextScore > bestScore) {
      bestScore = nextScore;
      bestPoint = localPoint;
    }
  }

  return bestPoint;
}

function getLandmarkPoint(
  landmarks: LandmarkPoint[],
  preferredClasses: string[],
): THREE.Vector3 | undefined {
  const preferred = new Set(
    preferredClasses.map((value) => value.toLowerCase()),
  );
  const landmark = landmarks.find((item) =>
    preferred.has(item.class.toLowerCase()),
  );
  if (!landmark) {
    return undefined;
  }

  return new THREE.Vector3(...landmark.coord);
}

/**
 * Shift every tooth's geometry (and all associated landmarks / LCS data)
 * slightly in the occlusal direction so that the coloured crowns are
 * visually separated from the semi-transparent gum mesh.
 *
 * The offset direction is derived automatically: it is the unit vector that
 * points from the overall jaw bounding-box centre toward the centroid of all
 * tooth FA-points.  For a standard dental scan (arch lying roughly in the
 * XZ plane) this resolves to approximately ±Y, matching the occlusal axis.
 * The magnitude is capped at 2 % of the jaw's longest bounding dimension so
 * the result is scale-independent (works for mm, cm, m, inch STL files).
 */
function applyCrownSeparation(
  teeth: Map<number, ToothEntity>,
  sourceGeometry: THREE.BufferGeometry,
): void {
  if (teeth.size === 0) return;

  const posSource = sourceGeometry.getAttribute("position");
  if (!posSource) return;

  // ── jaw bounding box ────────────────────────────────────────────────────
  const jawBbox = new THREE.Box3().setFromBufferAttribute(
    posSource as THREE.BufferAttribute,
  );
  const jawCenter = jawBbox.getCenter(new THREE.Vector3());
  const jawSize = jawBbox.getSize(new THREE.Vector3());

  // ── teeth cluster centre (average of FA-point / LCS origins) ────────────
  const teethCenter = new THREE.Vector3();
  teeth.forEach((tooth) => teethCenter.add(tooth.lcs.origin));
  teethCenter.divideScalar(teeth.size);

  // ── occlusal direction: jaw-centre → teeth-centre ──────────────────────
  const separationDir = teethCenter.clone().sub(jawCenter);
  if (separationDir.lengthSq() < 1e-6) {
    separationDir.set(0, 1, 0); // fallback: world +Y
  } else {
    separationDir.normalize();
  }

  // ── offset magnitude: 2 % of longest jaw dimension ─────────────────────
  const maxDim = Math.max(jawSize.x, jawSize.y, jawSize.z);
  const separationAmount = maxDim * 0.02;
  const offsetVec = separationDir.multiplyScalar(separationAmount);

  teeth.forEach((tooth) => {
    // 1. Shift geometry vertices so the gap is baked into the mesh
    const pos = tooth.mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + offsetVec.x,
        pos.getY(i) + offsetVec.y,
        pos.getZ(i) + offsetVec.z,
      );
    }
    pos.needsUpdate = true;
    tooth.mesh.geometry.computeBoundingBox();
    tooth.mesh.geometry.computeBoundingSphere();

    // 2. Shift canonical landmarks (THREE.Vector3 objects in jaw-local space)
    tooth.landmarks.FA_point.add(offsetVec);
    if (tooth.landmarks.incisal_edge)
      tooth.landmarks.incisal_edge.add(offsetVec);
    if (tooth.landmarks.mesial_contact)
      tooth.landmarks.mesial_contact.add(offsetVec);
    if (tooth.landmarks.distal_contact)
      tooth.landmarks.distal_contact.add(offsetVec);

    // 3. Shift raw landmark coord arrays
    tooth.rawLandmarks.forEach((lm) => {
      lm.coord[0] += offsetVec.x;
      lm.coord[1] += offsetVec.y;
      lm.coord[2] += offsetVec.z;
    });

    // 4. Shift LCS origin and rebuild the transform matrices so that
    //    bracket placement and coordinate exports stay consistent
    tooth.lcs.origin.add(offsetVec);
    tooth.localToWorld = buildTransformationMatrix(tooth.lcs);
    tooth.worldToLocal = buildInverseMatrix(tooth.lcs);
  });

  console.log(
    `[CrownSep] offset ${separationAmount.toFixed(3)} units along ` +
      `(${separationDir.x.toFixed(2)}, ${separationDir.y.toFixed(2)}, ${separationDir.z.toFixed(2)})`,
  );
}

function toLandmarkPoint(
  className: string,
  point: THREE.Vector3,
  toothId: number,
): LandmarkPoint {
  return {
    class: className,
    coord: [point.x, point.y, point.z],
    score: 1,
    tooth_id: toothId,
  };
}
