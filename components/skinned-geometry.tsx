"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";

function MultiBoneCube() {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);

    const params = useRef({
        strength: 0.5,
    });
    //   Box Geometry
    const { geometry, skeleton, bones } = useMemo(() => {
        const width = 4;
        const height = 4;
        const depth = 2;

        const segments = 10; // 🔥 number of bones

        // ---------------- GEOMETRY ----------------
        let geo = new THREE.BoxGeometry(width, height, depth, 10, segments, 10);

        //  geo = geo.toNonIndexed();
        geo.computeVertexNormals();
        geo.translate(0, height / 2, 0);

        const position = geo.attributes.position;
        const vertex = new THREE.Vector3();

        const skinIndices: number[] = [];
        const skinWeights: number[] = [];

        const segmentHeight = height / segments;

        // ---------------- BONES ----------------
        const bones: THREE.Bone[] = [];

        for (let i = 0; i < segments + 1; i++) {
            const bone = new THREE.Bone();
            bone.position.y = i === 0 ? 0 : segmentHeight;
            if (i > 0) bones[i - 1].add(bone);
            bones.push(bone);
        }

        const skeleton = new THREE.Skeleton(bones);

        // ---------------- SKINNING ----------------
        const minY = 0; // since you translated
        const maxY = height;

        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);

            // 🔥 normalize y properly
            const y = THREE.MathUtils.clamp(vertex.y, minY, maxY);

            const tY = y / height; // 0 → 1

            const boneIndex = Math.floor(tY * segments);
            const nextBone = Math.min(boneIndex + 1, segments);

            const localT = tY * segments - boneIndex;

            const idx = [boneIndex, nextBone, 0, 0];
            const w = [1 - localT, localT, 0, 0];

            skinIndices.push(...idx);
            skinWeights.push(...w);
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

    //Extruded Geometry
    // const { geometry, skeleton, bones } = useMemo(() => {
    //     const width = 4;
    //     const height = 4;
    //     const depth = 2;

    //     const segments = 5;

    //     // ---------------- SHAPE (square base) ----------------
    //     const shape = new THREE.Shape();
    //     shape.moveTo(-width / 2, 0);
    //     shape.lineTo(width / 2, 0);
    //     shape.lineTo(width / 2, height);
    //     shape.lineTo(-width / 2, height);
    //     shape.closePath();

    //     // ---------------- EXTRUDE ----------------
    //     let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    //         depth: depth,
    //         bevelEnabled: false,
    //         steps: segments,
    //     });

    //     geo = geo.toNonIndexed();

    //     // geo.center();
    //     // geo.translate(2, 1, 1);
    //     geo.computeVertexNormals();

    //     const position = geo.attributes.position as THREE.BufferAttribute;
    //     const vertex = new THREE.Vector3();

    //     const skinIndices: number[] = [];
    //     const skinWeights: number[] = [];

    //     // ---------------- BONES ----------------
    //     //create bone
    //     const bones: THREE.Bone[] = [];
    //     // segments as we want
    //     const segmentHeight = height / segments;
    //     // create bone chain
    //     for (let i = 0; i <= segments; i++) {
    //         const bone = new THREE.Bone();
    //         bone.position.y = i === 0 ? 0 : segmentHeight;

    //         if (i > 0) bones[i - 1].add(bone);
    //         bones.push(bone);
    //     }
    //     //Push it to sKELETON LATER we bind it
    //     const skeleton = new THREE.Skeleton(bones);

    //     // ---------------- SKINNING ----------------
    //     const bbox = new THREE.Box3().setFromBufferAttribute(position);
    //     const minY = bbox.min.y;
    //     const maxY = bbox.max.y;

    //     for (let i = 0; i < position.count; i++) {
    //         vertex.fromBufferAttribute(position, i);

    //         const y = THREE.MathUtils.clamp(vertex.y, minY, maxY);
    //         const tY = (y - minY) / (maxY - minY); // normalize 0 → 1

    //         const boneIndex = Math.floor(tY * segments);
    //         const nextBone = Math.min(boneIndex + 1, segments);

    //         const localT = tY * segments - boneIndex;

    //         const idx = [boneIndex, nextBone, 0, 0];
    //         const w = [1 - localT, localT, 0, 0];

    //         skinIndices.push(...idx);
    //         skinWeights.push(...w);
    //     }

    //     geo.setAttribute(
    //         "skinIndex",
    //         new THREE.Uint16BufferAttribute(skinIndices, 4),
    //     );

    //     geo.setAttribute(
    //         "skinWeight",
    //         new THREE.Float32BufferAttribute(skinWeights, 4),
    //     );

    //     return { geometry: geo, skeleton, bones };
    // }, []);
    //We store bones in a ref to maintain stable access across renders.
    // Then we attach the root bone to the mesh and bind the skeleton
    //  so that bone transformations can deform the mesh
    useEffect(() => {
        bonesRef.current = bones;
    }, [bones]);

    useEffect(() => {
        if (!meshRef.current) return;

        meshRef.current.add(bones[0]);
        meshRef.current.bind(skeleton);
    }, [bones, skeleton]);

    const resetBones = () => {
        const bones = bonesRef.current;

        bones.forEach((bone) => {
            bone.rotation.set(0, 0, 0);
        });
    };
    // ---------------- GUI ----------------
    useEffect(() => {
        const gui = new GUI();

        // Bone controls
        bones.forEach((bone, i) => {
            const f = gui.addFolder(`Bone ${i}`);
            f.add(bone.rotation, "x", -Math.PI, Math.PI, 0.01);
            f.add(bone.rotation, "y", -Math.PI, Math.PI, 0.01);
            f.add(bone.rotation, "z", -Math.PI, Math.PI, 0.01);
        });

        //  RESET BUTTON
        gui.add({ reset: resetBones }, "reset").name("Reset All");

        return () => gui.destroy();
    }, [bones]);
    //Debugging Helper
    useEffect(() => {
        if (!meshRef.current) return;

        const helper = new THREE.SkeletonHelper(meshRef.current);

        meshRef.current.parent?.add(helper);

        return () => {
            helper.parent?.remove(helper);
        };
    }, []);
    // useFrame(() => {
    //     const bones = bonesRef.current;
    //     if (!bones.length) return;

    //     const t = performance.now() * 0.001;

    //     bones.forEach((bone, i) => {
    //         bone.rotation.z = Math.sin(t + i * 0.5) * 0.2;
    //     });
    // });

    return (
        <skinnedMesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial
                color="cyan"
                metalness={0.7}
                roughness={0.2}
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
            <ambientLight />
            <directionalLight position={[5, 10, 5]} />
            <MultiBoneCube />
            <OrbitControls />
        </Canvas>
    );
}
