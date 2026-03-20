"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";

/* =======================
   CONTROLS
======================= */
const controls = {
    bend: 0.5,
    curve: 1.5,
};

/* =======================
   GUI
======================= */
function useGUI() {
    useEffect(() => {
        const gui = new GUI();

        gui.add(controls, "bend", -2, 2, 0.01).name("Bend");
        gui.add(controls, "curve", 0.5, 3, 0.1).name("Curve");

        return () => gui.destroy();
    }, []);
}

/* =======================
   CUSTOM CUBE + BONES
======================= */
function CustomCubeWithBones() {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);
    const skeletonRef = useRef<THREE.Skeleton | null>(null);

    const { geometry, bones, skeleton } = useMemo(() => {
        const geo = new THREE.BufferGeometry();

        /* ===== VERTICES ===== */
        const vertices = new Float32Array([
            -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, -1, -1, 1, 1,
            -1, -1, 1, -1,
        ]);

        /* ===== INDICES ===== */
        const indices = [
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 3, 2, 6, 3, 6, 7, 0, 5, 1, 0, 4,
            5, 1, 5, 6, 1, 6, 2, 0, 3, 7, 0, 7, 4,
        ];

        geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        /* ===== BONES ===== */
        const bones: THREE.Bone[] = [];
        const height = 2;
        const segments = 4;

        for (let i = 0; i <= segments; i++) {
            const bone = new THREE.Bone();
            bone.position.y = i === 0 ? -1 : height / segments;

            if (i > 0) bones[i - 1].add(bone);
            bones.push(bone);
        }

        const skeleton = new THREE.Skeleton(bones);

        /* ===== SKINNING ===== */
        const pos = geo.attributes.position as THREE.BufferAttribute;
        const skinIndices: number[] = [];
        const skinWeights: number[] = [];
        const v = new THREE.Vector3();

        geo.computeBoundingBox();
        const minY = geo.boundingBox!.min.y;
        const maxY = geo.boundingBox!.max.y;
        const range = maxY - minY;

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);

            const y = (v.y - minY) / range;

            const exact = y * segments;
            let boneIndex = Math.floor(exact);
            boneIndex = Math.min(boneIndex, segments - 1);

            const frac = exact - boneIndex;

            skinIndices.push(boneIndex, boneIndex + 1, 0, 0);
            skinWeights.push(1 - frac, frac, 0, 0);
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
    }, [skeleton]);

    /* ===== BENDING ===== */
    useFrame(() => {
        const bones = bonesRef.current;
        const total = bones.length;

        let cumulative = 0;

        bones.forEach((bone, i) => {
            const t = i / total;

            const influence = Math.pow(t, controls.curve);

            cumulative += influence;

            bone.rotation.z = controls.bend * cumulative * 0.2;
        });
    });

    return (
        <skinnedMesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial color="#22c55e" />
        </skinnedMesh>
    );
}

/* =======================
   SCENE
======================= */
export default function Scene() {
    useGUI();

    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            {" "}
            <ambientLight />
            <directionalLight position={[5, 5, 5]} />
            <CustomCubeWithBones />
            <OrbitControls />
        </Canvas>
    );
}
