/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Feed images come from many unknown publisher domains; we render them with a
  // plain <img> (not next/image) so we don't have to maintain a domain allowlist.
  images: { unoptimized: true },
  experimental: {
    // Native module: load it from node_modules at runtime rather than bundling.
    serverComponentsExternalPackages: ["better-sqlite3"],
    // The schema and category list are read from disk at runtime; ship them
    // with every serverless function on Vercel.
    outputFileTracingIncludes: { "/**": ["./local/schema.sql", "./local/seed_sources.json"] },
  },
};

export default nextConfig;
