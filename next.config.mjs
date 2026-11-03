/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.ignoreWarnings = [
      { module: /@supabase/ },
    ];
    return config;
  },
  turbopack: {},
  serverExternalPackages: ['@supabase/supabase-js', 'handlebars', 'puppeteer-core', '@sparticuz/chromium', 'exceljs'],
  // The report template and its images are read from disk at runtime.
  outputFileTracingIncludes: {
    '/api/report/**': ['./templates/**/*'],
  },
};

export default nextConfig;
