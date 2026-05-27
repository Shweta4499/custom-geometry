import dynamic from "next/dynamic";

const Scene = dynamic(() => import("../components/Extrude1"), {
    ssr: false,
});

export default function Extrude1Page() {
    return <Scene />;
}
