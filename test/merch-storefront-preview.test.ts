import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { renderMerchStorefrontPreview } from '../src/modules/merch/storefront.js';

describe('BASSSE Merch read-only preview', () => {
  it('is disabled by default, even without a database', async () => {
    const app = buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/merch' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('shows catalog categories only when explicitly enabled', async () => {
    const app = buildApp({ merchStorefrontPreviewEnabled: true });
    try {
      const res = await app.inject({ method: 'GET', url: '/merch' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toContain('YOUR MERCH.');
      expect(res.body).toContain('info@bassse.com');
      expect(res.body).toContain('camisetas-oversize');
      expect(res.body).toContain('Solicitar presupuesto');
      expect(res.body).not.toContain('checkoutUrl');
      expect(res.body).not.toContain('stripe.com');
    } finally {
      await app.close();
    }
  });

  it('contains 21 merchandise families without published prices', () => {
    const html = renderMerchStorefrontPreview();
    expect((html.match(/class="product"/g) ?? [])).toHaveLength(21);
    expect(html).toContain('VISTA PREVIA');
    expect(html).toContain('noindex,nofollow');
    expect(html).not.toContain('139059');
    expect(html).not.toContain('€');
  });
});
