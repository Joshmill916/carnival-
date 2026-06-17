// Store behind a stable IStore interface so a real provider (Stripe / native IAP
// via a future Capacitor wrapper) can drop in later without touching the UI.
// v1 is simulated: "Buy" grants tickets instantly with no real money.
import { State } from '../data/State.js';
import { awardTickets } from './Progression.js';

export const STORE_PRODUCTS = [
  { id: 'tickets_small', title: 'Handful of Tickets', desc: '250 tickets', priceLabel: '$0.99', grants: { tickets: 250 } },
  { id: 'tickets_med', title: 'Bag of Tickets', desc: '1,500 tickets (+20%)', priceLabel: '$3.99', grants: { tickets: 1500 } },
  { id: 'tickets_large', title: 'Bucket of Tickets', desc: '5,000 tickets (+40%)', priceLabel: '$9.99', grants: { tickets: 5000 } },
];

// Shared fulfillment: applies a product's grants. Real stores call this AFTER
// their async receipt verification, exactly as the simulated store does now.
function fulfill(product) {
  if (product.grants.tickets) awardTickets(product.grants.tickets);
}

class SimulatedStore {
  getProducts() {
    return STORE_PRODUCTS;
  }
  async purchase(productId) {
    const product = STORE_PRODUCTS.find((p) => p.id === productId);
    if (!product) return { ok: false, error: 'unknown-product' };
    fulfill(product);
    const receipt = 'SIM-' + Date.now();
    if (!State.s.store) State.s.store = { purchases: [] };
    State.s.store.purchases.push({ productId, receipt, ts: Date.now() });
    State.save();
    return { ok: true, productId, receipt };
  }
  async restore() {
    return { ok: true, restored: [] };
  }
}

export const Store = new SimulatedStore();
