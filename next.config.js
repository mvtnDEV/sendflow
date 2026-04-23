/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
  // Evitar que Next.js intente pre-renderizar páginas que usan DB
  staticPageGenerationTimeout: 1000,
}

module.exports = nextConfig
