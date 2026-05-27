"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";
import { LoopSubdivision } from "three-subdivide";
function MorphExtrude() {
    const meshRef = useRef<THREE.Mesh>(null!);

    const geometry = useMemo(() => {
        const width = 1;
        const height = 4;
        const depth = 3;

        // -------- SHAPE --------
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, 0);
        shape.lineTo(width / 2, 0);
        shape.lineTo(width / 2, height);
        shape.lineTo(-width / 2, height);
        shape.closePath();

        // const shape = new THREE.Shape();

        // const radius = 0.7;
        // const sides = 6;

        // for (let i = 0; i < sides; i++) {
        //     const angle = (i / sides) * Math.PI * 2;

        //     const x = Math.cos(angle) * radius;
        //     const y = Math.sin(angle) * radius;

        //     if (i === 0) {
        //         shape.moveTo(x, y);
        //     } else {
        //         shape.lineTo(x, y);
        //     }
        // }

        // shape.closePath();

        // let geo = new THREE.BoxGeometry(width, height, depth, 50, 50, 50);
        // -------- EXTRUDE --------
        let geo = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: false,
            steps: 200, // smoother deformation
        });
        geo = LoopSubdivision.modify(geo, 2) as THREE.ExtrudeGeometry; // 1–3 levels

        //  geo.rotateY(Math.PI / 2);
        geo = geo.toNonIndexed() as THREE.ExtrudeGeometry;

        const pos = geo.attributes.position;
        const morphPositions: number[] = [];
        const v = new THREE.Vector3();

        //  CORRECT NORMALIZATION
        const bbox = new THREE.Box3().setFromBufferAttribute(
            pos as THREE.BufferAttribute,
        );
        const min = bbox.min;
        const max = bbox.max;

        geo.morphAttributes.position = [];

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);

            let x = v.x;
            const y = v.y;
            let z = v.z;

            // FIXED NORMALIZATION (IMPORTANT)
            const xNorm = ((x - min.x) / (max.x - min.x)) * 2 - 1;
            const yNorm = (y - min.y) / (max.y - min.y);
            const zNorm = ((z - min.z) / (max.z - min.z)) * 2 - 1;

            // //  skip caps (top & bottom)
            // if (yNorm < 0.02 || yNorm > 0.98) {
            //     morphPositions.push(x, y, z);
            //     continue;
            // }

            // =================================================
            // SIDE GUSSET (same as box logic)
            // =================================================
            const centerDist = Math.abs(xNorm);
            const crease = Math.exp(-Math.pow(centerDist * 2, 2));

            const yFalloff = Math.sin(yNorm * Math.PI);
            const depthFalloff = Math.cos((zNorm * Math.PI) / 2);

            const influence = crease * yFalloff * depthFalloff;

            // fold
            x *= 1 - 1.2 * influence;

            // V shape (correct axis)
            z *= 1 - 0.7 * crease;

            // smooth symmetric bulge
            const bulge = Math.sin(yNorm * Math.PI);
            z += bulge * 0.5 * (1 - centerDist) * depthFalloff;
            // if (yNorm < 0.2) {
            //     z += 1; // force bottom movement
            // }
            morphPositions.push(x, y, z);
        }

        geo.morphAttributes.position.push(
            new THREE.Float32BufferAttribute(morphPositions, 3),
        );

        geo.computeVertexNormals();

        return geo;
    }, []);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        mesh.updateMorphTargets();

        const gui = new GUI();
        const params = { morph: 0 };

        gui.add(params, "morph", 0, 1, 0.01).onChange((v: number) => {
            mesh.morphTargetInfluences![0] = v;
        });

        return () => gui.destroy();
    }, []);

    return (
        <mesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial
                color="#ff7a00"
                roughness={0.35}
                metalness={0.1}
                // morphTargets
                wireframe
            />
        </mesh>
    );
}

export default function Scene() {
    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            {" "}
            <ambientLight intensity={0.3} />
            <directionalLight position={[5, 8, 5]} intensity={2} />
            <MorphExtrude />
            <OrbitControls />
        </Canvas>
    );
}
