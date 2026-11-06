import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import "./css/style.css";

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://chronotck.vercel.app"),
  title: "TCK Chrono — le chrono des coachs de canoë-kayak · Torcy Canoë-Kayak",
  description:
    "Un tap, un temps. Le chronomètre des coachs de canoë-kayak : une seule main, lisible en plein soleil, précis au centième.",
  icons: { icon: "/icon-512.png", apple: "/icon-512.png" },
  applicationName: "TCK Chrono",
  alternates: { canonical: "/" },
  openGraph: {
    title: "TCK Chrono — un tap, un temps",
    description: "Le chronomètre des coachs de canoë-kayak : une seule main, lisible en plein soleil, précis au centième.",
    type: "website",
    locale: "fr_FR",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="scroll-smooth">
      <head>
        {/* App installée (écran d'accueil) ou retour d'un lien e-mail de connexion : on va directement dans l'app. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var s=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;var a=/access_token=|type=recovery|type=signup|error_description=/.test(location.hash)||/[?&]code=/.test(location.search);if(s||a)location.replace('/app'+location.search+location.hash)}catch(e){}",
          }}
        />
      </head>
      <body className="bg-ground font-outfit tracking-tight text-ink antialiased">
        <div className="flex min-h-screen flex-col overflow-hidden supports-[overflow:clip]:overflow-clip">
          {children}
        </div>
      </body>
    </html>
  );
}
