/**
 * autoOcclusalPlane.ts
 * -------------------
 * Automatic occlusal plane detection from maxilla + mandible overlap.
 *
 * Algorithm:
 *   A. For each maxilla vertex, find the nearest mandible vertex → (p, q, d)
 *   B. Keep the closest k% pairs (overlap set), compute midpoints with weight 1/(d+ε)
 *   C. Weighted PCA on midpoints → smallest eigenvector = plane normal
 *   D. Orient normal so maxilla centroid is on the positive side
 */

import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AutoPlaneResult {
    normal: THREE.Vector3;
    center: THREE.Vector3;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract position array from BufferGeometry */
function getPositions(geom: THREE.BufferGeometry): Float32Array {
    const attr = geom.attributes.position as THREE.BufferAttribute;
    return attr.array as Float32Array;
}

/** Compute the centroid of a set of vertices (Float32Array, stride 3) */
function computeCentroid(positions: Float32Array): THREE.Vector3 {
    const c = new THREE.Vector3();
    const n = positions.length / 3;
    for (let i = 0; i < n; i++) {
        c.x += positions[i * 3];
        c.y += positions[i * 3 + 1];
        c.z += positions[i * 3 + 2];
    }
    return c.divideScalar(n);
}

/**
 * Sub-sample vertex positions to at most `maxCount` unique vertices.
 * Returns a Float32Array of xyz triples.
 */
function subsamplePositions(
    positions: Float32Array,
    maxCount: number
): Float32Array {
    const totalVerts = positions.length / 3;
    if (totalVerts <= maxCount) return positions;

    const step = Math.ceil(totalVerts / maxCount);
    const out: number[] = [];
    for (let i = 0; i < totalVerts; i += step) {
        out.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    return new Float32Array(out);
}

// ─── Nearest-vertex search (brute force, axis-sorted skip) ───────────────────

interface NearPair {
    px: number; py: number; pz: number;  // maxilla point
    qx: number; qy: number; qz: number;  // nearest mandible point
    d: number;                             // distance
}

/**
 * For every point in `sourcePositions`, find the closest point in
 * `targetPositions` using brute-force with early exit.
 */
function findNearestPairs(
    sourcePositions: Float32Array,
    targetPositions: Float32Array
): NearPair[] {
    const srcCount = sourcePositions.length / 3;
    const tgtCount = targetPositions.length / 3;
    const pairs: NearPair[] = [];

    for (let si = 0; si < srcCount; si++) {
        const px = sourcePositions[si * 3];
        const py = sourcePositions[si * 3 + 1];
        const pz = sourcePositions[si * 3 + 2];

        let bestDist = Infinity;
        let bx = 0, by = 0, bz = 0;

        for (let ti = 0; ti < tgtCount; ti++) {
            const tx = targetPositions[ti * 3];
            const ty = targetPositions[ti * 3 + 1];
            const tz = targetPositions[ti * 3 + 2];

            // Fast squared distance — skip sqrt until final
            const dx = px - tx;
            const dy = py - ty;
            const dz = pz - tz;
            const d2 = dx * dx + dy * dy + dz * dz;

            if (d2 < bestDist) {
                bestDist = d2;
                bx = tx; by = ty; bz = tz;
            }
        }

        pairs.push({
            px, py, pz,
            qx: bx, qy: by, qz: bz,
            d: Math.sqrt(bestDist),
        });
    }

    return pairs;
}

// ─── Weighted PCA ─────────────────────────────────────────────────────────────

/**
 * Analytic eigendecomposition of a real symmetric 3×3 matrix.
 * Returns { eigenvalues: [λ0, λ1, λ2], eigenvectors: [v0, v1, v2] }
 * sorted by ascending eigenvalue.
 */
function eigenSymmetric3x3(
    m: [number, number, number, number, number, number, number, number, number]
): { eigenvalues: [number, number, number]; eigenvectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3] } {
    // Use THREE.Matrix3 eigendecomposition via characteristic polynomial
    const mat = new THREE.Matrix3();
    mat.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);

    // Compute eigenvalues using Cardano's formula for 3×3 symmetric
    const a = m[0], b = m[4], c = m[8];
    const d = m[1], e = m[5], f = m[2];
    // m = [[a,d,f],[d,b,e],[f,e,c]]

    const p1 = d * d + f * f + e * e;

    if (p1 < 1e-20) {
        // Already diagonal
        const vals: [number, number, number] = [a, b, c];
        const vecs: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1),
        ];
        // Sort ascending
        const indices = [0, 1, 2].sort((i, j) => vals[i] - vals[j]);
        return {
            eigenvalues: [vals[indices[0]], vals[indices[1]], vals[indices[2]]],
            eigenvectors: [vecs[indices[0]], vecs[indices[1]], vecs[indices[2]]],
        };
    }

    const q = (a + b + c) / 3;
    const p2 =
        (a - q) * (a - q) +
        (b - q) * (b - q) +
        (c - q) * (c - q) +
        2 * p1;
    const p = Math.sqrt(p2 / 6);

    // B = (1/p) * (A - q*I)
    const b00 = (a - q) / p, b01 = d / p, b02 = f / p;
    const b10 = d / p, b11 = (b - q) / p, b12 = e / p;
    const b20 = f / p, b21 = e / p, b22 = (c - q) / p;

    const detB =
        b00 * (b11 * b22 - b12 * b21) -
        b01 * (b10 * b22 - b12 * b20) +
        b02 * (b10 * b21 - b11 * b20);

    let r = detB / 2;
    r = Math.max(-1, Math.min(1, r)); // clamp for numerical stability

    const phi = Math.acos(r) / 3;

    const eig1 = q + 2 * p * Math.cos(phi);
    const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
    const eig2 = 3 * q - eig1 - eig3; // since trace = sum of eigenvalues

    // Sort ascending
    const eigenvalues = [eig1, eig2, eig3].sort((x, y) => x - y) as [number, number, number];

    // Compute eigenvectors via (A - λI) null-space
    const computeEigenvector = (lambda: number): THREE.Vector3 => {
        // (A - λI)
        const r0 = [a - lambda, d, f];
        const r1 = [d, b - lambda, e];
        const r2 = [f, e, c - lambda];

        // Cross product of two rows gives the null-space direction
        const cross01 = new THREE.Vector3(
            r0[1] * r1[2] - r0[2] * r1[1],
            r0[2] * r1[0] - r0[0] * r1[2],
            r0[0] * r1[1] - r0[1] * r1[0]
        );
        if (cross01.lengthSq() > 1e-12) return cross01.normalize();

        const cross02 = new THREE.Vector3(
            r0[1] * r2[2] - r0[2] * r2[1],
            r0[2] * r2[0] - r0[0] * r2[2],
            r0[0] * r2[1] - r0[1] * r2[0]
        );
        if (cross02.lengthSq() > 1e-12) return cross02.normalize();

        const cross12 = new THREE.Vector3(
            r1[1] * r2[2] - r1[2] * r2[1],
            r1[2] * r2[0] - r1[0] * r2[2],
            r1[0] * r2[1] - r1[1] * r2[0]
        );
        if (cross12.lengthSq() > 1e-12) return cross12.normalize();

        // Fallback
        return new THREE.Vector3(0, 1, 0);
    };

    const eigenvectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
        computeEigenvector(eigenvalues[0]),
        computeEigenvector(eigenvalues[1]),
        computeEigenvector(eigenvalues[2]),
    ];

    return { eigenvalues, eigenvectors };
}

// ─── Main algorithm ───────────────────────────────────────────────────────────

const MAX_SAMPLE_VERTS = 4000; // subsample cap for performance
const EPS = 1e-6;

export function computeAutoOcclusalPlane(
    maxillaGeom: THREE.BufferGeometry,
    mandibleGeom: THREE.BufferGeometry
): AutoPlaneResult {
    // 1. Extract & subsample positions
    const maxPos = subsamplePositions(getPositions(maxillaGeom), MAX_SAMPLE_VERTS);
    const manPos = subsamplePositions(getPositions(mandibleGeom), MAX_SAMPLE_VERTS);

    // 2. Find nearest pairs (maxilla → mandible)
    const pairs = findNearestPairs(maxPos, manPos);

    // 3. Sort by distance ascending
    pairs.sort((a, b) => a.d - b.d);

    // 4. Select overlap set — adaptive k%
    let overlapCount = Math.max(Math.floor(pairs.length * 0.03), 30);
    if (overlapCount > pairs.length) overlapCount = pairs.length;

    // If too few pairs with reasonable distance, expand
    if (overlapCount < 50 && pairs.length > 50) {
        overlapCount = Math.max(Math.floor(pairs.length * 0.05), 50);
    }
    if (overlapCount < 50 && pairs.length > 100) {
        overlapCount = Math.max(Math.floor(pairs.length * 0.10), 50);
    }
    overlapCount = Math.min(overlapCount, pairs.length);

    const overlapPairs = pairs.slice(0, overlapCount);

    // 5. Compute weighted midpoints
    let totalWeight = 0;
    const cx = { x: 0, y: 0, z: 0 };

    const midpoints: { x: number; y: number; z: number; w: number }[] = [];

    for (const pair of overlapPairs) {
        const mx = (pair.px + pair.qx) / 2;
        const my = (pair.py + pair.qy) / 2;
        const mz = (pair.pz + pair.qz) / 2;
        const w = 1 / (pair.d + EPS);

        midpoints.push({ x: mx, y: my, z: mz, w });
        cx.x += w * mx;
        cx.y += w * my;
        cx.z += w * mz;
        totalWeight += w;
    }

    // Weighted centroid
    const centroid = new THREE.Vector3(
        cx.x / totalWeight,
        cx.y / totalWeight,
        cx.z / totalWeight
    );

    // 6. Weighted covariance matrix
    let cov00 = 0, cov01 = 0, cov02 = 0;
    let cov11 = 0, cov12 = 0;
    let cov22 = 0;

    for (const mp of midpoints) {
        const dx = mp.x - centroid.x;
        const dy = mp.y - centroid.y;
        const dz = mp.z - centroid.z;
        cov00 += mp.w * dx * dx;
        cov01 += mp.w * dx * dy;
        cov02 += mp.w * dx * dz;
        cov11 += mp.w * dy * dy;
        cov12 += mp.w * dy * dz;
        cov22 += mp.w * dz * dz;
    }

    // Normalize
    cov00 /= totalWeight; cov01 /= totalWeight; cov02 /= totalWeight;
    cov11 /= totalWeight; cov12 /= totalWeight;
    cov22 /= totalWeight;

    // 7. Eigendecomposition — smallest eigenvector is the normal
    const { eigenvectors } = eigenSymmetric3x3([
        cov00, cov01, cov02,
        cov01, cov11, cov12,
        cov02, cov12, cov22,
    ]);

    let normal = eigenvectors[0]; // smallest eigenvalue → plane normal

    // 8. Orient normal: maxilla centroid should be on positive-normal side
    const maxillaCentroid = computeCentroid(getPositions(maxillaGeom));
    const toMaxilla = new THREE.Vector3().subVectors(maxillaCentroid, centroid);
    if (toMaxilla.dot(normal) < 0) {
        normal = normal.negate();
    }

    return { normal, center: centroid };
}
