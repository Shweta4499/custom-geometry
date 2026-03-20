"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef, useEffect, useState } from "react";
import GUI from "lil-gui";

function MorphCube() {
    const meshRef = useRef<THREE.Mesh>(null!);
    const [debugPoint, setDebugPoint] = useState<THREE.Vector3 | null>(null);

    const geometry = useMemo(() => {
        const width = 1;
        const height = 4;
        const depth = 3;

        const geo = new THREE.BoxGeometry(width, height, depth, 50, 50, 50);

        const pos = geo.attributes.position;
        const morphPositions: number[] = [];

        const v = new THREE.Vector3();
        //PREPARE MORPH TARGET
        geo.morphAttributes.position = [];

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);

            let x = v.x;
            const y = v.y;
            let z = v.z;

            // -----------------------------
            // NORMALIZED
            // -----------------------------
            const xNorm = x / (width / 2);
            const yNorm = (y + height / 2) / height;
            const zNorm = z / (depth / 2);

            // =================================================
            //  SIDE GUSSET (SMOOTH)
            // =================================================
            const centerDist = Math.abs(xNorm);

            // smoother crease (less sharp)
            const crease = Math.exp(-Math.pow(centerDist * 2, 2));

            const yFalloff = Math.sin(yNorm * Math.PI);
            const depthFalloff = 1 - Math.abs(zNorm);

            const influence = crease * yFalloff * depthFalloff;

            // inward fold
            x *= 1 - 0.5 * influence;

            // V shape
            z *= 1 - 0.6 * crease;

            // soft bulge (air fill)
            const bulge = Math.sin(yNorm * Math.PI);
            if (Math.abs(zNorm) < 0.9) {
                z += bulge * 0.35 * (1 - Math.abs(xNorm));
            }

            // =================================================
            //  TOP SHOULDER (SMOOTH TRANSITION)
            // =================================================
            // const topBlend = THREE.MathUtils.smoothstep(yNorm, 0.65, 1);

            // if (topBlend > 0) {
            //     const centerFalloff = 1 - Math.abs(xNorm);

            //     // smooth inward taper
            //     x -= Math.sign(x) * topBlend * 0.35 * centerFalloff;

            //     // soft lift (no sharp ridge)
            //     y += centerFalloff * topBlend * 0.12;

            //     // compress depth
            //     z *= 1 - topBlend * 0.4;
            // }

            // // =================================================
            // //  TOP SEAL (FLAT BUT NATURAL)
            // // =================================================
            // const sealBlend = THREE.MathUtils.smoothstep(yNorm, 0.85, 1);

            // if (sealBlend > 0) {
            //     const centerFalloff = 1 - Math.abs(xNorm);

            //     // flatten but keep curve
            //     z *= 1 - sealBlend * 0.5;
            //     z -= sealBlend * 0.1;

            //     // pinch toward center
            //     x -= Math.sign(x) * sealBlend * 0.15 * centerFalloff;

            //     // slight bump (real pouch seam feel)
            //     y += centerFalloff * sealBlend * 0.08;
            // }

            // =================================================
            //  BOTTOM BASE (STABLE)
            // =================================================
            // const bottomBlend = THREE.MathUtils.smoothstep(1 - yNorm, 0.85, 1);

            // if (bottomBlend > 0) {
            //     z *= 1 - bottomBlend * 0.6;
            //     x *= 1 + bottomBlend * 0.15;
            // }

            // // =================================================
            // //  GLOBAL SMOOTHING (VERY IMPORTANT)
            // // =================================================
            // const smooth = 0.15 * Math.sin(yNorm * Math.PI);
            // x *= 1 - smooth * 0.08;
            // z *= 1 - smooth * 0.08;

            morphPositions.push(x, y, z);
        }

        geo.morphAttributes.position[0] = new THREE.Float32BufferAttribute(
            morphPositions,
            3,
        );

        geo.computeVertexNormals();

        return geo;
    }, []);
    useEffect(() => {
        const mesh = meshRef.current;
        mesh.updateMorphTargets();

        const params = { morph: 0 };
        const gui = new GUI();

        gui.add(params, "morph", 0, 1, 0.01).onChange((v: number) => {
            mesh.morphTargetInfluences![0] = v;
        });

        return () => gui.destroy();
    }, []);

    return (
        <>
            {/* Cube */}
            <mesh ref={meshRef} geometry={geometry}>
                <meshStandardMaterial
                    color="#ff7a00"
                    roughness={0.35}
                    metalness={0.1}
                />{" "}
            </mesh>
        </>
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
            <directionalLight position={[5, 8, 5]} intensity={2} castShadow />
            <directionalLight position={[-5, 5, 3]} intensity={0.8} />
            <directionalLight position={[0, 5, -6]} intensity={1.5} />
            <MorphCube />
            <OrbitControls />
        </Canvas>
    );
}
