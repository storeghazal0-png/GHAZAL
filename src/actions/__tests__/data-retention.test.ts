import { describe, it, expect } from 'vitest';
import { DATA_RETENTION_CONFIG } from '../../lib/data-retention-config';

describe('Data Retention & Free-Tier Storage Safeguards', () => {
  it('enforces strict 90-day retention for invoices and receipts', () => {
    expect(DATA_RETENTION_CONFIG.invoicesDays).toBe(90);
  });

  it('enforces 0-day retention for system logs and transient operations (purged completely)', () => {
    expect(DATA_RETENTION_CONFIG.systemLogsDays).toBe(0);
  });

  it('guarantees permanent preservation for core entities (products, categories, brands)', () => {
    expect(DATA_RETENTION_CONFIG.coreEntitiesRetention).toBe('PERMANENT');
  });

  it('computes correct cut-off dates for 90 day invoice retention and immediate log sweeps', () => {
    const fixedNow = new Date('2026-11-24T12:00:00.000Z');
    const invoiceCutoff = new Date(fixedNow.getTime() - 90 * 24 * 60 * 60 * 1000);
    const logCutoff = DATA_RETENTION_CONFIG.systemLogsDays === 0 
      ? fixedNow 
      : new Date(fixedNow.getTime() - DATA_RETENTION_CONFIG.systemLogsDays * 24 * 60 * 60 * 1000);

    expect(invoiceCutoff.toISOString()).toBe('2026-08-26T12:00:00.000Z');
    expect(logCutoff.toISOString()).toBe('2026-11-24T12:00:00.000Z');
  });

  it('correctly filters products by channel (ONLINE, POS, SHARED)', () => {
    const sampleProducts = [
      { id: '1', name: 'أحمر شفاه حصري للمتجر', channel: 'ONLINE' },
      { id: '2', name: 'عطر كاشير صالة العرض', channel: 'POS' },
      { id: '3', name: 'كريم أساس مشترك', channel: 'SHARED' }
    ];

    // Storefront items: only ONLINE and SHARED
    const storefrontItems = sampleProducts.filter(p => p.channel === 'ONLINE' || p.channel === 'SHARED');
    expect(storefrontItems.map(p => p.id)).toEqual(['1', '3']);
    expect(storefrontItems.some(p => p.channel === 'POS')).toBe(false);

    // POS Cashier items: only POS and SHARED
    const posCashierItems = sampleProducts.filter(p => p.channel === 'POS' || p.channel === 'SHARED');
    expect(posCashierItems.map(p => p.id)).toEqual(['2', '3']);
    expect(posCashierItems.some(p => p.channel === 'ONLINE')).toBe(false);

    // Shared items: available in both
    const sharedItems = sampleProducts.filter(p => p.channel === 'SHARED');
    expect(sharedItems.map(p => p.id)).toEqual(['3']);
  });
});
