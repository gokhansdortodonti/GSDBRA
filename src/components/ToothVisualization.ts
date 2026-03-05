// src/components/ToothVisualization.ts
import * as THREE from "three";
import type { ToothEntity, LocalCoordinateSystem } from "../core/types";

// Landmark colors by type
const LANDMARK_COLORS: Record<string, number> = {
  FA_point: 0x16a34a,     // Green
  incisal_edge: 0xeab308,  // Yellow
  mesial_contact: 0xff4444, // Red
  distal_contact: 0x4488ff, // Blue
};

/**
 * Create a scaled landmark sphere based on tooth size
 */
export function createLandmarkSphere(
  toothMesh: THREE.Mesh,
  landmarkType: string,
  position: THREE.Vector3
): THREE.Mesh {
  // Calculate tooth size
  const bbox = new THREE.Box3().setFromObject(toothMesh);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  // Scale radius: 2% of tooth size, max 0.5mm
  const radius = Math.min(maxDim * 0.02, 0.5);

  const color = LANDMARK_COLORS[landmarkType] || 0xffffff;

  const geometry = new THREE.SphereGeometry(radius, 16, 16);
  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.1,
  });

  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(position);
  sphere.name = `landmark_${landmarkType}`;

  return sphere;
}

/**
 * Create LCS axis visualization
 */
export function createLCSVisualization(
  lcs: LocalCoordinateSystem,
  axisLength: number = 2
): THREE.Group {
  const group = new THREE.Group();
  group.name = "lcs_axes";

  // X-axis (Red) - Mesiodistal
  const xArrow = new THREE.ArrowHelper(
    lcs.xAxis,
    lcs.origin,
    axisLength,
    0xff0000,
    axisLength * 0.2,
    axisLength * 0.1
  );
  xArrow.name = "x_axis";
  group.add(xArrow);

  // Y-axis (Green) - Gingivo-occlusal
  const yArrow = new THREE.ArrowHelper(
    lcs.yAxis,
    lcs.origin,
    axisLength,
    0x00ff00,
    axisLength * 0.2,
    axisLength * 0.1
  );
  yArrow.name = "y_axis";
  group.add(yArrow);

  // Z-axis (Blue) - Towards pulp
  const zArrow = new THREE.ArrowHelper(
    lcs.zAxis,
    lcs.origin,
    axisLength,
    0x0000ff,
    axisLength * 0.2,
    axisLength * 0.1
  );
  zArrow.name = "z_axis";
  group.add(zArrow);

  return group;
}

/**
 * Create complete visualization for a tooth entity
 */
export function createToothVisualization(tooth: ToothEntity): THREE.Group {
  const group = new THREE.Group();
  group.name = `tooth_viz_${tooth.id}`;

  // Add mesh
  tooth.mesh.name = `tooth_mesh_${tooth.id}`;
  group.add(tooth.mesh);

  // Add landmark spheres
  Object.entries(tooth.landmarks).forEach(([key, position]) => {
    if (position) {
      const sphere = createLandmarkSphere(tooth.mesh, key, position);
      group.add(sphere);
    }
  });

  return group;
}

/**
 * Create visualization group for all teeth
 */
export function createAllTeethVisualization(
  teeth: Map<number, ToothEntity>,
  showLCS: boolean = false
): THREE.Group {
  const group = new THREE.Group();
  group.name = "teeth_visualization";

  teeth.forEach((tooth) => {
    const toothViz = createToothVisualization(tooth);
    group.add(toothViz);

    // Optionally add LCS visualization
    if (showLCS) {
      const lcsViz = createLCSVisualization(tooth.lcs);
      lcsViz.name = `lcs_${tooth.id}`;
      group.add(lcsViz);
    }
  });

  return group;
}

/**
 * Toggle LCS visibility for all teeth
 */
export function setLCSVisibility(
  parentGroup: THREE.Group,
  visible: boolean
): void {
  parentGroup.traverse((child) => {
    if (child.name.startsWith("lcs_")) {
      child.visible = visible;
    }
  });
}
