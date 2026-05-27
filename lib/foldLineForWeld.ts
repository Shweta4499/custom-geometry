import * as THREE from "three";

/**
 * Fold crease in shape XY (extrusion is along Z). Used by Option 2 welding to
 * only merge seam vertex pairs that lie on the intended straight crease — not
 * on hole cut-outs or extension/tab geometry when `skipWeldRects` is set.
 */
export type FoldLineForWeld = {
    /** First point on the crease (shape XY). */
    p0: THREE.Vector2;
    /** Second point on the crease; defines infinite line p0→p1. */
    p1: THREE.Vector2;
    /** Max perpendicular distance in XY from the line to allow a weld (world units). */
    maxDistance: number;
    /**
     * Optional axis-aligned XY boxes: if a vertex lies inside any box, it is
     * not eligible for fold welding (e.g. hole footprint or extension tab strip).
     */
    skipWeldRects?: Array<{
        xmin: number;
        xmax: number;
        ymin: number;
        ymax: number;
    }>;
    /**
     * Optional: only weld when the projection of the vertex onto the line,
     * measured as scalar `t` along u = normalize(p1 - p0) from p0, satisfies
     * tMin <= t <= tMax. Distances in world units (same as coordinates).
     */
    tRange?: { tMin: number; tMax: number };
};

const _tmp = new THREE.Vector2();
const _u = new THREE.Vector2();

/** Squared perpendicular distance from `xy` to infinite line through p0–p1 (XY). */
export function distancePointToLineSqXY(
    xy: THREE.Vector2,
    p0: THREE.Vector2,
    p1: THREE.Vector2,
): number {
    _u.copy(p1).sub(p0);
    const lenSq = _u.lengthSq();
    if (lenSq < 1e-20) return xy.distanceToSquared(p0);
    const t = _tmp.copy(xy).sub(p0).dot(_u) / lenSq;
    const px = p0.x + t * _u.x;
    const py = p0.y + t * _u.y;
    const dx = xy.x - px;
    const dy = xy.y - py;
    return dx * dx + dy * dy;
}

/** Scalar t along (p0→p1) from p0, in units of |p1-p0| (not normalized). */
export function projectionTAlongFold(
    xy: THREE.Vector2,
    p0: THREE.Vector2,
    p1: THREE.Vector2,
): number {
    _u.copy(p1).sub(p0);
    const lenSq = _u.lengthSq();
    if (lenSq < 1e-20) return 0;
    return _tmp.copy(xy).sub(p0).dot(_u) / Math.sqrt(lenSq);
}

export function vertexEligibleForFoldWeld(
    xy: THREE.Vector2,
    fold: FoldLineForWeld,
): boolean {
    const dSq = distancePointToLineSqXY(xy, fold.p0, fold.p1);
    if (dSq > fold.maxDistance * fold.maxDistance) return false;

    if (fold.skipWeldRects) {
        for (const r of fold.skipWeldRects) {
            if (
                xy.x >= r.xmin &&
                xy.x <= r.xmax &&
                xy.y >= r.ymin &&
                xy.y <= r.ymax
            ) {
                return false;
            }
        }
    }

    if (fold.tRange) {
        const t = projectionTAlongFold(xy, fold.p0, fold.p1);
        if (t < fold.tRange.tMin || t > fold.tRange.tMax) return false;
    }

    return true;
}
