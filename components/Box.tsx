"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";
import { LoopSubdivision } from "three-subdivide";

const WIDTH = 2;
const HEIGHT = 3;
const DEPTH = 2;
/** One bone per vertical edge (four corners in XZ), plus a root bone. */

function BoxExtrudedSkinned() {
    const meshRef = useRef<THREE.SkinnedMesh>(null!);
    const bonesRef = useRef<THREE.Bone[]>([]);

    const { geometry, skeleton, bones } = useMemo(() => {
        const width = WIDTH;
        const height = HEIGHT;
        const depth = DEPTH;

        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, 0);
        shape.lineTo(width / 2, 0);
        shape.lineTo(width / 2, height);
        shape.lineTo(-width / 2, height);
        shape.closePath();

        let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
        });

        geo = LoopSubdivision.modify(geo, 2, { flatOnly: true });
        geo = geo.toNonIndexed();
        geo.computeVertexNormals();

        const position = geo.attributes.position as THREE.BufferAttribute;
        const vertex = new THREE.Vector3();

        const skinIndices: number[] = [];
        const skinWeights: number[] = [];

        const cornersXZ = [
            new THREE.Vector3(-width / 2, 0, 0),
            new THREE.Vector3(width / 2, 0, 0),
            new THREE.Vector3(width / 2, 0, depth),
            new THREE.Vector3(-width / 2, 0, depth),
        ];

        const bones: THREE.Bone[] = [];
        const root = new THREE.Bone();
        bones.push(root);

        for (let c = 0; c < 4; c++) {
            const bone = new THREE.Bone();
            bone.position.set(
                cornersXZ[c].x,
                height / 2,
                cornersXZ[c].z,
            );
            root.add(bone);
            bones.push(bone);
        }

        const skeleton = new THREE.Skeleton(bones);

        for (let vi = 0; vi < position.count; vi++) {
            vertex.fromBufferAttribute(position, vi);

            let bestC = 0;
            let bestD2 = Infinity;
            for (let c = 0; c < 4; c++) {
                const cx = cornersXZ[c].x;
                const cz = cornersXZ[c].z;
                const dx = vertex.x - cx;
                const dz = vertex.z - cz;
                const d2 = dx * dx + dz * dz;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    bestC = c;
                }
            }

            const boneIndex = 1 + bestC;
            skinIndices.push(boneIndex, 0, 0, 0);
            skinWeights.push(1, 0, 0, 0);
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

    useEffect(() => {
        bonesRef.current = bones;
    }, [bones]);

    useEffect(() => {
        if (!meshRef.current) return;

        meshRef.current.add(bones[0]);
        meshRef.current.bind(skeleton);
    }, [bones, skeleton]);

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
                color="hotpink"
                metalness={0.6}
                roughness={0.3}
            />
        </skinnedMesh>
    );
}

export default function Box() {
    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 10, 5]} intensity={1} />
            <BoxExtrudedSkinned />
            <OrbitControls />
        </Canvas>
    );
}
