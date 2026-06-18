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

export function getFoldLineEndpoints(foldLine: T_foldLineData): {
    p0: T_point2d;
    p1: T_point2d;
} {
    const pts = foldLine.edgePoints ?? foldLine.points;
    return { p0: pts[0]!, p1: pts[pts.length - 1]! };
}

/** Squared perpendicular distance from `xy` to infinite line through p0–p1 (XY). */
export function getPointToLineDistSqXY(
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
export function getPerpDistFromFoldXY(
    xy: THREE.Vector2,
    foldLine: T_foldLineData,
): number {
    const { p0, p1 } = getFoldLineEndpoints(foldLine);
    return Math.sqrt(getPointToLineDistSqXY(xy, p0, p1));
}

/** Midpoint of the crease segment in XY (z = 0); default hinge anchor for both bones. */
export function getFoldLineAnchorPoint(
    foldLine: T_foldLineData,
): THREE.Vector3 {
    const { p0, p1 } = getFoldLineEndpoints(foldLine);
    return new THREE.Vector3((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5, 0);
}
