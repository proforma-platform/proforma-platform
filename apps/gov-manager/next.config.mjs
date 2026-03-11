/** @type {import('next').NextConfig} */
const resolvedBuildId =
  String(process.env.GOV_MANAGER_BUILD_ID || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "")
    .trim()
    .slice(0, 20) || `gov-manager-${Date.now().toString(36)}`;

const nextConfig = {
  generateBuildId: async () => resolvedBuildId,
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate"
          }
        ]
      },
      {
        source: "/login",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate"
          }
        ]
      }
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
