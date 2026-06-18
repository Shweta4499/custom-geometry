import { MeshProps } from "@react-three/fiber";
import {
    AdditiveBlending,
    BackSide,
    Box3,
    BufferAttribute,
    BufferGeometry,
    Color,
    DoubleSide,
    Euler,
    ExtrudeGeometry,
    ExtrudeGeometryOptions,
    FrontSide,
    LinearSRGBColorSpace,
    MeshLambertMaterial,
    MeshLambertMaterialParameters,
    MeshPhysicalMaterial,
    MeshPhysicalMaterialParameters,
    MeshStandardMaterial,
    MeshStandardMaterialParameters,
    NoBlending,
    NormalBlending,
    ShaderMaterial,
    Shape,
    Side,
    SRGBColorSpace,
    Texture,
    UniformsLib,
    UniformsUtils,
    Vector2,
    Vector3,
} from "three";
import { Ref, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Edges } from "@react-three/drei";
import {
    activeSurfaceColor3d,
    editColor3d,
    hoverColor3d,
    selectColor3d,
} from "@/lib/colors/layer-colors";
import PopupEditorContext, {
    T_popupEditorContext,
} from "@/contexts/popupEditorContext";
import { decodeSlugFromShapeName } from "@/lib/data/folds/fold-labels";
import {
    E_attachmentType,
    E_editMode3d,
    E_foldType,
    T_flatShape3d,
    T_surfaceData,
    T_extrudedShapeOpts,
    T_design,
} from "@/lib/types/types3d";
import { useSelector } from "react-redux";
import { AppState } from "@/store";
import ShapeSurfaceHelper from "./ShapeSurfaceHelper";
import { checkIntersectionWithShapes } from "../PopupEditor/ui-utils3d/handle-intersections";
import { getIntersectionDetails } from "../fold-previews/preview-utils";
import { Intersection, ThreeEvent } from "@react-three/fiber";
import { getShapeBounds } from "@/lib/fold-utils";
import { decodeTextureSlug } from "@/lib/texture-utils";
import { decodeRgbaColor } from "@/lib/colors/color-utils";
import materialVertShader from "./glsl/material.vert";
import materialFragShader from "./glsl/material.frag";
import { T_materialRenderData } from "@/lib/types/types";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry";
import {
    getDefaultMaterial,
    getDefaultMaterialFinish,
} from "@/lib/data/configOptions";
import { RepeatWrapping, TextureLoader } from "three";
import { useLoader } from "@react-three/fiber";
import sideVertShader from "./glsl/side.vert";
import sideFragShader from "./glsl/side.frag";

let clickTimer: NodeJS.Timeout | undefined;
let alreadyClicked = false;

type ShapeMesh2Props = MeshProps & {
    shapeData: T_flatShape3d;
    extrudeShapes: Shape[];
    opts: T_extrudedShapeOpts;
};

export default function ShapeMesh2({
    name,
    shapeData,
    extrudeShapes,
    opts,
}: ShapeMesh2Props) {
    const {
        shapeUserData,
        activeFold,
        extrudeSettings,
        // side,
        textures,
        // textureSurface, //Obsolete
        color,
        hoverColor,
        selectColor,
        opacity,
        quaternion,
        position,
        scale,
        onAction,
        materialRenderData,
    } = opts;

    let sideTexturePath = "/textures/side-textures/default-side-texture.png"; //default
    switch (materialRenderData?.id) {
        case "cardboard-1":
            sideTexturePath =
                "/textures/side-textures/sine-cardboard-1-seamless-64.png";
            break;
        default:
            break;
    }
    /* Suspense required for RenderedDesignTree in MainScene 
       due to the presence of useLoader here*/
    const corrugationTexture = useLoader(TextureLoader, sideTexturePath);

    useMemo(() => {
        corrugationTexture.wrapS = RepeatWrapping;
        corrugationTexture.wrapT = RepeatWrapping;
        corrugationTexture.repeat.set(1, 1);

        corrugationTexture.colorSpace = SRGBColorSpace;
        corrugationTexture.flipY = false;

        corrugationTexture.needsUpdate = true;
    }, [corrugationTexture]);

    const { textureIndex, textureIndex_inside } = getTextureIndexes(shapeData);

    const shapeBounds = getShapeBounds(shapeData);
    const attachmentType = shapeData.attachment?.type || E_attachmentType.none;
    const currentDesign = useSelector((state: AppState) => {
        return state.currentDesignWithHistory.present;
    });
    const { showEdges, showProductShadows, showInSingleColor } =
        currentDesign.config.config3d;

    const meshRef: Ref<THREE.Mesh | undefined> = useRef();

    const [isHovered, setIsHovered] = useState<boolean | undefined>(undefined);
    const popupContext = useContext(PopupEditorContext);
    const {
        activeFoldSlug,
        activeShapeName,
        setActiveFoldSlug,
        setActiveShapeName,
        editMode,
        rightClickedFoldSlug,
        setRightClickedFoldSlug,
        activeSurfaces,
    } = popupContext;

    let isParentFoldSelected = false,
        isSelected = false,
        isActiveSurface = false;
    if (name) {
        isSelected = activeShapeName === name;
        const t1 = decodeSlugFromShapeName(name);
        isParentFoldSelected = !!activeFoldSlug && t1.slug === activeFold.slug;
        isActiveSurface = activeSurfaces
            .map((x) => x.surfaceShapeName)
            .includes(name);
    }

    const { meshColor, meshOpacity } = determineMeshColorAndOpacity(
        {
            givenColor: color,
            givenOpacity: opacity,
            hoverColor,
            selectColor,
        },
        {
            isHovered,
            isParentFoldSelected,
            isSelected,
            showInSingleColor,
            isActiveSurface,
        },
    );

    //----------PART 1: STARTS: REALISTIC RENDERING MATERIALS ---------------------

    // Memoize currentTextures and materials to prevent recreation on every render

    const currentTextures = useMemo(() => {
        return textures?.outsideTextures[textureIndex] || undefined;
    }, [textures, textureIndex]);
    const currentTextures_inside = useMemo(() => {
        return textures?.insideTextures[textureIndex_inside] || undefined;
    }, [textures, textureIndex_inside]);

    const extrudeGeometry = useMemo(() => {
        const geometry = new ExtrudeGeometry(extrudeShapes, {
            ...extrudeSettings,
        });

        if (geometry.groups.length >= 2) {
            const [capsGroup, sideGroup] = geometry.groups;
            const halfCount = Math.floor(capsGroup.count / 2);

            geometry.clearGroups();
            geometry.addGroup(capsGroup.start, halfCount, 0); // front cap
            geometry.addGroup(sideGroup.start, sideGroup.count, 1); // sides
            geometry.addGroup(
                capsGroup.start + halfCount,
                capsGroup.count - halfCount,
                2,
            ); // back cap
        }

        geometry.computeBoundingBox();
        geometry.computeVertexNormals();

        if (geometry.attributes.uv) {
            geometry.setAttribute(
                "uv1",
                new BufferAttribute(geometry.attributes.uv.array, 2),
            );
        }

        return geometry;
    }, [extrudeShapes, extrudeSettings]);
    useEffect(() => {
        return () => {
            extrudeGeometry.dispose();
        };
    }, [extrudeGeometry]);
    //----------PART 1: ENDS: REALISTIC RENDERING MATERIALS ---------------------

    const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
        if (!!editMode) return;
        const t = decodeSlugFromShapeName(name || "");
        let activeFoldSlug = isParentFoldSelected ? "" : t.activeFoldSlug;
        setActiveFoldSlug(activeFoldSlug, currentDesign);
        setActiveShapeName("");
        if (onAction) {
            onAction("onFoldSelect", { activeFoldSlug, meshRef, e });
        }
    };
    const handleSingleClick = (e: ThreeEvent<MouseEvent>) => {
        const shapeName = (isSelected ? "" : name) || "";
        console.log("handleSingleClick shapeName=", shapeName);
        setActiveShapeName(shapeName);
        if (activeFold.slug || !!editMode) return;
        const updatedSurfaces = updateActiveSurfaces(e, popupContext);
        console.log("handleSingleClick2 shapeName=", shapeName);
        if (onAction) {
            onAction("onShapeSelect", {
                shapeName,
                activeSurfaces: updatedSurfaces,
                meshRef,
                e,
            });
        }
    };

    const surfaceMaterials = useMemo(() => {
        return createMeshPhysicalMaterials({
            frontUserTextures: currentTextures,
            backUserTextures: currentTextures_inside,
            materialRenderData: materialRenderData || getDefaultMaterial(),
            currentDesign,
            corrugationTexture,
            thickness: extrudeSettings.depth,
        });
    }, [
        currentTextures,

        currentTextures_inside,
        materialRenderData,

        currentDesign,
        corrugationTexture,
        extrudeSettings.depth,
    ]);

    const meshName = name?.replace("shapeMesh$", "shapeMesh2$");

    return (
        <>
            <group
                position={position}
                scale={scale}
                quaternion={quaternion}
                name={name}
            >
                <mesh
                    name={meshName}
                    geometry={extrudeGeometry}
                    castShadow={showProductShadows}
                    receiveShadow={showProductShadows}
                    ref={meshRef as Ref<THREE.Mesh>}
                    onPointerOver={
                        editMode === E_editMode3d.photoRealism
                            ? undefined
                            : (e) => {
                                  if (!editMode) {
                                      e.stopPropagation();
                                  }
                                  // if (activeFold.slug) return;
                                  setIsHovered(true);
                                  if (onAction)
                                      onAction("onPointerOver", { meshRef, e });
                              }
                    }
                    onPointerOut={
                        editMode === E_editMode3d.photoRealism
                            ? undefined
                            : (e) => {
                                  if (!editMode) {
                                      e.stopPropagation();
                                  }
                                  // if (activeFold.slug) return;
                                  setIsHovered(false);
                                  if (onAction)
                                      onAction("onPointerOut", { meshRef, e });
                              }
                    }
                    onClick={
                        editMode === E_editMode3d.photoRealism
                            ? undefined
                            : (e) => {
                                  e.stopPropagation();
                                  if (alreadyClicked) {
                                      clearTimeout(clickTimer);
                                      // Double-click event handler
                                      handleDoubleClick(e);
                                      alreadyClicked = false;
                                  } else {
                                      alreadyClicked = true;
                                      clickTimer = setTimeout(function () {
                                          // Single-click event handler
                                          handleSingleClick(e);
                                          alreadyClicked = false;
                                      }, 225); // Adjust the delay as needed (e.g., 300ms)
                                  }
                              }
                    }
                    onContextMenu={
                        editMode === E_editMode3d.photoRealism
                            ? undefined
                            : (e) => {
                                  e.stopPropagation();
                                  if (!!editMode) return;
                                  if (!isParentFoldSelected) return;
                                  const t = decodeSlugFromShapeName(name || "");
                                  let activeFoldSlug = t.slug;
                                  if (rightClickedFoldSlug === activeFoldSlug) {
                                      setRightClickedFoldSlug(
                                          "",
                                          currentDesign,
                                      );
                                  } else {
                                      setRightClickedFoldSlug(
                                          activeFoldSlug,
                                          currentDesign,
                                      );
                                  }
                                  if (onAction) {
                                      onAction("onFoldRightClick", {
                                          activeFoldSlug,
                                          meshRef,
                                          e,
                                      });
                                  }
                              }
                    }
                    userData={{
                        ...shapeUserData,
                        isShape: true,
                        corrugationTexture,
                        thickness: extrudeSettings.depth,
                        _ptBakeData: {
                            frontUserTexture: currentTextures?.[0] || null,
                            backUserTexture:
                                currentTextures_inside?.[0] || null,
                            materialTexture:
                                materialRenderData?.materialTexture || null,
                            baseColorRgba:
                                currentDesign.config.config3d.rgbaColor ||
                                "rgba(255,255,255,1)",
                            userTextureBlendFactor:
                                materialRenderData?.userTextureBlendFactor ??
                                currentDesign.config.config3d
                                    .userTextureBlendFactor ??
                                1,
                            foldSlug: activeFold.slug,
                            textureIndex,
                            textureIndex_inside,
                        },
                    }}
                    material={surfaceMaterials}
                >
                    {(showEdges || isHovered || isParentFoldSelected) && (
                        <Edges
                            key={extrudeGeometry.uuid}
                            geometry={extrudeGeometry}
                            color={isHovered ? 0xff40bd : 0x000000}
                        />
                    )}
                </mesh>
                <ShapeSurfaceHelper
                    shapeBounds={shapeBounds}
                    attachmentType={attachmentType}
                />
            </group>
            {/* {userTexture && decalGeometry && (
                <mesh
                    geometry={decalGeometry}
                    position={position}
                    scale={scale}
                    quaternion={quaternion}
                >
                    <meshStandardMaterial map={userTexture} />
                </mesh>
            )} */}
        </>
    );
}
function createSideShaderMaterial({
    corrugationTexture,
    thickness,
}: {
    corrugationTexture: Texture;
    thickness: number;
}) {
    return new ShaderMaterial({
        side: FrontSide,
        transparent: false,
        uniforms: {
            corrugationTexture: { value: corrugationTexture },
            thickness: { value: thickness },
        },
        vertexShader: sideVertShader,
        fragmentShader: sideFragShader,
    });
}

function createMeshPhysicalMaterials({
    frontUserTextures,
    backUserTextures,
    materialRenderData,
    currentDesign,
    corrugationTexture,
    thickness,
}: {
    frontUserTextures: Texture[] | undefined;
    backUserTextures: Texture[] | undefined;
    materialRenderData: T_materialRenderData;
    currentDesign: T_design;
    corrugationTexture: Texture;
    thickness: number;
}) {
    const materialFront = createSurfaceMaterial({
        userTextures: frontUserTextures,
        materialRenderData,
        currentDesign,
    });
    const materialBack = createSurfaceMaterial({
        userTextures: backUserTextures,
        materialRenderData,
        currentDesign,
    });

    const materialSide = createSideShaderMaterial({
        corrugationTexture,
        thickness,
    });

    // materialFront.side = FrontSide;
    // materialSide.side = DoubleSide;
    // materialBack.side = BackSide;

    materialFront.needsUpdate = true;
    materialSide.needsUpdate = true;
    materialBack.needsUpdate = true;

    return [materialFront, materialSide, materialBack];
}

function createSurfaceMaterial({
    userTextures,
    materialRenderData,
    currentDesign,
}: {
    userTextures: Texture[] | undefined;
    materialRenderData: T_materialRenderData;
    currentDesign: T_design;
}): MeshPhysicalMaterial {
    const { config3d } = currentDesign.config;
    const { rgbaColor, disableMaterial } = config3d;
    const decodedBaseColor = decodeRgbaColor(
        rgbaColor || "rgba(255,255,255,1)",
    );
    const baseColor = new Color(decodedBaseColor?.hexColor || "#ffffff");

    //-----user texture-----
    const userTextureBlendFactor =
        materialRenderData.userTextureBlendFactor ??
        config3d.userTextureBlendFactor ??
        1;
    const userTexture: Texture | undefined = userTextures
        ? userTextures[0]
        : undefined; //Front texture;
    const tileOffset = userTexture ? userTexture.offset : new Vector2(0.5, 0.5);
    const userTextureScale = userTexture
        ? userTexture.repeat
        : new Vector2(0.01, 0.01);
    const hasUserTexture = !!userTexture;

    //-----material texture-----
    const materialTexture = materialRenderData.materialTexture;
    //const tileScale = userTexture ? userTexture.repeat : new Vector2(0.1, 0.1);
    //This tileScale number is hardcoded to ensure ~20 corrugated lines for 10cm width
    //const tileScale = new Vector2(0.025, 0.025);
    const tileScale = new Vector2(0.04, 0.04);

    const hasMaterialTexture = !!materialTexture;

    //-----ao texture-----
    const aoMap = materialRenderData.aoMap;
    const aoStrength = materialRenderData.aoStrength || 0.0;
    const hasAoTexture = !!aoMap;

    //-----roughness texture-----
    const roughnessMap = materialRenderData.roughnessMap;
    const hasRoughnessTexture = !!roughnessMap;

    //----displacement map-------
    const displacementMap = materialRenderData.displacementMap;
    const hasDisplacementMap = !!displacementMap;

    //----normal texture-------
    const normalMap = materialRenderData.normalMap;
    const hasNormalMap = !!normalMap;

    if (!hasMaterialTexture && !hasUserTexture) {
        baseColor.convertLinearToSRGB();
    }

    const specularStrength = materialRenderData.specularStrength || 0.0;
    const metalness = materialRenderData.metalness || 0.0;
    const ior = materialRenderData.ior;
    const clearcoat = materialRenderData.clearcoat;
    const clearcoatRoughness = materialRenderData.clearcoatRoughness;
    const roughness = materialRenderData.roughnessValue;
    const thickness = materialRenderData.thickness;
    const transmission = materialRenderData.transmission;
    const envMapIntensity = materialRenderData.envMapIntensity;
    const isTransparent = materialRenderData.isTransparent;
    const useTexture = materialRenderData.useTexture;
    const envMap = materialRenderData.envMap;

    const materialParams: MeshPhysicalMaterialParameters = {};
    if (ior !== undefined) materialParams.ior = ior;
    if (clearcoat !== undefined) materialParams.clearcoat = clearcoat;
    if (metalness !== undefined) materialParams.metalness = metalness;
    if (roughness !== undefined) materialParams.roughness = roughness;
    if (thickness !== undefined) materialParams.thickness = thickness;
    if (transmission !== undefined) materialParams.transmission = transmission;
    if (isTransparent !== undefined) materialParams.transparent = isTransparent;

    const mapParams: Record<string, any> = {};
    if (useTexture && !isTransparent) {
        if (materialTexture !== undefined) {
            mapParams.map = materialTexture;
            materialTexture.repeat.set(0.05, 0.05);
            materialTexture.offset.set(0.5, 0.5);
        }
        if (aoMap !== undefined) {
            mapParams.aoMap = aoMap;
            aoMap.repeat.set(0.05, 0.05);
            aoMap.offset.set(0.5, 0.5);
        }
        if (normalMap !== undefined) {
            mapParams.normalMap = normalMap;
            normalMap.repeat.set(0.05, 0.05);
            normalMap.offset.set(0.5, 0.5);
            mapParams.normalScale = new Vector2(0.03, 0.03);
            // mapParams.normalMapSpace = TangentSpace;
            // mapParams.normalMapEncoding = RGBADecode;
        }
        if (roughnessMap !== undefined) {
            mapParams.roughnessMap = roughnessMap;
            roughnessMap.repeat.set(0.05, 0.05);
            roughnessMap.offset.set(0.5, 0.5);
        }
        if (displacementMap !== undefined) {
            mapParams.displacementMap = displacementMap;
            displacementMap.repeat.set(0.05, 0.05);
            displacementMap.offset.set(0.5, 0.5);
        }

        if (aoStrength !== undefined) mapParams.aoMapIntensity = aoStrength;
        if (envMap !== undefined) mapParams.envMap = envMap;
        if (envMapIntensity !== undefined)
            mapParams.envMapIntensity = envMapIntensity;
    }

    //---Exception to apply baseColor to mapParams------
    if (materialRenderData.applyBaseColor) {
        mapParams.color = baseColor;
    }

    // if (hasUserTexture) {
    //     mapParams.map = userTexture;
    //     // userTexture.repeat.set(0.05, 0.05);
    //     // userTexture.offset.set(0.5, 0.5);
    // }

    // Create materials
    const surfaceMaterial = new MeshPhysicalMaterial({
        ...materialParams,
        ...mapParams,
    });

    if (hasUserTexture) {
        userTexture.colorSpace = SRGBColorSpace;
        surfaceMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.materialTexture = { value: materialTexture };
            shader.uniforms.userTexture = { value: userTexture };
            shader.uniforms.userTextureBlendFactor = {
                value: 1.0,
            };
            shader.uniforms.baseColor = { value: baseColor };
            shader.uniforms.hasUserTexture = { value: hasUserTexture };
            shader.uniforms.hasMaterialTexture = { value: hasMaterialTexture };
            shader.uniforms.tileScale = { value: tileScale };
            shader.uniforms.tileOffset = { value: tileOffset };
            shader.uniforms.userTextureScale = { value: userTextureScale };
            shader.vertexShader = shader.vertexShader.replace(
                "#include <common>",
                `#include <common>
                varying vec2 vUvTile;
                varying vec2 vUvuTexture;
                uniform vec2 tileScale;
                uniform vec2 tileOffset;
                uniform vec2 userTextureScale;
                `,
            );
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
                vUvTile = uv * tileScale + tileOffset;
                vUvuTexture = uv * userTextureScale + tileOffset;`,
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <common>",
                `#include <common>
                varying vec2 vUvTile;
                varying vec2 vUvuTexture;
                uniform vec2 tileScale;
                uniform vec2 tileOffset;
                uniform vec2 userTextureScale;
                uniform vec3 baseColor;
                uniform bool hasMaterialTexture;
                uniform bool hasUserTexture;
                uniform sampler2D userTexture;
                uniform sampler2D materialTexture;
                uniform float userTextureBlendFactor;
                
                `,
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                "#include <map_fragment>",
                `#include <map_fragment>
                vec3 base = baseColor;
                if(hasMaterialTexture){
                    vec4 baseTexColor = texture2D(materialTexture, vUvTile);
                    base = baseTexColor.rgb;
                }
                vec3 colorWithuTexture = base;
                if(hasUserTexture){
                    vec4 uTextureColor = texture2D(userTexture, vUvuTexture);
                    float uTextureAlpha = uTextureColor.a * userTextureBlendFactor;
                    colorWithuTexture = mix(base, uTextureColor.rgb, uTextureAlpha);
                    //float rgbSum = uTextureColor.r + uTextureColor.g + uTextureColor.b;
                    //if(rgbSum > 0.0){
                        //colorWithuTexture = uTextureColor.rgb;
                    //}else{
                    //    colorWithuTexture = base;
                    //}
                }
                //diffuseColor = vec4(base, 1.0);
                diffuseColor = vec4(colorWithuTexture, 1.0);
                //diffuseColor = vec4(1.0, 0.0, 0.0, 1.0);
                //diffuseColor*= vec4(colorWithuTexture,1.0);
                `,
            );
            //};
            // // Force UV code even if map is not set
            // if (!hasMaterialTexture) {
            //     surfaceMaterial.defines = { USE_UV: "" };
        };
    }
    return surfaceMaterial;
}

function createShaderMaterials({
    frontUserTextures,
    backUserTextures,
    materialRenderData,
    currentDesign,
}: {
    frontUserTextures: Texture[] | undefined;
    backUserTextures: Texture[] | undefined;
    materialRenderData: T_materialRenderData;
    currentDesign: T_design;
}) {
    const materialFront = createSurfaceShaderMaterial({
        userTextures: frontUserTextures,
        materialRenderData,
        currentDesign,
    });
    const materialBack = createSurfaceShaderMaterial({
        userTextures: backUserTextures,
        materialRenderData,
        currentDesign,
    });

    const materialSide = materialFront;

    return [materialFront, materialSide, materialBack];
}

function createSurfaceShaderMaterial({
    userTextures,
    materialRenderData,
    currentDesign,
}: {
    userTextures: Texture[] | undefined;
    materialRenderData: T_materialRenderData;
    currentDesign: T_design;
}) {
    const { config3d } = currentDesign.config;
    const { rgbaColor, disableMaterial } = config3d;
    const decodedBaseColor = decodeRgbaColor(
        rgbaColor || "rgba(255,255,255,1)",
    );
    const baseColor = new Color(decodedBaseColor?.hexColor || "#ffffff");

    //-----user texture-----
    const userTextureBlendFactor =
        materialRenderData.userTextureBlendFactor ??
        config3d.userTextureBlendFactor ??
        1;
    const userTexture: Texture | undefined = userTextures
        ? userTextures[0]
        : undefined; //Front texture;
    const tileOffset = userTexture ? userTexture.offset : new Vector2(0.5, 0.5);
    const userTextureScale = userTexture
        ? userTexture.repeat
        : new Vector2(0.01, 0.01);
    const hasUserTexture = !!userTexture;

    //-----material texture-----
    const materialTexture = materialRenderData.materialTexture;
    //const tileScale = userTexture ? userTexture.repeat : new Vector2(0.1, 0.1);
    //This tileScale number is hardcoded to ensure ~20 corrugated lines for 10cm width
    //const tileScale = new Vector2(0.025, 0.025);
    const tileScale = new Vector2(0.04, 0.04);

    const hasMaterialTexture = !disableMaterial && !!materialTexture;

    //-----ao texture-----
    const aoMap = materialRenderData.aoMap;
    const aoStrength = materialRenderData.aoStrength || 0;
    const hasAoTexture = !!aoMap;

    //-----roughness texture-----
    const roughnessMap = undefined;
    const hasRoughnessTexture = !!roughnessMap;

    if (!hasMaterialTexture && !hasUserTexture) {
        baseColor.convertLinearToSRGB();
    }

    const specularStrength = materialRenderData.specularStrength || 0;
    const metalness = materialRenderData.metalness || 0;

    // Create materials
    const surfaceMaterial = new ShaderMaterial({
        transparent: true,
        blending: NormalBlending,
        side: FrontSide,
        uniforms: {
            materialTexture: {
                value: materialTexture || new Texture(),
            },
            roughnessMap: {
                value: roughnessMap || new Texture(),
            },
            aoMap: { value: aoMap || new Texture() },
            aoStrength: { value: aoStrength },
            uTexture: { value: userTexture || new Texture() },
            userTextureBlendFactor: {
                value: userTextureBlendFactor,
            },
            hasUserTexture: { value: hasUserTexture },
            tileScale: { value: tileScale },
            tileOffset: { value: tileOffset },
            uTextureScale: { value: userTextureScale },
            baseColor: { value: baseColor },
            hasMaterialTexture: { value: hasMaterialTexture },
            hasAoTexture: { value: hasAoTexture },
            hasRoughnessTexture: { value: hasRoughnessTexture },
            metalness: { value: metalness },
            specularStrength: { value: specularStrength },
        },
        vertexShader: materialVertShader,
        fragmentShader: materialFragShader,
    });
    return surfaceMaterial;
}

const updateActiveSurfaces = (
    e: ThreeEvent<MouseEvent>,
    popupContext: T_popupEditorContext,
) => {
    const { addToActiveSurfaces, setActiveSurfaces } = popupContext;
    const { intersections } = e;
    let shapeIntersection = checkIntersectionWithShapes(intersections, {
        returnAll: false,
    }) as Intersection | undefined;
    if (!shapeIntersection) return;

    const { hitShapeName, hitShapeSide } =
        getIntersectionDetails(shapeIntersection);
    if (!hitShapeName) return;
    const surfaceData: T_surfaceData = {
        surfaceShapeName: hitShapeName,
        surfaceShapeSide: hitShapeSide,
    };
    let t: T_surfaceData[] = [];
    if (e.shiftKey) {
        t = addToActiveSurfaces(surfaceData);
    } else {
        t = [surfaceData];
        setActiveSurfaces(t);
    }
    return t;
};
const determineMeshColorAndOpacity = (
    dataProvider: {
        givenColor?: string;
        hoverColor?: string;
        selectColor?: string;
        givenOpacity?: number;
    },
    opts: {
        isParentFoldSelected: boolean;
        isSelected: boolean;
        showInSingleColor?: boolean;
        isHovered?: boolean;
        isActiveSurface?: boolean;
    } = {
        showInSingleColor: false,
        isHovered: false,
        isParentFoldSelected: false,
        isSelected: false,
        isActiveSurface: false,
    },
) => {
    const { givenColor, hoverColor, selectColor, givenOpacity } = dataProvider;
    const {
        showInSingleColor,
        isHovered,
        isParentFoldSelected,
        isSelected,
        isActiveSurface,
    } = opts;
    let meshColor = givenColor || "#ffffff";
    let meshOpacity = givenOpacity != undefined ? givenOpacity : 1;
    if (showInSingleColor) return { meshColor, meshOpacity };
    if (isParentFoldSelected) {
        meshColor = editColor3d;
    }
    if (isHovered) {
        meshColor = hoverColor || hoverColor3d;
    }
    if (isSelected) {
        meshColor = selectColor || selectColor3d;
    }
    if (isActiveSurface) {
        meshColor = activeSurfaceColor3d;
    }

    if (isHovered || isParentFoldSelected) meshOpacity = 0.6;
    if (isSelected || isActiveSurface) meshOpacity = 0.5;
    return {
        meshColor,
        meshOpacity,
    };
    // return givenColor || "#ffffff";
};

const getTextureIndexes = (shapeData: T_flatShape3d) => {
    const textureIndex = shapeData.textureData
        ? decodeTextureSlug(shapeData.textureData?.slug || "").textureIndex
        : 0;
    const textureIndex_inside = shapeData.textureData_inside
        ? decodeTextureSlug(shapeData.textureData_inside?.slug || "")
              .textureIndex
        : 0;

    return { textureIndex, textureIndex_inside };
};
