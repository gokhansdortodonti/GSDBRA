"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  computeAutoOcclusalPlane as runAutoPlane,
  computeAutoOcclusalPlaneWithICP,
  type AutoPlaneResult,
  type AutoPlaneResultWithICP,
  type ICPProgressCallback,
} from "./autoOcclusalPlane";
import { extractJawBaseMesh, segmentTeeth } from "../core/ToothSegmenter";
import { createAllTeethVisualization, setLCSVisibility } from "./ToothVisualization";
import { downloadTeethJSON, exportAllTeethToJSON } from "../utils/toothExport";
import type {
  LandmarkPoint,
  SegmentationResult,
  ToothEntity,
  ToothExportJSON,
} from "../core/types";
export type { LandmarkPoint, SegmentationResult } from "../core/types";

// ─── Public types ─────────────────────────────────────────────────────────────
export interface OcclusalPlaneData {
  normal: THREE.Vector3;
  center: THREE.Vector3;
  landmarks?: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

export interface AlignmentBasis {
  X: THREE.Vector3; // right
  Y: THREE.Vector3; // front (anterior)
  Z: THREE.Vector3; // up (occlusal normal)
  center: THREE.Vector3;
}

export interface ThreeViewerHandle {
  loadMesh: (file: File, jaw: "maxilla" | "mandible") => Promise<void>;
  clearMesh: (jaw: "maxilla" | "mandible") => void;
  resetCamera: () => void;
  setWireframe: (v: boolean) => void;
  setOrthographic: (v: boolean) => void;
  setPickMode: (mode: PickMode) => void;
  clearLandmarks: () => void;
  getOcclusalPlane: () => OcclusalPlaneData | null;
  setView: (view: ViewPreset) => void;
  setGizmoMode: (mode: "translate" | "rotate") => void;
  setMeshVisible: (jaw: "maxilla" | "mandible", visible: boolean) => void;
  setMeshOpacity: (jaw: "maxilla" | "mandible", opacity: number) => void;
  setMeshColor: (jaw: "maxilla" | "mandible", hex: string) => void;
  setSceneBrightness: (value: number) => void;
  undoLandmark: () => void;
  setGizmoAxis: (axis: "all" | "x" | "y" | "z") => void;
  applySegmentation: (result: SegmentationResult, jaw: "maxilla" | "mandible") => number;
  clearSegmentation: () => void;
  detachGizmo: () => void;
  // ── Tooth entity access ─────────────────────────────────────────────────────
  getToothEntities: () => Map<number, ToothEntity>;
  exportTeethJSON: () => ToothExportJSON[];
  downloadTeethJSON: (filename?: string) => void;
  setLCSVisible: (visible: boolean) => void;
  getTooth: (toothId: number) => ToothEntity | undefined;
  transformTooth: (toothId: number, matrix: THREE.Matrix4) => void;
  // ── Occlusal alignment ──────────────────────────────────────────────────────
  computeAutoOcclusalPlane: () => AutoPlaneResult | null;
  computeAutoOcclusalPlaneWithICP: (onProgress?: ICPProgressCallback) => AutoPlaneResultWithICP | null;
  setAnteriorPickMode: () => void;
  applyFullAlignment: (anteriorPoint: THREE.Vector3) => AlignmentBasis | null;
  applyOcclusalAlignment: (plane: OcclusalPlaneData) => void;
  saveAlignmentMatrix: () => THREE.Matrix4;
  resetAlignment: () => void;
  getAlignmentBasis: () => AlignmentBasis | null;
  // ── Post-alignment flip corrections ──────────────────────────────────────────
  flipAlignmentNormal: () => void;
  flipAlignmentX: () => void;
  flipFrontBack: () => void;
}

export type PickMode = "none" | "landmark" | "anteriorPick";
export type ViewPreset = "perspective" | "front" | "back" | "top" | "side" | "sideLeft" | "sideRight" | "bottom";
type JawKey = "maxilla" | "mandible";

interface ThreeViewerProps {
  onMeshLoaded?: (jaw: "maxilla" | "mandible", fileName: string) => void;
  onAnteriorPicked?: (point: THREE.Vector3) => void;
  onLandmarkPicked?: (index: number, point: THREE.Vector3) => void;
  onLandmarkUndone?: (newCount: number) => void;
  onOcclusalPlaneDefined?: (plane: OcclusalPlaneData) => void;
  onPickError?: (message: string) => void;   // collinear points, etc.
  onSetView?: (view: ViewPreset) => void;
  showGrid?: boolean;
  wireframe?: boolean;
  viewMode?: ViewPreset;
  orthographic?: boolean;
}

// ─── ViewCube face material helper ───────────────────────────────────────────
function makeViewCubeFaceMat(label: string, bg: string): THREE.MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, 64, 64, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2;
  ctx.roundRect(2, 2, 60, 60, 6);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 32, 32);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAXILLA_COLOR = 0xfff3e0;
const MANDIBLE_COLOR = 0xe3f2fd;
const LANDMARK_COLORS = [0x44ff44, 0xff4444, 0x4488ff]; // L molar (green), R molar (red), anterior (blue)
const LANDMARK_LABELS = ["L Molar", "R Molar", "Anterior"];
const PLANE_COLOR = 0x2563eb;
const CLICK_THRESHOLD_PX = 6;

function dedupeGeometryForSegmentation(
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  if (!position) {
    return geometry;
  }

  const index = geometry.getIndex();
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
  const dedupedPositions: number[] = [];
  const dedupedIndices: number[] = [];
  const uniqueVertexMap = new Map<string, number>();

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    for (let corner = 0; corner < 3; corner++) {
      const sourceIndex = index
        ? index.getX(triangleIndex * 3 + corner)
        : triangleIndex * 3 + corner;
      const x = position.getX(sourceIndex);
      const y = position.getY(sourceIndex);
      const z = position.getZ(sourceIndex);
      const key = `${Math.round(x * 1e8)},${Math.round(y * 1e8)},${Math.round(z * 1e8)}`;

      let dedupedIndex = uniqueVertexMap.get(key);
      if (dedupedIndex === undefined) {
        dedupedIndex = dedupedPositions.length / 3;
        uniqueVertexMap.set(key, dedupedIndex);
        dedupedPositions.push(x, y, z);
      }

      dedupedIndices.push(dedupedIndex);
    }
  }

  const normalizedGeometry = new THREE.BufferGeometry();
  normalizedGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(dedupedPositions, 3)
  );
  normalizedGeometry.setIndex(dedupedIndices);
  normalizedGeometry.computeVertexNormals();
  normalizedGeometry.computeBoundingBox();
  normalizedGeometry.computeBoundingSphere();

  return normalizedGeometry;
}

// Per-tooth color palette (20 distinct colors for FDI teeth)
const TOOTH_PALETTE: number[] = [
  0xe63946, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x457b9d,
  0x6a4c93, 0x1982c4, 0xff595e, 0xffca3a, 0x8ac926,
  0xff924c, 0x52b788, 0x4361ee, 0xf72585, 0x7209b7,
  0x3a86ff, 0x06d6a0, 0xef233c, 0xfca311, 0x9b2226,
];

// Landmark class → sphere color
// ─── Load geometry from file ──────────────────────────────────────────────────
function loadGeometry(file: File): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const url = URL.createObjectURL(file);
    const finish = (geom: THREE.BufferGeometry) => {
      URL.revokeObjectURL(url);
      const normalizedGeometry = dedupeGeometryForSegmentation(geom);
      if (normalizedGeometry !== geom) {
        geom.dispose();
      }
      // Preserve original scanner coordinates — scaling applied uniformly
      // in loadMesh so that bite relationship between maxilla/mandible is intact
      resolve(normalizedGeometry);
    };

    if (ext === "stl") {
      new STLLoader().load(url, finish, undefined, reject);
    } else if (ext === "ply") {
      new PLYLoader().load(url, finish, undefined, reject);
    } else if (ext === "obj") {
      new OBJLoader().load(
        url,
        (obj) => {
          const geoms: THREE.BufferGeometry[] = [];
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              geoms.push((child as THREE.Mesh).geometry.clone());
            }
          });
          URL.revokeObjectURL(url);
          if (geoms.length === 0) {
            reject(new Error("No mesh in OBJ"));
            return;
          }
          finish(geoms[0]);
        },
        undefined,
        reject
      );
    } else {
      URL.revokeObjectURL(url);
      reject(new Error(`Unsupported format: ${ext}`));
    }
  });
}

// ─── Build occlusal plane mesh from 3 points ─────────────────────────────────
function buildOcclusalPlane(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3
): { planeMesh: THREE.Mesh; normalArrow: THREE.ArrowHelper; center: THREE.Vector3; normal: THREE.Vector3 } {
  const center = new THREE.Vector3()
    .addVectors(p0, p1)
    .add(p2)
    .divideScalar(3);

  const v1 = new THREE.Vector3().subVectors(p1, p0);
  const v2 = new THREE.Vector3().subVectors(p2, p0);
  const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
  // Ensure normal points "up" (positive Y)
  if (normal.y < 0) normal.negate();

  // Plane size based on span of points
  const span = Math.max(
    p0.distanceTo(p1),
    p1.distanceTo(p2),
    p0.distanceTo(p2)
  );
  const size = Math.max(span * 1.6, 8);

  const planeGeom = new THREE.PlaneGeometry(size, size, 8, 8);
  const planeMat = new THREE.MeshBasicMaterial({
    color: PLANE_COLOR,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const planeMesh = new THREE.Mesh(planeGeom, planeMat);

  // Orient plane to match normal
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal
  );
  planeMesh.quaternion.copy(quaternion);
  planeMesh.position.copy(center);

  // Wireframe overlay
  const wireGeom = new THREE.PlaneGeometry(size, size, 4, 4);
  const wireMat = new THREE.MeshBasicMaterial({
    color: PLANE_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const wireMesh = new THREE.Mesh(wireGeom, wireMat);
  wireMesh.quaternion.copy(quaternion);
  wireMesh.position.copy(center);
  planeMesh.add(wireMesh);

  // Normal arrow
  const normalArrow = new THREE.ArrowHelper(
    normal,
    center,
    size * 0.25,
    0xfbbf24,
    size * 0.06,
    size * 0.04
  );

  return { planeMesh, normalArrow, center, normal };
}

// ─── Build single plane visualization from normal + center ────────────────────
function buildSinglePlaneVis(
  normal: THREE.Vector3,
  center: THREE.Vector3,
  size = 20
): { planeMesh: THREE.Mesh; normalArrow: THREE.ArrowHelper } {
  const planeGeom = new THREE.PlaneGeometry(size, size, 8, 8);
  const planeMat = new THREE.MeshBasicMaterial({
    color: PLANE_COLOR,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const planeMesh = new THREE.Mesh(planeGeom, planeMat);

  // Orient plane so its local +Z matches the plane normal
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal.clone().normalize()
  );
  planeMesh.quaternion.copy(quaternion);
  planeMesh.position.copy(center);

  // Wireframe overlay
  const wireGeom = new THREE.PlaneGeometry(size, size, 4, 4);
  const wireMat = new THREE.MeshBasicMaterial({
    color: PLANE_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const wireMesh = new THREE.Mesh(wireGeom, wireMat);
  wireMesh.quaternion.copy(quaternion);
  wireMesh.position.copy(center);
  planeMesh.add(wireMesh);

  // Normal arrow
  const normalArrow = new THREE.ArrowHelper(
    normal.clone().normalize(),
    center,
    size * 0.25,
    0xfbbf24,
    size * 0.06,
    size * 0.04
  );

  return { planeMesh, normalArrow };
}

// ─── Landmark sphere ──────────────────────────────────────────────────────────
function makeLandmarkSphere(color: number, radius = 0.18): THREE.Mesh {
  const geom = new THREE.SphereGeometry(radius, 16, 16);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.1,
  });
  return new THREE.Mesh(geom, mat);
}

// ─── Component ────────────────────────────────────────────────────────────────
const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  function ThreeViewer(
    {
      onMeshLoaded,
      onAnteriorPicked,
      onLandmarkPicked,
      onLandmarkUndone,
      onOcclusalPlaneDefined,
      onPickError,
      onSetView,
      showGrid = false,
      wireframe = false,
      viewMode = "perspective",
      orthographic = false,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orthoCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const transformRef = useRef<TransformControls | null>(null);
    const frameRef = useRef<number>(0);

    const maxillaMeshRef = useRef<THREE.Mesh | null>(null);
    const mandibleMeshRef = useRef<THREE.Mesh | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);
    // Pivot group — both jaw meshes are children of this group so they
    // can be transformed together as a single rigid body.
    const pivotGroupRef = useRef<THREE.Group | null>(null);
    // Whether the occlusal alignment has been applied to the pivot group
    const alignmentAppliedRef = useRef(false);
    // Orthonormal basis built from plane normal + anterior point
    const alignmentBasisRef = useRef<AlignmentBasis | null>(null);

    // ─── ViewCube refs ────────────────────────────────────────────────────────
    const cubeSceneRef = useRef<THREE.Scene | null>(null);
    const cubeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const cubeGroupRef = useRef<THREE.Group | null>(null);
    const cubeBoxMeshRef = useRef<THREE.Mesh | null>(null);

    // Landmark picking state
    const pickModeRef = useRef<PickMode>("none");
    const landmarksRef = useRef<THREE.Vector3[]>([]);
    const landmarkSpheresRef = useRef<THREE.Mesh[]>([]);
    const occlusalPlaneRef = useRef<THREE.Mesh | null>(null);
    const normalArrowRef = useRef<THREE.ArrowHelper | null>(null);
    const occlusalDataRef = useRef<OcclusalPlaneData | null>(null);

    // Pointer state for drag detection and sphere dragging
    const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
    const draggingSphereRef = useRef<{ sphere: THREE.Mesh; index: number } | null>(null);

    const isOrthoRef = useRef(false);

    // Scene-level scale factor (same for all models to preserve bite relationship)
    const scaleFactorRef = useRef<number | null>(null);

    // Light refs for brightness control
    const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
    const dirLight1Ref = useRef<THREE.DirectionalLight | null>(null);

    // Segmentation state
    const teethEntitiesRef = useRef<Record<JawKey, Map<number, ToothEntity>>>({
      maxilla: new Map(),
      mandible: new Map(),
    });
    const teethVizRef = useRef<Record<JawKey, THREE.Group | null>>({
      maxilla: null,
      mandible: null,
    });
    const showLCSRef = useRef<boolean>(true);

    const [isDragOver, setIsDragOver] = useState(false);
    const [pickMode, setPickModeState] = useState<PickMode>("none");
    const [landmarkCount, setLandmarkCount] = useState(0);

    // ── Active camera ─────────────────────────────────────────────────────────
    const getCamera = useCallback((): THREE.Camera => {
      return isOrthoRef.current
        ? (orthoCameraRef.current as THREE.Camera)
        : (perspCameraRef.current as THREE.Camera);
    }, []);

    // ── Fit camera to loaded meshes ───────────────────────────────────────────
    const fitCamera = useCallback(() => {
      const controls = controlsRef.current;
      if (!controls) return;

      // Ensure transforms are current before computing bounds
      pivotGroupRef.current?.updateMatrixWorld(true);

      const box = new THREE.Box3();
      // Use pivot group if it has been set up, otherwise individual meshes
      if (pivotGroupRef.current) {
        box.expandByObject(pivotGroupRef.current);
      } else {
        [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
          if (r.current) box.expandByObject(r.current);
        });
      }

      let center = new THREE.Vector3();
      let dist = 18;

      if (!box.isEmpty()) {
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        dist = maxDim * 1.8;
      }

      const cam = getCamera();
      if (cam instanceof THREE.PerspectiveCamera) {
        cam.position.set(center.x, center.y + dist * 0.4, center.z + dist);
      } else if (cam instanceof THREE.OrthographicCamera) {
        cam.position.set(center.x, center.y + dist * 0.4, center.z + dist);
        const aspect = mountRef.current
          ? mountRef.current.clientWidth / mountRef.current.clientHeight
          : 1;
        const half = dist * 0.6;
        cam.left = -half * aspect;
        cam.right = half * aspect;
        cam.top = half;
        cam.bottom = -half;
        cam.updateProjectionMatrix();
      }
      controls.target.copy(center);
      controls.update();
    }, [getCamera]);

    const clearSegmentationForJaw = useCallback((jaw: JawKey) => {
      const pivotGroup = pivotGroupRef.current;
      const scene = sceneRef.current;
      const vizGroup = teethVizRef.current[jaw];

      if (vizGroup) {
        if (pivotGroup) {
          pivotGroup.remove(vizGroup);
        } else {
          scene?.remove(vizGroup);
        }
        teethVizRef.current[jaw] = null;
      }

      teethEntitiesRef.current[jaw].clear();

      const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
      if (meshRef.current) {
        meshRef.current.visible = true;
      }
    }, []);

    const getAllToothEntities = useCallback(() => {
      const merged = new Map<number, ToothEntity>();

      (["maxilla", "mandible"] as JawKey[]).forEach((jaw) => {
        teethEntitiesRef.current[jaw].forEach((tooth, toothId) => {
          merged.set(toothId, tooth);
        });
      });

      return merged;
    }, []);

    const applyToJawMaterials = useCallback(
      (jaw: JawKey, update: (material: THREE.MeshPhysicalMaterial) => void) => {
        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        if (meshRef.current) {
          update(meshRef.current.material as THREE.MeshPhysicalMaterial);
        }

        const vizGroup = teethVizRef.current[jaw];
        if (!vizGroup) return;

        vizGroup.traverse((child) => {
          if (
            (child as THREE.Mesh).isMesh &&
            (
              child.name.startsWith("tooth_mesh_") ||
              child.name.startsWith("jaw_base_") ||
              child.name.startsWith("jaw_reference_")
            )
          ) {
            update((child as THREE.Mesh).material as THREE.MeshPhysicalMaterial);
          }
        });
      },
      []
    );

    // ── Set backface culling for both jaw meshes ───────────────────────────
    const setJawCulling = useCallback((frontOnly: boolean) => {
      (["maxilla", "mandible"] as JawKey[]).forEach((jaw) => {
        applyToJawMaterials(jaw, (material) => {
          material.side = frontOnly ? THREE.FrontSide : THREE.DoubleSide;
          material.needsUpdate = true;
        });
      });
    }, [applyToJawMaterials]);

    // ── Sync ortho camera frustum on resize ───────────────────────────────────
    const syncOrthoFrustum = useCallback(() => {
      const cam = orthoCameraRef.current;
      const mount = mountRef.current;
      if (!cam || !mount) return;
      const aspect = mount.clientWidth / mount.clientHeight;
      const half = (cam.top - cam.bottom) / 2 || 10;
      cam.left = -half * aspect;
      cam.right = half * aspect;
      cam.updateProjectionMatrix();
    }, []);

    // ── setView extracted for reuse (ViewCube + imperative handle) ────────────
    const setViewCallback = useCallback((view: ViewPreset) => {
      const controls = controlsRef.current;
      const cam = getCamera();
      if (!controls || !cam) return;

      pivotGroupRef.current?.updateMatrixWorld(true);

      const box = new THREE.Box3();
      if (pivotGroupRef.current) {
        box.expandByObject(pivotGroupRef.current);
      } else {
        [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
          if (r.current) box.expandByObject(r.current);
        });
      }

      const center = box.isEmpty()
        ? new THREE.Vector3()
        : (() => { const c = new THREE.Vector3(); box.getCenter(c); return c; })();

      const size = new THREE.Vector3();
      if (!box.isEmpty()) box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = Math.max(maxDim * 1.5, 18);

      if (cam instanceof THREE.PerspectiveCamera) {
        cam.near = 0.1;
        cam.updateProjectionMatrix();
      }

      const basis = alignmentBasisRef.current;

      if (basis) {
        // ── Basis-aware camera presets ──────────────────────────────────────
        const bCenter = center; // use bounding center for camera target
        let dir: THREE.Vector3;
        let up: THREE.Vector3;
        let cull = false;

        switch (view) {
          case "front":
            dir = basis.Y.clone();
            up = basis.Z.clone();
            break;
          case "back":
            dir = basis.Y.clone().negate();
            up = basis.Z.clone();
            break;
          case "side":
          case "sideLeft":
            dir = basis.X.clone().negate();
            up = basis.Z.clone();
            break;
          case "sideRight":
            dir = basis.X.clone();
            up = basis.Z.clone();
            break;
          case "top":
            dir = basis.Z.clone();
            up = basis.Y.clone().negate();
            cull = true;
            break;
          case "bottom":
            dir = basis.Z.clone().negate();
            up = basis.Y.clone();
            cull = true;
            break;
          default: // perspective
            dir = new THREE.Vector3()
              .addScaledVector(basis.Y, 0.7)
              .addScaledVector(basis.Z, 0.4)
              .normalize();
            up = basis.Z.clone();
            break;
        }

        setJawCulling(cull);
        cam.up.copy(up);
        cam.position.copy(bCenter).addScaledVector(dir, dist);
        controls.target.copy(bCenter);
        cam.lookAt(bCenter);
      } else {
        // ── Fallback: no basis yet — use world axes ──────────────────────────
        switch (view) {
          case "front":
            setJawCulling(false);
            cam.up.set(0, 1, 0);
            cam.position.set(center.x, center.y, center.z + dist);
            break;
          case "back":
            setJawCulling(false);
            cam.up.set(0, 1, 0);
            cam.position.set(center.x, center.y, center.z - dist);
            break;
          case "top": {
            const clearance = Math.max(dist * 0.55, 2);
            const camY = box.isEmpty() ? dist : box.max.y + clearance;
            cam.up.set(0, 0, -1);
            cam.position.set(center.x, camY, center.z);
            setJawCulling(true);
            break;
          }
          case "bottom": {
            const clearance = Math.max(dist * 0.55, 2);
            const camY = box.isEmpty() ? -dist : box.min.y - clearance;
            cam.up.set(0, 0, 1);
            cam.position.set(center.x, camY, center.z);
            setJawCulling(true);
            break;
          }
          case "side":
          case "sideLeft":
            setJawCulling(false);
            cam.up.set(0, 1, 0);
            cam.position.set(center.x - dist, center.y, center.z);
            break;
          case "sideRight":
            setJawCulling(false);
            cam.up.set(0, 1, 0);
            cam.position.set(center.x + dist, center.y, center.z);
            break;
          default:
            setJawCulling(false);
            cam.up.set(0, 1, 0);
            cam.position.set(center.x, center.y + dist * 0.4, center.z + dist);
        }
        controls.target.copy(center);
      }

      if (cam instanceof THREE.OrthographicCamera) syncOrthoFrustum();
      controls.update();
      onSetView?.(view);
    }, [getCamera, setJawCulling, syncOrthoFrustum, onSetView]);

    // ── ViewCube click detection ──────────────────────────────────────────────
    const VCUBE_CSS = 96;
    const VCUBE_MARGIN = 10;

    const checkViewCubeClick = useCallback((clientX: number, clientY: number): ViewPreset | null => {
      const mount = mountRef.current;
      if (!mount || !cubeBoxMeshRef.current || !cubeCameraRef.current) return null;
      const rect = mount.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const W = rect.width;
      const cubeLeft = W - VCUBE_CSS - VCUBE_MARGIN;
      const cubeTop = VCUBE_MARGIN;
      const cubeRight = W - VCUBE_MARGIN;
      const cubeBottom = VCUBE_MARGIN + VCUBE_CSS;
      if (cx < cubeLeft || cx > cubeRight || cy < cubeTop || cy > cubeBottom) return null;
      const nx = ((cx - cubeLeft) / VCUBE_CSS) * 2 - 1;
      const ny = -((cy - cubeTop) / VCUBE_CSS) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), cubeCameraRef.current);
      cubeGroupRef.current?.updateMatrixWorld(true);
      const hits = raycaster.intersectObject(cubeBoxMeshRef.current, false);
      if (hits.length === 0) return null;
      const matIdx = hits[0].face?.materialIndex ?? -1;
      // BoxGeometry face order: +X=0, -X=1, +Y=2, -Y=3, +Z=4, -Z=5
      const MAP: Record<number, ViewPreset> = {
        0: "sideRight",  // +X right
        1: "sideLeft",   // -X left
        2: "top",        // +Y top
        3: "bottom",     // -Y bottom
        4: "front",      // +Z front
        5: "back",       // -Z back
      };
      return MAP[matIdx] ?? null;
    }, []);

    // ── Rebuild occlusal plane from current landmarks ─────────────────────────
    const rebuildPlane = useCallback(
      (silent = false) => {
        const scene = sceneRef.current;
        if (!scene || landmarksRef.current.length < 3) return;

        const [p0, p1, p2] = landmarksRef.current as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3
        ];

        // ── Collinearity guard ────────────────────────────────────────────────
        const _v1 = new THREE.Vector3().subVectors(p1, p0);
        const _v2 = new THREE.Vector3().subVectors(p2, p0);
        const crossLen = new THREE.Vector3().crossVectors(_v1, _v2).length();
        if (crossLen < 0.01) {
          onPickError?.("3 nokta neredeyse aynı doğrultuda — düzlem tanımlanamıyor. Lütfen tekrar seçin.");
          return;
        }

        const { planeMesh, normalArrow, center, normal } = buildOcclusalPlane(
          p0,
          p1,
          p2
        );

        if (occlusalPlaneRef.current) scene.remove(occlusalPlaneRef.current);
        if (normalArrowRef.current) scene.remove(normalArrowRef.current);

        scene.add(planeMesh);
        scene.add(normalArrow);
        occlusalPlaneRef.current = planeMesh;
        normalArrowRef.current = normalArrow;

        const tc = transformRef.current;
        if (tc) {
          tc.attach(planeMesh);
          tc.camera = getCamera();
        }

        const planeData: OcclusalPlaneData = {
          normal,
          center,
          landmarks: [p0, p1, p2],
        };
        occlusalDataRef.current = planeData;

        if (!silent) {
          onOcclusalPlaneDefined?.(planeData);
        }
      },
      [getCamera, onOcclusalPlaneDefined, onPickError]
    );

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      loadMesh: async (file: File, jaw: "maxilla" | "mandible") => {
        const geom = await loadGeometry(file);

        // Compute scene-level scale from first loaded model; reuse for all
        // subsequent models so relative positions (bite) are preserved
        if (scaleFactorRef.current === null) {
          const box = new THREE.Box3().setFromBufferAttribute(
            geom.attributes.position as THREE.BufferAttribute
          );
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          scaleFactorRef.current = maxDim > 0 ? 10 / maxDim : 1;
        }
        geom.scale(scaleFactorRef.current, scaleFactorRef.current, scaleFactorRef.current);

        const color = jaw === "maxilla" ? MAXILLA_COLOR : MANDIBLE_COLOR;
        const mat = new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.28,
          metalness: 0.0,
          clearcoat: 0.55,
          clearcoatRoughness: 0.15,
          side: THREE.DoubleSide,
          wireframe,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.importScale = scaleFactorRef.current ?? 1;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const scene = sceneRef.current;
        if (!scene) return;

        // Ensure pivot group exists in scene
        if (!pivotGroupRef.current) {
          const g = new THREE.Group();
          pivotGroupRef.current = g;
          scene.add(g);
        }
        const pivotGroup = pivotGroupRef.current;

        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        clearSegmentationForJaw(jaw);
        if (meshRef.current) pivotGroup.remove(meshRef.current);
        meshRef.current = mesh;
        pivotGroup.add(mesh);
        fitCamera();
        onMeshLoaded?.(jaw, file.name);
      },

      clearMesh: (jaw: "maxilla" | "mandible") => {
        clearSegmentationForJaw(jaw);
        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        if (meshRef.current && pivotGroupRef.current) {
          pivotGroupRef.current.remove(meshRef.current);
          meshRef.current = null;
        }
        // Reset scene scale when no models remain so next import is re-calibrated
        const otherRef = jaw === "maxilla" ? mandibleMeshRef : maxillaMeshRef;
        if (!otherRef.current) {
          scaleFactorRef.current = null;
          alignmentAppliedRef.current = false;
        }
      },

      resetCamera: () => fitCamera(),

      setWireframe: (v: boolean) => {
        (["maxilla", "mandible"] as JawKey[]).forEach((jaw) => {
          applyToJawMaterials(jaw, (material) => {
            material.wireframe = v;
            material.needsUpdate = true;
          });
        });
      },

      setOrthographic: (v: boolean) => {
        isOrthoRef.current = v;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;
        if (!controls || !renderer) return;
        const cam = getCamera();
        controls.object = cam;
        if (v) syncOrthoFrustum();
        controls.update();
      },

      setPickMode: (mode: PickMode) => {
        pickModeRef.current = mode;
        setPickModeState(mode);
        // Orbit controls remain enabled — user can orbit while placing landmarks
      },

      clearLandmarks: () => {
        const scene = sceneRef.current;
        if (!scene) return;
        landmarkSpheresRef.current.forEach((s) => scene.remove(s));
        landmarkSpheresRef.current = [];
        landmarksRef.current = [];
        if (occlusalPlaneRef.current) {
          scene.remove(occlusalPlaneRef.current);
          occlusalPlaneRef.current = null;
        }
        if (normalArrowRef.current) {
          scene.remove(normalArrowRef.current);
          normalArrowRef.current = null;
        }
        // Detach transform controls
        const tc = transformRef.current;
        if (tc) tc.detach();
        occlusalDataRef.current = null;
        setLandmarkCount(0);
      },

      undoLandmark: () => {
        const scene = sceneRef.current;
        if (!scene || landmarksRef.current.length === 0) return;

        // Remove last sphere
        const sphere = landmarkSpheresRef.current.pop();
        if (sphere) scene.remove(sphere);
        landmarksRef.current.pop();

        const newCount = landmarksRef.current.length;

        // If we previously had 3 and now have 2, remove plane and re-enter pick mode
        if (newCount < 3) {
          if (occlusalPlaneRef.current) {
            scene.remove(occlusalPlaneRef.current);
            occlusalPlaneRef.current = null;
          }
          if (normalArrowRef.current) {
            scene.remove(normalArrowRef.current);
            normalArrowRef.current = null;
          }
          const tc = transformRef.current;
          if (tc) tc.detach();
          occlusalDataRef.current = null;
          // Re-enable picking
          pickModeRef.current = "landmark";
          setPickModeState("landmark");
        }

        setLandmarkCount(newCount);
        onLandmarkUndone?.(newCount);
      },

      getOcclusalPlane: () => occlusalDataRef.current,

      setGizmoMode: (mode: "translate" | "rotate") => {
        const tc = transformRef.current;
        if (tc) tc.setMode(mode);
      },

      setGizmoAxis: (axis: "all" | "x" | "y" | "z") => {
        const tc = transformRef.current;
        if (!tc) return;
        tc.showX = axis === "all" || axis === "x";
        tc.showY = axis === "all" || axis === "y";
        tc.showZ = axis === "all" || axis === "z";
      },

      setMeshVisible: (jaw: "maxilla" | "mandible", visible: boolean) => {
        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        const vizGroup = teethVizRef.current[jaw];

        if (vizGroup) {
          vizGroup.visible = visible;
        }

        if (meshRef.current) {
          meshRef.current.visible = vizGroup ? false : visible;
        }
      },

      setMeshOpacity: (jaw: "maxilla" | "mandible", opacity: number) => {
        applyToJawMaterials(jaw, (material) => {
          material.transparent = opacity < 1;
          material.opacity = opacity;
          material.depthWrite = opacity >= 1;
          material.needsUpdate = true;
        });
      },

      setMeshColor: (jaw: "maxilla" | "mandible", hex: string) => {
        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        if (!meshRef.current) return;
        const mat = meshRef.current.material as THREE.MeshPhysicalMaterial;
        mat.color.setStyle(hex);
        mat.needsUpdate = true;
      },

      setSceneBrightness: (value: number) => {
        if (ambientLightRef.current) ambientLightRef.current.intensity = 1.6 * value;
        if (dirLight1Ref.current) dirLight1Ref.current.intensity = 2.2 * value;
      },

      setView: setViewCallback,

      // ── Tooth segmentation ────────────────────────────────────────────────
      applySegmentation: (result: SegmentationResult, jaw: "maxilla" | "mandible") => {
        const mesh = jaw === "maxilla" ? maxillaMeshRef.current : mandibleMeshRef.current;
        const pivotGroup = pivotGroupRef.current;
        if (!mesh || !pivotGroup) {
          return 0;
        }

        const position = mesh.geometry.getAttribute("position");
        if (!position || result.labels.length === 0) {
          console.warn(
            `[Seg] ${jaw}: no position attribute or empty labels (position=${position?.count ?? 0}, labels=${result.labels.length})`
          );
          fitCamera();
          return 0;
        }

        // Label count may differ from position.count (e.g. per-face labels for STL).
        // segmentTeeth → createTriangleLabelReader handles face/corner/vertex modes.

        mesh.updateMatrixWorld(true);
        clearSegmentationForJaw(jaw);

        const teeth = segmentTeeth(mesh, result, jaw);
        if (teeth.size === 0) {
          console.warn(`[Seg] ${jaw}: no tooth parts were created`);
          fitCamera();
          return 0;
        }

        const jawGroup = new THREE.Group();
        jawGroup.name = `teeth_viz_${jaw}`;
        jawGroup.position.copy(mesh.position);
        jawGroup.quaternion.copy(mesh.quaternion);
        jawGroup.scale.copy(mesh.scale);

        const baseMesh = extractJawBaseMesh(mesh, result, jaw);
        if (baseMesh) {
          jawGroup.add(baseMesh);
        }

        const vizGroup = createAllTeethVisualization(teeth, showLCSRef.current);
        jawGroup.add(vizGroup);

        teethVizRef.current[jaw] = jawGroup;
        teethEntitiesRef.current[jaw] = teeth;
        mesh.visible = false;
        pivotGroup.add(jawGroup);

        fitCamera();

        console.log(`[Seg] ${jaw}: Segmented ${teeth.size} teeth with LCS visualization`);
        return teeth.size;
      },

      clearSegmentation: () => {
        clearSegmentationForJaw("maxilla");
        clearSegmentationForJaw("mandible");
      },

      detachGizmo: () => {
        const tc = transformRef.current;
        if (tc) tc.detach();
      },

      // ── Auto occlusal plane computation ──────────────────────────────────
      computeAutoOcclusalPlane: (): AutoPlaneResult | null => {
        const maxMesh = maxillaMeshRef.current;
        const manMesh = mandibleMeshRef.current;
        if (!maxMesh || !manMesh) return null;

        const result = runAutoPlane(maxMesh.geometry, manMesh.geometry);

        // Visualize: remove old plane, add new single plane
        const scene = sceneRef.current;
        if (scene) {
          if (occlusalPlaneRef.current) scene.remove(occlusalPlaneRef.current);
          if (normalArrowRef.current) scene.remove(normalArrowRef.current);

          const { planeMesh, normalArrow } = buildSinglePlaneVis(
            result.normal,
            result.center
          );
          scene.add(planeMesh);
          scene.add(normalArrow);
          occlusalPlaneRef.current = planeMesh;
          normalArrowRef.current = normalArrow;
        }

        const planeData: OcclusalPlaneData = {
          normal: result.normal,
          center: result.center,
        };
        occlusalDataRef.current = planeData;

        return result;
      },

      // ── ICP-enhanced occlusal plane computation ───────────────────────────
      computeAutoOcclusalPlaneWithICP: (
        onProgress?: ICPProgressCallback
      ): AutoPlaneResultWithICP | null => {
        const maxMesh = maxillaMeshRef.current;
        const manMesh = mandibleMeshRef.current;
        if (!maxMesh || !manMesh) return null;

        const result = computeAutoOcclusalPlaneWithICP(
          maxMesh.geometry,
          manMesh.geometry,
          onProgress
        );

        // Visualize refined plane
        const scene = sceneRef.current;
        if (scene) {
          if (occlusalPlaneRef.current) scene.remove(occlusalPlaneRef.current);
          if (normalArrowRef.current) scene.remove(normalArrowRef.current);

          const { planeMesh, normalArrow } = buildSinglePlaneVis(
            result.normal,
            result.center
          );
          scene.add(planeMesh);
          scene.add(normalArrow);
          occlusalPlaneRef.current = planeMesh;
          normalArrowRef.current = normalArrow;
        }

        const planeData: OcclusalPlaneData = {
          normal: result.normal,
          center: result.center,
        };
        occlusalDataRef.current = planeData;

        return result;
      },

      // ── Anterior pick mode for full alignment ──────────────────────────────
      setAnteriorPickMode: () => {
        pickModeRef.current = "anteriorPick";
        setPickModeState("anteriorPick");
      },

      // ── Full alignment with anterior point ───────────────────────────────────
      applyFullAlignment: (anteriorPoint: THREE.Vector3): AlignmentBasis | null => {
        const plane = occlusalDataRef.current;
        if (!plane) return null;

        // Apply occlusal alignment first
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return null;

        // Reset pivot to identity
        pivotGroup.position.set(0, 0, 0);
        pivotGroup.quaternion.identity();
        pivotGroup.scale.set(1, 1, 1);
        pivotGroup.updateMatrixWorld(true);

        // Align normal to +Y
        const alignQ = new THREE.Quaternion();
        const sourceNormal = plane.normal.clone().normalize();
        const dot = sourceNormal.dot(new THREE.Vector3(0, 1, 0));
        if (Math.abs(dot) < 0.9999) {
          alignQ.setFromUnitVectors(sourceNormal, new THREE.Vector3(0, 1, 0));
        }

        pivotGroup.quaternion.copy(alignQ);
        pivotGroup.updateMatrixWorld(true);

        // Compute alignment basis
        const center = plane.center.clone();
        const Z = new THREE.Vector3(0, 1, 0); // up after alignment
        const Y = new THREE.Vector3(0, 0, -1); // default anterior
        const X = new THREE.Vector3().crossVectors(Y, Z).normalize();

        const basis: AlignmentBasis = { X, Y, Z, center };
        alignmentBasisRef.current = basis;
        alignmentAppliedRef.current = true;

        return basis;
      },

      // ── Occlusal alignment — normal→+Y only (no landmark yaw) ──────────
      applyOcclusalAlignment: (plane: OcclusalPlaneData) => {
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return;

        // Reset pivot to identity — makes the operation idempotent
        pivotGroup.position.set(0, 0, 0);
        pivotGroup.quaternion.identity();
        pivotGroup.scale.set(1, 1, 1);
        pivotGroup.updateMatrixWorld(true);

        // ── Step 1: normal → +Y (occlusal plane becomes world XZ) ────────────
        const alignQ = new THREE.Quaternion();
        const sourceNormal = plane.normal.clone().normalize();
        const dot = sourceNormal.dot(new THREE.Vector3(0, 1, 0));
        if (Math.abs(dot) < 0.9999) {
          alignQ.setFromUnitVectors(sourceNormal, new THREE.Vector3(0, 1, 0));
        }

        // ── Step 2: sagittal alignment via landmarks (if available) ──────────
        let totalQ = alignQ.clone();

        if (plane.landmarks) {
          const [p0, p1, p2] = plane.landmarks;
          const p0r = p0.clone().applyQuaternion(alignQ);
          const p1r = p1.clone().applyQuaternion(alignQ);
          const p2r = p2.clone().applyQuaternion(alignQ);
          const molarMid = new THREE.Vector3().addVectors(p0r, p1r).multiplyScalar(0.5);
          const sagVec = new THREE.Vector3().subVectors(p2r, molarMid);
          sagVec.y = 0; // project to XZ plane
          const sagQ = new THREE.Quaternion();
          if (sagVec.length() > 0.001) {
            sagQ.setFromUnitVectors(sagVec.normalize(), new THREE.Vector3(0, 0, 1));
          }
          totalQ = new THREE.Quaternion().multiplyQuaternions(sagQ, alignQ);

          // Ensure R molar (p1) lands at +X (patient's right)
          const p1Final = p1.clone().applyQuaternion(totalQ);
          if (p1Final.x < 0) {
            const flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            totalQ.premultiply(flipQ);
          }
        }
        // If no landmarks, totalQ = alignQ (normal→+Y only; user adjusts yaw via buttons)

        // ── Step 3: apply rotation ────────────────────────────────────────────
        pivotGroup.quaternion.copy(totalQ);
        pivotGroup.updateMatrixWorld(true);

        // ── Step 4: translate so occlusal center lands at world origin ────────
        const rotatedCenter = plane.center.clone().applyQuaternion(totalQ);
        pivotGroup.position.copy(rotatedCenter).negate();
        pivotGroup.updateMatrixWorld(true);

        alignmentAppliedRef.current = true;

        // ── Step 5: remove plane vis (it has served its purpose) ─────────────
        const scene = sceneRef.current;
        if (scene) {
          if (occlusalPlaneRef.current) { scene.remove(occlusalPlaneRef.current); occlusalPlaneRef.current = null; }
          if (normalArrowRef.current) { scene.remove(normalArrowRef.current); normalArrowRef.current = null; }
        }

        // ── Step 6: attach gizmo for fine-tuning ─────────────────────────────
        const tc = transformRef.current;
        if (tc) {
          tc.detach();
          tc.attach(pivotGroup);
          tc.camera = getCamera();
        }

        // ── Step 7: refit camera
        fitCamera();
      },

      saveAlignmentMatrix: () => {
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return new THREE.Matrix4();
        pivotGroup.updateMatrixWorld(true);
        return pivotGroup.matrixWorld.clone();
      },

      resetAlignment: () => {
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return;
        pivotGroup.position.set(0, 0, 0);
        pivotGroup.quaternion.identity();
        pivotGroup.updateMatrixWorld(true);
        alignmentAppliedRef.current = false;
        const tc = transformRef.current;
        if (tc) tc.detach();
        // Re-attach to occlusal plane if defined
        if (occlusalPlaneRef.current) {
          tc?.attach(occlusalPlaneRef.current);
        }
        fitCamera();
      },

      getAlignmentBasis: () => {
        return alignmentBasisRef.current;
      },

      // ── Post-alignment flip corrections ──────────────────────────────────────
      // "Flip Normal" — rotates 180° around X axis:  flips up/down
      //   Use when occlusal surface faces DOWN instead of UP after alignment.
      flipAlignmentNormal: () => {
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return;
        const flipQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          Math.PI
        );
        pivotGroup.quaternion.premultiply(flipQ);
        pivotGroup.updateMatrixWorld(true);
      },

      // "Flip R/L" — rotates 180° around Y axis: flips left/right
      flipAlignmentX: () => {
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return;
        const flipQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI
        );
        pivotGroup.quaternion.premultiply(flipQ);
        pivotGroup.updateMatrixWorld(true);
      },

      // "Flip Front/Back" — rotates 180° around Z axis (WCS up=Y after alignment)
      //   Actually rotates around Y since Y is up after alignment, giving 180° yaw
      flipFrontBack: () => {
        const pivotGroup = pivotGroupRef.current;
        if (!pivotGroup) return;
        const flipQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI
        );
        pivotGroup.quaternion.premultiply(flipQ);
        pivotGroup.updateMatrixWorld(true);
      },

      // ── Tooth entity access methods ───────────────────────────────────────────
      // Get all tooth entities
      getToothEntities: () => {
        return getAllToothEntities();
      },

      // Export teeth to JSON
      exportTeethJSON: () => {
        return exportAllTeethToJSON(getAllToothEntities());
      },

      // Download teeth as JSON file
      downloadTeethJSON: (filename?: string) => {
        downloadTeethJSON(getAllToothEntities(), filename);
      },

      // Toggle LCS visibility
      setLCSVisible: (visible: boolean) => {
        showLCSRef.current = visible;
        (["maxilla", "mandible"] as JawKey[]).forEach((jaw) => {
          const vizGroup = teethVizRef.current[jaw];
          if (vizGroup) {
            setLCSVisibility(vizGroup, visible);
          }
        });
      },

      // Get individual tooth
      getTooth: (toothId: number) => {
        return (
          teethEntitiesRef.current.maxilla.get(toothId) ??
          teethEntitiesRef.current.mandible.get(toothId)
        );
      },

      // Transform individual tooth
      transformTooth: (toothId: number, matrix: THREE.Matrix4) => {
        const tooth =
          teethEntitiesRef.current.maxilla.get(toothId) ??
          teethEntitiesRef.current.mandible.get(toothId);
        if (tooth) {
          tooth.mesh.applyMatrix4(matrix);
        }
      },
    }));

    // ── Grid toggle ───────────────────────────────────────────────────────────
    useEffect(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (showGrid) {
        if (!gridRef.current) {
          const g = new THREE.GridHelper(30, 30, 0xb0bec5, 0xdde3ea);
          g.position.y = -6;
          gridRef.current = g;
        }
        scene.add(gridRef.current);
      } else {
        if (gridRef.current) scene.remove(gridRef.current);
      }
    }, [showGrid]);

    // ── View mode prop — delegates to the imperative setView ─────────────
    // We rely on the parent calling viewerRef.current.setView() explicitly,
    // so this effect is intentionally left minimal to avoid double-execution.
    useEffect(() => {
      // Only auto-apply on initial mount or when prop changes without explicit call
    }, [viewMode]);

    // ── Orthographic prop ─────────────────────────────────────────────────────
    useEffect(() => {
      isOrthoRef.current = orthographic;
      const controls = controlsRef.current;
      if (!controls) return;
      controls.object = getCamera();
      if (orthographic) syncOrthoFrustum();
      controls.update();
    }, [orthographic, getCamera, syncOrthoFrustum]);

    // ── Init Three.js ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (!mountRef.current) return;

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef2f7);
      scene.fog = new THREE.FogExp2(0xeef2f7, 0.006);
      sceneRef.current = scene;

      // Perspective camera
      const perspCam = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
      perspCam.position.set(0, 8, 18);
      perspCameraRef.current = perspCam;

      // Orthographic camera
      const aspect = w / h;
      const half = 10;
      const orthoCam = new THREE.OrthographicCamera(
        -half * aspect,
        half * aspect,
        half,
        -half,
        0.1,
        500
      );
      orthoCam.position.set(0, 8, 18);
      orthoCameraRef.current = orthoCam;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      rendererRef.current = renderer;
      mountRef.current.appendChild(renderer.domElement);

      // OrbitControls (starts with the active camera)
      const initialCam = orthographic ? orthoCam : perspCam;
      const controls = new OrbitControls(initialCam, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 1;
      controls.maxDistance = 120;
      // Left drag = rotate, wheel = zoom, middle drag = pan
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      };
      controlsRef.current = controls;

      // TransformControls for occlusal plane
      const tc = new TransformControls(initialCam, renderer.domElement);
      tc.setMode("rotate");
      tc.setSize(0.8);
      tc.addEventListener("dragging-changed", (e) => {
        controls.enabled = !(e as unknown as { value: boolean }).value;
      });
      tc.addEventListener("objectChange", () => {
        // Update occlusal plane data when gizmo moves it
        const plane = occlusalPlaneRef.current;
        if (!plane || !occlusalDataRef.current) return;
        const newNormal = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(plane.quaternion)
          .normalize();
        occlusalDataRef.current = {
          ...occlusalDataRef.current,
          normal: newNormal,
          center: plane.position.clone(),
        };
        // Move normal arrow
        if (normalArrowRef.current) {
          normalArrowRef.current.position.copy(plane.position);
          normalArrowRef.current.setDirection(newNormal);
        }
      });
      scene.add(tc.getHelper());
      transformRef.current = tc;

      // ── ViewCube setup ─────────────────────────────────────────────────────
      const cubeScene = new THREE.Scene();
      cubeScene.add(new THREE.AmbientLight(0xffffff, 3.0));
      const cubeCam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      cubeCam.position.set(0, 0, 3.5);
      const cubeGroup = new THREE.Group();
      const boxGeom = new THREE.BoxGeometry(1, 1, 1);
      const boxMats = [
        makeViewCubeFaceMat("Sağ", "#c0392b"),      // +X = patient right
        makeViewCubeFaceMat("Sol", "#8e44ad"),       // -X = patient left
        makeViewCubeFaceMat("Oklüzal", "#2980b9"),   // +Y = occlusal (up)
        makeViewCubeFaceMat("Apikal", "#1a5276"),     // -Y = apical (root side)
        makeViewCubeFaceMat("Ön", "#27ae60"),         // +Z = anterior (frontal)
        makeViewCubeFaceMat("Arka", "#1e8449"),       // -Z = posterior (back)
      ];
      const cubeBox = new THREE.Mesh(boxGeom, boxMats);
      cubeGroup.add(cubeBox);
      cubeGroup.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeom),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })
      ));
      cubeScene.add(cubeGroup);
      cubeSceneRef.current = cubeScene;
      cubeCameraRef.current = cubeCam;
      cubeGroupRef.current = cubeGroup;
      cubeBoxMeshRef.current = cubeBox;

      // Lighting
      const ambient = new THREE.AmbientLight(0xffffff, 1.6);
      ambientLightRef.current = ambient;
      scene.add(ambient);
      const dir1 = new THREE.DirectionalLight(0xffffff, 2.2);
      dirLight1Ref.current = dir1;
      dir1.position.set(6, 14, 10);
      dir1.castShadow = true;
      dir1.shadow.mapSize.width = 2048;
      dir1.shadow.mapSize.height = 2048;
      dir1.shadow.camera.near = 0.5;
      dir1.shadow.camera.far = 100;
      dir1.shadow.camera.left = -15;
      dir1.shadow.camera.right = 15;
      dir1.shadow.camera.top = 15;
      dir1.shadow.camera.bottom = -15;
      dir1.shadow.bias = -0.0005;
      scene.add(dir1);
      const dir2 = new THREE.DirectionalLight(0xd0e8ff, 1.0);
      dir2.position.set(-8, 6, -6);
      scene.add(dir2);
      const fill = new THREE.PointLight(0xfff0e0, 0.6, 60);
      fill.position.set(0, -6, 10);
      scene.add(fill);

      // Grid (off by default)
      if (showGrid) {
        const g = new THREE.GridHelper(30, 30, 0xb0bec5, 0xdde3ea);
        g.position.y = -6;
        gridRef.current = g;
        scene.add(g);
      }

      // Sync ortho state on init
      isOrthoRef.current = orthographic;
      if (orthographic) {
        orthoCam.position.copy(perspCam.position);
        orthoCam.quaternion.copy(perspCam.quaternion);
        orthoCam.updateProjectionMatrix();
      }

      // Animate
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        controls.update();
        const cam = isOrthoRef.current ? orthoCam : perspCam;

        // Main scene
        renderer.setScissorTest(false);
        renderer.render(scene, cam);

        // ViewCube overlay (top-right corner)
        if (cubeGroupRef.current && cubeCameraRef.current && cubeSceneRef.current && mountRef.current) {
          const VCPX = 96;
          const VMRG = 10;
          const cw = mountRef.current.clientWidth;
          const ch = mountRef.current.clientHeight;
          cubeGroupRef.current.quaternion.copy(cam.quaternion).invert();
          cubeGroupRef.current.updateMatrixWorld(true);
          renderer.setScissorTest(true);
          renderer.setScissor(cw - VCPX - VMRG, ch - VCPX - VMRG, VCPX, VCPX);
          renderer.setViewport(cw - VCPX - VMRG, ch - VCPX - VMRG, VCPX, VCPX);
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(cubeSceneRef.current, cubeCameraRef.current);
          renderer.autoClear = true;
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, cw, ch);
        }
      };
      animate();

      // Resize
      const onResize = () => {
        if (!mountRef.current) return;
        const nw = mountRef.current.clientWidth;
        const nh = mountRef.current.clientHeight;
        perspCam.aspect = nw / nh;
        perspCam.updateProjectionMatrix();
        const a = nw / nh;
        const hh = orthoCam.top;
        orthoCam.left = -hh * a;
        orthoCam.right = hh * a;
        orthoCam.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      const node = mountRef.current;
      return () => {
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(frameRef.current);
        controls.dispose();
        tc.dispose();
        renderer.dispose();
        if (node && renderer.domElement.parentNode === node) {
          node.removeChild(renderer.domElement);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Pointer: down — record position & check sphere drag ──────────────────
    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (pickModeRef.current !== "landmark") return;

        pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

        const mount = mountRef.current;
        if (!mount) return;
        const rect = mount.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(nx, ny), getCamera());

        // Check if clicking on an existing landmark sphere
        const sphereHits = raycaster.intersectObjects(
          landmarkSpheresRef.current,
          false
        );
        if (sphereHits.length > 0) {
          const hitSphere = sphereHits[0].object as THREE.Mesh;
          const idx = landmarkSpheresRef.current.indexOf(hitSphere);
          if (idx >= 0) {
            draggingSphereRef.current = { sphere: hitSphere, index: idx };
            // Disable orbit so only we handle this pointer
            if (controlsRef.current) controlsRef.current.enabled = false;
            mount.setPointerCapture(e.pointerId);
          }
        }
      },
      [getCamera]
    );

    // ── Pointer: move — drag sphere along mesh surface ────────────────────────
    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingSphereRef.current) return;

        const mount = mountRef.current;
        if (!mount) return;
        const rect = mount.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(nx, ny), getCamera());

        const meshes = [maxillaMeshRef.current, mandibleMeshRef.current].filter(
          Boolean
        ) as THREE.Mesh[];
        const hits = raycaster.intersectObjects(meshes, false);

        if (hits.length > 0) {
          const { sphere, index } = draggingSphereRef.current;
          const newPos = hits[0].point.clone();
          sphere.position.copy(newPos);
          landmarksRef.current[index] = newPos;

          // Live plane update during drag (silent — don't notify parent yet)
          if (landmarksRef.current.length === 3) {
            rebuildPlane(true);
          }
        }
      },
      [getCamera, rebuildPlane]
    );

    // ── Pointer: up — release drag or place new landmark ─────────────────────
    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        // Finish sphere drag
        if (draggingSphereRef.current) {
          draggingSphereRef.current = null;
          if (controlsRef.current) controlsRef.current.enabled = true;
          try {
            (mountRef.current as HTMLDivElement).releasePointerCapture(e.pointerId);
          } catch { }
          // Notify parent of updated plane after drag ends
          if (landmarksRef.current.length === 3 && occlusalDataRef.current) {
            onOcclusalPlaneDefined?.(occlusalDataRef.current);
          }
          pointerDownPosRef.current = null;
          return;
        }

        // Check if this was a short click (not an orbit drag)
        const downPos = pointerDownPosRef.current;
        pointerDownPosRef.current = null;

        if (!downPos) return;

        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD_PX) return; // Was an orbit drag

        // ── ViewCube click (works in any pick mode) ────────────────────────────
        const vcView = checkViewCubeClick(e.clientX, e.clientY);
        if (vcView) { setViewCallback(vcView); return; }

        if (pickModeRef.current !== "landmark") return;
        if (landmarksRef.current.length >= 3) return;

        // Place new landmark
        const mount = mountRef.current;
        const scene = sceneRef.current;
        if (!mount || !scene) return;
        const rect = mount.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(nx, ny), getCamera());

        const meshes = [maxillaMeshRef.current, mandibleMeshRef.current].filter(
          Boolean
        ) as THREE.Mesh[];
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length === 0) return;

        const point = hits[0].point.clone();
        const idx = landmarksRef.current.length;

        // Add sphere marker
        const sphere = makeLandmarkSphere(LANDMARK_COLORS[idx]);
        sphere.position.copy(point);
        scene.add(sphere);
        landmarkSpheresRef.current.push(sphere);
        landmarksRef.current.push(point);

        const newCount = landmarksRef.current.length;
        setLandmarkCount(newCount);
        onLandmarkPicked?.(idx, point);

        // When 3 landmarks are picked, build the occlusal plane
        if (newCount === 3) {
          rebuildPlane(false); // notify parent
          pickModeRef.current = "none";
          setPickModeState("none");
        }
      },
      [getCamera, onLandmarkPicked, onOcclusalPlaneDefined, rebuildPlane, checkViewCubeClick, setViewCallback]
    );

    // ── Drag-and-drop ─────────────────────────────────────────────────────────
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        mountRef.current?.dispatchEvent(
          new CustomEvent("scanDrop", { detail: { file }, bubbles: true })
        );
      }
    };

    // ── Cursor style ──────────────────────────────────────────────────────────
    const cursor =
      pickMode === "landmark"
        ? "crosshair"
        : "grab";

    return (
      <div className="w-full h-full relative">
        <div
          ref={mountRef}
          className="w-full h-full"
          style={{ cursor }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* Pick mode overlay instructions */}
        {pickMode === "landmark" && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium pointer-events-none"
            style={{
              background: "rgba(37,99,235,0.92)",
              color: "#fff",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 16px rgba(37,99,235,0.35)",
              zIndex: 20,
            }}
          >
            {landmarkCount < 3 ? (
              <>
                <span className="font-bold">
                  {landmarkCount + 1}/3
                </span>{" "}
                — Click on scan:{" "}
                <span className="font-bold">{LANDMARK_LABELS[landmarkCount]}</span>
                <span className="ml-2 opacity-70 text-xs">· Orbit freely</span>
              </>
            ) : (
              "All 3 landmarks placed"
            )}
          </div>
        )}

        {/* Landmark count badge */}
        {landmarkCount > 0 && landmarkCount < 3 && pickMode === "landmark" && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none"
            style={{ zIndex: 20 }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full border-2"
                style={{
                  background: i < landmarkCount ? `#${LANDMARK_COLORS[i].toString(16).padStart(6, "0")}` : "transparent",
                  borderColor: `#${LANDMARK_COLORS[i].toString(16).padStart(6, "0")}`,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        )}

        {/* Drag-over overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{
              background: "rgba(37, 99, 235, 0.08)",
              border: "2px dashed #2563eb",
              borderRadius: "4px",
              zIndex: 20,
            }}
          >
            <div
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{
                background: "rgba(255,255,255,0.92)",
                color: "#2563eb",
                backdropFilter: "blur(8px)",
              }}
            >
              Drop scan file here
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default ThreeViewer;

