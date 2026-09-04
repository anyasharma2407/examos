import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploads deliberately do NOT go through a Server Action: those cap the
  // request body, and any request the proxy matches is buffered in memory
  // first. They go to src/app/api/materials/upload, which src/proxy.ts
  // excludes, so neither ceiling applies. See MAX_FILE_BYTES for the real
  // limit and the storage backend's own cap.
  serverExternalPackages: [
    // pdf.js and mammoth do their own dynamic loading and font/binary handling;
    // bundling them breaks extraction at runtime.
    "unpdf",
    "mammoth",
  ],
};

export default nextConfig;
