import dynamic from "next/dynamic";

// prevent SSR (important for three.js)
const Scene = dynamic(() => import("../components/Pouch4"), {
    ssr: false,
});

export default function PouchPage() {
    return <Scene />;
}
