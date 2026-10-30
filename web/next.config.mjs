/** @type {import('next').NextConfig} */
const nextConfig = {
  // hide the Next.js development badge
  devIndicators: false,
  // keep the embedding model library out of the bundle (it loads native code)
  serverExternalPackages: ['@huggingface/transformers'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
