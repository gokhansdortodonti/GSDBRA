"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

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
}

// Tooth geometry data - simplified arch positions
const UPPER_TEETH = [
  { id: 11, name: "UR1", x: -0.5, z: 0.0 },
  { id: 12, name: "UR2", x: -1.2, z: 0.3 },
  { id: 13, name: "UR3", x: -2.0, z: 0.8 },
  { id: 14, name: "UR4", x: -2.7, z: 1.5 },
  { id: 15, name: "UR5", x: -3.3, z: 2.2 },
  { id: 16, name: "UR6", x: -3.8, z: 3.2 },
  { id: 17, name: "UR7", x: -4.2, z: 4.2 },
  { id: 21, name: "UL1", x: 0.5, z: 0.0 },
  { id: 22, name: "UL2", x: 1.2, z: 0.3 },
  { id: 23, name: "UL3", x: 2.0, z: 0.8 },
  { id: 24, name: "UL4", x: 2.7, z: 1.5 },
  { id: 25, name: "UL5", x: 3.3, z: 2.2 },
  { id: 26, name: "UL6", x: 3.8, z: 3.2 },
  { id: 27, name: "UL7", x: 4.2, z: 4.2 },
];

const LOWER_TEETH = [
  { id: 41, name: "LR1", x: -0.5, z: 0.0 },
  { id: 42, name: "LR2", x: -1.2, z: 0.3 },
  { id: 43, name: "LR3", x: -2.0, z: 0.8 },
  { id: 44, name: "LR4", x: -2.7, z: 1.5 },
  { id: 45, name: "LR5", x: -3.3, z: 2.2 },
  { id: 46, name: "LR6", x: -3.8, z: 3.2 },
  { id: 47, name: "LR7", x: -4.2, z: 4.2 },
  { id: 31, name: "LL1", x: 0.5, z: 0.0 },
  { id: 32, name: "LL2", x: 1.2, z: 0.3 },
  { id: 33, name: "LL3", x: 2.0, z: 0.8 },
  { id: 34, name: "LL4", x: 2.7, z: 1.5 },
  { id: 35, name: "LL5", x: 3.3, z: 2.2 },
  { id: 36, name: "LL6", x: 3.8, z: 3.2 },
  { id: 37, name: "LL7", x: 4.2, z: 4.2 },
];

export default function ThreeViewer({
  activeJaw,
  selectedTooth,
  placedBrackets,
  onToothClick,
  viewMode,
  showGrid,
  showWireframe,
}: ThreeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const toothMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const bracketMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const frameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef({ theta: 0, phi: Math.PI / 4, radius: 14 });
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const teeth = activeJaw === "upper" ? UPPER_TEETH : LOWER_TEETH;

  const buildScene = useCallback(() => {
    const scene = sceneRef.current!;
    // Clear existing tooth meshes
    toothMeshesRef.current.forEach((mesh) => scene.remove(mesh));
    toothMeshesRef.current.clear();

    // Ambient light
    scene.clear();
    const ambientLight = new THREE.AmbientLight(0x334466, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x6699ff, 2.0);
    dirLight1.position.set(5, 10, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x2244aa, 1.0);
    dirLight2.position.set(-5, 5, -5);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x00ccff, 1.5, 30);
    pointLight.position.set(0, 8, 0);
    scene.add(pointLight);

    // Grid
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(20, 20, 0x1e2a40, 0x131825);
      gridHelper.position.y = -3;
      scene.add(gridHelper);
    }

    // Arch base (gum simulation)
    const archCurve = new THREE.CatmullRomCurve3(
      teeth.map((t) => new THREE.Vector3(t.x, -0.5, t.z))
    );
    const archPoints = archCurve.getPoints(100);
    const archGeom = new THREE.BufferGeometry().setFromPoints(archPoints);
    const archMat = new THREE.LineBasicMaterial({ color: 0x1e3a5f, linewidth: 2 });
    const archLine = new THREE.Line(archGeom, archMat);
    scene.add(archLine);

    // Gum surface
    const gumShape = new THREE.Shape();
    const gumPoints = archCurve.getPoints(50);
    gumShape.moveTo(gumPoints[0].x, gumPoints[0].z);
    gumPoints.forEach((p) => gumShape.lineTo(p.x, p.z));
    gumShape.lineTo(gumPoints[gumPoints.length - 1].x + 1, gumPoints[gumPoints.length - 1].z + 2);
    gumShape.lineTo(gumPoints[0].x - 1, gumPoints[0].z + 2);

    // Create teeth
    teeth.forEach((tooth) => {
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

      // Smooth the geometry
      const posAttr = toothGeom.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        posAttr.setXYZ(i, x * 0.95, y * 0.95, z * 0.95);
      }
      toothGeom.computeVertexNormals();

      const isSelected = selectedTooth === tooth.id;
      const hasBracket = placedBrackets.some((b) => b.toothId === tooth.id);

      const toothMat = new THREE.MeshPhysicalMaterial({
        color: isSelected ? 0x4488ff : hasBracket ? 0xd4e8ff : 0xf0f4ff,
        roughness: 0.15,
        metalness: 0.0,
        transmission: 0.1,
        thickness: 0.5,
        envMapIntensity: 1.0,
        wireframe: showWireframe,
        emissive: isSelected ? 0x1133aa : 0x000000,
        emissiveIntensity: isSelected ? 0.3 : 0,
      });

      const toothMesh = new THREE.Mesh(toothGeom, toothMat);
      toothMesh.position.set(tooth.x, 0, tooth.z);
      toothMesh.userData = { toothId: tooth.id, toothName: tooth.name };

      // Rotate teeth to face outward
      const angle = Math.atan2(tooth.x, tooth.z);
      toothMesh.rotation.y = -angle;

      scene.add(toothMesh);
      toothMeshesRef.current.set(tooth.id, toothMesh);

      // Add selection ring
      if (isSelected) {
        const ringGeom = new THREE.RingGeometry(0.7, 0.85, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x00ccff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.set(tooth.x, 1.2, tooth.z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
      }

      // Add bracket if placed
      if (hasBracket) {
        const bracketGeom = new THREE.BoxGeometry(0.5, 0.3, 0.15);
        const bracketMat = new THREE.MeshPhysicalMaterial({
          color: 0x8899cc,
          roughness: 0.2,
          metalness: 0.8,
          emissive: 0x2244aa,
          emissiveIntensity: 0.2,
        });
        const bracketMesh = new THREE.Mesh(bracketGeom, bracketMat);

        // Position bracket on labial surface
        const offset = new THREE.Vector3(
          Math.sin(angle) * 0.4,
          0.2,
          Math.cos(angle) * 0.4
        );
        bracketMesh.position.set(
          tooth.x + offset.x,
          0.2,
          tooth.z + offset.z
        );
        bracketMesh.rotation.y = -angle;

        // Bracket wings
        const wingGeom = new THREE.BoxGeometry(0.6, 0.1, 0.12);
        const wingMesh = new THREE.Mesh(wingGeom, bracketMat);
        wingMesh.position.copy(bracketMesh.position);
        wingMesh.position.y += 0.1;
        wingMesh.rotation.y = -angle;
        scene.add(wingMesh);

        const wingMesh2 = new THREE.Mesh(wingGeom, bracketMat);
        wingMesh2.position.copy(bracketMesh.position);
        wingMesh2.position.y -= 0.1;
        wingMesh2.rotation.y = -angle;
        scene.add(wingMesh2);

        // Archwire slot
        const slotGeom = new THREE.BoxGeometry(0.15, 0.08, 0.18);
        const slotMat = new THREE.MeshBasicMaterial({ color: 0x334466 });
        const slotMesh = new THREE.Mesh(slotGeom, slotMat);
        slotMesh.position.copy(bracketMesh.position);
        slotMesh.rotation.y = -angle;
        scene.add(slotMesh);

        scene.add(bracketMesh);
        bracketMeshesRef.current.set(tooth.id, bracketMesh);
      }
    });

    // Archwire if brackets placed
    if (placedBrackets.length >= 2) {
      const sortedBrackets = [...placedBrackets].sort((a, b) => a.toothId - b.toothId);
      const wirePoints = sortedBrackets.map((b) => {
        const tooth = teeth.find((t) => t.id === b.toothId);
        if (!tooth) return new THREE.Vector3(0, 0, 0);
        const angle = Math.atan2(tooth.x, tooth.z);
        return new THREE.Vector3(
          tooth.x + Math.sin(angle) * 0.4,
          0.2,
          tooth.z + Math.cos(angle) * 0.4
        );
      });

      const wireCurve = new THREE.CatmullRomCurve3(wirePoints);
      const wireGeom = new THREE.TubeGeometry(wireCurve, 64, 0.04, 8, false);
      const wireMat = new THREE.MeshPhysicalMaterial({
        color: 0xaabbdd,
        metalness: 0.9,
        roughness: 0.1,
      });
      const wireMesh = new THREE.Mesh(wireGeom, wireMat);
      scene.add(wireMesh);
    }
  }, [teeth, selectedTooth, placedBrackets, showGrid, showWireframe]);

  const updateCamera = useCallback(() => {
    const camera = cameraRef.current!;
    const { theta, phi, radius } = cameraAngleRef.current;
    camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = radius * Math.cos(phi);
    camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(0, 0, 2);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d14);
    scene.fog = new THREE.FogExp2(0x0a0d14, 0.02);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    cameraRef.current = camera;
    updateCamera();

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
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

  // Rebuild scene when props change
  useEffect(() => {
    if (sceneRef.current) {
      buildScene();
    }
  }, [buildScene]);

  // View mode camera
  useEffect(() => {
    if (!cameraRef.current) return;
    switch (viewMode) {
      case "front":
        cameraAngleRef.current = { theta: 0, phi: Math.PI / 2, radius: 14 };
        break;
      case "top":
        cameraAngleRef.current = { theta: 0, phi: 0.1, radius: 14 };
        break;
      case "side":
        cameraAngleRef.current = { theta: Math.PI / 2, phi: Math.PI / 2.5, radius: 14 };
        break;
      default:
        cameraAngleRef.current = { theta: 0, phi: Math.PI / 4, radius: 14 };
    }
    updateCamera();
  }, [viewMode, updateCamera]);

  // Mouse handlers
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
        0.1,
        Math.min(Math.PI - 0.1, cameraAngleRef.current.phi + dy * 0.01)
      );
      updateCamera();
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    cameraAngleRef.current.radius = Math.max(
      5,
      Math.min(25, cameraAngleRef.current.radius + e.deltaY * 0.02)
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
    <div
      ref={mountRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onClick={handleClick}
    />
  );
}
