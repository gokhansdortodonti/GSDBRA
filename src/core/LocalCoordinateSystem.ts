// src/core/LocalCoordinateSystem.ts
import * as THREE from "three";
import { computePCA } from "./PCA";
import type { LocalCoordinateSystem } from "./types";

/**
 * Compute Local Coordinate System for a tooth
 * Origin: FA point
 * Z-axis: FA point to tooth center (towards pulp)
 * X-axis: Mesiodistal direction (from PCA)
 * Y-axis: Gingivo-occlusal direction (tooth long axis)
 */
export function computeToothLCS(
  mesh: THREE.Mesh,
  faPoint: THREE.Vector3
): LocalCoordinateSystem {
  // 1. Compute tooth center from bounding box
  const bbox = new THREE.Box3().setFromObject(mesh);
  const center = new THREE.Vector3();
  bbox.getCenter(center);

  // 2. Z-axis: FA point to center (towards pulp)
  const zAxis = new THREE.Vector3()
    .subVectors(center, faPoint)
    .normalize();

  // Handle edge case where FA is at center
  if (zAxis.length() < 0.001) {
    // Use default Z direction
    zAxis.set(0, 0, 1);
  }

  // 3. Get initial X and Y from PCA
  const pca = computePCA(mesh.geometry);

  // PC1 is typically mesiodistal (longest dimension)
  let xAxis = pca.pc1.clone();
  let yAxis = pca.pc2.clone();

  // 4. Gram-Schmidt orthogonalization
  // First, make Y orthogonal to Z
  const yProjOnZ = yAxis.dot(zAxis);
  yAxis.sub(zAxis.clone().multiplyScalar(yProjOnZ));
  yAxis.normalize();

  // Then, make X orthogonal to both Y and Z
  const xProjOnZ = xAxis.dot(zAxis);
  const xProjOnY = xAxis.dot(yAxis);
  xAxis.sub(zAxis.clone().multiplyScalar(xProjOnZ));
  xAxis.sub(yAxis.clone().multiplyScalar(xProjOnY));
  xAxis.normalize();

  // 5. Ensure right-handed coordinate system
  const crossCheck = new THREE.Vector3().crossVectors(xAxis, yAxis);
  if (crossCheck.dot(zAxis) < 0) {
    xAxis.negate();
  }

  return {
    origin: faPoint.clone(),
    xAxis,
    yAxis,
    zAxis,
  };
}

/**
 * Build 4x4 transformation matrix from LCS
 * Local to World transformation
 */
export function buildTransformationMatrix(lcs: LocalCoordinateSystem): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();

  // Column-major order for Three.js
  // [Xx, Xy, Xz, 0]
  // [Yx, Yy, Yz, 0]
  // [Zx, Zy, Zz, 0]
  // [Ox, Oy, Oz, 1]
  matrix.set(
    lcs.xAxis.x, lcs.yAxis.x, lcs.zAxis.x, lcs.origin.x,
    lcs.xAxis.y, lcs.yAxis.y, lcs.zAxis.y, lcs.origin.y,
    lcs.xAxis.z, lcs.yAxis.z, lcs.zAxis.z, lcs.origin.z,
    0, 0, 0, 1
  );

  return matrix;
}

/**
 * Build inverse transformation matrix (World to Local)
 */
export function buildInverseMatrix(lcs: LocalCoordinateSystem): THREE.Matrix4 {
  const matrix = buildTransformationMatrix(lcs);
  return matrix.clone().invert();
}

/**
 * Convert matrix to JSON-serializable 2D array
 */
export function matrixToArray(matrix: THREE.Matrix4): number[][] {
  const elements = matrix.elements;
  // Three.js uses column-major, convert to row-major for JSON
  return [
    [elements[0], elements[4], elements[8], elements[12]],
    [elements[1], elements[5], elements[9], elements[13]],
    [elements[2], elements[6], elements[10], elements[14]],
    [elements[3], elements[7], elements[11], elements[15]],
  ];
}
