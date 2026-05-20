import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const defaultApiProxyTarget = 'http://Shoppi-ApiSe-vxdBwFgRxFe9-1262418963.us-east-1.elb.amazonaws.com';
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? defaultApiProxyTarget).replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
