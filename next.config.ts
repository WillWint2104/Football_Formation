import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingIncludes: {
    "/api/organizations/*/sessions/*/*/exports": ["./assets/pdf-fonts/*.ttf"],
  },
};

export default nextConfig;
