"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useMemo, useEffect, useRef, useState } from "react";
import GUI from "lil-gui";

function VertexLabels({ geometry }: { geometry: THREE.BufferGeometry }) {
    const positions = geometry.attributes.position;

    const labels = [];

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        labels.push(
            <Html key={i} position={[x, y, z]} center>
                <div
                    style={{
                        color: "white",
                        fontSize: "10px",
                        background: "rgba(0,0,0,0.5)",
                        padding: "2px",
                        borderRadius: "2px",
                    }}
                >
                    {i}
                </div>
            </Html>,
        );
    }

    return <>{labels}</>;
}
/* =========================
   CUSTOM GEOMETRIES
========================= */

//  Cube
function createCube() {
    const geo = new THREE.BufferGeometry();

    const vertices = new Float32Array([
        -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, -1, -1, 1, 1, -1,
        -1, 1, -1,
    ]);

    const indices = [
        0, 1, 2, 2, 3, 0, 5, 4, 7, 7, 6, 5, 3, 2, 6, 6, 7, 3, 4, 5, 1, 1, 0, 4,
        1, 5, 6, 6, 2, 1, 4, 0, 3, 3, 7, 4,
    ];

    geo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

//  Sphere
function createSphere() {
    const geo = new THREE.BufferGeometry();

    const radius = 1;
    const w = 24;
    const h = 16;

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= h; y++) {
        const v = y / h;
        const theta = v * Math.PI;

        for (let x = 0; x <= w; x++) {
            const u = x / w;
            const phi = u * Math.PI * 2;

            vertices.push(
                radius * Math.sin(theta) * Math.cos(phi),
                radius * Math.cos(theta),
                radius * Math.sin(theta) * Math.sin(phi),
            );
        }
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * (w + 1) + x;

            const a = i;
            const b = i + w + 1;
            const c = i + 1;
            const d = i + w + 2;

            indices.push(a, b, c);
            indices.push(c, b, d);
        }
    }

    geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(vertices), 3),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

//  Cylinder
function createCylinder() {
    const geo = new THREE.BufferGeometry();

    const r = 1;
    const h = 2;
    const seg = 32;

    const vertices: number[] = [];
    const indices: number[] = [];

    // side
    for (let y = 0; y <= 1; y++) {
        const py = (y - 0.5) * h;

        for (let i = 0; i <= seg; i++) {
            const t = (i / seg) * Math.PI * 2;
            vertices.push(r * Math.cos(t), py, r * Math.sin(t));
        }
    }

    for (let i = 0; i < seg; i++) {
        const a = i;
        const b = i + seg + 1;
        const c = i + 1;
        const d = b + 1;

        indices.push(a, b, c);
        indices.push(c, b, d);
    }

    geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(vertices), 3),
    );
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}
//  Capsule
function createCapsule() {
    const geo = new THREE.BufferGeometry();

    const radius = 1;
    const height = 2;

    const radialSegments = 32;
    const hemiSegments = 12;

    const vertices: number[] = [];
    const indices: number[] = [];

    //  TOP HEMISPHERE
    for (let y = 0; y <= hemiSegments; y++) {
        const v = y / hemiSegments;
        const theta = (v * Math.PI) / 2;

        const py = Math.cos(theta) * radius + height / 2;
        const r = Math.sin(theta) * radius;

        for (let i = 0; i < radialSegments; i++) {
            const u = i / radialSegments;
            const phi = u * Math.PI * 2;

            vertices.push(r * Math.cos(phi), py, r * Math.sin(phi));
        }
    }

    //  CYLINDER
    for (let y = 0; y <= hemiSegments; y++) {
        const v = y / hemiSegments;
        const py = height / 2 - v * height;

        for (let i = 0; i < radialSegments; i++) {
            const u = i / radialSegments;
            const phi = u * Math.PI * 2;

            vertices.push(radius * Math.cos(phi), py, radius * Math.sin(phi));
        }
    }

    //  BOTTOM HEMISPHERE
    for (let y = 0; y <= hemiSegments; y++) {
        const v = y / hemiSegments;
        const theta = (v * Math.PI) / 2;

        const py = -Math.cos(theta) * radius - height / 2;
        const r = Math.sin(theta) * radius;

        for (let i = 0; i < radialSegments; i++) {
            const u = i / radialSegments;
            const phi = u * Math.PI * 2;

            vertices.push(r * Math.cos(phi), py, r * Math.sin(phi));
        }
    }

    const rows = (hemiSegments + 1) * 3;

    // CONNECT
    for (let y = 0; y < rows - 1; y++) {
        for (let i = 0; i < radialSegments; i++) {
            const next = (i + 1) % radialSegments;

            const a = y * radialSegments + i;
            const b = (y + 1) * radialSegments + i;
            const c = y * radialSegments + next;
            const d = (y + 1) * radialSegments + next;

            indices.push(a, b, c);
            indices.push(c, b, d);
        }
    }

    geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(vertices), 3),
    );

    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

// Vase (Lathe / Revolve)
function createVase() {
    const geo = new THREE.BufferGeometry();

    const radialSegments = 40;

    //  profile (edit this to change shape)
    const profile = [
        [0.0, -1.5],
        [0.5, -1.5],
        [0.8, -1.0],
        [0.6, -0.3],
        [1.0, 0.3],
        [0.7, 1.0],
        [0.5, 1.5],
        [0.0, 1.5],
    ];

    const vertices: number[] = [];
    const indices: number[] = [];

    const rows = profile.length;

    //  revolve profile
    for (let y = 0; y < rows; y++) {
        const [r, py] = profile[y];

        for (let i = 0; i < radialSegments; i++) {
            const theta = (i / radialSegments) * Math.PI * 2;

            const px = r * Math.cos(theta);
            const pz = r * Math.sin(theta);

            vertices.push(px, py, pz);
        }
    }

    //  connect rings
    for (let y = 0; y < rows - 1; y++) {
        for (let i = 0; i < radialSegments; i++) {
            const next = (i + 1) % radialSegments;

            const a = y * radialSegments + i;
            const b = (y + 1) * radialSegments + i;
            const c = y * radialSegments + next;
            const d = (y + 1) * radialSegments + next;

            indices.push(a, b, c);
            indices.push(c, b, d);
        }
    }

    geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(vertices), 3),
    );

    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

function createPillowPouch() {
    const geo = new THREE.BufferGeometry();

    const width = 3;
    const height = 2;

    const segX = 40;
    const segY = 30;

    const thickness = 0.3;

    const vertices: number[] = [];
    const indices: number[] = [];

    //  CREATE FRONT + BACK
    for (let y = 0; y <= segY; y++) {
        for (let x = 0; x <= segX; x++) {
            const u = x / segX;
            const v = y / segY;

            let px = (u - 0.5) * width;
            let py = (v - 0.5) * height;
            let pz = 0;

            //  main cylindrical curve
            const curve = Math.sin((u - 0.5) * Math.PI);
            pz = curve * 0.8;
            //  side pinch
            const pinch = Math.pow(Math.abs(u - 0.5) * 2, 2);
            pz *= 1 - pinch * 0.7;

            //  top/bottom concave
            const edge = Math.pow(Math.abs(v - 0.5) * 2, 2);
            py *= 1 - edge * 0.3;

            // FRONT
            vertices.push(px, py, pz + thickness);

            // BACK
            vertices.push(px, py, pz - thickness);
        }
    }

    const row = segX + 1;

    //  FRONT + BACK FACES
    for (let y = 0; y < segY; y++) {
        for (let x = 0; x < segX; x++) {
            const i = y * row + x;

            const a = i * 2;
            const b = (i + 1) * 2;
            const c = (i + row) * 2;
            const d = (i + row + 1) * 2;

            // FRONT
            indices.push(a, b, c);
            indices.push(b, d, c);

            // BACK (reverse winding)
            indices.push(a + 1, c + 1, b + 1);
            indices.push(b + 1, c + 1, d + 1);
        }
    }

    //  SIDE EDGES (LEFT + RIGHT)
    for (let y = 0; y < segY; y++) {
        const left = y * row;
        const right = left + segX;

        const nextL = left + row;
        const nextR = right + row;

        const a = left * 2;
        const b = nextL * 2;

        const c = right * 2;
        const d = nextR * 2;

        // LEFT
        indices.push(a, b, a + 1);
        indices.push(a, b, b + 1);

        // RIGHT
        indices.push(c, c + 1, d);
        indices.push(c + 1, d + 1, d);
    }

    //  TOP & BOTTOM SEAL (IMPORTANT)
    for (let x = 0; x < segX; x++) {
        const top = x;
        const bottom = segY * row + x;

        const nextT = top + 1;
        const nextB = bottom + 1;

        const a = top * 2;
        const b = nextT * 2;

        const c = bottom * 2;
        const d = nextB * 2;

        // TOP
        indices.push(a, a + 1, b);
        indices.push(a + 1, b + 1, b);

        // BOTTOM
        indices.push(c, d, c + 1);
        indices.push(c + 1, d, d + 1);
    }

    geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(vertices), 3),
    );

    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

/* =========================
   MESH SWITCHER
========================= */

function Shape({ type }: { type: string }) {
    const geometry = useMemo(() => {
        if (type === "sphere") return createSphere();
        if (type === "cylinder") return createCylinder();
        if (type === "capsule") return createCapsule();
        if (type === "vase") return createVase();
        if (type === "pouch") return createPillowPouch();
        return createCube();
    }, [type]);

    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial color="orange" wireframe />
            <points geometry={geometry}>
                <pointsMaterial size={0.05} color="red" sizeAttenuation />
            </points>

            <VertexLabels geometry={geometry} />
        </mesh>
    );
}

/* =========================
   MAIN SCENE
========================= */

export default function Scene() {
    const [shape, setShape] = useState("cube");
    const params = useRef({ shape: "cube" });

    useEffect(() => {
        const gui = new GUI();

        gui.add(params.current, "shape", [
            "cube",
            "sphere",
            "cylinder",
            "capsule",

            "vase",

            "pouch",
        ])
            .name("Geometry")
            .onChange((v: string) => setShape(v));

        return () => gui.destroy();
    }, []);

    return (
        <Canvas
            camera={{ position: [8, 6, 10], fov: 70 }}
            style={{ width: "100vw", height: "100vh" }}
        >
            {" "}
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} />
            <Shape type={shape} />
            <OrbitControls />
        </Canvas>
    );
}
