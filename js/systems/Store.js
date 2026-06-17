// Store behind a stable IStore interface so a real provider (Stripe / native IAP
// via a future Capacitor wrapper) can drop in later without touching the UI.
import { State } from '../data/State.js';
import { STORE_PRODUCTS } from '../data/defs.js';
import { addCoins, refillEnergy } from './Economy.js';

// Shared fulfillment: applies a product's grants. Real stores call this AFTER
// their async receipt verification, exactly as the simulated store does now.
function fulfill(product) {
  if (product.grants.coins) addCoins(product.grants.coins);
  if (product.grants.energyFull) refillEnergy();
}

class SimulatedStore {
  // IStore.getProducts()
  getProducts() {
    return STORE_PRODUCTS;
  }
  // IStore.purchase(): instant grant, no real money. Returns a fake receipt.
  async purchase(productId) {
    const product = STORE_PRODUCTS.find((p) => p.id === productId);
    if (!product) return { ok: false, error: 'unknown-product' };
    fulfill(product);
    const receipt = 'SIM-' + Date.now();
    State.s.store.purchases.push({ productId, receipt, ts: Date.now() });
    State.save();
    return { ok: true, productId, receipt };
  }
  // IStore.restore(): no-op for the simulated store.
  async restore() {
    return { ok: true, restored: [] };
  }
}

// The app depends only on this instance, never on the concrete class.
export const Store = new SimulatedStore();
