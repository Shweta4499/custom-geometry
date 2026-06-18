"use client";

import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Suspense, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import { button, folder, Leva, useControls } from "leva";
import {
    getJointSkinningScenario,
    JOINT_SKINNING_SCENARIOS,
} from "@/lib/skinningScenarios";
import {
    getFoldLineAnchorPoint,
    getFoldLineEndpoints,
    getPerpDistFromFoldXY,
    type T_foldLineData,
} from "@/lib/foldLineData";
import {
    augmentProductionSeamExtension,
    augmentProductionSeamHole,
} from "@/lib/productionShapeAugment";
import { LoopSubdivision } from "three-subdivide";

const extrudeSettings = { depth: 0.5, bevelEnabled: false } as const;
// const EXTRUDE_Z_CENTER = extrudeSettings.depth / 2;
const DEG = Math.PI / 180;
const FRONT_TEXTURE_URL = "/textures/front.png";
const BACK_TEXTURE_URL = "/textures/back.png";
const SIDE_TEXTURE_URL = "/textures/side.png";

function splitExtrudeCapGroups(geo: THREE.BufferGeometry): void {
    if (geo.groups.length < 2) return;
    console.log("geo.groups", geo.groups);
    const [capsGroup, sideGroup] = geo.groups;
    const halfCount = Math.floor(capsGroup.count / 2);

    geo.clearGroups();
    geo.addGroup(capsGroup.start, halfCount, 0); // front cap
    geo.addGroup(sideGroup.start, sideGroup.count, 1); // sides
    geo.addGroup(capsGroup.start + halfCount, capsGroup.count - halfCount, 2); // back cap
    console.log("geo.groupsf", geo.groups);
}

/** mergeGeometries() drops groups unless useGroups=true (per-mesh only); offset and keep face groups. */
function mergeGeometriesPreservingGroups(
    geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry {
    const mergedGeo = mergeGeometries(geometries);
    if (!mergedGeo) throw new Error("mergeGeometries returned null");

    mergedGeo.clearGroups();
    let vertexOffset = 0;
    for (const geo of geometries) {
        for (const group of geo.groups) {
            mergedGeo.addGroup(
                vertexOffset + group.start,
                group.count,
                group.materialIndex,
            );
        }
        vertexOffset += (geo.attributes.position as THREE.BufferAttribute)
            .count;
    }
    return mergedGeo;
}

/** UV-map front (+Z) and back (z = 0) cap vertices from XY bounds. */
function applyUvs(geo: THREE.BufferGeometry, depth: number): void {
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    if (!bbox) return;

    const minX = bbox.min.x;
    const minY = bbox.min.y;
    const spanX = bbox.max.x - minX || 1;
    const spanY = bbox.max.y - minY || 1;
    const zEps = 1e-3;
    const frontZ = depth;
    const backZ = 0;

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) - minX) / spanX;
        const v = (pos.getY(i) - minY) / spanY;
        if (pos.getZ(i) >= frontZ - zEps) {
            uv[i * 2] = u;
            uv[i * 2 + 1] = v;
        } else if (pos.getZ(i) <= backZ + zEps) {
            uv[i * 2] = 1 - u;
            uv[i * 2 + 1] = v;
        } else {
            // Side walls: u along perimeter (world XY), v through extrusion depth.
            uv[i * 2] = pos.getX(i) + pos.getY(i);
            uv[i * 2 + 1] = pos.getZ(i) / depth;
        }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

// /** ExtrudeGeometry spans z ∈ [0, depth]; shift so the crease hinge lies on z = 0. */
// function centerExtrudeZ(geo: THREE.BufferGeometry): void {
//     geo.translate(0, 0, -EXTRUDE_Z_CENTER);
// }

function subdivideGeo(
    geo: THREE.BufferGeometry,
    subdivisions: number,
): THREE.BufferGeometry {
    if (subdivisions <= 0) return geo;
    const subdivided = LoopSubdivision.modify(geo, subdivisions, {
        flatOnly: true,
    });
    geo.dispose();
    subdivided.computeVertexNormals();
    return subdivided;
}

function cloneShapeArray(shapes: THREE.Shape[]): THREE.Shape[] {
    return shapes.map((s) => {
        const c = new THREE.Shape();
        c.copy(s);
        return c;
    });
}

/** World-space segment for visualizing a scenario crease. */
function foldLineWorldEndpoints(
    fold: T_foldLineData,
    z: number,
): [THREE.Vector3, THREE.Vector3] {
    const { p0, p1 } = getFoldLineEndpoints(fold);
    return [new THREE.Vector3(p0.x, p0.y, z), new THREE.Vector3(p1.x, p1.y, z)];
}

function shapesFromSvgPath(svgPathD: string): THREE.Shape[] {
    const d = svgPathD.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${d}"/></svg>`;
    const loader = new SVGLoader();
    const { paths } = loader.parse(svg);
    return paths.flatMap((p) => SVGLoader.createShapes(p));
}

/**
 * Soften the hinge by blending bone weights from 0.5 on the crease to 1.0 at
 * `blendWidth` (perpendicular distance in XY). Needs subdivision for enough
 * vertices in the band.
 */
function applyCreaseBlendWeights(
    position: THREE.BufferAttribute,
    skinIndices: number[],
    skinWeights: number[],
    foldLine: T_foldLineData,
    blendWidth: number,
    primaryBone: 0 | 1,
    startIdx: number,
    endIdx: number,
): void {
    if (blendWidth <= 0) return;

    const otherBone = primaryBone === 0 ? 1 : 0;
    const xy = new THREE.Vector2();

    for (let i = startIdx; i < endIdx; i++) {
        xy.set(position.getX(i), position.getY(i));
        const d = getPerpDistFromFoldXY(xy, foldLine);
        if (d >= blendWidth) continue;

        const t = d / blendWidth;
        const wPrimary = 0.5 + 0.5 * t;
        const wOther = 1 - wPrimary;
        const base = i * 4;

        skinIndices[base] = primaryBone;
        skinIndices[base + 1] = otherBone;
        skinIndices[base + 2] = 0;
        skinIndices[base + 3] = 0;
        skinWeights[base] = wPrimary;
        skinWeights[base + 1] = wOther;
        skinWeights[base + 2] = 0;
        skinWeights[base + 3] = 0;
    }
}

/** Merge extrusions and assign bones by mesh half. */
function buildSkinnedGeo(
    shape0Shapes: THREE.Shape[],
    shape1Shapes: THREE.Shape[],
    subdivisions: number,
    foldLine: T_foldLineData | null = null,
    creaseBlend = 0,
): THREE.BufferGeometry {
    let geo0: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
        shape0Shapes,
        extrudeSettings,
    );
    let geo1: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
        shape1Shapes,
        extrudeSettings,
    );
    // centerExtrudeZ(geo0);
    // centerExtrudeZ(geo1);
    geo0 = subdivideGeo(geo0, subdivisions);
    geo1 = subdivideGeo(geo1, subdivisions);
    splitExtrudeCapGroups(geo0);
    splitExtrudeCapGroups(geo1);

    const count0 = (geo0.attributes.position as THREE.BufferAttribute).count;
    const count1 = (geo1.attributes.position as THREE.BufferAttribute).count;

    const merged = mergeGeometriesPreservingGroups([geo0, geo1]);
    console.log("merged groups", merged.groups);
    console.log("index count", merged.index?.count);
    console.log("vertex count", merged.attributes.position.count);
    geo0.dispose();
    geo1.dispose();

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

    const position = merged.attributes.position as THREE.BufferAttribute;
    if (foldLine !== null && creaseBlend > 0) {
        applyCreaseBlendWeights(
            position,
            skinIndices,
            skinWeights,
            foldLine,
            creaseBlend,
            0,
            0,
            count0,
        );
        applyCreaseBlendWeights(
            position,
            skinIndices,
            skinWeights,
            foldLine,
            creaseBlend,
            1,
            count0,
            count0 + count1,
        );
    }

    merged.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(skinIndices, 4),
    );
    merged.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(skinWeights, 4),
    );

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
            subdivisions,
            creaseBlend,
            showSkeleton,
            showFoldLine,
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
            subdivisions: {
                label: "Subdivision",
                value: 2,
                min: 0,
                max: 8,
                step: 1,
            },
            creaseBlend: {
                label: "Crease",
                value: 2,
                min: 0,
                max: 8,
                step: 0.1,
            },
            showSkeleton: { label: "Bones", value: true },
            showFoldLine: {
                label: "Fold line",
                value: true,
            },
            b0: folder({
                b0x: {
                    value: 0,
                    min: -30,
                    max: 30,
                    step: 0.1,
                    label: "x",
                    hint: "Offset from crease anchor",
                },
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

    /** World hinge anchor on the scenario crease (both bones pivot here + Leva offsets). */
    const hingeAnchor = useMemo((): THREE.Vector3 => {
        const fold = scenario.foldLine;
        return fold ? getFoldLineAnchorPoint(fold) : new THREE.Vector3(0, 0, 0);
    }, [scenario.foldLine]);

    const { shape0Shapes, shape1Shapes } = useMemo(() => {
        const shapeAugment = scenario.shapeAugment;
        const shape0FromSvg = shapesFromSvgPath(scenario.shape0SvgPath);
        const shape1FromSvg = shapesFromSvgPath(scenario.shape1SvgPath);
        const unfoldedFromSvg = shapesFromSvgPath(scenario.unfoldedSvgPath);

        if (!shapeAugment) {
            return {
                shape0Shapes: shape0FromSvg,
                shape1Shapes: shape1FromSvg,
            };
        }

        const shape0Shapes = cloneShapeArray(shape0FromSvg);
        const shape1Shapes = cloneShapeArray(shape1FromSvg);
        const unfoldedShapes = cloneShapeArray(unfoldedFromSvg);

        if (shapeAugment === "productionSeamHole") {
            augmentProductionSeamHole(
                shape0Shapes,
                shape1Shapes,
                unfoldedShapes,
            );
        } else if (shapeAugment === "productionSeamExtension") {
            augmentProductionSeamExtension(shape0Shapes, shape1Shapes);
        }

        return { shape0Shapes, shape1Shapes };
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

    const foldLinePreview = useMemo(() => {
        const fold = scenario.foldLine;
        if (!fold) return null;
        const z = 0.04;
        const [a, b] = foldLineWorldEndpoints(fold, z);
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        return new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: 0xffab00 }),
        );
    }, [scenario.foldLine]);

    useEffect(() => {
        return () => {
            if (!foldLinePreview) return;
            foldLinePreview.geometry.dispose();
            (foldLinePreview.material as THREE.Material).dispose();
        };
    }, [foldLinePreview]);

    const skinnedGeo = useMemo(() => {
        const subdivisionCount = Math.max(0, Math.round(subdivisions));
        const blend = Math.max(0, creaseBlend);
        const fold = scenario.foldLine ?? null;
        const geo = buildSkinnedGeo(
            shape0Shapes,
            shape1Shapes,
            subdivisionCount,
            fold,
            blend,
        );
        applyUvs(geo, extrudeSettings.depth);
        return geo;
    }, [
        subdivisions,
        creaseBlend,
        scenario.foldLine,
        shape0Shapes,
        shape1Shapes,
    ]);

    useEffect(() => {
        const count = (skinnedGeo.attributes.position as THREE.BufferAttribute)
            .count;
        console.log("vertices:", count);
        console.log(skinnedGeo.attributes.uv);
    }, [skinnedGeo]);

    useEffect(() => {
        return () => {
            skinnedGeo.dispose();
        };
    }, [skinnedGeo]);

    useFrame(() => {
        b0.position.set(
            hingeAnchor.x + b0x,
            hingeAnchor.y + b0y,
            hingeAnchor.z + b0z,
        );
        b0.rotation.set(b0rx * DEG, b0ry * DEG, b0rz * DEG);
        b0.scale.set(b0sx, b0sy, b0sz);

        b1.position.set(
            hingeAnchor.x + b1x,
            hingeAnchor.y + b1y,
            hingeAnchor.z + b1z,
        );
        b1.rotation.set(b1rx * DEG, b1ry * DEG, b1rz * DEG);
        b1.scale.set(b1sx, b1sy, b1sz);
    });

    const textures = useTexture([
        FRONT_TEXTURE_URL,
        BACK_TEXTURE_URL,
        SIDE_TEXTURE_URL,
    ]);

    const [frontTexture, backTexture, sideTexture] = useMemo(() => {
        const front = textures[0].clone();
        front.colorSpace = THREE.SRGBColorSpace;
        front.wrapS = THREE.ClampToEdgeWrapping;
        front.wrapT = THREE.ClampToEdgeWrapping;

        const back = textures[1].clone();
        back.colorSpace = THREE.SRGBColorSpace;
        back.wrapS = THREE.ClampToEdgeWrapping;
        back.wrapT = THREE.ClampToEdgeWrapping;

        const side = textures[2].clone();
        side.colorSpace = THREE.SRGBColorSpace;
        side.wrapS = THREE.RepeatWrapping;
        side.wrapT = THREE.RepeatWrapping;
        side.repeat.set(0.15, 1);

        return [front, back, side];
    }, [textures]);

    const [frontMaterial, sideMaterial, backMaterial] = useMemo(() => {
        return [
            new THREE.MeshPhysicalMaterial({
                map: frontTexture,
                roughness: 0.85,
                metalness: 0.02,
            }),
            new THREE.MeshStandardMaterial({
                map: sideTexture,
            }),
            new THREE.MeshPhysicalMaterial({
                map: backTexture,
                roughness: 0.85,
                metalness: 0.02,
            }),
        ];
    }, [frontTexture, backTexture, sideTexture]);

    useEffect(() => {
        return () => {
            frontTexture.dispose();
            backTexture.dispose();
            sideTexture.dispose();
            frontMaterial.dispose();
            backMaterial.dispose();
            sideMaterial.dispose();
        };
    }, [
        frontTexture,
        backTexture,
        sideTexture,
        frontMaterial,
        backMaterial,
        sideMaterial,
    ]);

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

        b0.position.copy(hingeAnchor);
        b1.position.copy(hingeAnchor);
        b0.rotation.set(0, 0, 0);
        b1.rotation.set(0, 0, 0);
        b0.scale.set(1, 1, 1);
        b1.scale.set(1, 1, 1);
        b0.updateMatrixWorld(true);
        b1.updateMatrixWorld(true);

        mesh.bind(skeleton);
    }, [skinnedGeo, skeleton, b0, b1, hingeAnchor]);

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
                material={[frontMaterial, sideMaterial, backMaterial]}
            />
            {showFoldLine && foldLinePreview ? (
                <primitive
                    object={foldLinePreview}
                    name="fold-line-highlight"
                />
            ) : null}
        </group>
    );
}

export default function JointSkinningTestScene() {
    return (
        <>
            <Leva
                titleBar={{ title: "Joint skinning test" }}
                collapsed={false}
            />
            <Canvas
                camera={{ position: [28, 22, 34], fov: 50 }}
                style={{ width: "100vw", height: "100vh" }}
            >
                <color attach="background" args={["#f0f0f0"]} />
                <ambientLight intensity={0.55} />
                <directionalLight position={[12, 18, 10]} intensity={1.05} />
                <Suspense fallback={null}>
                    <SkinnedHingeDemo />
                </Suspense>
                <OrbitControls makeDefault />
            </Canvas>
        </>
    );
}
