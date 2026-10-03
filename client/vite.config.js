import crypto from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Task 35 — Subresource Integrity (SRI) Plugin
 *
 * Computes SHA-384 integrity hashes for generated bundle scripts and styles
 * and injects integrity and crossorigin attributes into production index.html.
 */
function subresourceIntegrity() {
  return {
    name: 'subresource-integrity',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      if (!ctx || !ctx.bundle) return html;

      return html.replace(
        /(<(?:script|link)[^>]+(?:src|href)=["'])([^"']+)(["'][^>]*>)/gi,
        (match, prefix, url, suffix) => {
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
            return match;
          }
          const cleanPath = url.replace(/^\//, '');
          const bundleItem =
            ctx.bundle[cleanPath] ||
            Object.values(ctx.bundle).find((b) => b.fileName === cleanPath);

          if (bundleItem) {
            const content = bundleItem.type === 'asset' ? bundleItem.source : bundleItem.code;
            if (content) {
              const hash = crypto.createHash('sha384').update(content).digest('base64');
              const withoutClosing = suffix.replace(/>$/, '');
              return `${prefix}${url}${withoutClosing} integrity="sha384-${hash}" crossorigin="anonymous">`;
            }
          }
          return match;
        },
      );
    },
  };
}

/**
 * The dev server port is pinned to 5173 because the backend's CORS origin
 * (server/.env CLIENT_URL) is configured for it. `strictPort` makes a port
 * clash fail loudly instead of silently moving to 5174 and breaking CORS.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), subresourceIntegrity()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('@remix-run')) {
              return 'vendor-router';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});
