/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The /api/process route accepts a downscaled data URI. Client-side downscaling
  // (MAX_EDGE, JPEG ~0.9) keeps bodies well under Vercel's ~4.5MB serverless limit.
};

export default nextConfig;
