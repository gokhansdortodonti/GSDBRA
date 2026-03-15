import * as THREE from "three";
import type { LocalCoordinateSystem, ToothEntity } from "../core/types";

const LANDMARK_COLORS: Record<string, number> = {
  FA_point: 0x16a34a,
  FacialPoint: 0x16a34a,
  OuterPoint: 0xf97316,
  InnerPoint: 0x9333ea,
  incisal_edge: 0xeab308,
  IncisalEdge: 0xeab308,
  Cusp: 0xeab308,
  mesial_contact: 0xff4444,
  Mesial: 0xff4444,
  distal_contact: 0x4488ff,
  Distal: 0x4488ff,
};

/**
 * Create a scaled landmark sphere based on tooth size
 */
export function createLandmarkSphere(
  _toothMesh: THREE.Mesh,
  landmarkType: string,
  position: THREE.Vector3
): THREE.Mesh {
  const radius = 0.08;

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
 * Create LCS axis visualization with anatomical labels
 *
 * Axis convention (from tooth_analysis.py):
 *   X (Red)   = Mesiodistal — along dental arch
 *   Y (Green) = Okluzogingival — crown long axis
 *   Z (Blue)  = Faciolingual — buccal outward direction
 */
export function createLCSVisualization(
  lcs: LocalCoordinateSystem,
  axisLength: number = 2
): THREE.Group {
  const group = new THREE.Group();
  group.name = "lcs_axes";

  const headLength = axisLength * 0.18;
  const headWidth = axisLength * 0.09;

  // X-axis (Red) - Mesiodistal
  const xArrow = new THREE.ArrowHelper(
    lcs.xAxis,
    lcs.origin,
    axisLength,
    0xff5050,
    headLength,
    headWidth
  );
  xArrow.name = "x_axis_md";
  group.add(xArrow);

  // Y-axis (Green) - Okluzogingival (crown long axis)
  const yArrow = new THREE.ArrowHelper(
    lcs.yAxis,
    lcs.origin,
    axisLength,
    0x50ff50,
    headLength,
    headWidth
  );
  yArrow.name = "y_axis_og";
  group.add(yArrow);

  // Z-axis (Blue) - Faciolingual (buccal outward)
  const zArrow = new THREE.ArrowHelper(
    lcs.zAxis,
    lcs.origin,
    axisLength,
    0x5050ff,
    headLength,
    headWidth
  );
  zArrow.name = "z_axis_fl";
  group.add(zArrow);

  // Origin marker — small white sphere at FA point
  const originGeo = new THREE.SphereGeometry(axisLength * 0.06, 12, 12);
  const originMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const originSphere = new THREE.Mesh(originGeo, originMat);
  originSphere.position.copy(lcs.origin);
  originSphere.name = "lcs_origin";
  group.add(originSphere);

  return group;
}

/**
 * Create a 3D text label sprite for a tooth's FDI number
 */
function createToothFDILabel(fdiId: number, position: THREE.Vector3): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Draw circular background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw FDI number
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(fdiId), size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    sizeAttenuation: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(0.6, 0.6, 1);
  sprite.name = `fdi_label_${fdiId}`;
  sprite.renderOrder = 999;

  return sprite;
}

/**
 * Create complete visualization for a tooth entity
 */
export function createToothVisualization(tooth: ToothEntity): THREE.Group {
  const group = new THREE.Group();
  group.name = `tooth_viz_${tooth.id}`;

  tooth.mesh.name = `tooth_mesh_${tooth.id}`;
  group.add(tooth.mesh);

  // Add FDI number label above the tooth
  const toothGeom = tooth.mesh.geometry;
  const posAttr = toothGeom.getAttribute("position");
  if (posAttr) {
    const bbox = new THREE.Box3().setFromBufferAttribute(posAttr as THREE.BufferAttribute);
    const center = bbox.getCenter(new THREE.Vector3());
    // Position label slightly above the tooth's highest point
    const labelPos = new THREE.Vector3(
      center.x,
      bbox.max.y + 0.3,
      center.z
    );
    const label = createToothFDILabel(tooth.id, labelPos);
    group.add(label);
  }

  if (tooth.rawLandmarks.length > 0) {
    tooth.rawLandmarks.forEach((landmark, index) => {
      const sphere = createLandmarkSphere(
        tooth.mesh,
        landmark.class,
        new THREE.Vector3(...landmark.coord)
      );
      sphere.name = `landmark_${landmark.class}_${index}`;
      group.add(sphere);
    });
  } else {
    Object.entries(tooth.landmarks).forEach(([key, position]) => {
      if (position) {
        const sphere = createLandmarkSphere(tooth.mesh, key, position);
        group.add(sphere);
      }
    });
  }

  return group;
}

/**
 * Create visualization group for all teeth
 */
export function createAllTeethVisualization(
  teeth: Map<number, ToothEntity>,
  showLCS: boolean = true
): THREE.Group {
  const group = new THREE.Group();
  group.name = "teeth_visualization";

  teeth.forEach((tooth) => {
    const toothViz = createToothVisualization(tooth);
    group.add(toothViz);

    // Compute axis length relative to tooth bounding box
    const toothPos = tooth.mesh.geometry.getAttribute("position");
    let axisLen = 2;
    if (toothPos) {
      const bbox = new THREE.Box3().setFromBufferAttribute(
        toothPos as THREE.BufferAttribute
      );
      const size = bbox.getSize(new THREE.Vector3());
      axisLen = Math.max(size.x, size.y, size.z) * 0.4;
    }

    if (showLCS) {
      const lcsViz = createLCSVisualization(tooth.lcs, axisLen);
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
