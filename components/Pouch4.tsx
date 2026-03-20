"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";

/* =========================
   GEOMETRY
========================= */

function createCapsuleGeometry() {
    const geo = new THREE.BufferGeometry();

    const radius = 1;
    const height = 3;

    const radialSegments = 16;
    const heightSegments = 20;

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= heightSegments; y++) {
        const v = y / heightSegments;
        const py = (v - 0.5) * height;

        for (let i = 0; i <= radialSegments; i++) {
            const theta = (i / radialSegments) * Math.PI * 2;

            vertices.push(
                radius * Math.cos(theta),
                py,
                radius * Math.sin(theta),
            );
        }
    }

    for (let y = 0; y < heightSegments; y++) {
        for (let i = 0; i < radialSegments; i++) {
            const a = y * (radialSegments + 1) + i;
            const b = a + radialSegments + 1;
            const c = a + 1;
            const d = b + 1;

            indices.push(a, b, c);
            indices.push(c, b, d);
        }
    }

    geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(vertices), 3),
    );
    geo.setIndex(indices);

    /* =========================
       SKINNING (CORRECT)
    ========================= */

    const skinIndices: number[] = [];
    const skinWeights: number[] = [];

    const vertexCount = vertices.length / 3;
    const boneCount = 4;

    for (let i = 0; i < vertexCount; i++) {
        const y = vertices[i * 3 + 1];

        const t = (y + height / 2) / height;
        const scaled = t * (boneCount - 1);

        const i0 = Math.floor(scaled);
        const i1 = Math.min(i0 + 1, boneCount - 1);

        const w1 = scaled - i0;
        const w0 = 1 - w1;

        skinIndices.push(i0, i1, 0, 0);
        skinWeights.push(w0, w1, 0, 0);
    }

    geo.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(skinIndices, 4),
    );

    geo.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(skinWeights, 4),
    );

    geo.computeVertexNormals();

    return geo;
}

/* =========================
   COMPONENT
========================= */

function CapsuleWithBones() {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);
    const params = useRef({ bend: 0 });

    const geometry = useMemo(() => createCapsuleGeometry(), []);

    const { skeleton, rootBone } = useMemo(() => {
        const bones: THREE.Bone[] = [];

        const segmentHeight = 1;
        const segmentCount = 3;

        let prevBone = new THREE.Bone();
        prevBone.position.y = -1.5;
        bones.push(prevBone);

        for (let i = 0; i < segmentCount; i++) {
            const bone = new THREE.Bone();
            bone.position.y = segmentHeight;
            prevBone.add(bone);
            bones.push(bone);
            prevBone = bone;
        }

        bonesRef.current = bones;

        // 🔥 IMPORTANT: create bone inverses
        const skeleton = new THREE.Skeleton(bones);

        return {
            skeleton,
            rootBone: bones[0],
        };
    }, []);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        // attach skeleton root
        mesh.add(rootBone);

        // 🔥 CRITICAL: set bind matrix properly
        mesh.bind(skeleton);

        // force updates
        mesh.updateMatrixWorld(true);
    }, [skeleton, rootBone]);

    useEffect(() => {
        const gui = new GUI();
        gui.add(params.current, "bend", -1, 1, 0.01);
        return () => gui.destroy();
    }, []);

    useFrame(() => {
        bonesRef.current.forEach((bone, i) => {
            bone.rotation.z = params.current.bend * (i * 0.8);
        });
    });

    return (
        <skinnedMesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial color="hotpink" />
        </skinnedMesh>
    );
}

/* =========================
   SCENE
========================= */

export default function Scene() {
    return (
        <Canvas camera={{ position: [6, 4, 8], fov: 70 }}>
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} />

            <CapsuleWithBones />

            <OrbitControls />
        </Canvas>
    );
}
