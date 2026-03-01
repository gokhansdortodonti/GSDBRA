"use client";

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface ThreeViewerHandle {
  loadMesh: (file: File, jaw: "maxilla" | "mandible") => Promise<void>;
  clearMesh: (jaw: "maxilla" | "mandible") => void;
  resetCamera: () => void;
  setWireframe: (v: boolean) => void;
}

interface ThreeViewerProps {
  onMeshLoaded?: (jaw: "maxilla" | "mandible", fileName: string) => void;
  showGrid?: boolean;
  wireframe?: boolean;
  viewMode?: "perspective" | "front" | "top" | "side";
}

// ─── Mesh colours ─────────────────────────────────────────────────────────────
const MAXILLA_COLOR = 0xfff3e0;   // warm ivory (upper)
const MANDIBLE_COLOR = 0xe3f2fd;  // cool blue-white (lower)

// ─── Load geometry from file ──────────────────────────────────────────────────
function loadGeometry(file: File): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const url = URL.createObjectURL(file);

    const finish = (geom: THREE.BufferGeometry) => {
      URL.revokeObjectURL(url);
      geom.computeVertexNormals();
      geom.center();

      // Auto-scale so longest axis ≈ 10 units
      const box = new THREE.Box3().setFromBufferAttribute(
        geom.attributes.position as THREE.BufferAttribute
      );
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const s = 10 / maxDim;
        geom.scale(s, s, s);
      }
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
          if (geoms.length === 0) { reject(new Error("No mesh in OBJ")); return; }
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

// ─── Component ────────────────────────────────────────────────────────────────
const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(
  function ThreeViewer({ onMeshLoaded, showGrid = true, wireframe = false, viewMode = "perspective" }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const frameRef = useRef<number>(0);

    const maxillaMeshRef = useRef<THREE.Mesh | null>(null);
    const mandibleMeshRef = useRef<THREE.Mesh | null>(null);
    const gridRef = useRef<THREE.GridHelper | null>(null);

    const [isDragOver, setIsDragOver] = useState(false);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const getMeshRef = (jaw: "maxilla" | "mandible") =>
      jaw === "maxilla" ? maxillaMeshRef : mandibleMeshRef;

    const getColor = (jaw: "maxilla" | "mandible") =>
      jaw === "maxilla" ? MAXILLA_COLOR : MANDIBLE_COLOR;

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      loadMesh: async (file: File, jaw: "maxilla" | "mandible") => {
        const geom = await loadGeometry(file);
        const mat = new THREE.MeshPhysicalMaterial({
          color: getColor(jaw),
          roughness: 0.28,
          metalness: 0.0,
          side: THREE.DoubleSide,
          wireframe,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Offset mandible slightly downward so they don't overlap
        if (jaw === "mandible") mesh.position.y = -1.5;

        const scene = sceneRef.current;
        if (!scene) return;

        const meshRef = getMeshRef(jaw);
        if (meshRef.current) scene.remove(meshRef.current);
        meshRef.current = mesh;
        scene.add(mesh);

        // Fit camera to all loaded meshes
        fitCamera();

        onMeshLoaded?.(jaw, file.name);
      },

      clearMesh: (jaw: "maxilla" | "mandible") => {
        const scene = sceneRef.current;
        const meshRef = getMeshRef(jaw);
        if (scene && meshRef.current) {
          scene.remove(meshRef.current);
          meshRef.current = null;
        }
      },

      resetCamera: () => fitCamera(),

      setWireframe: (v: boolean) => {
        [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
          if (r.current) {
            (r.current.material as THREE.MeshPhysicalMaterial).wireframe = v;
          }
        });
      },
    }));

    // ── Fit camera to loaded meshes ──────────────────────────────────────────
    const fitCamera = useCallback(() => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const box = new THREE.Box3();
      [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
        if (r.current) box.expandByObject(r.current);
      });

      if (box.isEmpty()) {
        camera.position.set(0, 8, 18);
        controls.target.set(0, 0, 0);
      } else {
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.8;
        camera.position.set(center.x, center.y + dist * 0.4, center.z + dist);
        controls.target.copy(center);
      }
      controls.update();
    }, []);

    // ── Grid toggle ──────────────────────────────────────────────────────────
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

    // ── View mode ────────────────────────────────────────────────────────────
    useEffect(() => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const box = new THREE.Box3();
      [maxillaMeshRef, mandibleMeshRef].forEach((r) => {
        if (r.current) box.expandByObject(r.current);
      });
      const center = box.isEmpty() ? new THREE.Vector3() : (() => { const c = new THREE.Vector3(); box.getCenter(c); return c; })();
      const dist = 18;

      switch (viewMode) {
        case "front":
          camera.position.set(center.x, center.y, center.z + dist);
          break;
        case "top":
          camera.position.set(center.x, center.y + dist, center.z);
          break;
        case "side":
          camera.position.set(center.x + dist, center.y, center.z);
          break;
        default:
          camera.position.set(center.x, center.y + dist * 0.4, center.z + dist);
      }
      controls.target.copy(center);
      controls.update();
    }, [viewMode]);

    // ── Init Three.js ────────────────────────────────────────────────────────
    useEffect(() => {
      if (!mountRef.current) return;

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeef2f7);
      scene.fog = new THREE.FogExp2(0xeef2f7, 0.008);
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
      camera.position.set(0, 8, 18);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      rendererRef.current = renderer;
      mountRef.current.appendChild(renderer.domElement);

      // OrbitControls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 2;
      controls.maxDistance = 80;
      controlsRef.current = controls;

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const dir1 = new THREE.DirectionalLight(0xffffff, 2.2);
      dir1.position.set(6, 14, 10);
      dir1.castShadow = true;
      scene.add(dir1);
      const dir2 = new THREE.DirectionalLight(0xd0e8ff, 1.0);
      dir2.position.set(-8, 6, -6);
      scene.add(dir2);
      const fill = new THREE.PointLight(0xfff0e0, 0.6, 60);
      fill.position.set(0, -6, 10);
      scene.add(fill);

      // Grid (initial)
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
        renderer.render(scene, camera);
      };
      animate();

      // Resize
      const onResize = () => {
        if (!mountRef.current) return;
        const nw = mountRef.current.clientWidth;
        const nh = mountRef.current.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      const node = mountRef.current;
      return () => {
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(frameRef.current);
        controls.dispose();
        renderer.dispose();
        if (node && renderer.domElement.parentNode === node) {
          node.removeChild(renderer.domElement);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Drag-and-drop (accepts files, emits to parent via custom event) ──────
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      // Dispatch a custom event so parent can handle jaw assignment
      const file = e.dataTransfer.files[0];
      if (file) {
        mountRef.current?.dispatchEvent(
          new CustomEvent("scanDrop", { detail: { file }, bubbles: true })
        );
      }
    };

    return (
      <div className="w-full h-full relative">
        <div
          ref={mountRef}
          className="w-full h-full"
          style={{ cursor: "grab" }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />

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
