// src/core/PCA.ts
import * as THREE from "three";

export interface PCAResult {
  pc1: THREE.Vector3;  // First principal component (largest variance)
  pc2: THREE.Vector3;  // Second principal component
  pc3: THREE.Vector3;  // Third principal component
  eigenvalues: [number, number, number];
}

/**
 * Compute Principal Component Analysis on mesh vertices
 * Uses covariance matrix and power iteration for eigen decomposition
 */
export function computePCA(geometry: THREE.BufferGeometry): PCAResult {
  const position = geometry.getAttribute("position");
  if (!position) {
    throw new Error("Geometry has no position attribute");
  }

  const vertexCount = position.count;
  if (vertexCount === 0) {
    throw new Error("Geometry has no vertices");
  }

  // 1. Compute centroid
  const centroid = new THREE.Vector3();
  for (let i = 0; i < vertexCount; i++) {
    centroid.x += position.getX(i);
    centroid.y += position.getY(i);
    centroid.z += position.getZ(i);
  }
  centroid.divideScalar(vertexCount);

  // 2. Compute covariance matrix (3x3)
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let i = 0; i < vertexCount; i++) {
    const dx = position.getX(i) - centroid.x;
    const dy = position.getY(i) - centroid.y;
    const dz = position.getZ(i) - centroid.z;

    cov[0][0] += dx * dx;
    cov[0][1] += dx * dy;
    cov[0][2] += dx * dz;
    cov[1][1] += dy * dy;
    cov[1][2] += dy * dz;
    cov[2][2] += dz * dz;
  }

  // Symmetric matrix
  cov[1][0] = cov[0][1];
  cov[2][0] = cov[0][2];
  cov[2][1] = cov[1][2];

  // Normalize by vertex count
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      cov[i][j] /= vertexCount;
    }
  }

  // 3. Power iteration for eigenvalues/eigenvectors
  const { eigenvectors, eigenvalues } = powerIteration3x3(cov);

  return {
    pc1: new THREE.Vector3(eigenvectors[0][0], eigenvectors[0][1], eigenvectors[0][2]),
    pc2: new THREE.Vector3(eigenvectors[1][0], eigenvectors[1][1], eigenvectors[1][2]),
    pc3: new THREE.Vector3(eigenvectors[2][0], eigenvectors[2][1], eigenvectors[2][2]),
    eigenvalues: eigenvalues as [number, number, number],
  };
}

/**
 * Power iteration method for 3x3 symmetric matrix eigen decomposition
 */
function powerIteration3x3(matrix: number[][]): {
  eigenvectors: number[][];
  eigenvalues: number[];
} {
  const eigenvectors: number[][] = [];
  const eigenvalues: number[] = [];

  // Work on a copy to deflate
  const A = matrix.map((row) => [...row]);

  for (let pc = 0; pc < 3; pc++) {
    // Random initial vector
    let v = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
    normalize(v);

    // Power iteration
    for (let iter = 0; iter < 100; iter++) {
      const Av = multiplyMatrixVector(A, v);
      normalize(Av);

      // Check convergence
      const dot = v[0] * Av[0] + v[1] * Av[1] + v[2] * Av[2];
      v = Av;

      if (Math.abs(Math.abs(dot) - 1) < 1e-10) break;
    }

    // Compute eigenvalue (Rayleigh quotient)
    const Av = multiplyMatrixVector(A, v);
    const eigenvalue = v[0] * Av[0] + v[1] * Av[1] + v[2] * Av[2];

    eigenvectors.push(v);
    eigenvalues.push(eigenvalue);

    // Deflate matrix for next eigenvector
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        A[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  return { eigenvectors, eigenvalues };
}

function normalize(v: number[]): void {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len > 1e-10) {
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
}

function multiplyMatrixVector(m: number[][], v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}
