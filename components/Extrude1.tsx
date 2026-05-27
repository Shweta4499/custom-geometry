"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect, useLayoutEffect } from "react";
import GUI from "lil-gui";
import { LoopSubdivision } from "three-subdivide";

function ExtrudedSubdivided() {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);
    const startInstRef = useRef<THREE.InstancedMesh>(null!);
    const endInstRef = useRef<THREE.InstancedMesh>(null!);
    const jointDummy = useMemo(() => new THREE.Object3D(), []);
    const jointEndLocal = useMemo(() => new THREE.Vector3(), []);

    // ---------------- GEOMETRY + SUBDIVISION + SKINNING ----------------
    const { geometry, skeleton, bones, attachToMesh, segmentHeight } =
        useMemo(() => {
            const width = 2;
            const height = 4;
            const depth = 0.06;
            const segments = 2;

            /** "chain": parent→child FK stack (rotation propagates). "siblings": shared armature root, pivots at absolute Y (each joint bends independently). */
            // const BONE_LAYOUT = "chain" as "chain" | "siblings";
            const BONE_LAYOUT = "siblings" as "chain" | "siblings";
            // -------- SHAPE --------
            const shape = new THREE.Shape();
            shape.moveTo(-width / 2, 0);
            shape.lineTo(width / 2, 0);
            shape.lineTo(width / 2, height);
            shape.lineTo(-width / 2, height);
            shape.closePath();

            // -------- EXTRUDE  --------
            let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
                depth: depth,

                bevelEnabled: false,
                // bevelThickness: 0.04,
                // bevelSize: 0.04,
                // bevelSegments: 2,

                // steps: segments, // not too high
            });

            // LIGHT SUBDIVISION ONLY
            geo = LoopSubdivision.modify(geo, 5, {
                //  preserveEdges: true,
                flatOnly: true,
            });

            geo = geo.toNonIndexed();
            geo.computeVertexNormals();

            const position = geo.attributes.position as THREE.BufferAttribute;
            const vertex = new THREE.Vector3();
            const skinIndices: number[] = [];
            const skinWeights: number[] = [];

            // -------- BONES --------
            const bones: THREE.Bone[] = [];
            const segmentHeight = height / segments;
            let attachToMesh: THREE.Bone;

            // Bone spine X: shape lies in XY with X in [-width/2, width/2]; extrude is along Z.
            const boneAnchorX = 0; // center (default — spine down middle of slab)
            // const boneAnchorX = +width / 4; // left edge of profile in X

            if (BONE_LAYOUT === "chain") {
                for (let i = 0; i <= segments; i++) {
                    const bone = new THREE.Bone();
                    bone.position.y = i === 0 ? 0 : segmentHeight;
                    if (i === 0) bone.position.x = boneAnchorX;
                    if (i > 0) bones[i - 1]!.add(bone);
                    bones.push(bone);
                }
                attachToMesh = bones[0]!;
            } else {
                const armRoot = new THREE.Bone();
                armRoot.name = "ArmatureRoot";
                armRoot.position.x = boneAnchorX;
                for (let i = 0; i <= segments; i++) {
                    const bone = new THREE.Bone();
                    bone.position.y = i * segmentHeight;
                    armRoot.add(bone);
                    bones.push(bone);
                }
                attachToMesh = armRoot;
            }

            const skeleton = new THREE.Skeleton(bones);

            // -------- SKINNING --------
            const bbox = new THREE.Box3().setFromBufferAttribute(position);
            const minY = bbox.min.y;
            const maxY = bbox.max.y;

            // X-direction skinning (tX) — keep for reference:
            // const minX = bbox.min.x;
            // const maxX = bbox.max.x;
            // for (let i = 0; i < position.count; i++) {
            //     vertex.fromBufferAttribute(position, i);
            //     const x = THREE.MathUtils.clamp(vertex.x, minX, maxX);
            //     const tX = (x - minX) / (maxX - minX);
            //     const boneIndex = Math.min(
            //         Math.floor(tX * segments),
            //         segments - 1,
            //     );
            //     const nextBone = Math.min(boneIndex + 1, segments);
            //     const localT = tX * segments - boneIndex;
            //     skinIndices.push(boneIndex, nextBone, 0, 0);
            //     skinWeights.push(1 - localT, localT, 0, 0);
            // }

            for (let i = 0; i < position.count; i++) {
                vertex.fromBufferAttribute(position, i);

                const y = THREE.MathUtils.clamp(vertex.y, minY, maxY);
                const tY = (y - minY) / (maxY - minY);

                const boneIndex = Math.min(
                    Math.floor(tY * segments),
                    segments - 1,
                );

                const nextBone = Math.min(boneIndex + 1, segments);
                const localT = tY * segments - boneIndex;

                skinIndices.push(boneIndex, nextBone, 0, 0);
                skinWeights.push(1 - localT, localT, 0, 0);
            }

            geo.setAttribute(
                "skinIndex",
                new THREE.Uint16BufferAttribute(skinIndices, 4),
            );

            geo.setAttribute(
                "skinWeight",
                new THREE.Float32BufferAttribute(skinWeights, 4),
            );

            return {
                geometry: geo,
                skeleton,
                bones,
                attachToMesh,
                segmentHeight,
            };
        }, []);

    const jointSphere = useMemo(
        () => new THREE.IcosahedronGeometry(0.085, 1),
        [],
    );
    const jointStartMat = useMemo(
        () => new THREE.MeshBasicMaterial({ color: "#22dd88" }),
        [],
    );
    const jointEndMat = useMemo(
        () => new THREE.MeshBasicMaterial({ color: "#ff8833" }),
        [],
    );

    useFrame(() => {
        const list = bonesRef.current;
        const startMesh = startInstRef.current;
        const endMesh = endInstRef.current;
        if (!list.length || !startMesh || !endMesh) return;

        for (let i = 0; i < list.length; i++) {
            const bone = list[i]!;
            bone.getWorldPosition(jointDummy.position);
            jointDummy.rotation.set(0, 0, 0);
            jointDummy.scale.set(1, 1, 1);
            jointDummy.updateMatrix();
            startMesh.setMatrixAt(i, jointDummy.matrix);

            bone.localToWorld(jointEndLocal.set(0, segmentHeight, 0));
            jointDummy.position.copy(jointEndLocal);
            jointDummy.updateMatrix();
            endMesh.setMatrixAt(i, jointDummy.matrix);
        }
        startMesh.count = list.length;
        endMesh.count = list.length;
        startMesh.instanceMatrix.needsUpdate = true;
        endMesh.instanceMatrix.needsUpdate = true;
    });

    // -------- STORE BONES --------
    useEffect(() => {
        bonesRef.current = bones;
    }, [bones]);

    // -------- BIND --------
    // useLayoutEffect: bind before paint / before R3F's first render pass, otherwise
    // frustum culling calls computeBoundingSphere → applyBoneTransform while skeleton is still undefined.
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        mesh.add(attachToMesh);
        mesh.bind(skeleton);
        return () => {
            mesh.remove(attachToMesh);
        };
    }, [attachToMesh, skeleton]);

    // -------- GUI --------
    useEffect(() => {
        const gui = new GUI();

        bones.forEach((bone, i) => {
            const f = gui.addFolder(`Bone ${i}`);
            f.add(bone.rotation, "x", -Math.PI, Math.PI, 0.01);
            f.add(bone.rotation, "y", -Math.PI, Math.PI, 0.01);
            f.add(bone.rotation, "z", -Math.PI, Math.PI, 0.01);
        });

        gui.add(
            {
                reset: () => {
                    bonesRef.current.forEach((b) => b.rotation.set(0, 0, 0));
                },
            },
            "reset",
        ).name("Reset");

        return () => gui.destroy();
    }, [bones]);

    // -------- HELPER --------
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
    //         bone.rotation.z = Math.sin(t + i * 0.4) * 0.25;
    //     });
    // });

    return (
        <>
            <skinnedMesh ref={meshRef} geometry={geometry}>
                <meshStandardMaterial
                    color="hotpink"
                    metalness={0.6}
                    roughness={0.3}
                />
            </skinnedMesh>
            {/* Green = bone origin (joint). Orange = +local Y by one segment (next joint for this stack). */}
            <instancedMesh
                ref={startInstRef}
                args={[jointSphere, jointStartMat, bones.length]}
                frustumCulled={false}
            />
            <instancedMesh
                ref={endInstRef}
                args={[jointSphere, jointEndMat, bones.length]}
                frustumCulled={false}
            />
        </>
    );
}

// ---------------- SCENE ----------------
export default function Scene() {
    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 10, 5]} intensity={1} />
            <ExtrudedSubdivided />
            <OrbitControls />
        </Canvas>
    );
}
