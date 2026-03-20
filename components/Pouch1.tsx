"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";

/* =======================
   GLOBAL CONTROLS
======================= */
const controls = {
    front: { bend: 0 },
    back: { bend: 0 },
    gusset: { offset: 0.45 },
};

/* =======================
   GUI
======================= */
function useGUI() {
    useEffect(() => {
        const gui = new GUI();

        gui.add(controls.front, "bend", -1, 1).name("Front Bend");
        gui.add(controls.back, "bend", -1, 1).name("Back Bend");
        gui.add(controls.gusset, "offset", 0.2, 1).name("Gusset Width");

        return () => gui.destroy();
    }, []);
}

/* =======================
   TYPES
======================= */
type PanelType = "front" | "back";

type PanelProps = {
    position: [number, number, number];
    type: PanelType;
    externalRef?: React.MutableRefObject<THREE.SkinnedMesh | null>;
};

type GussetProps = {
    frontRef: React.MutableRefObject<THREE.SkinnedMesh | null>;
    backRef: React.MutableRefObject<THREE.SkinnedMesh | null>;
    side: "left" | "right";
};

/* =======================
   BENDING PANEL
======================= */
function BendingPanel({ position, type, externalRef }: PanelProps) {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);
    const skeletonRef = useRef<THREE.Skeleton | null>(null);

    const { geometry, bones, skeleton } = useMemo(() => {
        const height = 2;
        const segments = 20;

        const geo = new THREE.BoxGeometry(0.05, height, 2, 4, segments, 4);

        /* ===== BONES ===== */
        const bones: THREE.Bone[] = [];
        const segmentHeight = height / segments;

        for (let i = 0; i <= segments; i++) {
            const bone = new THREE.Bone();
            bone.position.y = i === 0 ? -height / 2 : segmentHeight;

            if (i > 0) bones[i - 1].add(bone);
            bones.push(bone);
        }

        const skeleton = new THREE.Skeleton(bones);

        /* ===== SKINNING ===== */
        const pos = geo.attributes.position;
        const skinIndices: number[] = [];
        const skinWeights: number[] = [];
        const v = new THREE.Vector3();

        geo.computeBoundingBox();
        const minY = geo.boundingBox!.min.y;
        const maxY = geo.boundingBox!.max.y;
        const heightRange = maxY - minY;

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);

            const y = (v.y - minY) / heightRange;

            let boneIndex = Math.floor(y * segments);
            boneIndex = Math.min(boneIndex, segments - 1);

            const weight = (y * segments) % 1;

            skinIndices.push(boneIndex, boneIndex + 1, 0, 0);
            skinWeights.push(1 - weight, weight, 0, 0);
        }

        geo.setAttribute(
            "skinIndex",
            new THREE.Uint16BufferAttribute(skinIndices, 4),
        );

        geo.setAttribute(
            "skinWeight",
            new THREE.Float32BufferAttribute(skinWeights, 4),
        );

        return { geometry: geo, bones, skeleton };
    }, []);

    useEffect(() => {
        bonesRef.current = bones;
        skeletonRef.current = skeleton;
    }, [bones, skeleton]);

    useEffect(() => {
        if (!meshRef.current || !skeletonRef.current) return;

        meshRef.current.add(skeletonRef.current.bones[0]);
        meshRef.current.bind(skeletonRef.current);

        if (externalRef) externalRef.current = meshRef.current;
    }, [externalRef]);

    /* ===== ANIMATION ===== */
    useFrame(() => {
        const bones = bonesRef.current;
        const total = bones.length;

        const bend =
            type === "front" ? controls.front.bend : controls.back.bend;

        const direction = type === "front" ? 1 : -1;

        bones.forEach((bone, i) => {
            const t = i / total;
            const influence = t * t;

            bone.rotation.z = direction * bend * influence;
        });
    });

    return (
        <group position={position}>
            <skinnedMesh ref={meshRef} geometry={geometry}>
                <meshStandardMaterial color="#3b82f6" />
            </skinnedMesh>
        </group>
    );
}

/* =======================
   GUSSET
======================= */
function GeneratedGusset({ frontRef, backRef, side }: GussetProps) {
    const meshRef = useRef<THREE.Mesh>(null!);

    const geometry = useMemo(() => {
        const segments = 20;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array((segments + 1) * 2 * 3);
        const indices: number[] = [];

        for (let i = 0; i < segments; i++) {
            const a = i * 2;
            const b = i * 2 + 1;
            const c = i * 2 + 2;
            const d = i * 2 + 3;

            indices.push(a, b, c);
            indices.push(b, d, c);
        }

        geo.setIndex(indices);
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

        return geo;
    }, []);

    useFrame(() => {
        if (!frontRef.current || !backRef.current || !meshRef.current) return;

        const geo = meshRef.current.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position as THREE.BufferAttribute;

        const frontBones = frontRef.current.skeleton.bones;
        const backBones = backRef.current.skeleton.bones;

        const segments = Math.min(frontBones.length, backBones.length) - 1;

        const vFront = new THREE.Vector3();
        const vBack = new THREE.Vector3();

        const sideOffset = side === "left" ? -1 : 1;

        for (let i = 0; i <= segments; i++) {
            frontBones[i].getWorldPosition(vFront);
            backBones[i].getWorldPosition(vBack);

            const offset = controls.gusset.offset;

            vFront.z += sideOffset * offset;
            vBack.z += sideOffset * offset;

            pos.setXYZ(i * 2, vFront.x, vFront.y, vFront.z);
            pos.setXYZ(i * 2 + 1, vBack.x, vBack.y, vBack.z);
        }

        pos.needsUpdate = true;
        geo.computeVertexNormals();
    });

    return (
        <mesh ref={meshRef}>
            <primitive object={geometry} attach="geometry" />
            <meshStandardMaterial
                color={side === "left" ? "#a855f7" : "#ec4899"}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

/* =======================
   SCENE
======================= */
export default function Scene() {
    useGUI();

    const frontRef = useRef<THREE.SkinnedMesh | null>(null);
    const backRef = useRef<THREE.SkinnedMesh | null>(null);

    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            {" "}
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <BendingPanel
                position={[-0.25, 0, 0]}
                type="front"
                externalRef={frontRef}
            />
            <BendingPanel
                position={[0.25, 0, 0]}
                type="back"
                externalRef={backRef}
            />
            <GeneratedGusset
                frontRef={frontRef}
                backRef={backRef}
                side="left"
            />
            <GeneratedGusset
                frontRef={frontRef}
                backRef={backRef}
                side="right"
            />
            <mesh position={[0, -1, 0]}>
                <boxGeometry args={[0.5, 0.02, 2]} />
                <meshStandardMaterial color="#f59e0b" />
            </mesh>
            <OrbitControls />
        </Canvas>
    );
}
