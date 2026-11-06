/** @type {import('next').NextConfig} */
const nextConfig = {
  // Site 100 % statique : `pnpm build` produit le dossier `out/`, à déposer sur Netlify, Vercel, GitHub Pages…
  output: "export",
  images: { unoptimized: true },
};

module.exports = nextConfig;
