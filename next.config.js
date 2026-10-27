/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    "/api/audits/[id]/pdf": ["./dist-crawler/**"],
  },
};
module.exports = nextConfig;