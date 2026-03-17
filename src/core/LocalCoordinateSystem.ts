// src/core/LocalCoordinateSystem.ts
import * as THREE from "three";
import { computePCA } from "./PCA";
import type { LocalCoordinateSystem, ToothAngles } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find the vertex in `geometry` closest to `target` and return its unit normal.
 * Falls back to (target - centroid) if the geometry has no normals.
 */
function surfaceNormalAtPoint(
  geometry: THREE.BufferGeometry,
  target: THREE.Vector3,
): THREE.Vector3 {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");

  if (!position) return new THREE.Vector3(0, 1, 0);

  // Find closest vertex
  let bestIdx = 0;
  let bestDist2 = Infinity;
  const tmp = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    tmp.set(position.getX(i), position.getY(i), position.getZ(i));
    const d2 = tmp.distanceToSquared(target);
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestIdx = i;
    }
  }

  // Average normal from a small neighbourhood for robustness
  if (normal) {
    const radius2 = bestDist2 < 1e-12 ? 0.01 : bestDist2 * 16;
    const avg = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < position.count; i++) {
      tmp.set(position.getX(i), position.getY(i), position.getZ(i));
      if (tmp.distanceToSquared(target) <= radius2) {
        avg.add(
          new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)),
        );
        count++;
      }
    }
    if (count > 0 && avg.lengthSq() > 1e-12) {
      return avg.normalize();
    }
    const n = new THREE.Vector3(
      normal.getX(bestIdx),
      normal.getY(bestIdx),
      normal.getZ(bestIdx),
    );
    if (n.lengthSq() > 1e-12) return n.normalize();
  }

  // No normals — use FA→centroid direction as rough estimate
  const centroid = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    centroid.add(
      new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)),
    );
  }
  centroid.divideScalar(position.count);

  const fallback = new THREE.Vector3().subVectors(target, centroid);
  return fallback.lengthSq() > 1e-12
    ? fallback.normalize()
    : new THREE.Vector3(0, 1, 0);
}

/**
 * True if FDI belongs to the RIGHT side of the arch (quadrants 1 & 4).
 * Right-side teeth: 11-18 (upper right) and 41-48 (lower right).
 */
function isRightSide(fdiId: number): boolean {
  return (fdiId >= 11 && fdiId <= 18) || (fdiId >= 41 && fdiId <= 48);
}

/**
 * Build an orthonormal anatomical LCS from ez (occlusal) and ey_hint (buccal).
 *
 * Priority order:
 *   1. ez (occlusal)  — PRIMARY anchor, never modified
 *   2. ey (buccal)    — orthogonalized against ez
 *   3. ex (distal)    — derived via cross product, sign fixed by FDI
 *
 * This guarantees +Z always = occlusal/incisal and +Y always = buccal.
 * +X = distal is enforced by FDI-based sign correction.
 *
 * For one side of the arch the frame is right-handed, for the other it is
 * left-handed — this is geometrically unavoidable when all three anatomical
 * directions are fixed across a bilateral mirror.  The clinical angles are
 * still correct because they are computed as anatomical projections, not
 * Euler angles that assume handedness.
 */
function buildOrthonormalLCS(
  origin: THREE.Vector3,
  ezDir: THREE.Vector3,
  eyHint: THREE.Vector3,
  fdiId: number,
): LocalCoordinateSystem {
  // 1. ez = occlusal (primary anchor)
  const ez = ezDir.clone().normalize();

  // 2. ey = buccal — orthogonalize against ez
  let ey = eyHint.clone();
  ey = ey.sub(ez.clone().multiplyScalar(ey.dot(ez)));
  if (ey.lengthSq() < 1e-12) {
    // eyHint was parallel to ez — pick an arbitrary perpendicular
    const arbAxis = Math.abs(ez.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    ey = new THREE.Vector3().crossVectors(ez, arbAxis);
  }
  ey.normalize();

  // 3. ex = ey × ez (gives a vector perpendicular to both)
  let ex = new THREE.Vector3().crossVectors(ey, ez).normalize();

  // 4. Sign correction: +X must be distal (away from midline)
  //    Right side (FDI 1x, 4x): distal ≈ +world X
  //    Left  side (FDI 2x, 3x): distal ≈ -world X
  if (isRightSide(fdiId)) {
    if (ex.x < 0) ex.negate();
  } else {
    if (ex.x > 0) ex.negate();
  }

  // 5. Recompute ey = ez × ex to guarantee orthonormality
  //    (ez and ex are already perpendicular, but after the sign flip
  //     we must recompute ey so the three form a consistent triad)
  ey = new THREE.Vector3().crossVectors(ez, ex).normalize();

  return {
    origin: origin.clone(),
    xAxis: ex,
    yAxis: ey,
    zAxis: ez,
  };
}

// ── Main LCS computation ────────────────────────────────────────────────────

/**
 * Compute the anatomical Local Coordinate System for a single tooth
 * using PCA (fallback when API data is not available).
 *
 * Convention:
 *   Origin = FacialPt (FA point)
 *   +X = Distal,  -X = Mesial
 *   +Y = Buccal,  -Y = Lingual
 *   +Z = Occlusal, -Z = Gingival
 *
 * @param mesh     The tooth's Three.js mesh (with position + normal attributes)
 * @param faPoint  Facial Axis point on the buccal surface
 * @param fdiId    FDI tooth number (11-48) — needed to determine mesial/distal sign
 */
export function computeToothLCS(
  mesh: THREE.Mesh,
  faPoint: THREE.Vector3,
  fdiId?: number,
): LocalCoordinateSystem {
  const geometry = mesh.geometry;

  // ── ey hint: surface normal at FacialPt (buccal direction) ─────────────
  const eyHint = surfaceNormalAtPoint(geometry, faPoint);

  // ── ez: occlusal direction from PCA ────────────────────────────────────
  //   Pick the PCA component most perpendicular to ey AND most vertical.
  //   Then orient it toward +Y (occlusal = up for upper jaw after alignment,
  //   also up for lower jaw since lower teeth point up in the viewer).
  const pca = computePCA(geometry);
  const candidates = [pca.pc1, pca.pc2, pca.pc3];
  const worldUp = new THREE.Vector3(0, 1, 0);

  let bestEz = candidates[0].clone();
  let bestScore = -Infinity;

  for (const pc of candidates) {
    const ortho = 1 - Math.abs(pc.dot(eyHint));
    const vert = Math.abs(pc.dot(worldUp));
    const score = ortho * 0.6 + vert * 0.4;
    if (score > bestScore) {
      bestScore = score;
      bestEz = pc.clone();
    }
  }

  // Orient toward occlusal (+Y world)
  if (bestEz.dot(worldUp) < 0) {
    bestEz.negate();
  }

  return buildOrthonormalLCS(
    faPoint,
    bestEz,
    eyHint,
    fdiId ?? 21, // default to left side if unknown
  );
}

/**
 * Build an LCS from three pre-computed axis vectors (from the Python API).
 *
 * @param origin       FA point
 * @param buccalDir    Faciolingual direction (buccal outward) → becomes +Y
 * @param longAxis     Okluzogingival direction from API — points toward occlusal
 *                     (despite the name "okluzogingival", the Python code orients
 *                      OG toward the occlusal surface, NOT toward gingival).
 * @param mesiodistal  Mesiodistal direction from the API (unused but kept for API compat)
 * @param fdiId        FDI number for distal sign correction
 */
export function buildAnatomicalLCS(
  origin: THREE.Vector3,
  buccalDir: THREE.Vector3,
  longAxis: THREE.Vector3,
  _mesiodistal: THREE.Vector3,
  fdiId: number,
): LocalCoordinateSystem {
  // The Python API's okluzogingival axis:
  //   Upper jaw → points -Z in training coords (toward the occlusal surface)
  //   Lower jaw → points +Z in training coords (toward the occlusal surface)
  //
  // In both cases OG points TOWARD the occlusal surface (biting edge).
  // After occlusal alignment in Three.js, that direction maps to +Y (world up)
  // for both jaws (upper teeth still have crowns pointing toward the bite plane,
  // lower teeth also point toward the bite plane from below).
  //
  // However the API axes are in the ORIGINAL mesh coordinate space before
  // Three.js alignment.  The mesh loader may rotate the model so that
  // the OG direction ends up close to ±Y world.
  //
  // We use OG directly as the occlusal direction.  If it happens to point
  // away from world +Y (which would mean gingival), we negate it.
  const worldUp = new THREE.Vector3(0, 1, 0);
  let ez = longAxis.clone().normalize();
  if (ez.dot(worldUp) < 0) {
    ez.negate();
  }

  return buildOrthonormalLCS(origin, ez, buccalDir, fdiId);
}

// ── Clinical angles ─────────────────────────────────────────────────────────

/**
 * Extract clinical angles from an LCS.
 *
 * These are NOT Euler angles (which depend on handedness and suffer from
 * gimbal lock).  Instead they are direct anatomical projection angles:
 *
 *   Tip (mesiodistal angulation):
 *     Angle between the tooth long axis (ez) and the occlusal plane,
 *     projected onto the mesiodistal plane (XZ plane).
 *     Positive = crown tipped toward distal.
 *
 *   Torque (buccolingual inclination):
 *     Angle between the tooth long axis (ez) and the occlusal plane,
 *     projected onto the buccolingual plane (YZ plane).
 *     Positive = crown tipped toward buccal.
 *
 *   Rotation (around the long axis):
 *     Angle between ex (distal direction) and the horizontal XY plane,
 *     projected onto the occlusal plane (XY plane).
 *     Measured as deviation from the ideal arch tangent direction.
 *
 * Returned in degrees.  Zero = ideal alignment with the world frame.
 */
export function extractToothAngles(lcs: LocalCoordinateSystem): ToothAngles {
  const ex = lcs.xAxis;
  const ey = lcs.yAxis;
  const ez = lcs.zAxis;

  // World reference: ideal occlusal = +Y, ideal "up" = Y
  // We measure how much each axis deviates from the ideal.

  // Tip: how much is ez tilted in the XZ plane?
  // Project ez onto XZ plane (remove Y component) and measure angle with pure +Y
  // tip = atan2(ez.x, ez.y)  — positive when crown tips toward distal (X)
  const tip = Math.atan2(ex.dot(ez), ez.y) !== undefined
    ? Math.atan2(ez.x, ez.y)
    : 0;

  // Torque: how much is ez tilted in the YZ plane?
  // torque = atan2(ez.z, ez.y) — positive when crown tips toward buccal (Z)
  // But we want the sign relative to the buccal direction...
  // A simpler formulation: angle between ez and world Y, measured in the
  // plane spanned by ez and ey.
  const torque = Math.atan2(
    ez.dot(ey.clone().cross(new THREE.Vector3(0, 1, 0)).lengthSq() > 1e-12
      ? ey : new THREE.Vector3(0, 0, 1)),
    ez.y,
  );

  // Rotation: deviation of ex from the horizontal plane
  // rotation = atan2(ex.y, sqrt(ex.x² + ex.z²))
  // But more useful: rotation within the occlusal plane
  const rotation = Math.atan2(ex.y, Math.sqrt(ex.x * ex.x + ex.z * ex.z));

  const RAD2DEG = 180 / Math.PI;
  return {
    rotation: rotation * RAD2DEG,
    tip: tip * RAD2DEG,
    torque: torque * RAD2DEG,
  };
}

// ── Matrix utilities ────────────────────────────────────────────────────────

/**
 * Build 4x4 Local→World transformation matrix from LCS.
 * Columns: [ex | ey | ez | origin]
 */
export function buildTransformationMatrix(
  lcs: LocalCoordinateSystem,
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.set(
    lcs.xAxis.x, lcs.yAxis.x, lcs.zAxis.x, lcs.origin.x,
    lcs.xAxis.y, lcs.yAxis.y, lcs.zAxis.y, lcs.origin.y,
    lcs.xAxis.z, lcs.yAxis.z, lcs.zAxis.z, lcs.origin.z,
    0, 0, 0, 1,
  );
  return matrix;
}

/**
 * Build inverse transformation matrix (World → Local).
 */
export function buildInverseMatrix(
  lcs: LocalCoordinateSystem,
): THREE.Matrix4 {
  return buildTransformationMatrix(lcs).clone().invert();
}

/**
 * Convert a THREE.Matrix4 to a JSON-serializable 2D array (row-major).
 */
export function matrixToArray(matrix: THREE.Matrix4): number[][] {
  const e = matrix.elements;
  return [
    [e[0], e[4], e[8], e[12]],
    [e[1], e[5], e[9], e[13]],
    [e[2], e[6], e[10], e[14]],
    [e[3], e[7], e[11], e[15]],
  ];
}
