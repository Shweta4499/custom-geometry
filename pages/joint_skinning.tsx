import dynamic from "next/dynamic";

const JointSkinningTestScene = dynamic(
    () => import("../components/JointSkinningTest"),
    { ssr: false },
);

export default function JointSkinningPage() {
    return <JointSkinningTestScene />;
}
