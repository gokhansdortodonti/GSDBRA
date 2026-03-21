/**
 * ICP.ts — Iterative Closest Point
 * ---------------------------------
 * Point-to-point ICP implementation for dental scan registration.
 *
 * Used to refine the occlusal plane estimate by iteratively aligning
 * the mandible contact zone to the maxilla contact zone.
 *
 * Algorithm per iteration:
 *   1. For each source point, find the closest target point
 *   2. Reject outliers (keep closest trimFraction)
 *   3. Compute optimal rigid transform via SVD of cross-covariance H
 *   4. Apply transform to source, accumulate cumulative transform
 *   5. Check convergence on RMS error
 */

import * as THREE from "three";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ICPResult {
    /** Cumulative rotation (source → target alignment) */
    rotation: THREE.Quaternion;
    /** Cumulative translation (applied after rotation) */
    translation: THREE.Vector3;
    /** Final RMS point-to-point error (in mesh units) */
    rmsError: number;
    /** Number of iterations executed */
    iterations: number;
    /** Whether convergence criterion was met */
    converged: boolean;
}

export interface ICPOptions {
    /** Maximum iterations (default: 50) */
    maxIterations?: number;
    /** Convergence tolerance on ΔRMS (default: 1e-5) */
    tolerance?: number;
    /**
     * Fraction of closest pairs to keep each iteration (trimmed ICP).
     * Smaller = more robust to outliers, but needs good initial alignment.
     * Default: 0.1 (keep closest 10%)
     */
    trimFraction?: number;
    /** Subsample both clouds to at most this many points (default: 2000) */
    maxPoints?: number;
}

// ─── Internal types ───────────────────────────────────────────────────────────

/** Row-major 3×3 matrix as flat array [r00,r01,r02, r10,r11,r12, r20,r21,r22] */
type Mat3 = [
    number, number, number,
    number, number, number,
    number, number, number
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

/**
 * Subsample vertices (Float32Array, stride 3) to at most `maxCount` points
 * using uniform stride-based sampling.
 */
function subsamplePoints(pts: Float32Array, maxCount: number): Float32Array {
    const n = pts.length / 3;
    if (n <= maxCount) return pts;
    const step = Math.ceil(n / maxCount);
    const outLen = Math.ceil(n / step);
    const out = new Float32Array(outLen * 3);
    let idx = 0;
    for (let i = 0; i < n; i += step) {
        out[idx++] = pts[i * 3];
        out[idx++] = pts[i * 3 + 1];
        out[idx++] = pts[i * 3 + 2];
    }
    return out.slice(0, idx);
}

/** Compute centroid of a Float32Array point cloud (stride 3) */
function centroid(pts: Float32Array): THREE.Vector3 {
    const n = pts.length / 3;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < n; i++) {
        x += pts[i * 3];
        y += pts[i * 3 + 1];
        z += pts[i * 3 + 2];
    }
    return new THREE.Vector3(x / n, y / n, z / n);
}

/**
 * Apply rotation + translation to a Float32Array point cloud.
 * Returns a new Float32Array (does not modify input).
 */
export function applyTransform(
    pts: Float32Array,
    rotation: THREE.Quaternion,
    translation: THREE.Vector3
): Float32Array {
    const n = pts.length / 3;
    const out = new Float32Array(pts.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
        v.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
        v.applyQuaternion(rotation).add(translation);
        out[i * 3] = v.x;
        out[i * 3 + 1] = v.y;
        out[i * 3 + 2] = v.z;
    }
    return out;
}

// ─── Eigendecomposition of 3×3 symmetric matrix (Cardano's formula) ──────────

/**
 * Analytic eigendecomposition of a real symmetric 3×3 matrix.
 * Returns eigenvalues sorted ascending and corresponding eigenvectors.
 */
function eigenSym3x3(m: Mat3): {
    values: [number, number, number];
    vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
} {
    // m = [[a,d,f],[d,b,e],[f,e,c]]  (symmetric, stored row-major)
    const a = m[0], d = m[1], f = m[2];
    const b = m[4], e = m[5];
    const c = m[8];

    const p1 = d * d + f * f + e * e;

    if (p1 < 1e-20) {
        // Already diagonal
        const vals: [number, number, number] = [a, b, c];
        const vecs: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1),
        ];
        const idx = ([0, 1, 2] as const).slice().sort((i, j) => vals[i] - vals[j]);
        return {
            values: [vals[idx[0]], vals[idx[1]], vals[idx[2]]],
            vectors: [vecs[idx[0]], vecs[idx[1]], vecs[idx[2]]],
        };
    }

    const q = (a + b + c) / 3;
    const p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1;
    const p = Math.sqrt(p2 / 6);

    const B: Mat3 = [
        (a - q) / p, d / p, f / p,
        d / p, (b - q) / p, e / p,
        f / p, e / p, (c - q) / p,
    ];

    let r =
        B[0] * (B[4] * B[8] - B[5] * B[7]) -
        B[1] * (B[3] * B[8] - B[5] * B[6]) +
        B[2] * (B[3] * B[7] - B[4] * B[6]);
    r = r / 2;
    r = Math.max(-1, Math.min(1, r));

    const phi = Math.acos(r) / 3;
    const eig1 = q + 2 * p * Math.cos(phi);
    const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
    const eig2 = 3 * q - eig1 - eig3;

    const eigenvalues = [eig1, eig2, eig3].sort((x, y) => x - y) as [number, number, number];

    const eigvec = (lambda: number): THREE.Vector3 => {
        const r0 = [a - lambda, d, f];
        const r1 = [d, b - lambda, e];
        const r2 = [f, e, c - lambda];

        const c01 = new THREE.Vector3(
            r0[1] * r1[2] - r0[2] * r1[1],
            r0[2] * r1[0] - r0[0] * r1[2],
            r0[0] * r1[1] - r0[1] * r1[0]
        );
        if (c01.lengthSq() > 1e-12) return c01.normalize();

        const c02 = new THREE.Vector3(
            r0[1] * r2[2] - r0[2] * r2[1],
            r0[2] * r2[0] - r0[0] * r2[2],
            r0[0] * r2[1] - r0[1] * r2[0]
        );
        if (c02.lengthSq() > 1e-12) return c02.normalize();

        const c12 = new THREE.Vector3(
            r1[1] * r2[2] - r1[2] * r2[1],
            r1[2] * r2[0] - r1[0] * r2[2],
            r1[0] * r2[1] - r1[1] * r2[0]
        );
        if (c12.lengthSq() > 1e-12) return c12.normalize();

        return new THREE.Vector3(0, 1, 0);
    };

    return {
        values: eigenvalues,
        vectors: [eigvec(eigenvalues[0]), eigvec(eigenvalues[1]), eigvec(eigenvalues[2])],
    };
}

// ─── Closest-point search with trimming ──────────────────────────────────────

interface ClosestPairsResult {
    srcPts: Float32Array;
    tgtPts: Float32Array;
    rms: number;
}

/**
 * For each point in `src`, find the closest point in `tgt`.
 * Keeps only the `trimFraction` fraction with smallest distances.
 */
function findClosestPairs(
    src: Float32Array,
    tgt: Float32Array,
    trimFraction: number
): ClosestPairsResult {
    const sn = src.length / 3;
    const tn = tgt.length / 3;

    const distances = new Float32Array(sn);
    const matchedTgt = new Float32Array(sn * 3);

    for (let si = 0; si < sn; si++) {
        const sx = src[si * 3];
        const sy = src[si * 3 + 1];
        const sz = src[si * 3 + 2];

        let bestD2 = Infinity;
        let bx = 0, by = 0, bz = 0;

        for (let ti = 0; ti < tn; ti++) {
            const dx = sx - tgt[ti * 3];
            const dy = sy - tgt[ti * 3 + 1];
            const dz = sz - tgt[ti * 3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) {
                bestD2 = d2;
                bx = tgt[ti * 3];
                by = tgt[ti * 3 + 1];
                bz = tgt[ti * 3 + 2];
            }
        }

        distances[si] = Math.sqrt(bestD2);
        matchedTgt[si * 3] = bx;
        matchedTgt[si * 3 + 1] = by;
        matchedTgt[si * 3 + 2] = bz;
    }

    // Sort indices by distance, keep closest trimFraction
    const order = Array.from({ length: sn }, (_, i) => i).sort(
        (a, b) => distances[a] - distances[b]
    );
    const keepCount = Math.max(10, Math.floor(sn * trimFraction));
    const keep = order.slice(0, keepCount);

    const outSrc = new Float32Array(keepCount * 3);
    const outTgt = new Float32Array(keepCount * 3);
    let rmsSum = 0;

    for (let k = 0; k < keepCount; k++) {
        const i = keep[k];
        outSrc[k * 3] = src[i * 3];
        outSrc[k * 3 + 1] = src[i * 3 + 1];
        outSrc[k * 3 + 2] = src[i * 3 + 2];
        outTgt[k * 3] = matchedTgt[i * 3];
        outTgt[k * 3 + 1] = matchedTgt[i * 3 + 1];
        outTgt[k * 3 + 2] = matchedTgt[i * 3 + 2];
        rmsSum += distances[i] * distances[i];
    }

    return {
        srcPts: outSrc,
        tgtPts: outTgt,
        rms: Math.sqrt(rmsSum / keepCount),
    };
}

// ─── Optimal rigid transform via SVD of cross-covariance ─────────────────────

/**
 * Compute the optimal rotation R and translation t that minimises
 * Σ ||R·src_i + t − tgt_i||² using the SVD of the cross-covariance matrix.
 *
 * H = Σ (src_i − μ_src)(tgt_i − μ_tgt)ᵀ
 * SVD: H = U S Vᵀ  →  R = V Uᵀ
 * t = μ_tgt − R·μ_src
 */
function computeOptimalTransform(
    srcPts: Float32Array,
    tgtPts: Float32Array
): { rotation: THREE.Quaternion; translation: THREE.Vector3 } {
    const n = srcPts.length / 3;
    const μs = centroid(srcPts);
    const μt = centroid(tgtPts);

    // Build 3×3 cross-covariance H (row-major)
    let h00 = 0, h01 = 0, h02 = 0;
    let h10 = 0, h11 = 0, h12 = 0;
    let h20 = 0, h21 = 0, h22 = 0;

    for (let i = 0; i < n; i++) {
        const sx = srcPts[i * 3] - μs.x;
        const sy = srcPts[i * 3 + 1] - μs.y;
        const sz = srcPts[i * 3 + 2] - μs.z;
        const tx = tgtPts[i * 3] - μt.x;
        const ty = tgtPts[i * 3 + 1] - μt.y;
        const tz = tgtPts[i * 3 + 2] - μt.z;

        // H = srcᵀ × tgt (outer product sum)
        h00 += sx * tx; h01 += sx * ty; h02 += sx * tz;
        h10 += sy * tx; h11 += sy * ty; h12 += sy * tz;
        h20 += sz * tx; h21 += sz * ty; h22 += sz * tz;
    }

    const H: Mat3 = [h00, h01, h02, h10, h11, h12, h20, h21, h22];

    // HTH = Hᵀ H  (symmetric, for eigendecomposition → V)
    const HTH: Mat3 = [
        h00 * h00 + h10 * h10 + h20 * h20,
        h00 * h01 + h10 * h11 + h20 * h21,
        h00 * h02 + h10 * h12 + h20 * h22,
        h01 * h00 + h11 * h10 + h21 * h20,
        h01 * h01 + h11 * h11 + h21 * h21,
        h01 * h02 + h11 * h12 + h21 * h22,
        h02 * h00 + h12 * h10 + h22 * h20,
        h02 * h01 + h12 * h11 + h22 * h21,
        h02 * h02 + h12 * h12 + h22 * h22,
    ];

    const { values, vectors } = eigenSym3x3(HTH);

    // Singular values σ = sqrt(eigenvalues of HTH)
    const sigma = values.map((v) => Math.sqrt(Math.max(0, v)));

    // V = matrix whose columns are eigenvectors of HTH
    // U[:,i] = H·V[:,i] / σ_i
    const EPS = 1e-10;

    const uCol = (v: THREE.Vector3, s: number): THREE.Vector3 => {
        const hv = new THREE.Vector3(
            H[0] * v.x + H[1] * v.y + H[2] * v.z,
            H[3] * v.x + H[4] * v.y + H[5] * v.z,
            H[6] * v.x + H[7] * v.y + H[8] * v.z
        );
        if (s < EPS) return hv.lengthSq() > EPS ? hv.normalize() : new THREE.Vector3(0, 0, 1);
        return hv.divideScalar(s);
    };

    const V0 = vectors[0].clone(), V1 = vectors[1].clone(), V2 = vectors[2].clone();
    const U0 = uCol(V0, sigma[0]);
    const U1 = uCol(V1, sigma[1]);
    let U2 = uCol(V2, sigma[2]);

    // R = V Uᵀ  (row i, col j → Σ_k V[k][i] * U[k][j]  → using column vectors)
    // R[row][col] = Σ_k V_k[row] * U_k[col]
    let r00 = V0.x * U0.x + V1.x * U1.x + V2.x * U2.x;
    let r01 = V0.x * U0.y + V1.x * U1.y + V2.x * U2.y;
    let r02 = V0.x * U0.z + V1.x * U1.z + V2.x * U2.z;
    let r10 = V0.y * U0.x + V1.y * U1.x + V2.y * U2.x;
    let r11 = V0.y * U0.y + V1.y * U1.y + V2.y * U2.y;
    let r12 = V0.y * U0.z + V1.y * U1.z + V2.y * U2.z;
    let r20 = V0.z * U0.x + V1.z * U1.x + V2.z * U2.x;
    let r21 = V0.z * U0.y + V1.z * U1.y + V2.z * U2.y;
    let r22 = V0.z * U0.z + V1.z * U1.z + V2.z * U2.z;

    // det(R) must be +1 for proper rotation; if −1, flip last V column
    const detR =
        r00 * (r11 * r22 - r12 * r21) -
        r01 * (r10 * r22 - r12 * r20) +
        r02 * (r10 * r21 - r11 * r20);

    if (detR < 0) {
        V2.negate();
        U2 = uCol(V2, sigma[2]);

        r00 = V0.x * U0.x + V1.x * U1.x + V2.x * U2.x;
        r01 = V0.x * U0.y + V1.x * U1.y + V2.x * U2.y;
        r02 = V0.x * U0.z + V1.x * U1.z + V2.x * U2.z;
        r10 = V0.y * U0.x + V1.y * U1.x + V2.y * U2.x;
        r11 = V0.y * U0.y + V1.y * U1.y + V2.y * U2.y;
        r12 = V0.y * U0.z + V1.y * U1.z + V2.y * U2.z;
        r20 = V0.z * U0.x + V1.z * U1.x + V2.z * U2.x;
        r21 = V0.z * U0.y + V1.z * U1.y + V2.z * U2.y;
        r22 = V0.z * U0.z + V1.z * U1.z + V2.z * U2.z;
    }

    // Convert rotation matrix (row-major) → THREE.Matrix4 → Quaternion
    // THREE.Matrix4.set() takes row-major arguments
    const m4 = new THREE.Matrix4();
    m4.set(
        r00, r01, r02, 0,
        r10, r11, r12, 0,
        r20, r21, r22, 0,
        0, 0, 0, 1
    );
    const rotation = new THREE.Quaternion().setFromRotationMatrix(m4);

    // t = μ_tgt − R·μ_src
    const rotatedSrc = μs.clone().applyQuaternion(rotation);
    const translation = new THREE.Vector3().subVectors(μt, rotatedSrc);

    return { rotation, translation };
}

// ─── Main ICP loop ────────────────────────────────────────────────────────────

/**
 * Run Iterative Closest Point to align `sourcePositions` onto `targetPositions`.
 *
 * @param sourcePositions  Float32Array of xyz vertices (to be moved)
 * @param targetPositions  Float32Array of xyz vertices (fixed reference)
 * @param options          Algorithm parameters
 * @returns                Cumulative rigid transform + convergence info
 */
export function runICP(
    sourcePositions: Float32Array,
    targetPositions: Float32Array,
    options?: ICPOptions
): ICPResult {
    const maxIterations = options?.maxIterations ?? 50;
    const tolerance = options?.tolerance ?? 1e-5;
    const trimFraction = options?.trimFraction ?? 0.1;
    const maxPoints = options?.maxPoints ?? 2000;

    // Subsample for performance
    let src = subsamplePoints(sourcePositions, maxPoints);
    const tgt = subsamplePoints(targetPositions, maxPoints);

    // Cumulative transform (identity)
    let cumRotation = new THREE.Quaternion();
    let cumTranslation = new THREE.Vector3();

    let prevRms = Infinity;
    let converged = false;
    let iter = 0;

    for (iter = 0; iter < maxIterations; iter++) {
        // 1. Find closest pairs with trimming
        const { srcPts, tgtPts, rms } = findClosestPairs(src, tgt, trimFraction);

        // 2. Compute optimal rigid transform for this pair set
        const { rotation, translation } = computeOptimalTransform(srcPts, tgtPts);

        // 3. Apply transform to full source cloud
        src = applyTransform(src, rotation, translation);

        // 4. Accumulate: new_cumR = rotation * cumR
        //               new_cumT = rotation * cumT + translation
        const newCumT = cumTranslation.clone().applyQuaternion(rotation).add(translation);
        cumRotation = rotation.clone().multiply(cumRotation);
        cumTranslation = newCumT;

        // 5. Convergence check
        const deltaRms = Math.abs(prevRms - rms);
        prevRms = rms;

        if (deltaRms < tolerance && iter > 0) {
            converged = true;
            iter++;
            break;
        }
    }

    return {
        rotation: cumRotation,
        translation: cumTranslation,
        rmsError: prevRms,
        iterations: iter,
        converged,
    };
}
