const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Set the output file tracing root to the current directory
  // This silences the warning about multiple lockfiles
  outputFileTracingRoot: path.join(__dirname),
  
  images: {
    domains: ['res.cloudinary.com'], // Cloudinary for media storage
  },
  
  // WebSocket configuration
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = nextConfig
