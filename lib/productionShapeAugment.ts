import * as THREE from "three";
import type { T_foldLineData } from "./foldLineData";

/** Straight shared edge between packaging g1 (shape0) and g2 (shape1). */
export const PRODUCTION_SEAM_X = -8;

const FEATURE_CY = 0;
const HOLE_W = 5.0;
const HOLE_H = 5.0;
const TAB_DEPTH = 1.1;
const TAB_HALF_H = 1.1;

function rectPath(
    xmin: number,
    xmax: number,
    ymin: number,
    ymax: number,
): THREE.Path {
    const p = new THREE.Path();
    p.moveTo(xmin, ymin);
    p.lineTo(xmax, ymin);
    p.lineTo(xmax, ymax);
    p.lineTo(xmin, ymax);
    p.lineTo(xmin, ymin);
    return p;
}

/** Full hole crossing the seam (for unfolded / Option 1). */
function fullSeamHolePath(): THREE.Path {
    const cx = PRODUCTION_SEAM_X;
    const hw = HOLE_W * 0.5;
    const hh = HOLE_H * 0.5;
    return rectPath(cx - hw, cx + hw, FEATURE_CY - hh, FEATURE_CY + hh);
}

/** Left half of hole (shape0 / g1 side of seam). */
function leftSeamHolePath(): THREE.Path {
    const cx = PRODUCTION_SEAM_X;
    const hw = HOLE_W * 0.5;
    const hh = HOLE_H * 0.5;
    return rectPath(cx - hw, cx, FEATURE_CY - hh, FEATURE_CY + hh);
}

/** Right half of hole (shape1 / g2 side of seam). */
function rightSeamHolePath(): THREE.Path {
    const cx = PRODUCTION_SEAM_X;
    const hw = HOLE_W * 0.5;
    const hh = HOLE_H * 0.5;
    return rectPath(cx, cx + hw, FEATURE_CY - hh, FEATURE_CY + hh);
}

/** Pocket on g1 matching tab footprint (extension case). */
function pocketPath(): THREE.Path {
    const cx = PRODUCTION_SEAM_X;
    return rectPath(
        cx - TAB_DEPTH,
        cx,
        FEATURE_CY - TAB_HALF_H,
        FEATURE_CY + TAB_HALF_H,
    );
}

/** Small tab on g2 (bone1), flush on x = seam, extending into g1. */
function seamTabShape(): THREE.Shape {
    const cx = PRODUCTION_SEAM_X;
    const tab = new THREE.Shape();
    tab.moveTo(cx, FEATURE_CY - TAB_HALF_H);
    tab.lineTo(cx - TAB_DEPTH, FEATURE_CY - TAB_HALF_H);
    tab.lineTo(cx - TAB_DEPTH, FEATURE_CY + TAB_HALF_H);
    tab.lineTo(cx, FEATURE_CY + TAB_HALF_H);
    tab.lineTo(cx, FEATURE_CY - TAB_HALF_H);
    return tab;
}

export function augmentProductionSeamHole(
    shapes0: THREE.Shape[],
    shapes1: THREE.Shape[],
    unfoldedShapes: THREE.Shape[],
): void {
    const full = fullSeamHolePath();
    const left = leftSeamHolePath();
    const right = rightSeamHolePath();
    for (const s of shapes0) s.holes.push(left.clone());
    for (const s of shapes1) s.holes.push(right.clone());
    for (const s of unfoldedShapes) s.holes.push(full.clone());
}

export function augmentProductionSeamExtension(
    shapes0: THREE.Shape[],
    shapes1: THREE.Shape[],
): void {
    const pocket = pocketPath();
    for (const s of shapes0) s.holes.push(pocket.clone());
    shapes1.push(seamTabShape());
}

export function productionFlapFoldLineBase(): T_foldLineData {
    return {
        points: [
            { x: PRODUCTION_SEAM_X, y: -20 },
            { x: PRODUCTION_SEAM_X, y: 22 },
        ],
    };
}
