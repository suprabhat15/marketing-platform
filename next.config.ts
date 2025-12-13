import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@radix-ui/react-slot',
      'lucide-react',
      'date-fns',
      'better-auth',
      '@polar-sh/better-auth',
      '@polar-sh/sdk'
    ],
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Handle Node.js built-in modules with node: prefix
    // This alias converts node:module to module, etc.
    config.resolve.alias = {
      ...config.resolve.alias,
      'node:module': 'module',
      'node:crypto': 'crypto',
      'node:fs': 'fs',
      'node:path': 'path',
      'node:url': 'url',
      'node:util': 'util',
      'node:stream': 'stream',
      'node:buffer': 'buffer',
      'node:process': 'process',
    };

    // For client-side builds, prevent bundling of Node.js built-ins
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'module': false,
        'fs': false,
        'path': false,
        'crypto': false,
        'stream': false,
        'buffer': false,
        'util': false,
        'url': false,
        'process': false,
      };
    }

    // For server builds, mark node: prefixed modules as externals
    if (isServer) {
      const nodeModules = [
        'node:module',
        'node:crypto',
        'node:fs',
        'node:path',
        'node:url',
        'node:util',
        'node:stream',
        'node:buffer',
        'node:process',
      ];

      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        (
          { context, request }: { context: string; request: string },
          callback: (err?: Error | null, result?: string) => void
        ) => {
          if (nodeModules.includes(request)) {
            const moduleName = request.replace(/^node:/, '');
            return callback(null, `commonjs ${moduleName}`);
          }
          if (typeof originalExternals === 'function') {
            return (originalExternals as (
              { context, request }: { context: string; request: string },
              callback: (err?: Error | null, result?: string) => void
            ) => void)({ context, request }, callback);
          }
          callback();
        },
      ];
    }

    // Use NormalModuleReplacementPlugin to handle node: URI scheme in imports
    // This converts node:module imports to module imports before webpack processes them
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^(node:)(.+)$/,
        (resource: { request: string }) => {
          // Remove node: prefix, webpack will use the alias to resolve it
          resource.request = resource.request.replace(/^node:/, '');
        }
      )
    );

    // API route optimization
    if (isServer && !dev) {
      // Optimize server-side chunks for faster API compilation
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks?.cacheGroups,
        // Split auth route into smaller chunks
        'auth-core': {
          name: 'auth-core',
          test: /[\\/]node_modules[\\/]better-auth[\\/](?!adapters|plugins).*\.js$/,
          chunks: 'all',
          priority: 25,
          enforce: true,
        },
        'auth-adapters': {
          name: 'auth-adapters',
          test: /[\\/]node_modules[\\/]better-auth[\\/]adapters[\\/]/,
          chunks: 'all',
          priority: 24,
          enforce: true,
        },
        'auth-lite': {
          name: 'auth-lite',
          test: /[\\/]lib[\\/]auth-lite\.ts$/,
          chunks: 'all',
          priority: 23,
          enforce: true,
        },
        'auth-full': {
          name: 'auth-full',
          test: /[\\/]lib[\\/]auth\.ts$/,
          chunks: 'all',
          priority: 22,
          enforce: true,
        },
        'api-polar': {
          name: 'api-polar',
          test: /[\\/](polar|billing)[\\/]/,
          chunks: 'all',
          priority: 21,
          enforce: true,
        },
        'api-prisma': {
          name: 'api-prisma',
          test: /[\\/]lib[\\/]prisma\.ts$/,
          chunks: 'all',
          priority: 20,
          enforce: true,
        },
      };
    }

    // Optimize bundling for large components
    if (!dev) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        maxSize: 500000, // 500KB max chunk size
        minSize: 20000,  // 20KB min chunk size
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // Auth-related chunks - split into smaller chunks
          'better-auth-core': {
            name: 'better-auth-core',
            test: /[\\/]node_modules[\\/]better-auth[\\/](?!adapters|plugins).*\.js$/,
            chunks: 'all',
            priority: 16,
          },
          'better-auth-adapters': {
            name: 'better-auth-adapters',
            test: /[\\/]node_modules[\\/]better-auth[\\/]adapters[\\/]/,
            chunks: 'all',
            priority: 15,
          },
          'polar-core': {
            name: 'polar-core',
            test: /[\\/]node_modules[\\/]@polar-sh[\\/]sdk[\\/]/,
            chunks: 'all',
            priority: 14,
          },
          'polar-auth': {
            name: 'polar-auth',
            test: /[\\/]node_modules[\\/]@polar-sh[\\/]better-auth[\\/]/,
            chunks: 'all',
            priority: 13,
          },
          'polar-checkout': {
            name: 'polar-checkout',
            test: /[\\/]node_modules[\\/]@polar-sh[\\/]checkout[\\/]/,
            chunks: 'all',
            priority: 12,
          },
          // Editor chunks
          'tiptap': {
            name: 'tiptap',
            test: /[\\/]node_modules[\\/]@tiptap[\\/]/,
            chunks: 'all',
            priority: 10,
          },
          // UI library chunks
          'radix': {
            name: 'radix',
            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            chunks: 'all',
            priority: 9,
          },
          // AWS SDK chunks (can be large)
          'aws-sdk': {
            name: 'aws-sdk',
            test: /[\\/]node_modules[\\/]@aws-sdk[\\/]/,
            chunks: 'all',
            priority: 8,
          },
          // CSV and data processing libraries
          'data-processing': {
            name: 'data-processing',
            test: /[\\/]node_modules[\\/](papaparse|csv-parser|fast-csv)[\\/]/,
            chunks: 'all',
            priority: 7,
          },
          // Utility libraries
          'date-utils': {
            name: 'date-utils',
            test: /[\\/]node_modules[\\/](date-fns|dayjs|moment)[\\/]/,
            chunks: 'all',
            priority: 6,
          },
          'form-utils': {
            name: 'form-utils',
            test: /[\\/]node_modules[\\/](zod|react-hook-form|formik)[\\/]/,
            chunks: 'all',
            priority: 5,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
