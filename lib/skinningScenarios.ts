import * as THREE from "three";
import { UNFOLDED_SHAPE_SVG_PATH } from "./unfoldedShapeSvgPath";
import type { FoldLineForWeld } from "./foldLineForWeld";
import {
    productionFlapFoldLineBase,
    productionFlapFoldLineWithExtension,
    productionFlapFoldLineWithHole,
} from "./productionShapeAugment";

/** Runtime geometry tweak (parsed SVG shapes are cloned then augmented). */
export type SceneShapeAugment = "productionSeamHole" | "productionSeamExtension";

/** One test case: unfolded union + the two bone-owned sub-shapes (shape0 = b0, shape1 = b1). */
export type JointSkinningScenario = {
    id: string;
    label: string;
    notes: string;
    unfoldedSvgPath: string;
    shape0SvgPath: string;
    shape1SvgPath: string;
    /**
     * Crease used when Option 2 hinge-welds (skips hole / extension via `skipWeldRects`).
     * `skipWeldRects` excludes hole / extension strips in XY.
     */
    foldLine?: FoldLineForWeld;
    /** Optional post-parse edit for production-style paths (see `productionShapeAugment.ts`). */
    shapeAugment?: SceneShapeAugment;
};

/** Real flap split (same strings as packaging dataProvider). */
const PRODUCTION_SHAPE0 =
    "M -8 5.025 L -8.1 5.025 L -8.1 12.75 C -8.1 13.3023 -8.5477 13.75 -9.1 13.75 L -11.9 13.75 C -12.4523 13.75 -12.9 13.3023 -12.9 12.75 L -12.9 5.025 L -12.975 5.025 L -12.975 4.9 L -13.45 4.9 C -13.7261 4.9 -13.95 4.6761 -13.95 4.4 L -13.95 4.3196 C -13.95 4.0769 -14.1242 3.8693 -14.3632 3.8272 L -21.9236 2.494 C -22.4016 2.4098 -22.75 1.9945 -22.75 1.5092 L -22.75 -1.5092 C -22.75 -1.9945 -22.4016 -2.4098 -21.9236 -2.494 L -14.3632 -3.8272 C -14.1242 -3.8693 -13.95 -4.0769 -13.95 -4.3196 L -13.95 -4.4 C -13.95 -4.6761 -13.7261 -4.9 -13.45 -4.9 L -12.975 -4.9 L -12.975 -4.975 L -12.9 -4.975 L -12.9 -12.75 C -12.9 -13.3023 -12.4523 -13.75 -11.9 -13.75 L -9.1 -13.75 C -8.5477 -13.75 -8.1 -13.3023 -8.1 -12.75 L -8.1 -4.975 L -8 -4.975 Z ";

const PRODUCTION_SHAPE1 =
    "M -8 -4.975 L -7.9 -4.975 L -7.9 -5.45 C -7.9 -5.7261 -7.6761 -5.95 -7.4 -5.95 L -7.3195 -5.95 C -7.0769 -5.95 -6.8693 -6.1242 -6.8271 -6.3632 L -6.3757 -8.9237 C -6.2914 -9.4016 -5.8761 -9.75 -5.3909 -9.75 L -2.6091 -9.75 C -2.1238 -9.75 -1.7086 -9.4016 -1.6243 -8.9237 L -1.1728 -6.3632 C -1.1307 -6.1242 -0.9231 -5.95 -0.6804 -5.95 L -0.6 -5.95 C -0.3239 -5.95 -0.1 -5.7261 -0.1 -5.45 L -0.1 -4.975 L 5.1 -4.975 L 5.1 -5.45 C 5.1 -5.7261 5.3239 -5.95 5.6 -5.95 L 5.6805 -5.95 C 5.9231 -5.95 6.1307 -6.1242 6.1729 -6.3632 L 6.6243 -8.9237 C 6.7086 -9.4016 7.1239 -9.75 7.6091 -9.75 L 10.3909 -9.75 C 10.8762 -9.75 11.2914 -9.4016 11.3757 -8.9237 L 11.8272 -6.3632 C 11.8693 -6.1242 12.0769 -5.95 12.3196 -5.95 L 12.4 -5.95 C 12.6761 -5.95 12.9 -5.7261 12.9 -5.45 L 12.9 -4.975 L 13.025 -4.975 L 13.025 -4.9 L 13.45 -4.9 C 13.7261 -4.9 13.95 -4.6761 13.95 -4.4 L 13.95 -4.3196 C 13.95 -4.0769 14.1242 -3.8693 14.3632 -3.8272 L 21.9236 -2.494 C 22.4016 -2.4098 22.75 -1.9945 22.75 -1.5092 L 22.75 1.5092 C 22.75 1.9945 22.4016 2.4098 21.9236 2.494 L 14.3632 3.8271 C 14.1242 3.8693 13.95 4.0769 13.95 4.3195 L 13.95 4.4 C 13.95 4.6761 13.7261 4.9 13.45 4.9 L 13.025 4.9 L 13.025 5.025 L 12.9 5.025 L 12.9 5.45 C 12.9 5.7261 12.6761 5.95 12.4 5.95 L 12.3195 5.95 C 12.0769 5.95 11.8693 6.1242 11.8271 6.3632 L 11.3757 8.9237 C 11.2914 9.4016 10.8762 9.75 10.3909 9.75 L 7.6091 9.75 C 7.1238 9.75 6.7086 9.4016 6.6243 8.9237 L 6.1728 6.3632 C 6.1307 6.1242 5.9231 5.95 5.6804 5.95 L 5.6 5.95 C 5.3239 5.95 5.1 5.7261 5.1 5.45 L 5.1 5.025 L -0.1 5.025 L -0.1 5.45 C -0.1 5.7261 -0.3239 5.95 -0.6 5.95 L -0.6805 5.95 C -0.9231 5.95 -1.1307 6.1242 -1.1729 6.3632 L -1.6243 8.9237 C -1.7086 9.4016 -2.1239 9.75 -2.6091 9.75 L -5.3909 9.75 C -5.8762 9.75 -6.2914 9.4016 -6.3757 8.9237 L -6.8272 6.3632 C -6.8693 6.1242 -7.0769 5.95 -7.3196 5.95 L -7.4 5.95 C -7.6761 5.95 -7.9 5.7261 -7.9 5.45 L -7.9 5.025 L -8 5.025 Z ";

export const JOINT_SKINNING_SCENARIOS: JointSkinningScenario[] = [
    {
        id: "simple",
        label: "Simple vertical seam",
        notes: "Two rectangles meet at x = 0. Clean weld line; good baseline for Option 1 vs 2.",
        unfoldedSvgPath: "M -10 -5 L 10 -5 L 10 5 L -10 5 Z",
        shape0SvgPath: "M -10 -5 L 0 -5 L 0 5 L -10 5 Z",
        shape1SvgPath: "M 0 -5 L 10 -5 L 10 5 L 0 5 Z",
        foldLine: {
            p0: new THREE.Vector2(0, -12),
            p1: new THREE.Vector2(0, 12),
            maxDistance: 0.08,
        },
    },
    {
        id: "extension",
        label: "Extension tab (shape1) + matching pocket (shape0)",
        notes: "Tab on shape1 (b1) past x = 0; same-size rectangular cut on shape0 (b0) so they interlock when flat. Fold weld still skips the tab strip on the seam.",
        unfoldedSvgPath: "M -10 -5 L 10 -5 L 10 5 L -10 5 Z",
        shape0SvgPath:
            "M -10 -5 L 0 -5 L 0 5 L -10 5 Z M -3 -2 L 0 -2 L 0 2 L -3 2 Z",
        shape1SvgPath:
            "M 0 -5 L 10 -5 L 10 5 L 0 5 L 0 2 L -3 2 L -3 -2 L 0 -2 Z",
        foldLine: {
            p0: new THREE.Vector2(0, -12),
            p1: new THREE.Vector2(0, 12),
            maxDistance: 0.08,
            skipWeldRects: [
                { xmin: -0.06, xmax: 0.06, ymin: -2.08, ymax: 2.08 },
            ],
        },
    },
    {
        id: "holeSeam",
        label: "Rectangular hole straddling seam",
        notes: "Square hole centered on the joint. Crease welding should skip the gap; Option 1 may 50/50 ambiguous regions near the hole.",
        unfoldedSvgPath:
            "M -10 -5 L 10 -5 L 10 5 L -10 5 Z M -1 -1 L 1 -1 L 1 1 L -1 1 Z",
        shape0SvgPath:
            "M -10 -5 L 0 -5 L 0 -1 L -1 -1 L -1 1 L 0 1 L 0 5 L -10 5 Z",
        shape1SvgPath:
            "M 0 -5 L 10 -5 L 10 5 L 0 5 L 0 1 L 1 1 L 1 -1 L 0 -1 Z",
        foldLine: {
            p0: new THREE.Vector2(0, -12),
            p1: new THREE.Vector2(0, 12),
            maxDistance: 0.08,
            skipWeldRects: [
                { xmin: -1.08, xmax: 1.08, ymin: -1.08, ymax: 1.08 },
            ],
        },
    },
    {
        id: "production",
        label: "Production flap pair",
        notes: "Real unfolded outline + g1 / g2 split from packaging data.",
        unfoldedSvgPath: UNFOLDED_SHAPE_SVG_PATH,
        shape0SvgPath: PRODUCTION_SHAPE0,
        shape1SvgPath: PRODUCTION_SHAPE1,
        foldLine: productionFlapFoldLineBase(),
    },
    {
        id: "production_hole",
        label: "Production flap + seam hole",
        notes: "Same g1/g2 SVGs with a small rectangular hole punched across the fold at x = -8 (runtime augment).",
        unfoldedSvgPath: UNFOLDED_SHAPE_SVG_PATH,
        shape0SvgPath: PRODUCTION_SHAPE0,
        shape1SvgPath: PRODUCTION_SHAPE1,
        shapeAugment: "productionSeamHole",
        foldLine: productionFlapFoldLineWithHole(),
    },
    {
        id: "production_extension",
        label: "Production flap + seam extension",
        notes: "Same g1/g2 SVGs with a short tab on g2 and matching pocket on g1 at the fold (runtime augment).",
        unfoldedSvgPath: UNFOLDED_SHAPE_SVG_PATH,
        shape0SvgPath: PRODUCTION_SHAPE0,
        shape1SvgPath: PRODUCTION_SHAPE1,
        shapeAugment: "productionSeamExtension",
        foldLine: productionFlapFoldLineWithExtension(),
    },
];

export function getJointSkinningScenario(id: string): JointSkinningScenario {
    const s = JOINT_SKINNING_SCENARIOS.find((x) => x.id === id);
    return s ?? JOINT_SKINNING_SCENARIOS[0]!;
}
