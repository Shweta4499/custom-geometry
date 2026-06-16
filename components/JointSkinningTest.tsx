"use client";

import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import {
    mergeGeometries,
    mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Suspense, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import { button, folder, Leva, useControls } from "leva";
import {
    getJointSkinningScenario,
    JOINT_SKINNING_SCENARIOS,
} from "@/lib/skinningScenarios";
import {
    foldLineAnchorPoint,
    perpendicularDistanceFromFoldXY,
    vertexEligibleForFoldWeld,
    type FoldLineForWeld,
} from "@/lib/foldLineForWeld";
import {
    augmentProductionSeamExtension,
    augmentProductionSeamHole,
} from "@/lib/productionShapeAugment";
import { LoopSubdivision } from "three-subdivide";

const extrudeSettings = { depth: 0.5, bevelEnabled: false } as const;
// const EXTRUDE_Z_CENTER = extrudeSettings.depth / 2;
const DEG = Math.PI / 180;
const PANEL_TEXTURE_URL = "/textures/texture.png";
const TOP_CAP_MATERIAL = 0;
const BODY_MATERIAL = 1;

const triA = new THREE.Vector3();
const triB = new THREE.Vector3();
const triC = new THREE.Vector3();
const triE1 = new THREE.Vector3();
const triE2 = new THREE.Vector3();
const triN = new THREE.Vector3();

/**
 * UV-map the +Z cap (printed face) and split triangles into two material
 * groups so only that cap samples the texture; sides and bottom stay solid.
 */
function applyTopCapTextureLayout(
    geo: THREE.BufferGeometry,
    capZ: number,
): void {
    geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    if (!bbox) return;

    const minX = bbox.min.x;
    const minY = bbox.min.y;
    const spanX = bbox.max.x - minX || 1;
    const spanY = bbox.max.y - minY || 1;
    const zEps = 1e-3;

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) >= capZ - zEps) {
            uv[i * 2] = (pos.getX(i) - minX) / spanX;
            uv[i * 2 + 1] = (pos.getY(i) - minY) / spanY;
        }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    const topIndices: number[] = [];
    const bodyIndices: number[] = [];
    const index = geo.index;

    const classifyTriangle = (i0: number, i1: number, i2: number) => {
        triA.fromBufferAttribute(pos, i0);
        triB.fromBufferAttribute(pos, i1);
        triC.fromBufferAttribute(pos, i2);
        triE1.subVectors(triC, triB);
        triE2.subVectors(triA, triB);
        triN.crossVectors(triE1, triE2).normalize();

        const onTopCap =
            triA.z >= capZ - zEps &&
            triB.z >= capZ - zEps &&
            triC.z >= capZ - zEps &&
            triN.z > 0.5;

        (onTopCap ? topIndices : bodyIndices).push(i0, i1, i2);
    };

    if (index) {
        for (let t = 0; t < index.count; t += 3) {
            classifyTriangle(
                index.getX(t),
                index.getX(t + 1),
                index.getX(t + 2),
            );
        }
    } else {
        for (let t = 0; t < pos.count; t += 3) {
            classifyTriangle(t, t + 1, t + 2);
        }
    }

    geo.clearGroups();
    geo.setIndex([...topIndices, ...bodyIndices]);
    if (topIndices.length > 0) {
        geo.addGroup(0, topIndices.length, TOP_CAP_MATERIAL);
    }
    if (bodyIndices.length > 0) {
        geo.addGroup(topIndices.length, bodyIndices.length, BODY_MATERIAL);
    }
}

// /** ExtrudeGeometry spans z ∈ [0, depth]; shift so the crease hinge lies on z = 0. */
// function centerExtrudeZ(geo: THREE.BufferGeometry): void {
//     geo.translate(0, 0, -EXTRUDE_Z_CENTER);
// }

/** Tessellate faces without smoothing positions (keeps rigid panels for skinning). */
function subdivideGeo(
    geo: THREE.BufferGeometry,
    iterations: number,
): THREE.BufferGeometry {
    if (iterations <= 0) return geo;
    const subdivided = LoopSubdivision.modify(geo, iterations, {
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

/**
 * Soften the hinge by blending bone weights from 0.5 on the crease to 1.0 at
 * `blendWidth` (perpendicular distance in XY). Needs subdivision for enough
 * vertices in the band.
 */
function applyCreaseBlendWeights(
    pos: THREE.BufferAttribute,
    skinIndices: number[],
    skinWeights: number[],
    foldLine: FoldLineForWeld,
    blendWidth: number,
    primaryBone: 0 | 1,
    startIdx: number,
    endIdx: number,
): void {
    if (blendWidth <= 0) return;

    const otherBone = primaryBone === 0 ? 1 : 0;
    const xy = new THREE.Vector2();

    for (let i = startIdx; i < endIdx; i++) {
        xy.set(pos.getX(i), pos.getY(i));
        const d = perpendicularDistanceFromFoldXY(xy, foldLine.p0, foldLine.p1);
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

function buildSkinnedGeoOption1(
    unfoldedShapes: THREE.Shape[],
    shapes0: THREE.Shape[],
    shapes1: THREE.Shape[],
    subdivisions: number,
    foldLine: FoldLineForWeld | null,
    creaseBlend: number,
): THREE.BufferGeometry {
    let geo: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
        unfoldedShapes,
        extrudeSettings,
    );
    // centerExtrudeZ(geo);
    geo = subdivideGeo(geo, subdivisions);
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

    if (foldLine !== null && creaseBlend > 0) {
        for (let i = 0; i < position.count; i++) {
            pt.set(position.getX(i), position.getY(i));
            const inS0 = shapes0.some((s) => pointInShape(s, pt));
            const inS1 = shapes1.some((s) => pointInShape(s, pt));
            if (inS0 && !inS1) {
                applyCreaseBlendWeights(
                    position,
                    skinIndices,
                    skinWeights,
                    foldLine,
                    creaseBlend,
                    0,
                    i,
                    i + 1,
                );
            } else if (inS1 && !inS0) {
                applyCreaseBlendWeights(
                    position,
                    skinIndices,
                    skinWeights,
                    foldLine,
                    creaseBlend,
                    1,
                    i,
                    i + 1,
                );
            }
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
    subdivisions: number,
    weld = false,
    foldLine: FoldLineForWeld | null = null,
    creaseBlend = 0,
): THREE.BufferGeometry {
    let geo0: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
        shapes0,
        extrudeSettings,
    );
    let geo1: THREE.BufferGeometry = new THREE.ExtrudeGeometry(
        shapes1,
        extrudeSettings,
    );
    // centerExtrudeZ(geo0);
    // centerExtrudeZ(geo1);
    geo0 = subdivideGeo(geo0, subdivisions);
    geo1 = subdivideGeo(geo1, subdivisions);
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

    const pos = merged.attributes.position as THREE.BufferAttribute;
    if (foldLine !== null && creaseBlend > 0) {
        applyCreaseBlendWeights(
            pos,
            skinIndices,
            skinWeights,
            foldLine,
            creaseBlend,
            0,
            0,
            count0,
        );
        applyCreaseBlendWeights(
            pos,
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
            subdivisions,
            creaseBlend,
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
            subdivisions: {
                label: "Subdivision",
                value: 2,
                min: 0,
                max: 8,
                step: 1,
                hint: "Tessellate panels; use ≥3 with crease blend",
            },
            creaseBlend: {
                label: "Crease blend",
                value: 2,
                min: 0,
                max: 8,
                step: 0.1,
                hint: "Skin-weight falloff from crease (world units); rounds the fold",
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
        return fold ? foldLineAnchorPoint(fold) : new THREE.Vector3(0, 0, 0);
    }, [scenario.foldLine]);

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
            if (!foldLineObject) return;
            foldLineObject.geometry.dispose();
            (foldLineObject.material as THREE.Material).dispose();
        };
    }, [foldLineObject]);

    const skinnedGeo = useMemo(() => {
        const levels = Math.max(0, Math.round(subdivisions));
        const blend = Math.max(0, creaseBlend);
        const fold = scenario.foldLine ?? null;
        const geo =
            algorithm === "option1"
                ? buildSkinnedGeoOption1(
                      unfoldedShapes,
                      shapes0,
                      shapes1,
                      levels,
                      fold,
                      blend,
                  )
                : buildSkinnedGeoOption2(
                      shapes0,
                      shapes1,
                      levels,
                      weld,
                      foldLineForWeld ?? fold,
                      blend,
                  );
        applyTopCapTextureLayout(geo, extrudeSettings.depth);
        return geo;
    }, [
        algorithm,
        subdivisions,
        creaseBlend,
        weld,
        foldLineForWeld,
        scenario.foldLine,
        unfoldedShapes,
        shapes0,
        shapes1,
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

    const panelTexture = useTexture(PANEL_TEXTURE_URL);

    const capTexture = useMemo(() => {
        const tex = panelTexture.clone();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    }, [panelTexture]);

    const [topCapMaterial, bodyMaterial] = useMemo(() => {
        return [
            new THREE.MeshStandardMaterial({
                map: capTexture,
                roughness: 0.85,
                metalness: 0.02,
            }),
            new THREE.MeshStandardMaterial({
                color: "#c62828",
                roughness: 0.9,
                metalness: 0,
            }),
        ];
    }, [capTexture]);

    useEffect(() => {
        return () => {
            capTexture.dispose();
            topCapMaterial.dispose();
            bodyMaterial.dispose();
        };
    }, [capTexture, topCapMaterial, bodyMaterial]);

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
                material={[topCapMaterial, bodyMaterial]}
            />
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
                <Suspense fallback={null}>
                    <SkinnedHingeDemo />
                </Suspense>
                <OrbitControls makeDefault />
            </Canvas>
        </>
    );
}
