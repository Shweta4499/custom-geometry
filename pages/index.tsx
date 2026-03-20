import dynamic from "next/dynamic";

const Scene = dynamic(() => import("../components/skinned-geometry"), {
    ssr: false,
});

export default function Home() {
    return <Scene />;
}
