/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The /api/process route accepts a downscaled data URI. Client-side downscaling
  // (MAX_EDGE, JPEG ~0.9) keeps bodies well under Vercel's ~4.5MB serverless limit.
  webpack: (config) => {
    // libraw-wasm (used client-side for RAW/.ARW/.DNG bracket decoding in the
    // HDR Blend tab) ships a WebAssembly module loaded via a Web Worker.
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
