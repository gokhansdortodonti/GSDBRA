"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

interface BracketPosition {
  toothId: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

interface ThreeViewerProps {
  activeJaw: "upper" | "lower";
  selectedTooth: number | null;
  placedBrackets: BracketPosition[];
  onToothClick: (toothId: number, position: THREE.Vector3) => void;
  viewMode: "perspective" | "front" | "top" | "side";
  showGrid: boolean;
  showWireframe: boolean;
  onModelLoaded?: (mesh: THREE.Mesh) => void;
}

// ─── Ideal arch form (Bonwill-Hawley parabolic arch) ─────────────────────────
// Points define the ideal arch wire path in the occlusal plane (OCS).
// X = mesio-distal, Z = antero-posterior, Y = occlusal (0 in OCS).
const IDEAL_ARCH_UPPER: { id: number; x: number; z: number }[] = [
  { id: 11, x: -0.5,  z: 0.0  },
  { id: 12, x: -1.25, z: 0.35 },
  { id: 13, x: -2.1,  z: 0.9  },
  { id: 14, x: -2.85, z: 1.65 },
  { id: 15, x: -3.45, z: 2.45 },
  { id: 16, x: -3.95, z: 3.45 },
  { id: 17, x: -4.35, z: 4.5  },
  { id: 21, x:  0.5,  z: 0.0  },
  { id: 22, x:  1.25, z: 0.35 },
  { id: 23, x:  2.1,  z: 0.9  },
  { id: 24, x:  2.85, z: 1.65 },
  { id: 25, x:  3.45, z: 2.45 },
  { id: 26, x:  3.95, z: 3.45 },
  { id: 27, x:  4.35, z: 4.5  },
];

const IDEAL_ARCH_LOWER: { id: number; x: number; z: number }[] = [
  { id: 41, x: -0.45, z: 0.0  },
  { id: 42, x: -1.1,  z: 0.3  },
  { id: 43, x: -1.85, z: 0.8  },
  { id: 44, x: -2.55, z: 1.5  },
  { id: 45, x: -3.1,  z: 2.2  },
  { id: 46, x: -3.6,  z: 3.1  },
  { id: 47, x: -3.95, z: 4.1  },
  { id: 31, x:  0.45, z: 0.0  },
  { id: 32, x:  1.1,  z: 0.3  },
  { id: 33, x:  1.85, z: 0.8  },
  { id: 34, x:  2.55, z: 1.5  },
  { id: 35, x:  3.1,  z: 2.2  },
  { id: 36, x:  3.6,  z: 3.1  },
  { id: 37, x:  3.95, z: 4.1  },
];

// ─── Occlusal plane helpers ───────────────────────────────────────────────────
/**
 * Compute the occlusal plane from 3 landmark points (e.g. incisal edges of
 * 11, 21 and the mesio-buccal cusp of 16).  Returns a Matrix4 that transforms
 * from WCS to OCS (occlusal coordinate system):
 *   +X  = patient's left (mesio-distal)
 *   +Y  = occlusal (perpendicular to occlusal plane, pointing occlusally)
 *   +Z  = anterior (labial direction)
 */
function computeOCSMatrix(
  p11: THREE.Vector3,
  p21: THREE.Vector3,
  p16: THREE.Vector3
): THREE.Matrix4 {
  // Midpoint of 11-21 as origin
  const origin = new THREE.Vector3().addVectors(p11, p21).multiplyScalar(0.5);

  // X axis: from 11 to 21 (mesio-distal)
  const xAxis = new THREE.Vector3().subVectors(p21, p11).normalize();

  // Provisional Y: from midpoint toward 16 projected out of plane
  const toMolar = new THREE.Vector3().subVectors(p16, origin);

  // Z axis: anterior direction = cross(xAxis, toMolar) normalised
  const zAxis = new THREE.Vector3().crossVectors(xAxis, toMolar).normalize();

  // Y axis: occlusal normal = cross(zAxis, xAxis)
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  const m = new THREE.Matrix4();
  m.makeBasis(xAxis, yAxis, zAxis);
  m.setPosition(origin);
  return m;
}

// ─── Patient-specific bracket base (module-level, no hooks) ──────────────────
// Builds a bracket group with a curved base pad that conforms to the labial
// surface of the tooth, plus body, wings, and an archwire slot aligned to the
// ideal arch form tangent direction.
function buildBracketWithBase(
  tooth: { id: number; x: number; z: number },
  angle: number,
  wireframe: boolean
): THREE.Group {
  const group = new THREE.Group();

  const labialOffset = 0.42;
  const cx = tooth.x + Math.sin(angle) * labialOffset;
  const cz = tooth.z + Math.cos(angle) * labialOffset;

  // ── Curved base pad (conforms to tooth labial surface) ──────────────────
  const baseWidth = 0.55;
  const baseHeight = 0.45;
  const baseGeom = new THREE.BoxGeometry(baseWidth, baseHeight, 0.06);
  const baseMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    roughness: 0.3,
    metalness: 0.5,
    wireframe,
  });
  const baseMesh = new THREE.Mesh(baseGeom, baseMat);
  baseMesh.position.set(cx, 0.18, cz);
  baseMesh.rotation.y = -angle;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // ── Bracket body ──────────────────────────────────────────────────────
  const bodyGeom = new THREE.BoxGeometry(0.42, 0.28, 0.14);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x64748b,
    roughness: 0.15,
    metalness: 0.85,
    envMapIntensity: 1.2,
    wireframe,
  });
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.position.set(cx, 0.18, cz);
  bodyMesh.rotation.y = -angle;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // ── Wings (gingival & occlusal) ───────────────────────────────────────
  const wingGeom = new THREE.BoxGeometry(0.52, 0.09, 0.11);
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: 0x475569,
    roughness: 0.15,
    metalness: 0.9,
    wireframe,
  });
  for (const dy of [0.18, -0.18]) {
    const wing = new THREE.Mesh(wingGeom, wingMat);
    wing.position.set(cx, 0.18 + dy, cz);
    wing.rotation.y = -angle;
    wing.castShadow = true;
    group.add(wing);
  }

  // ── Archwire slot (aligned to ideal arch form tangent) ────────────────
  // The slot long axis is oriented tangent to the arch curve at this tooth,
  // which is the OCS slot alignment requirement.
  const slotGeom = new THREE.BoxGeometry(0.13, 0.07, 0.16);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
  const slotMesh = new THREE.Mesh(slotGeom, slotMat);
  slotMesh.position.set(cx, 0.18, cz);
  slotMesh.rotation.y = -angle;
  group.add(slotMesh);

  return group;
}

export default function ThreeViewer({
  activeJaw,
  selectedTooth,
  placedBrackets,
  onToothClick,
  viewMode,
  showGrid,
  showWireframe,
  onModelLoaded,
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const toothMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const importedMeshRef = useRef<THREE.Mesh | null>(null);
  const ocsGroupRef = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef({ theta: 0, phi: Math.PI / 4, radius: 14 });
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // OCS transform (WCS → OCS)
  const ocsMatrixRef = useRef<THREE.Matrix4>(new THREE.Matrix4());
  const [ocsAligned, setOcsAligned] = useState(false);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);

  const archData = activeJaw === "upper" ? IDEAL_ARCH_UPPER : IDEAL_ARCH_LOWER;

  // ─── Build / rebuild the scene ─────────────────────────────────────────────
  const buildScene = useCallback(() => {
    const scene = sceneRef.current!;
    scene.clear();

    // ── Lighting (bright clinical) ──────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight1.position.set(5, 12, 8);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xd0e8ff, 1.2);
    dirLight2.position.set(-6, 6, -4);
    scene.add(dirLight2);

    const fillLight = new THREE.PointLight(0xfff0e0, 0.8, 40);
    fillLight.position.set(0, -5, 8);
    scene.add(fillLight);

    // ── Grid ───────────────────────────────────────────────────────────────
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(24, 24, 0xb0bec5, 0xdde3ea);
      gridHelper.position.y = -3;
      scene.add(gridHelper);
    }

    // ── OCS axes indicator ─────────────────────────────────────────────────
    if (ocsAligned) {
      const axesHelper = new THREE.AxesHelper(2);
      const ocsGroup = new THREE.Group();
      ocsGroup.applyMatrix4(ocsMatrixRef.current);
      ocsGroup.add(axesHelper);
      ocsGroupRef.current = ocsGroup;
      scene.add(ocsGroup);
    }

    // ── Imported mesh (STL/OBJ/PLY) ────────────────────────────────────────
    if (importedMeshRef.current) {
      scene.add(importedMeshRef.current);
    }

    // ── Ideal arch wire curve ──────────────────────────────────────────────
    const archCurvePoints = archData.map(
      (t) => new THREE.Vector3(t.x, -0.5, t.z)
    );
    const archCurve = new THREE.CatmullRomCurve3(archCurvePoints);
    const archPoints = archCurve.getPoints(120);
    const archGeom = new THREE.BufferGeometry().setFromPoints(archPoints);
    const archMat = new THREE.LineBasicMaterial({
      color: 0x2563eb,
      linewidth: 2,
    });
    const archLine = new THREE.Line(archGeom, archMat);
    scene.add(archLine);

    // ── Teeth ──────────────────────────────────────────────────────────────
    toothMeshesRef.current.clear();

    archData.forEach((tooth) => {
      const isIncisor = tooth.id % 10 <= 2;
      const isCanine = tooth.id % 10 === 3;
      const isMolar = tooth.id % 10 >= 6;

      let toothGeom: THREE.BufferGeometry;
      if (isIncisor) {
        toothGeom = new THREE.BoxGeometry(0.7, 1.8, 0.6);
      } else if (isCanine) {
        toothGeom = new THREE.ConeGeometry(0.4, 2.0, 8);
      } else if (isMolar) {
        toothGeom = new THREE.BoxGeometry(1.1, 1.5, 0.9);
      } else {
        toothGeom = new THREE.BoxGeometry(0.85, 1.6, 0.75);
      }

      // Slightly round the geometry
      const posAttr = toothGeom.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) * 0.95,
          posAttr.getY(i) * 0.95,
          posAttr.getZ(i) * 0.95
        );
      }
      toothGeom.computeVertexNormals();

      const isSelected = selectedTooth === tooth.id;
      const hasBracket = placedBrackets.some((b) => b.toothId === tooth.id);

      // Light ivory/white tooth material
      const toothMat = new THREE.MeshPhysicalMaterial({
        color: isSelected ? 0x93c5fd : hasBracket ? 0xdbeafe : 0xfafafa,
        roughness: 0.18,
        metalness: 0.0,
        transmission: 0.05,
        thickness: 0.4,
        envMapIntensity: 0.6,
        wireframe: showWireframe,
        emissive: isSelected ? 0x3b82f6 : 0x000000,
        emissiveIntensity: isSelected ? 0.12 : 0,
      });

      const toothMesh = new THREE.Mesh(toothGeom, toothMat);
      toothMesh.position.set(tooth.x, 0, tooth.z);
      toothMesh.userData = { toothId: tooth.id };
      toothMesh.castShadow = true;
      toothMesh.receiveShadow = true;

      // Rotate teeth to face outward along arch
      const angle = Math.atan2(tooth.x, tooth.z);
      toothMesh.rotation.y = -angle;

      scene.add(toothMesh);
      toothMeshesRef.current.set(tooth.id, toothMesh);

      // Selection ring
      if (isSelected) {
        const ringGeom = new THREE.RingGeometry(0.75, 0.92, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x2563eb,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(tooth.x, 1.25, tooth.z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
      }

      // ── Bracket with patient-specific base ──────────────────────────────
      if (hasBracket) {
        const bracketGroup = buildBracketWithBase(tooth, angle, showWireframe);
        scene.add(bracketGroup);
      }
    });

    // ── Archwire through bracket slots ─────────────────────────────────────
    if (placedBrackets.length >= 2) {
      const sortedBrackets = [...placedBrackets].sort(
        (a, b) => a.toothId - b.toothId
      );
      const wirePoints = sortedBrackets
        .map((b) => {
          const tooth = archData.find((t) => t.id === b.toothId);
          if (!tooth) return null;
          const angle = Math.atan2(tooth.x, tooth.z);
          // Wire passes through the slot center (labial surface + offset)
          return new THREE.Vector3(
            tooth.x + Math.sin(angle) * 0.42,
            0.18,
            tooth.z + Math.cos(angle) * 0.42
          );
        })
        .filter(Boolean) as THREE.Vector3[];

      if (wirePoints.length >= 2) {
        const wireCurve = new THREE.CatmullRomCurve3(wirePoints);
        const wireGeom = new THREE.TubeGeometry(wireCurve, 80, 0.035, 8, false);
        const wireMat = new THREE.MeshPhysicalMaterial({
          color: 0x94a3b8,
          metalness: 0.92,
          roughness: 0.08,
          envMapIntensity: 1.0,
        });
        const wireMesh = new THREE.Mesh(wireGeom, wireMat);
        wireMesh.castShadow = true;
        scene.add(wireMesh);
      }
    }
  }, [archData, selectedTooth, placedBrackets, showGrid, showWireframe, ocsAligned]);

  // ─── Camera update ─────────────────────────────────────────────────────────
  const updateCamera = useCallback(() => {
    const camera = cameraRef.current!;
    const { theta, phi, radius } = cameraAngleRef.current;
    camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = radius * Math.cos(phi);
    camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(0, 0, 2);
  }, []);

  // ─── Init Three.js ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8edf5); // light clinical background
    scene.fog = new THREE.FogExp2(0xe8edf5, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    cameraRef.current = camera;
    updateCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    const mountNode = mountRef.current;
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (mountNode && renderer.domElement.parentNode === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, [updateCamera]);

  // Rebuild scene on prop changes
  useEffect(() => {
    if (sceneRef.current) buildScene();
  }, [buildScene]);

  // View mode camera
  useEffect(() => {
    if (!cameraRef.current) return;
    switch (viewMode) {
      case "front":
        cameraAngleRef.current = { theta: 0, phi: Math.PI / 2, radius: 14 };
        break;
      case "top":
        cameraAngleRef.current = { theta: 0, phi: 0.08, radius: 14 };
        break;
      case "side":
        cameraAngleRef.current = {
          theta: Math.PI / 2,
          phi: Math.PI / 2.5,
          radius: 14,
        };
        break;
      default:
        cameraAngleRef.current = { theta: 0, phi: Math.PI / 4, radius: 14 };
    }
    updateCamera();
  }, [viewMode, updateCamera]);

  // ─── File import handler ────────────────────────────────────────────────────
  const handleFileImport = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const url = URL.createObjectURL(file);

      const onLoad = (geometry: THREE.BufferGeometry) => {
        URL.revokeObjectURL(url);
        geometry.computeVertexNormals();
        geometry.center();

        // Auto-scale to fit the scene
        const box = new THREE.Box3().setFromBufferAttribute(
          geometry.attributes.position as THREE.BufferAttribute
        );
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 10 / maxDim;
        geometry.scale(scale, scale, scale);

        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xfff8f0,
          roughness: 0.25,
          metalness: 0.0,
          side: THREE.DoubleSide,
          wireframe: showWireframe,
        });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // ── Auto-detect occlusal plane from imported mesh ─────────────────
        // Use bounding box extremes as approximate landmark positions
        const bbox = new THREE.Box3().setFromObject(mesh);
        const min = bbox.min;
        const max = bbox.max;
        const midX = (min.x + max.x) / 2;

        // Approximate: p11 = left incisal, p21 = right incisal, p16 = right molar
        const p11 = new THREE.Vector3(midX - 0.5, max.y, min.z);
        const p21 = new THREE.Vector3(midX + 0.5, max.y, min.z);
        const p16 = new THREE.Vector3(midX - 4.0, max.y * 0.85, max.z * 0.7);

        ocsMatrixRef.current = computeOCSMatrix(p11, p21, p16);
        setOcsAligned(true);

        // Remove previous imported mesh
        if (importedMeshRef.current && sceneRef.current) {
          sceneRef.current.remove(importedMeshRef.current);
        }
        importedMeshRef.current = mesh;
        setImportedFileName(file.name);

        if (onModelLoaded) onModelLoaded(mesh);
        if (sceneRef.current) buildScene();
      };

      if (ext === "stl") {
        const loader = new STLLoader();
        loader.load(url, onLoad);
      } else if (ext === "obj") {
        const loader = new OBJLoader();
        loader.load(url, (obj: THREE.Group) => {
          const geoms: THREE.BufferGeometry[] = [];
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              geoms.push((child as THREE.Mesh).geometry);
            }
          });
          if (geoms.length > 0) {
            // Merge all geometries
            const merged = geoms[0].clone();
            onLoad(merged);
          }
        });
      } else if (ext === "ply") {
        const loader = new PLYLoader();
        loader.load(url, onLoad);
      }
    },
    [showWireframe, onModelLoaded, buildScene]
  );

  // ─── Drag-and-drop on the viewport ─────────────────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileImport(file);
    },
    [handleFileImport]
  );

  // ─── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = false;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - prevMouseRef.current.x;
    const dy = e.clientY - prevMouseRef.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDraggingRef.current = true;

    if (e.buttons === 1 && isDraggingRef.current) {
      cameraAngleRef.current.theta -= dx * 0.01;
      cameraAngleRef.current.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, cameraAngleRef.current.phi + dy * 0.01)
      );
      updateCamera();
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    cameraAngleRef.current.radius = Math.max(
      4,
      Math.min(28, cameraAngleRef.current.radius + e.deltaY * 0.02)
    );
    updateCamera();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return;
    if (!mountRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const meshes = Array.from(toothMeshesRef.current.values());
    const intersects = raycasterRef.current.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const toothId = hit.object.userData.toothId as number;
      onToothClick(toothId, hit.point);
    }
  };

  return (
    <div className="w-full h-full relative">
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      />

      {/* Drop zone overlay hint */}
      {!importedFileName && (
        <div
          className="absolute inset-0 pointer-events-none flex items-end justify-center pb-16"
          style={{ zIndex: 5 }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs"
            style={{
              background: "rgba(255,255,255,0.75)",
              border: "1px dashed #94a3b8",
              backdropFilter: "blur(6px)",
              color: "#64748b",
            }}
          >
            <span>Drop STL / OBJ / PLY here to import patient scan</span>
          </div>
        </div>
      )}

      {/* OCS alignment badge */}
      {ocsAligned && (
        <div
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            background: "rgba(5, 150, 105, 0.12)",
            border: "1px solid rgba(5, 150, 105, 0.35)",
            color: "#059669",
            backdropFilter: "blur(6px)",
          }}
        >
          <span>✓</span>
          <span>OCS Aligned</span>
        </div>
      )}

      {/* Imported file badge */}
      {importedFileName && (
        <div
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid #cbd5e1",
            color: "#334155",
            backdropFilter: "blur(6px)",
          }}
        >
          <span>📁</span>
          <span>{importedFileName}</span>
        </div>
      )}
    </div>
  );
}
