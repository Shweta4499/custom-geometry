import { UNFOLDED_SHAPE_SVG_PATH } from "./unfoldedShapeSvgPath";
import type { T_foldLineData } from "./foldLineData";
import { productionFlapFoldLineBase } from "./productionShapeAugment";

/** Runtime geometry tweak (parsed SVG shapes are cloned then augmented). */
export type T_sceneShapeAugment =
    | "productionSeamHole"
    | "productionSeamExtension";

/** One test case: unfolded union + the two bone-owned sub-shapes (shape0 = b0, shape1 = b1). */
export type T_jointSkinningScenario = {
    id: string;
    label: string;
    unfoldedSvgPath: string;
    shape0SvgPath: string;
    shape1SvgPath: string;
    /** Crease used for hinge anchor, visualization, and crease blend weights. */
    foldLine?: T_foldLineData;
    /** Optional post-parse edit for production-style paths (see `productionShapeAugment.ts`). */
    shapeAugment?: T_sceneShapeAugment;
};

/** Real flap split (same strings as packaging dataProvider). */
const PRODUCTION_SHAPE0 =
    "M -8 5.025 L -8.1 5.025 L -8.1 12.75 C -8.1 13.3023 -8.5477 13.75 -9.1 13.75 L -11.9 13.75 C -12.4523 13.75 -12.9 13.3023 -12.9 12.75 L -12.9 5.025 L -12.975 5.025 L -12.975 4.9 L -13.45 4.9 C -13.7261 4.9 -13.95 4.6761 -13.95 4.4 L -13.95 4.3196 C -13.95 4.0769 -14.1242 3.8693 -14.3632 3.8272 L -21.9236 2.494 C -22.4016 2.4098 -22.75 1.9945 -22.75 1.5092 L -22.75 -1.5092 C -22.75 -1.9945 -22.4016 -2.4098 -21.9236 -2.494 L -14.3632 -3.8272 C -14.1242 -3.8693 -13.95 -4.0769 -13.95 -4.3196 L -13.95 -4.4 C -13.95 -4.6761 -13.7261 -4.9 -13.45 -4.9 L -12.975 -4.9 L -12.975 -4.975 L -12.9 -4.975 L -12.9 -12.75 C -12.9 -13.3023 -12.4523 -13.75 -11.9 -13.75 L -9.1 -13.75 C -8.5477 -13.75 -8.1 -13.3023 -8.1 -12.75 L -8.1 -4.975 L -8 -4.975 Z ";

const PRODUCTION_SHAPE1 =
    "M -8 -4.975 L -7.9 -4.975 L -7.9 -5.45 C -7.9 -5.7261 -7.6761 -5.95 -7.4 -5.95 L -7.3195 -5.95 C -7.0769 -5.95 -6.8693 -6.1242 -6.8271 -6.3632 L -6.3757 -8.9237 C -6.2914 -9.4016 -5.8761 -9.75 -5.3909 -9.75 L -2.6091 -9.75 C -2.1238 -9.75 -1.7086 -9.4016 -1.6243 -8.9237 L -1.1728 -6.3632 C -1.1307 -6.1242 -0.9231 -5.95 -0.6804 -5.95 L -0.6 -5.95 C -0.3239 -5.95 -0.1 -5.7261 -0.1 -5.45 L -0.1 -4.975 L 5.1 -4.975 L 5.1 -5.45 C 5.1 -5.7261 5.3239 -5.95 5.6 -5.95 L 5.6805 -5.95 C 5.9231 -5.95 6.1307 -6.1242 6.1729 -6.3632 L 6.6243 -8.9237 C 6.7086 -9.4016 7.1239 -9.75 7.6091 -9.75 L 10.3909 -9.75 C 10.8762 -9.75 11.2914 -9.4016 11.3757 -8.9237 L 11.8272 -6.3632 C 11.8693 -6.1242 12.0769 -5.95 12.3196 -5.95 L 12.4 -5.95 C 12.6761 -5.95 12.9 -5.7261 12.9 -5.45 L 12.9 -4.975 L 13.025 -4.975 L 13.025 -4.9 L 13.45 -4.9 C 13.7261 -4.9 13.95 -4.6761 13.95 -4.4 L 13.95 -4.3196 C 13.95 -4.0769 14.1242 -3.8693 14.3632 -3.8272 L 21.9236 -2.494 C 22.4016 -2.4098 22.75 -1.9945 22.75 -1.5092 L 22.75 1.5092 C 22.75 1.9945 22.4016 2.4098 21.9236 2.494 L 14.3632 3.8271 C 14.1242 3.8693 13.95 4.0769 13.95 4.3195 L 13.95 4.4 C 13.95 4.6761 13.7261 4.9 13.45 4.9 L 13.025 4.9 L 13.025 5.025 L 12.9 5.025 L 12.9 5.45 C 12.9 5.7261 12.6761 5.95 12.4 5.95 L 12.3195 5.95 C 12.0769 5.95 11.8693 6.1242 11.8271 6.3632 L 11.3757 8.9237 C 11.2914 9.4016 10.8762 9.75 10.3909 9.75 L 7.6091 9.75 C 7.1238 9.75 6.7086 9.4016 6.6243 8.9237 L 6.1728 6.3632 C 6.1307 6.1242 5.9231 5.95 5.6804 5.95 L 5.6 5.95 C 5.3239 5.95 5.1 5.7261 5.1 5.45 L 5.1 5.025 L -0.1 5.025 L -0.1 5.45 C -0.1 5.7261 -0.3239 5.95 -0.6 5.95 L -0.6805 5.95 C -0.9231 5.95 -1.1307 6.1242 -1.1729 6.3632 L -1.6243 8.9237 C -1.7086 9.4016 -2.1239 9.75 -2.6091 9.75 L -5.3909 9.75 C -5.8762 9.75 -6.2914 9.4016 -6.3757 8.9237 L -6.8272 6.3632 C -6.8693 6.1242 -7.0769 5.95 -7.3196 5.95 L -7.4 5.95 C -7.6761 5.95 -7.9 5.7261 -7.9 5.45 L -7.9 5.025 L -8 5.025 Z ";

export const JOINT_SKINNING_SCENARIOS: T_jointSkinningScenario[] = [
    {
        id: "simple",
        label: "Simple vertical seam",
        unfoldedSvgPath: "M -10 -5 L 10 -5 L 10 5 L -10 5 Z",
        shape0SvgPath: "M -10 -5 L 0 -5 L 0 5 L -10 5 Z",
        shape1SvgPath: "M 0 -5 L 10 -5 L 10 5 L 0 5 Z",
        foldLine: {
            points: [
                { x: 0, y: -12 },
                { x: 0, y: 12 },
            ],
        },
    },
    {
        id: "extension",
        label: "Extension tab (shape1) + matching pocket (shape0)",
        unfoldedSvgPath: "M -10 -5 L 10 -5 L 10 5 L -10 5 Z",
        shape0SvgPath:
            "M -10 -5 L 0 -5 L 0 5 L -10 5 Z M -3 -2 L 0 -2 L 0 2 L -3 2 Z",
        shape1SvgPath:
            "M 0 -5 L 10 -5 L 10 5 L 0 5 L 0 2 L -3 2 L -3 -2 L 0 -2 Z",
        foldLine: {
            points: [
                { x: 0, y: -12 },
                { x: 0, y: 12 },
            ],
        },
    },
    {
        id: "holeSeam",
        label: "Rectangular hole straddling seam",
        unfoldedSvgPath:
            "M -10 -5 L 10 -5 L 10 5 L -10 5 Z M -1 -1 L 1 -1 L 1 1 L -1 1 Z",
        shape0SvgPath:
            "M -10 -5 L 0 -5 L 0 -1 L -1 -1 L -1 1 L 0 1 L 0 5 L -10 5 Z",
        shape1SvgPath:
            "M 0 -5 L 10 -5 L 10 5 L 0 5 L 0 1 L 1 1 L 1 -1 L 0 -1 Z",
        foldLine: {
            points: [
                { x: 0, y: -12 },
                { x: 0, y: 12 },
            ],
        },
    },
    {
        id: "complexFlap",
        label: "Complex flap — multi-notch, 2 holes & 2 tabs",
        unfoldedSvgPath:
            "M -14 -9 L -6 -9 L -6 -6 L -2 -6 L -2 -7 L 0 -7 L 0 -9 L 2 -9 L 2 -6 L 6 -6 L 6 -9 L 14 -9 L 14 9 L 6 9 L 6 6 L 2 6 L 2 9 L 0 9 L 0 6.5 L -3 6.5 L -3 5.5 L 0 5.5 L 0 2 L 2.5 2 L 2.5 -2 L 0 -2 L 0 -4 L 1.5 -4 L 1.5 -5.5 L 0 -5.5 L 0 -6 L -2 -6 Z" +
            " M -2.5 -2 L 2.5 -2 L 2.5 2 L -2.5 2 Z" +
            " M -1.5 -5.5 L 1.5 -5.5 L 1.5 -4 L -1.5 -4 Z" +
            " M -11 -4 L -8.5 -4 L -8.5 -2 L -11 -2 Z" +
            " M 8.5 2 L 11 2 L 11 4 L 8.5 4 Z",
        shape0SvgPath:
            "M -14 -9 L -6 -9 L -6 -6 L -2 -6 L -2 -9 L 0 -9 L 0 -7 L 0 -6 L 0 -5.5 L -1.5 -5.5 L -1.5 -4 L 0 -4 L 0 -2 L -2.5 -2 L -2.5 2 L 0 2 L 0 5.5 L -3 5.5 L -3 6.5 L 0 6.5 L 0 9 L -2 9 L -2 6 L -6 6 L -6 9 L -14 9 Z" +
            " M -11 -4 L -8.5 -4 L -8.5 -2 L -11 -2 Z",
        shape1SvgPath:
            "M 0 -9 L 2 -9 L 2 -6 L 6 -6 L 6 -9 L 14 -9 L 14 9 L 6 9 L 6 6 L 2 6 L 2 9 L 0 9 L 0 6.5 L -3 6.5 L -3 5.5 L 0 5.5 L 0 2 L 2.5 2 L 2.5 -2 L 0 -2 L 0 -4 L 1.5 -4 L 1.5 -5.5 L 0 -5.5 L 0 -6 L -2 -6 L -2 -7 L 0 -7 Z" +
            " M 8.5 2 L 11 2 L 11 4 L 8.5 4 Z",
        foldLine: {
            points: [
                { x: 0, y: -12 },
                { x: 0, y: 12 },
            ],
        },
    },
    {
        id: "production",
        label: "Production flap pair",
        unfoldedSvgPath: UNFOLDED_SHAPE_SVG_PATH,
        shape0SvgPath: PRODUCTION_SHAPE0,
        shape1SvgPath: PRODUCTION_SHAPE1,
        foldLine: productionFlapFoldLineBase(),
    },
    {
        id: "production_hole",
        label: "Production flap + seam hole",
        unfoldedSvgPath: UNFOLDED_SHAPE_SVG_PATH,
        shape0SvgPath: PRODUCTION_SHAPE0,
        shape1SvgPath: PRODUCTION_SHAPE1,
        shapeAugment: "productionSeamHole",
        foldLine: productionFlapFoldLineBase(),
    },
    {
        id: "production_extension",
        label: "Production flap + seam extension",
        unfoldedSvgPath: UNFOLDED_SHAPE_SVG_PATH,
        shape0SvgPath: PRODUCTION_SHAPE0,
        shape1SvgPath: PRODUCTION_SHAPE1,
        shapeAugment: "productionSeamExtension",
        foldLine: productionFlapFoldLineBase(),
    },
];

export function getJointSkinningScenario(id: string): T_jointSkinningScenario {
    const s = JOINT_SKINNING_SCENARIOS.find((x) => x.id === id);
    return s ?? JOINT_SKINNING_SCENARIOS[0]!;
}
