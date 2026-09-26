import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.resolve(__dirname, '../src');

describe('P26 — Theme Consistency & Sunset Warm Design Tokens', () => {
  const css = fs.readFileSync(path.join(CLIENT_DIR, 'index.css'), 'utf8');

  describe('1. Sunset Warm Light Theme Tokens', () => {
    it('declares all primary Sunset Warm tokens in @theme', () => {
      assert.ok(css.includes('--color-brand: #ea580c'), 'missing --color-brand');
      assert.ok(css.includes('--color-brand-soft: #f97316'), 'missing --color-brand-soft');
      assert.ok(css.includes('--color-canvas: #fff7ed'), 'missing --color-canvas');
      assert.ok(css.includes('--color-surface: #ffffff'), 'missing --color-surface');
      assert.ok(css.includes('--color-ink: #1f2937'), 'missing --color-ink');
      assert.ok(css.includes('--color-ink-muted: #6b7280'), 'missing --color-ink-muted');
      assert.ok(css.includes('--color-on-brand: #3b0a03'), 'missing --color-on-brand');
    });

    it('declares darkened high-contrast text variants for light theme', () => {
      assert.ok(css.includes('--color-brand-text: #c2410c'), 'missing --color-brand-text');
      assert.ok(css.includes('--color-danger-text: #b91c1c'), 'missing --color-danger-text');
      assert.ok(css.includes('--color-warning-text: #92400e'), 'missing --color-warning-text');
    });
  });

  describe('2. Warm Charcoal Dark Theme Tokens', () => {
    it('declares warm charcoal surfaces without cold slate leaks', () => {
      assert.ok(css.includes('--color-canvas: #181614'), 'missing dark --color-canvas');
      assert.ok(css.includes('--color-surface: #211e1b'), 'missing dark --color-surface');
      assert.ok(css.includes('--color-ink: #f5efe8'), 'missing dark --color-ink');
      assert.ok(css.includes('--color-ink-muted: #aca69d'), 'missing dark --color-ink-muted');
    });

    it('declares elevated brand and text tokens for dark theme', () => {
      assert.ok(css.includes('--color-brand: #f97316'), 'missing dark --color-brand');
      assert.ok(css.includes('--color-brand-soft: #fb923c'), 'missing dark --color-brand-soft');
      assert.ok(css.includes('--color-brand-text: #fdba74'), 'missing dark --color-brand-text');
      assert.ok(css.includes('--color-danger-text: #fca5a5'), 'missing dark --color-danger-text');
      assert.ok(css.includes('--color-warning-text: #fcd34d'), 'missing dark --color-warning-text');
      assert.ok(css.includes('--color-on-brand: #1c1411'), 'missing dark --color-on-brand');
    });

    it('declares complete status badge ramps for dark theme', () => {
      assert.ok(css.includes('--color-green-50: #17241d'), 'missing dark --color-green-50');
      assert.ok(css.includes('--color-green-200: #2d4638'), 'missing dark --color-green-200');
      assert.ok(css.includes('--color-green-800: #86efac'), 'missing dark --color-green-800');

      assert.ok(css.includes('--color-amber-50: #2a2016'), 'missing dark --color-amber-50');
      assert.ok(css.includes('--color-amber-200: #523b20'), 'missing dark --color-amber-200');
      assert.ok(css.includes('--color-amber-800: #fcd34d'), 'missing dark --color-amber-800');

      assert.ok(css.includes('--color-sky-50: #14232c'), 'missing dark --color-sky-50');
      assert.ok(css.includes('--color-sky-200: #1e3e4f'), 'missing dark --color-sky-200');
      assert.ok(css.includes('--color-sky-800: #7dd3fc'), 'missing dark --color-sky-800');

      assert.ok(css.includes('--color-rose-50: #2b181b'), 'missing dark --color-rose-50');
      assert.ok(css.includes('--color-rose-200: #57272f'), 'missing dark --color-rose-200');
      assert.ok(css.includes('--color-rose-800: #fda4af'), 'missing dark --color-rose-800');
    });
  });

  describe('3. Contrast Mathematical Verification', () => {
    function hexToRgb(hex) {
      const clean = hex.replace('#', '');
      const num = parseInt(clean, 16);
      return [num >> 16, (num >> 8) & 255, num & 255];
    }

    function luminance([r, g, b]) {
      const a = [r, g, b].map((v) => {
        const val = v / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function contrastRatio(hex1, hex2) {
      const lum1 = luminance(hexToRgb(hex1));
      const lum2 = luminance(hexToRgb(hex2));
      const [lighter, darker] = lum1 > lum2 ? [lum1, lum2] : [lum2, lum1];
      return (lighter + 0.05) / (darker + 0.05);
    }

    it('all light theme text tokens meet WCAG AA (>= 4.5:1) on white surface', () => {
      assert.ok(contrastRatio('#1f2937', '#ffffff') >= 4.5, 'ink on surface');
      assert.ok(contrastRatio('#6b7280', '#ffffff') >= 4.5, 'ink-muted on surface');
      assert.ok(contrastRatio('#c2410c', '#ffffff') >= 4.5, 'brand-text on surface');
      assert.ok(contrastRatio('#b91c1c', '#ffffff') >= 4.5, 'danger-text on surface');
      assert.ok(contrastRatio('#92400e', '#ffffff') >= 4.5, 'warning-text on surface');
      assert.ok(contrastRatio('#3b0a03', '#ea580c') >= 4.5, 'on-brand text on brand fill');
    });

    it('all dark theme text tokens meet WCAG AA (>= 4.5:1) on dark surface (#211e1b)', () => {
      const darkSurface = '#211e1b';
      assert.ok(contrastRatio('#f5efe8', darkSurface) >= 4.5, 'dark ink on surface');
      assert.ok(contrastRatio('#aca69d', darkSurface) >= 4.5, 'dark ink-muted on surface');
      assert.ok(contrastRatio('#fdba74', darkSurface) >= 4.5, 'dark brand-text on surface');
      assert.ok(contrastRatio('#fca5a5', darkSurface) >= 4.5, 'dark danger-text on surface');
      assert.ok(contrastRatio('#fcd34d', darkSurface) >= 4.5, 'dark warning-text on surface');
      assert.ok(contrastRatio('#86efac', darkSurface) >= 4.5, 'dark green-800 on surface');
      assert.ok(contrastRatio('#7dd3fc', darkSurface) >= 4.5, 'dark sky-800 on surface');
      assert.ok(contrastRatio('#fda4af', darkSurface) >= 4.5, 'dark rose-800 on surface');
      assert.ok(contrastRatio('#1c1411', '#f97316') >= 4.5, 'dark on-brand text on brand fill');
    });
  });
});
