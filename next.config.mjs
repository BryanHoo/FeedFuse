/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Next.js 仅支持在项目根读取 next.config，这里保留唯一根配置入口。
  poweredByHeader: false,
  experimental: {
    // 对高频图标库做按需导入重写，减少客户端打包体积。
    optimizePackageImports: ['lucide-react'],
  },
  typescript: {
    // 复用生产类型检查范围，避免测试夹具的类型错误阻断发布构建。
    tsconfigPath: 'config/typescript/tsconfig.typecheck.json',
  },
};

export default nextConfig;
