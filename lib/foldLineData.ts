import * as THREE from "three";

export type T_point2d = {
    x: number;
    y: number;
};

export type T_foldLineData = {
    points: T_point2d[];
    edgePoints?: T_point2d[];

    angle3d?: number;
    openAngle3d?: number;
    closeAngle3d?: number;

    flipSplitShapes?: boolean;
    flipFoldLineVector?: boolean;
};

/**
 * Option 2 weld filter (test harness). Not part of the production fold-line
 * payload — scenarios pair this with `T_foldLineData` for crease welding.
 */
export type FoldWeldFilter = {
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

export function getFoldLineEndpoints(
    foldLine: T_foldLineData,
): { p0: T_point2d; p1: T_point2d } {
    const pts = foldLine.edgePoints ?? foldLine.points;
    return { p0: pts[0]!, p1: pts[pts.length - 1]! };
}

/** Squared perpendicular distance from `xy` to infinite line through p0–p1 (XY). */
export function distancePointToLineSqXY(
    xy: THREE.Vector2,
    p0: T_point2d,
    p1: T_point2d,
): number {
    const ux = p1.x - p0.x;
    const uy = p1.y - p0.y;
    const lenSq = ux * ux + uy * uy;
    if (lenSq < 1e-20) {
        const dx = xy.x - p0.x;
        const dy = xy.y - p0.y;
        return dx * dx + dy * dy;
    }
    const t = ((xy.x - p0.x) * ux + (xy.y - p0.y) * uy) / lenSq;
    const px = p0.x + t * ux;
    const py = p0.y + t * uy;
    const dx = xy.x - px;
    const dy = xy.y - py;
    return dx * dx + dy * dy;
}

/** Perpendicular distance from `xy` to infinite line through the fold crease (XY). */
export function perpendicularDistanceFromFoldXY(
    xy: THREE.Vector2,
    foldLine: T_foldLineData,
): number {
    const { p0, p1 } = getFoldLineEndpoints(foldLine);
    return Math.sqrt(distancePointToLineSqXY(xy, p0, p1));
}

/** Scalar t along (p0→p1) from p0, in units of |p1-p0| (not normalized). */
export function projectionTAlongFold(
    xy: THREE.Vector2,
    foldLine: T_foldLineData,
): number {
    const { p0, p1 } = getFoldLineEndpoints(foldLine);
    const ux = p1.x - p0.x;
    const uy = p1.y - p0.y;
    const lenSq = ux * ux + uy * uy;
    if (lenSq < 1e-20) return 0;
    return ((xy.x - p0.x) * ux + (xy.y - p0.y) * uy) / Math.sqrt(lenSq);
}

export function vertexEligibleForFoldWeld(
    xy: THREE.Vector2,
    foldLine: T_foldLineData,
    weld: FoldWeldFilter,
): boolean {
    const { p0, p1 } = getFoldLineEndpoints(foldLine);
    const dSq = distancePointToLineSqXY(xy, p0, p1);
    if (dSq > weld.maxDistance * weld.maxDistance) return false;

    if (weld.skipWeldRects) {
        for (const r of weld.skipWeldRects) {
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

    if (weld.tRange) {
        const t = projectionTAlongFold(xy, foldLine);
        if (t < weld.tRange.tMin || t > weld.tRange.tMax) return false;
    }

    return true;
}

/** Midpoint of the crease segment in XY (z = 0); default hinge anchor for both bones. */
export function foldLineAnchorPoint(foldLine: T_foldLineData): THREE.Vector3 {
    const { p0, p1 } = getFoldLineEndpoints(foldLine);
    return new THREE.Vector3(
        (p0.x + p1.x) * 0.5,
        (p0.y + p1.y) * 0.5,
        0,
    );
}
