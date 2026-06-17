// DOM overlay panel helper used by the menu/result scenes. Keeps menus as
// accessible HTML over the canvas rather than hand-drawn buttons.
import { Audio } from '../core/Audio.js';

const root = () => document.getElementById('overlay-root');

// Build a modal. opts: { title, dim=true, dismissable=false, onDismiss }.
// Returns { el, body, close, addButton }.
export function createModal(opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap' + (opts.dim === false ? ' no-dim' : '');

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  if (opts.title) {
    const h = document.createElement('h2');
    h.className = 'modal-title';
    h.textContent = opts.title;
    panel.appendChild(h);
  }

  const body = document.createElement('div');
  body.className = 'modal-body';
  panel.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  panel.appendChild(footer);

  wrap.appendChild(panel);
  root().appendChild(wrap);

  function close() {
    wrap.remove();
  }

  if (opts.dismissable) {
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) {
        Audio.ui();
        close();
        opts.onDismiss?.();
      }
    });
  }

  function addButton(label, onClick, kind = 'primary') {
    const b = document.createElement('button');
    b.className = 'btn btn-' + kind;
    b.textContent = label;
    b.addEventListener('click', () => {
      Audio.ui();
      onClick();
    });
    footer.appendChild(b);
    return b;
  }

  return { el: wrap, panel, body, footer, close, addButton };
}

// Quick non-blocking toast.
export function toast(msg, ms = 1600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  root().appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}
