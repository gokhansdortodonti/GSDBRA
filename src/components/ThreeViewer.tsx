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

// ─── Public types ─────────────────────────────────────────────────────────────
export interface OcclusalPlaneData {
  normal: THREE.Vector3;
  center: THREE.Vector3;
  landmarks: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
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
}

export type PickMode = "none" | "landmark";
export type ViewPreset = "perspective" | "front" | "top" | "side" | "bottom";

interface ThreeViewerProps {
  onMeshLoaded?: (jaw: "maxilla" | "mandible", fileName: string) => void;
  onLandmarkPicked?: (index: number, point: THREE.Vector3) => void;
  onLandmarkUndone?: (newCount: number) => void;
  onOcclusalPlaneDefined?: (plane: OcclusalPlaneData) => void;
  showGrid?: boolean;
  wireframe?: boolean;
  viewMode?: ViewPreset;
  orthographic?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAXILLA_COLOR = 0xfff3e0;
const MANDIBLE_COLOR = 0xe3f2fd;
const LANDMARK_COLORS = [0xff4444, 0x44ff44, 0x4488ff]; // R molar, L molar, midline
const LANDMARK_LABELS = ["R Molar", "L Molar", "11|21"];
const PLANE_COLOR = 0x2563eb;
const CLICK_THRESHOLD_PX = 6;

// ─── Load geometry from file ──────────────────────────────────────────────────
function loadGeometry(file: File): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const url = URL.createObjectURL(file);

    const finish = (geom: THREE.BufferGeometry) => {
      URL.revokeObjectURL(url);
      geom.computeVertexNormals();
      // Preserve original scanner coordinates — scaling applied uniformly
      // in loadMesh so that bite relationship between maxilla/mandible is intact
      resolve(geom);
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
      onLandmarkPicked,
      onLandmarkUndone,
      onOcclusalPlaneDefined,
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

      const box = new THREE.Box3();
      [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
        if (r.current) box.expandByObject(r.current);
      });

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
      [getCamera, onOcclusalPlaneDefined]
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
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // No position offset — scanner coordinates determine jaw positions

        const scene = sceneRef.current;
        if (!scene) return;

        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        if (meshRef.current) scene.remove(meshRef.current);
        meshRef.current = mesh;
        scene.add(mesh);
        fitCamera();
        onMeshLoaded?.(jaw, file.name);
      },

      clearMesh: (jaw: "maxilla" | "mandible") => {
        const scene = sceneRef.current;
        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        if (scene && meshRef.current) {
          scene.remove(meshRef.current);
          meshRef.current = null;
        }
        // Reset scene scale when no models remain so next import is re-calibrated
        const otherRef = jaw === "maxilla" ? mandibleMeshRef : maxillaMeshRef;
        if (!otherRef.current) scaleFactorRef.current = null;
      },

      resetCamera: () => fitCamera(),

      setWireframe: (v: boolean) => {
        [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
          if (r.current) {
            (r.current.material as THREE.MeshPhysicalMaterial).wireframe = v;
          }
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
        if (meshRef.current) meshRef.current.visible = visible;
      },

      setMeshOpacity: (jaw: "maxilla" | "mandible", opacity: number) => {
        const meshRef = jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;
        if (!meshRef.current) return;
        const mat = meshRef.current.material as THREE.MeshPhysicalMaterial;
        mat.transparent = opacity < 1;
        mat.opacity = opacity;
        mat.depthWrite = opacity >= 1;
        mat.needsUpdate = true;
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
        if (dirLight1Ref.current)    dirLight1Ref.current.intensity   = 2.2 * value;
      },

      setView: (view: ViewPreset) => {
        const controls = controlsRef.current;
        const cam = getCamera();
        if (!controls || !cam) return;

        const box = new THREE.Box3();
        [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
          if (r.current) box.expandByObject(r.current);
        });
        const center = box.isEmpty()
          ? new THREE.Vector3()
          : (() => {
            const c = new THREE.Vector3();
            box.getCenter(c);
            return c;
          })();
        const dist = 18;

        switch (view) {
          case "front":
            cam.position.set(center.x, center.y, center.z + dist);
            break;
          case "top":
            cam.position.set(center.x, center.y + dist, center.z);
            cam.up.set(0, 0, -1);
            break;
          case "bottom":
            cam.position.set(center.x, center.y - dist, center.z);
            cam.up.set(0, 0, 1);
            break;
          case "side":
            cam.position.set(center.x + dist, center.y, center.z);
            break;
          default:
            cam.up.set(0, 1, 0);
            cam.position.set(center.x, center.y + dist * 0.4, center.z + dist);
        }
        controls.target.copy(center);
        if (cam instanceof THREE.OrthographicCamera) syncOrthoFrustum();
        controls.update();
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

    // ── View mode prop ────────────────────────────────────────────────────────
    useEffect(() => {
      const controls = controlsRef.current;
      const cam = getCamera();
      if (!controls || !cam) return;

      const box = new THREE.Box3();
      [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
        if (r.current) box.expandByObject(r.current);
      });
      const center = box.isEmpty()
        ? new THREE.Vector3()
        : (() => {
          const c = new THREE.Vector3();
          box.getCenter(c);
          return c;
        })();
      const dist = 18;

      switch (viewMode) {
        case "front":
          cam.position.set(center.x, center.y, center.z + dist);
          break;
        case "top":
          cam.position.set(center.x, center.y + dist, center.z);
          cam.up.set(0, 0, -1);
          break;
        case "bottom":
          cam.position.set(center.x, center.y - dist, center.z);
          cam.up.set(0, 0, 1);
          break;
        case "side":
          cam.position.set(center.x + dist, center.y, center.z);
          break;
        default:
          cam.up.set(0, 1, 0);
          cam.position.set(center.x, center.y + dist * 0.4, center.z + dist);
      }
      controls.target.copy(center);
      controls.update();
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;
      mountRef.current.appendChild(renderer.domElement);

      // OrbitControls (starts with perspective)
      const controls = new OrbitControls(perspCam, renderer.domElement);
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
      const tc = new TransformControls(perspCam, renderer.domElement);
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

      // Animate
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        controls.update();
        const cam = isOrthoRef.current ? orthoCam : perspCam;
        renderer.render(scene, cam);
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
          } catch {}
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

        if (!downPos || pickModeRef.current !== "landmark") return;
        if (landmarksRef.current.length >= 3) return;

        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD_PX) return; // Was an orbit drag

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
      [getCamera, onLandmarkPicked, onOcclusalPlaneDefined, rebuildPlane]
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
