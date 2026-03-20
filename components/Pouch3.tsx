"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";

function GridBox() {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);

    const rows = 10;
    const cols = 10;

    const params = useRef({
        animate: true,
        strength: 0.25,
        speed: 1,
        waveX: 1,
        waveY: 1,
    });

    const { geometry, skeleton, bones } = useMemo(() => {
        const width = 4;
        const height = 2;
        const depth = 2;

        // ---------------- GEOMETRY ----------------
        const geo = new THREE.BoxGeometry(width, height, depth, cols, rows, 4);

        const pos = geo.attributes.position;
        const vertex = new THREE.Vector3();

        const skinIndices: number[] = [];
        const skinWeights: number[] = [];

        // ---------------- BONES GRID (FIXED) ----------------
        const bones: THREE.Bone[] = [];
        const root = new THREE.Bone();
        bones.push(root);

        for (let y = 0; y <= rows; y++) {
            for (let x = 0; x <= cols; x++) {
                const bone = new THREE.Bone();

                //  add first
                root.add(bone);

                //  then position (important!)
                bone.position.set(
                    -width / 2 + (x / cols) * width,
                    -height / 2 + (y / rows) * height,
                    0,
                );

                bones.push(bone);
            }
        }

        const skeleton = new THREE.Skeleton(bones);

        // ---------------- SKINNING ----------------
        const offset = 1;

        for (let i = 0; i < pos.count; i++) {
            vertex.fromBufferAttribute(pos, i);

            const u = (vertex.x + width / 2) / width;
            const v = (vertex.y + height / 2) / height;

            const gx = u * cols;
            const gy = v * rows;

            const x0 = Math.floor(gx);
            const y0 = Math.floor(gy);

            const x1 = Math.min(x0 + 1, cols);
            const y1 = Math.min(y0 + 1, rows);

            const tx = gx - x0;
            const ty = gy - y0;

            const i00 = offset + y0 * (cols + 1) + x0;
            const i10 = offset + y0 * (cols + 1) + x1;
            const i01 = offset + y1 * (cols + 1) + x0;
            const i11 = offset + y1 * (cols + 1) + x1;

            const w00 = (1 - tx) * (1 - ty);
            const w10 = tx * (1 - ty);
            const w01 = (1 - tx) * ty;
            const w11 = tx * ty;

            skinIndices.push(i00, i10, i01, i11);
            skinWeights.push(w00, w10, w01, w11);
        }

        geo.setAttribute(
            "skinIndex",
            new THREE.Uint16BufferAttribute(skinIndices, 4),
        );

        geo.setAttribute(
            "skinWeight",
            new THREE.Float32BufferAttribute(skinWeights, 4),
        );

        return { geometry: geo, skeleton, bones };
    }, []);

    // bind skeleton
    useEffect(() => {
        if (!meshRef.current) return;

        meshRef.current.add(bones[0]); // root
        meshRef.current.bind(skeleton);
        bonesRef.current = bones;
    }, [bones, skeleton]);

    // GUI
    useEffect(() => {
        const gui = new GUI();

        gui.add(params.current, "animate");
        gui.add(params.current, "strength", 0, 1, 0.01);
        gui.add(params.current, "speed", 0.1, 5, 0.1);
        gui.add(params.current, "waveX", 0, 2, 0.01);
        gui.add(params.current, "waveY", 0, 2, 0.01);

        return () => gui.destroy();
    }, []);

    //  animation
    useFrame(() => {
        if (!params.current.animate) return;

        const t = performance.now() * 0.001 * params.current.speed;

        bonesRef.current.forEach((bone, i) => {
            if (i === 0) return; // skip root

            const index = i - 1;
            const x = index % (cols + 1);
            const y = Math.floor(index / (cols + 1));

            const wave = Math.sin(
                t + x * params.current.waveX + y * params.current.waveY,
            );

            bone.position.z = wave * params.current.strength;
        });
    });

    //  skeleton helper
    useEffect(() => {
        if (!meshRef.current) return;

        const helper = new THREE.SkeletonHelper(meshRef.current);
        meshRef.current.parent?.add(helper);

        return () => {
            helper.parent?.remove(helper);
        };
    }, []);

    return (
        <skinnedMesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial
                color="#00ffaa"
                roughness={0.3}
                metalness={0.2}
            />
        </skinnedMesh>
    );
}

export default function Scene() {
    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            {" "}
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} />
            <GridBox />
            <OrbitControls />
        </Canvas>
    );
}
