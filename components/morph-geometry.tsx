"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useRef, useEffect } from "react";
import GUI from "lil-gui";

function MorphMesh() {
    const meshRef = useRef<THREE.Mesh>(null!);

    const params = useRef({
        progress: 0.0,
    });
    const geometry = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(2, 0);
        shape.lineTo(2, 1);
        shape.lineTo(1, 1.5);
        shape.lineTo(0, 1);
        shape.lineTo(0, 0);

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.2,
            bevelEnabled: false,
            steps: 60,
        });

        geo.center();

        const position = geo.attributes.position;

        // =========================
        // Morph Target 1: Bend
        // =========================
        const bendPositions = new Float32Array(position.count * 3);

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);

            const bend = Math.sin(x * Math.PI);

            bendPositions[i * 3 + 0] = x;
            bendPositions[i * 3 + 1] = y + bend;
            bendPositions[i * 3 + 2] = z;
        }

        // =========================
        // Morph Target 2: S-Curve
        // =========================
        const sCurvePositions = new Float32Array(position.count * 3);

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);

            const bend = Math.sin(x * Math.PI * 2.0) * 0.5;

            sCurvePositions[i * 3 + 0] = x;
            sCurvePositions[i * 3 + 1] = y + bend;
            sCurvePositions[i * 3 + 2] = z;
        }

        // Attach morphs
        geo.morphAttributes.position = [
            new THREE.BufferAttribute(bendPositions, 3),
            new THREE.BufferAttribute(sCurvePositions, 3),
        ];

        return geo;
    }, []);

    // GUI
    useEffect(() => {
        const gui = new GUI();

        gui.add(params.current, "progress", 0, 1, 0.01).name("Progress");

        return () => gui.destroy();
    }, []);

    //  Morph logic
    useFrame(() => {
        if (!meshRef.current) return;

        const t = params.current.progress;

        // Smooth blending between 2 morphs
        meshRef.current.morphTargetInfluences![0] = t;
        meshRef.current.morphTargetInfluences![1] = t * (1.0 - t);
    });

    return (
        <mesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial color="skyblue" />
        </mesh>
    );
}

export default function MorphGeometry() {
    return (
        <Canvas camera={{ position: [0, 2, 5], fov: 75 }}>
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} />
            <MorphMesh />
            <OrbitControls />
        </Canvas>
    );
}
