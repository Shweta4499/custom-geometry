"use client";

import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import {
    mergeGeometries,
    mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { button, folder, Leva, useControls } from "leva";
import {
    getJointSkinningScenario,
    JOINT_SKINNING_SCENARIOS,
} from "@/lib/skinningScenarios";
import {
    vertexEligibleForFoldWeld,
    type FoldLineForWeld,
} from "@/lib/foldLineForWeld";
import {
    augmentProductionSeamExtension,
    augmentProductionSeamHole,
} from "@/lib/productionShapeAugment";

const extrudeSettings = { depth: 1, bevelEnabled: false } as const;
const DEG = Math.PI / 180;

function cloneShapeArray(shapes: THREE.Shape[]): THREE.Shape[] {
    return shapes.map((s) => {
        const c = new THREE.Shape();
        c.copy(s);
        return c;
    });
}

/** World-space segment for visualizing a scenario crease (respects `tRange`). */
function foldLineWorldEndpoints(
    fold: FoldLineForWeld,
    z: number,
): [THREE.Vector3, THREE.Vector3] {
    const dir = new THREE.Vector2().subVectors(fold.p1, fold.p0);
    const len = dir.length();
    const tStart = fold.tRange?.tMin ?? 0;
    const tEnd = fold.tRange?.tMax ?? len;
    const along = (t: number): THREE.Vector3 => {
        if (len < 1e-20) {
            return new THREE.Vector3(fold.p0.x, fold.p0.y, z);
        }
        const u = t / len;
        return new THREE.Vector3(
            fold.p0.x + u * dir.x,
            fold.p0.y + u * dir.y,
            z,
        );
    };
    return [along(tStart), along(tEnd)];
}

function shapesFromSvgPath(svgPathD: string): THREE.Shape[] {
    const d = svgPathD.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${d}"/></svg>`;
    const loader = new SVGLoader();
    const { paths } = loader.parse(svg);
    return paths.flatMap((p) => SVGLoader.createShapes(p));
}

function raycastPolygon(polygon: THREE.Vector2[], pt: THREE.Vector2): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i]!.x;
        const yi = polygon[i]!.y;
        const xj = polygon[j]!.x;
        const yj = polygon[j]!.y;
        if (
            yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
}

function pointInShape(shape: THREE.Shape, pt: THREE.Vector2): boolean {
    const { shape: outline, holes } = shape.extractPoints(64);
    let inside = raycastPolygon(outline, pt);
    for (const hole of holes) {
        if (raycastPolygon(hole, pt)) inside = !inside;
    }
    return inside;
}

function buildSkinnedGeoOption1(
    unfoldedShapes: THREE.Shape[],
    shapes0: THREE.Shape[],
    shapes1: THREE.Shape[],
): THREE.ExtrudeGeometry {
    const geo = new THREE.ExtrudeGeometry(unfoldedShapes, extrudeSettings);
    const position = geo.attributes.position as THREE.BufferAttribute;
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    const pt = new THREE.Vector2();

    for (let i = 0; i < position.count; i++) {
        pt.set(position.getX(i), position.getY(i));
        const inS0 = shapes0.some((s) => pointInShape(s, pt));
        const inS1 = shapes1.some((s) => pointInShape(s, pt));

        if (inS0 && !inS1) {
            skinIndices.push(0, 0, 0, 0);
            skinWeights.push(1, 0, 0, 0);
        } else if (inS1 && !inS0) {
            skinIndices.push(1, 1, 0, 0);
            skinWeights.push(1, 0, 0, 0);
        } else {
            skinIndices.push(0, 1, 0, 0);
            skinWeights.push(0.5, 0.5, 0, 0);
        }
    }

    geo.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(skinIndices, 4),
    );
    geo.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(skinWeights, 4),
    );
    return geo;
}

/**
 * Option 2: merge extrusions, assign bones by mesh half, optional weld.
 *
 * When `weld` is true and the scenario provides `foldLine`, a pair is welded
 * only on the crease (within `maxDistance` of p0–p1) and outside every
 * `skipWeldRects` box — holes and extension tabs are skipped automatically.
 *
 * When `weld` is true and `foldLine` is null, every coincident pair is welded
 * (legacy fallback for scenarios without a crease definition).
 */
function buildSkinnedGeoOption2(
    shapes0: THREE.Shape[],
    shapes1: THREE.Shape[],
    weld = false,
    foldLine: FoldLineForWeld | null = null,
): THREE.BufferGeometry {
    const geo0 = new THREE.ExtrudeGeometry(shapes0, extrudeSettings);
    const geo1 = new THREE.ExtrudeGeometry(shapes1, extrudeSettings);
    const count0 = (geo0.attributes.position as THREE.BufferAttribute).count;
    const count1 = (geo1.attributes.position as THREE.BufferAttribute).count;

    const merged = mergeGeometries([geo0, geo1]);
    geo0.dispose();
    geo1.dispose();
    if (!merged) throw new Error("mergeGeometries returned null");

    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    for (let i = 0; i < count0; i++) {
        skinIndices.push(0, 0, 0, 0);
        skinWeights.push(1, 0, 0, 0);
    }
    for (let i = 0; i < count1; i++) {
        skinIndices.push(1, 1, 0, 0);
        skinWeights.push(1, 0, 0, 0);
    }

    if (weld) {
        const pos = merged.attributes.position as THREE.BufferAttribute;
        const PRECISION = 1e-4;
        const posKey = (i: number) =>
            `${Math.round(pos.getX(i) / PRECISION)},` +
            `${Math.round(pos.getY(i) / PRECISION)},` +
            `${Math.round(pos.getZ(i) / PRECISION)}`;

        const geo0KeyToIdx = new Map<string, number>();
        for (let i = 0; i < count0; i++) geo0KeyToIdx.set(posKey(i), i);

        const xy = new THREE.Vector2();
        for (let j = count0; j < count0 + count1; j++) {
            const geo0Idx = geo0KeyToIdx.get(posKey(j));
            if (geo0Idx === undefined) continue;

            if (foldLine !== null) {
                xy.set(pos.getX(j), pos.getY(j));
                if (!vertexEligibleForFoldWeld(xy, foldLine)) continue;
            }

            skinIndices[j * 4] = 0;
            skinIndices[j * 4 + 1] = 1;
            skinWeights[j * 4] = 0.5;
            skinWeights[j * 4 + 1] = 0.5;

            skinIndices[geo0Idx * 4] = 0;
            skinIndices[geo0Idx * 4 + 1] = 1;
            skinWeights[geo0Idx * 4] = 0.5;
            skinWeights[geo0Idx * 4 + 1] = 0.5;
        }
    }

    merged.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(skinIndices, 4),
    );
    merged.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(skinWeights, 4),
    );

    if (weld) {
        const welded = mergeVertices(merged);
        merged.dispose();
        return welded;
    }

    return merged;
}

const scenarioLevaOptions = Object.fromEntries(
    JOINT_SKINNING_SCENARIOS.map((s) => [s.label, s.id]),
);

function SkinnedHingeDemo() {
    const setLevaRef = useRef<((v: Record<string, unknown>) => void) | null>(
        null,
    );

    const [
        {
            scenarioId,
            algorithm,
            weld,
            showSkeleton,
            showFoldLine,
            showSplitParts,
            b0x,
            b0y,
            b0z,
            b0rx,
            b0ry,
            b0rz,
            b0sx,
            b0sy,
            b0sz,
            b1x,
            b1y,
            b1z,
            b1rx,
            b1ry,
            b1rz,
            b1sx,
            b1sy,
            b1sz,
        },
        set,
    ] = useControls(
        () => ({
            resetBones: button(() => {
                setLevaRef.current?.({
                    b0x: 0,
                    b0y: 0,
                    b0z: 0,
                    b0rx: 0,
                    b0ry: 0,
                    b0rz: 0,
                    b0sx: 1,
                    b0sy: 1,
                    b0sz: 1,
                    b1x: 0,
                    b1y: 0,
                    b1z: 0,
                    b1rx: 0,
                    b1ry: 0,
                    b1rz: 0,
                    b1sx: 1,
                    b1sy: 1,
                    b1sz: 1,
                });
            }),
            scenarioId: {
                label: "Scenario",
                options: scenarioLevaOptions,
                value: JOINT_SKINNING_SCENARIOS[0]!.id,
            },
            algorithm: {
                label: "Algorithm",
                options: {
                    "Option 2 — merge (O(V), fast)": "option2",
                    "Option 1 — ray cast (O(V×P×64), slow)": "option1",
                },
                value: "option2",
            },
            weld: {
                label: "Weld seam (hinge)",
                value: true,
                hint: "Option 2: crease only; skips holes & extension tabs per scenario",
            },
            showSkeleton: { label: "Show bones (axes)", value: true },
            showFoldLine: {
                label: "Highlight fold line",
                value: true,
                hint: "Scenario crease used for fold-filtered welding",
            },
            showSplitParts: {
                label: "Show shape0 / shape1 refs",
                value: false,
            },
            b0: folder({
                b0x: { value: 0, min: -30, max: 30, step: 0.1, label: "x" },
                b0y: { value: 0, min: -30, max: 30, step: 0.1, label: "y" },
                b0z: { value: 0, min: -10, max: 10, step: 0.1, label: "z" },
                b0rx: { value: 0, min: -180, max: 180, step: 1, label: "rx °" },
                b0ry: { value: 0, min: -180, max: 180, step: 1, label: "ry °" },
                b0rz: { value: 0, min: -180, max: 180, step: 1, label: "rz °" },
                b0sx: { value: 1, min: 0.01, max: 5, step: 0.01, label: "sx" },
                b0sy: { value: 1, min: 0.01, max: 5, step: 0.01, label: "sy" },
                b0sz: { value: 1, min: 0.01, max: 5, step: 0.01, label: "sz" },
            }),
            b1: folder({
                b1x: { value: 0, min: -30, max: 30, step: 0.1, label: "x" },
                b1y: { value: 0, min: -30, max: 30, step: 0.1, label: "y" },
                b1z: { value: 0, min: -10, max: 10, step: 0.1, label: "z" },
                b1rx: { value: 0, min: -180, max: 180, step: 1, label: "rx °" },
                b1ry: { value: 0, min: -180, max: 180, step: 1, label: "ry °" },
                b1rz: { value: 0, min: -180, max: 180, step: 1, label: "rz °" },
                b1sx: { value: 1, min: 0.01, max: 5, step: 0.01, label: "sx" },
                b1sy: { value: 1, min: 0.01, max: 5, step: 0.01, label: "sy" },
                b1sz: { value: 1, min: 0.01, max: 5, step: 0.01, label: "sz" },
            }),
        }),
        [],
    );

    useLayoutEffect(() => {
        setLevaRef.current = set;
    }, [set]);

    const scenario = useMemo(
        () => getJointSkinningScenario(scenarioId as string),
        [scenarioId],
    );

    const { unfoldedShapes, shapes0, shapes1 } = useMemo(() => {
        const aug = scenario.shapeAugment;
        const raw0 = shapesFromSvgPath(scenario.shape0SvgPath);
        const raw1 = shapesFromSvgPath(scenario.shape1SvgPath);
        const rawU = shapesFromSvgPath(scenario.unfoldedSvgPath);

        if (!aug) {
            return {
                shapes0: raw0,
                shapes1: raw1,
                unfoldedShapes: rawU,
            };
        }

        const s0 = cloneShapeArray(raw0);
        const s1 = cloneShapeArray(raw1);
        const unfolded = cloneShapeArray(rawU);

        if (aug === "productionSeamHole") {
            augmentProductionSeamHole(s0, s1, unfolded);
        } else if (aug === "productionSeamExtension") {
            augmentProductionSeamExtension(s0, s1);
        }

        return { shapes0: s0, shapes1: s1, unfoldedShapes: unfolded };
    }, [
        scenario.shapeAugment,
        scenario.shape0SvgPath,
        scenario.shape1SvgPath,
        scenario.unfoldedSvgPath,
    ]);

    const { b0, b1, skeleton } = useMemo(() => {
        const b0 = new THREE.Bone();
        b0.name = "b0";
        const b1 = new THREE.Bone();
        b1.name = "b1";
        return { b0, b1, skeleton: new THREE.Skeleton([b0, b1]) };
    }, []);

    const foldLineForWeld = useMemo((): FoldLineForWeld | null => {
        if (algorithm !== "option2" || !weld) return null;
        return scenario.foldLine ?? null;
    }, [algorithm, weld, scenario.foldLine]);

    const foldLineObject = useMemo(() => {
        const fold = scenario.foldLine;
        if (!fold) return null;
        const z = extrudeSettings.depth + 0.04;
        const [a, b] = foldLineWorldEndpoints(fold, z);
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        return new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: 0xffab00 }),
        );
    }, [scenario.foldLine]);

    useEffect(() => {
        return () => {
            if (!foldLineObject) return;
            foldLineObject.geometry.dispose();
            (foldLineObject.material as THREE.Material).dispose();
        };
    }, [foldLineObject]);

    const skinnedGeo = useMemo(() => {
        if (algorithm === "option1") {
            return buildSkinnedGeoOption1(unfoldedShapes, shapes0, shapes1);
        }
        return buildSkinnedGeoOption2(shapes0, shapes1, weld, foldLineForWeld);
    }, [algorithm, weld, foldLineForWeld, unfoldedShapes, shapes0, shapes1]);

    useEffect(() => {
        return () => {
            skinnedGeo.dispose();
        };
    }, [skinnedGeo]);

    useFrame(() => {
        b0.position.set(b0x, b0y, b0z);
        b0.rotation.set(b0rx * DEG, b0ry * DEG, b0rz * DEG);
        b0.scale.set(b0sx, b0sy, b0sz);

        b1.position.set(b1x, b1y, b1z);
        b1.rotation.set(b1rx * DEG, b1ry * DEG, b1rz * DEG);
        b1.scale.set(b1sx, b1sy, b1sz);
    });

    const meshRef = useRef<THREE.SkinnedMesh>(null);
    const axesB0Ref = useRef<THREE.AxesHelper | null>(null);
    const axesB1Ref = useRef<THREE.AxesHelper | null>(null);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        mesh.add(b0);
        mesh.add(b1);

        const axesB0 = new THREE.AxesHelper(6);
        axesB0.name = "axes-b0";
        b0.add(axesB0);
        axesB0Ref.current = axesB0;

        const axesB1 = new THREE.AxesHelper(6);
        axesB1.name = "axes-b1";
        b1.add(axesB1);
        axesB1Ref.current = axesB1;

        return () => {
            mesh.remove(b0);
            mesh.remove(b1);
            b0.remove(axesB0);
            b1.remove(axesB1);
            axesB0.dispose();
            axesB1.dispose();
            axesB0Ref.current = null;
            axesB1Ref.current = null;
        };
    }, [b0, b1]);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        mesh.bind(skeleton);
    }, [skinnedGeo, skeleton, b0, b1]);

    useEffect(() => {
        if (axesB0Ref.current) axesB0Ref.current.visible = showSkeleton;
        if (axesB1Ref.current) axesB1Ref.current.visible = showSkeleton;
    }, [showSkeleton]);

    return (
        <group>
            <skinnedMesh
                ref={meshRef}
                geometry={skinnedGeo}
                name="unfoldedShape"
            >
                <meshStandardMaterial color="#c62828" />
            </skinnedMesh>
            {showFoldLine && foldLineObject ? (
                <primitive object={foldLineObject} name="fold-line-highlight" />
            ) : null}
            <mesh
                position={[0, 0, 1.2]}
                visible={showSplitParts}
                name="shape0-ref"
            >
                <extrudeGeometry args={[shapes0, extrudeSettings]} />
                <meshStandardMaterial
                    color="#2e7d32"
                    transparent
                    opacity={0.35}
                />
            </mesh>
            <mesh
                position={[0, 0, -1.2]}
                visible={showSplitParts}
                name="shape1-ref"
            >
                <extrudeGeometry args={[shapes1, extrudeSettings]} />
                <meshStandardMaterial
                    color="#1565c0"
                    transparent
                    opacity={0.35}
                />
            </mesh>
        </group>
    );
}

export default function JointSkinningTestScene() {
    return (
        <>
            <Leva
                titleBar={{ title: "Joint skinning / weld test" }}
                collapsed={false}
            />
            <Canvas
                camera={{ position: [28, 22, 34], fov: 50 }}
                style={{ width: "100vw", height: "100vh" }}
            >
                <color attach="background" args={["#f0f0f0"]} />
                <ambientLight intensity={0.55} />
                <directionalLight position={[12, 18, 10]} intensity={1.05} />
                <SkinnedHingeDemo />
                <OrbitControls makeDefault />
            </Canvas>
        </>
    );
}
