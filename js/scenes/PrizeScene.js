// Prize Booth: redeem tickets for prizes, see your shelf, and trade 3 of a tier
// up to one better prize. Higher tiers unlock as your Level climbs.
import { Scene } from '../core/SceneManager.js';
import { createModal, toast } from '../ui/Modal.js';
import { PRIZE_TIERS, prizesInTier, TRADE_UP_COUNT } from '../data/defs.js';
import { getStatus } from '../systems/Progression.js';
import { redeem, canTradeUp, tradeUp, countOf, tierCount, ownedList } from '../systems/Prizes.js';
import { Audio } from '../core/Audio.js';

export class PrizeScene extends Scene {
  onEnter() {
    this.game.input.setMode('none');
    this.modal = createModal({ title: '🎁 Prize Booth' });
    this.body = this.modal.body;
    this._render();
    this.modal.addButton('Get tickets 🛒', () => this.game.openStore(), 'ghost');
    this.modal.addButton('Close', () => this.game.closeMenu(), 'ghost');
  }

  _render() {
    const s = getStatus();
    const pct = Math.round(s.progress * 100);
    const nextTxt = s.next
      ? `Lvl ${s.level} → ${s.toNext} more tickets to Lvl ${s.next.level}`
      : `Lvl ${s.level} — max level!`;

    let html = `
      <div class="prize-head">
        <div class="prize-wallet">🎟️ <b>${s.tickets}</b> tickets · Level <b>${s.level}</b></div>
        <div class="lvlbar"><span style="width:${pct}%"></span></div>
        <div class="muted">${nextTxt}</div>
      </div>`;

    // Redeem, tier by tier. Locked tiers are shown so players see what's coming.
    html += `<h3 class="prize-h">Redeem tickets</h3>`;
    for (let tier = 1; tier <= PRIZE_TIERS; tier++) {
      const locked = tier > s.maxTier;
      html += `<div class="prize-tier ${locked ? 'locked' : ''}">
        <div class="tier-label">Tier ${tier}${locked ? ' 🔒 (reach Level ' + tier + ')' : ''}</div>
        <div class="prize-grid">`;
      for (const p of prizesInTier(tier)) {
        const own = countOf(p.id);
        html += `<button class="prize-card" data-redeem="${p.id}" ${locked ? 'disabled' : ''}>
            <span class="prize-emoji">${p.emoji}</span>
            <span class="prize-name">${p.name}</span>
            <span class="prize-cost">🎟️ ${p.cost}</span>
            ${own ? `<span class="prize-own">×${own}</span>` : ''}
          </button>`;
      }
      html += `</div></div>`;
    }

    // Trade-up: any tier where you hold enough to move up.
    const tradeable = [];
    for (let tier = 1; tier < PRIZE_TIERS; tier++) {
      if (canTradeUp(tier)) tradeable.push(tier);
    }
    if (tradeable.length) {
      html += `<h3 class="prize-h">Trade up <span class="muted">(${TRADE_UP_COUNT} of a tier → 1 better)</span></h3>`;
      for (const tier of tradeable) {
        html += `<div class="trade-row"><div class="muted">You have ${tierCount(tier)} tier ${tier} prizes — trade ${TRADE_UP_COUNT} for one:</div><div class="prize-grid">`;
        for (const p of prizesInTier(tier + 1)) {
          html += `<button class="prize-card trade" data-trade="${tier}" data-reward="${p.id}">
              <span class="prize-emoji">${p.emoji}</span>
              <span class="prize-name">${p.name}</span>
              <span class="prize-cost">Trade ${TRADE_UP_COUNT}</span>
            </button>`;
        }
        html += `</div></div>`;
      }
    }

    // Your shelf.
    const owned = ownedList();
    html += `<h3 class="prize-h">Your shelf</h3>`;
    if (!owned.length) {
      html += `<p class="muted">No prizes yet — win tickets and redeem them above!</p>`;
    } else {
      html += `<div class="shelf">`;
      for (const p of owned) {
        html += `<div class="shelf-item" title="${p.name}">${p.emoji}<span>×${p.count}</span></div>`;
      }
      html += `</div>`;
    }

    this.body.innerHTML = html;

    this.body.querySelectorAll('[data-redeem]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = redeem(btn.dataset.redeem);
        if (res.ok) {
          Audio.coin();
          toast('Redeemed!');
        } else {
          toast(res.reason === 'broke' ? 'Not enough tickets' : res.reason === 'locked' ? 'Locked — level up first' : 'Cannot redeem');
        }
        this._render();
      });
    });
    this.body.querySelectorAll('[data-trade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = tradeUp(Number(btn.dataset.trade), btn.dataset.reward);
        if (res.ok) {
          Audio.win();
          toast('Traded up! 🎉');
        } else {
          toast('Cannot trade up yet');
        }
        this._render();
      });
    });
  }

  onExit() {
    this.modal?.close();
  }
}
