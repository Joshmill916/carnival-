// Simulated store overlay. Lists products from the IStore and grants instantly on
// "Buy" (no real money in v1). Depends only on the Store interface.
import { Scene } from '../core/SceneManager.js';
import { createModal, toast } from '../ui/Modal.js';
import { Store } from '../systems/Store.js';

export class StoreScene extends Scene {
  onEnter() {
    this.game.input.setMode('none');
    this.modal = createModal({ title: '🛒 Store' });
    this.modal.body.innerHTML = `<p class="muted">Demo store — purchases are simulated and free (no real money).</p>`;
    this.list = document.createElement('div');
    this.list.className = 'product-list';
    this.modal.body.appendChild(this.list);
    this._render();
    this.modal.addButton('Close', () => this.game.closeMenu(), 'ghost');
  }

  _render() {
    this.list.innerHTML = '';
    for (const p of Store.getProducts()) {
      const row = document.createElement('div');
      row.className = 'product';
      row.innerHTML = `
        <div class="product-info">
          <div class="product-title">${p.title}</div>
          <div class="product-desc">${p.desc}</div>
        </div>`;
      const buy = document.createElement('button');
      buy.className = 'btn btn-primary';
      buy.textContent = p.priceLabel;
      buy.addEventListener('click', async () => {
        buy.disabled = true;
        const res = await Store.purchase(p.id);
        buy.disabled = false;
        toast(res.ok ? `Granted: ${p.title}` : 'Purchase failed');
      });
      row.appendChild(buy);
      this.list.appendChild(row);
    }
  }

  onExit() {
    this.modal?.close();
  }
}
