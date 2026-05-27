import dynamic from "next/dynamic";

const BoxScene = dynamic(() => import("../components/Box"), {
    ssr: false,
});

export default function BoxPage() {
    return <BoxScene />;
}
