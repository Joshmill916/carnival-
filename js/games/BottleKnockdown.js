// Bottle Knockdown: swipe up to throw a baseball at a stacked pyramid of bottles.
// Knocked bottles cascade into each other. 2 balls; clear them all for a coin bonus.
import { MiniGame } from './MiniGame.js';
import { drawBoothBack, drawCounter, drawFloor, drawBaseball, contactShadow, drawSign, rr } from '../ui/BoothStage.js';
import { Audio } from '../core/Audio.js';

// Side-view physics. Bottles are upright boxes stacked in a pyramid on a
// table. A hit bottle tumbles (it spins and falls under gravity), lands on
// the table or the floor and rolls flat. A bottle whose support is knocked
// out from under it topples too, and a tumbling bottle that crashes into a
// standing one takes it down with it — so a good hit low in the stack brings
// the whole pyramid down, like the real thing.
const BW = 34;          // bottle width
const BH = 60;          // bottle height (body + neck)
const GAP = 4;          // gap between bottles in a row
const G = 1500;         // gravity, px/s^2
const BALL_R = 12;
const FLIGHT = 0.42;    // seconds for the ball to reach the pyramid
const THROWS = 3;

export class BottleKnockdown extends MiniGame {
  static key = 'bottles';
  static label = 'Bottle Knockdown';

  init() {
    const W = this.view.w, H = this.view.h;
    this.attemptsLeft = THROWS;
    this.hint = 'Flick at the bottles — harder = higher';
    this.launch = { x: W / 2, y: H - 134 };
    this.tableY = H * 0.42 + 26;                 // table top surface
    this.tableX0 = W / 2 - (W * 0.74) / 2;
    this.tableX1 = W / 2 + (W * 0.74) / 2;
    this.floorY = this.tableY + 150;             // where things that fall off land
    this.ball = null;
    this.settleT = 0;

    // Pyramid: 3 / 2 / 1, each row standing on the one below.
    this.bottles = [];
    const rows = [3, 2, 1];
    rows.forEach((n, row) => {
      const startX = W / 2 - ((n - 1) * (BW + GAP)) / 2;
      for (let i = 0; i < n; i++) {
        const x = startX + i * (BW + GAP);
        const y = this.tableY - BH / 2 - row * BH;
        this.bottles.push({ x, y, hx: x, hy: y, row, vx: 0, vy: 0, a: 0, va: 0, standing: true, down: false, rest: false });
      }
    });
  }

  handleInput(input) {
    // Hold the ball under your finger while you line up the throw.
    this._holding = this.phase === 'aim' && input.drag && input.drag.active
      ? { x: input.drag.x, y: Math.min(input.drag.y, this.launch.y + 20) }
      : null;
    if (this.phase !== 'aim') return;
    const g = input.consumeGesture();
    if (g && g.type === 'flick' && g.vy < -200) this._throw(g);
  }

  // Direction of the flick picks the column; its speed picks the height.
  _throw(g) {
    const power = Math.max(0, Math.min(1, (Math.abs(g.vy) - 400) / 2600));
    const reach = this.launch.y - this.tableY;
    const lean = (g.dx || g.vx * 0.1) / Math.max(40, -(g.dy || g.vy * 0.1));
    const tx = this.launch.x + lean * reach * 0.85 + (this.rng() - 0.5) * 8;
    const ty = this.tableY + 20 - power * 220 + (this.rng() - 0.5) * 8;
    this.ball = {
      phase: 'fly', t: 0,
      sx: this.launch.x, sy: this.launch.y,
      tx: Math.max(this.tableX0 - 30, Math.min(this.tableX1 + 30, tx)), ty,
      x: this.launch.x, y: this.launch.y, scale: 1.5,
      vx: 0, vy: 0, life: 0, hits: 0, power,
    };
    this.phase = 'fly';
    this.hint = '';
    this.settleT = 0;
    Audio.throw_();
  }

  update(dt) {
    super.update(dt);
    if (this.phase === 'aim' || this.phase === 'done') return;
    const b = this.ball;

    if (b && b.phase === 'fly') {
      // Into the scene on an arc, shrinking with distance.
      b.t += dt;
      const u = Math.min(1, b.t / FLIGHT);
      b.x = b.sx + (b.tx - b.sx) * u;
      b.y = b.sy + (b.ty - b.sy) * u - Math.sin(Math.PI * u) * 70;
      b.scale = 1.5 - 0.6 * u;
      if (u >= 1) {
        // Arrived at the pyramid: now it moves in the bottles' plane for a
        // moment (still carrying its throw), smashing whatever it meets.
        b.phase = 'plane';
        b.vx = (b.tx - b.sx) / FLIGHT * 0.6;
        b.vy = 60;
        b.speed = 520 + b.power * 380;
      }
    } else if (b && b.phase === 'plane') {
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += G * 0.3 * dt;
      for (const bo of this.bottles) {
        if (!bo.standing) continue;
        if (Math.abs(b.x - bo.x) < BW / 2 + BALL_R && Math.abs(b.y - bo.y) < BH / 2 + BALL_R) {
          this._knock(bo, b);
        }
      }
      if (b.life > 0.12 || b.speed < 120) {
        b.phase = 'gone';
        if (!b.hits) Audio.fail();
      }
    } else if (b && b.phase === 'gone') {
      b.life += dt;
      b.scale *= 1 - dt * 3;
      if (b.life > 0.5) this.ball = null;
    }

    this._physics(dt);

    // The throw ends once the ball is gone and everything has stopped moving.
    if (!this.ball || this.ball.phase === 'gone') {
      this.settleT += dt;
      const moving = this.bottles.some((bo) => !bo.standing && !bo.rest);
      if ((!moving && this.settleT > 0.5) || this.settleT > 3.5) this._endThrow();
    }
  }

  // The ball hits a standing bottle: send it tumbling away from the impact.
  _knock(bo, b) {
    const off = (bo.x - b.x) / (BW / 2 + BALL_R);     // -1..1, which side was hit
    // The ball drives it BACK, off the stack and away from you: it flies up
    // a little, tumbling, and drops out of sight behind the table.
    bo.standing = false;
    bo.down = true;
    bo.back = true;
    bo.depth = 1;
    bo.vx = b.vx * 0.3 + off * 120 + (this.rng() - 0.5) * 50;
    bo.vy = -160 - b.speed * 0.15 - this.rng() * 60;
    bo.va = (off >= 0 ? 1 : -1) * (5 + this.rng() * 5);
    b.speed *= 0.72;
    b.vx *= 0.8;
    b.hits++;
    this.particles.burst(bo.x, bo.y, '#ffffff', 6);
    Audio.hit();
  }

  _physics(dt) {
    // Anything that has lost what it was standing on starts to fall.
    for (const bo of this.bottles) {
      if (!bo.standing || bo.row === 0) continue;
      const below = this.bottles.filter((o) => o.row === bo.row - 1 && Math.abs(o.hx - bo.hx) < BW);
      const lost = below.filter((o) => !o.standing);
      if (lost.length) {
        bo.standing = false;
        bo.down = true;
        const side = Math.sign(lost[0].hx - bo.hx) || 1;
        bo.vx = side * 40;
        bo.vy = 0;
        bo.va = side * (2 + this.rng() * 2);
      }
    }

    const hw = BW / 2, hh = BH / 2;
    for (const bo of this.bottles) {
      if (bo.standing || bo.rest) continue;
      bo.vy += G * dt;
      bo.x += bo.vx * dt;
      bo.y += bo.vy * dt;
      bo.a += bo.va * dt;
      if (bo.back) {
        // Knocked backward: shrinks into the distance and falls behind the
        // table, out of everything else's way.
        bo.depth = Math.max(0.7, bo.depth - dt * 0.8);
        if (bo.y > this.tableY + BH) bo.rest = true;
        continue;
      }

      // A tumbling bottle crashing into a standing one takes it down too.
      const sp = Math.hypot(bo.vx, bo.vy);
      if (sp > 220) {
        for (const o of this.bottles) {
          if (!o.standing) continue;
          if (Math.abs(o.x - bo.x) < BW * 0.7 && Math.abs(o.y - bo.y) < BH * 0.6) {
            o.standing = false;
            o.down = true;
            o.vx = bo.vx * 0.6 + Math.sign(o.x - bo.x || 1) * 60;
            o.vy = Math.min(bo.vy * 0.5, -60);
            o.va = Math.sign(o.x - bo.x || 1) * (3 + this.rng() * 3);
            bo.vx *= 0.6;
            Audio.hit();
          }
        }
      }

      // Land on the table (if over it) or the floor, then roll flat.
      const onTable = bo.x > this.tableX0 && bo.x < this.tableX1 && bo.y < this.tableY + 4;
      const surf = onTable ? this.tableY : this.floorY;
      const low = Math.abs(hh * Math.cos(bo.a)) + Math.abs(hw * Math.sin(bo.a));
      if (bo.y + low >= surf && bo.vy > 0) {
        bo.y = surf - low;
        bo.vy = -bo.vy * 0.25;
        bo.vx *= 0.7;
        // Settle toward lying on its side.
        const flat = Math.sign(Math.sin(bo.a) || 1) * Math.PI / 2;
        const k = Math.round((bo.a - flat) / Math.PI);
        bo.va = (flat + k * Math.PI - bo.a) * 6;
        if (Math.abs(bo.vy) < 40 && Math.abs(bo.vx) < 20 && Math.abs(flat + k * Math.PI - bo.a) < 0.08) {
          bo.a = flat + k * Math.PI;
          bo.vx = bo.vy = bo.va = 0;
          bo.y = surf - hw;
          bo.rest = true;
        }
      }
      if (bo.y > this.view.h + 100) bo.rest = true; // fell out of sight
    }
  }

  _endThrow() {
    this.ball = null;
    this.attempts++;
    this.attemptsLeft--;
    this.score = this.bottles.filter((b) => b.down).length;
    const allDown = this.bottles.every((b) => b.down);
    if (allDown) {
      this.particles.text(this.view.w / 2, this.tableY - 200, 'ALL DOWN!', '#ffd14d', 30);
      Audio.win();
    }
    if (this.attemptsLeft <= 0 || allDown) {
      this.done = true;
      this.phase = 'done';
    } else {
      this.phase = 'aim';
      this.hint = 'Flick at the bottles — harder = higher';
    }
  }

  render(ctx) {
    const W = this.view.w, H = this.view.h;
    const t = this.t || 0;
    const tableY = H * 0.42 + 26; // bottom of the pyramid's base row
    const counterY = H - 122;
    drawBoothBack(ctx, W, H, 'blue', t);
    drawFloor(ctx, W, tableY + 70, counterY);
    drawSign(ctx, W / 2, H * 0.42 - 205, 'KNOCK \'EM ALL DOWN!', '#ffcf3f', '#1d3f8f', 15);

    // Bottles knocked backward fly behind the stack and drop behind the table.
    for (const bo of this.bottles) if (bo.back && !bo.rest) this._drawMilkBottle(ctx, bo);

    // Display table with a ruffled cloth.
    const tw = W * 0.74, tx = W / 2 - tw / 2;
    ctx.fillStyle = '#6b3a14';
    ctx.fillRect(tx + 10, tableY + 50, 10, 30);
    ctx.fillRect(tx + tw - 20, tableY + 50, 10, 30);
    const top = ctx.createLinearGradient(0, tableY - 4, 0, tableY + 10);
    top.addColorStop(0, '#f2c27f');
    top.addColorStop(1, '#a5662e');
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(tx + 14, tableY - 6);
    ctx.lineTo(tx + tw - 14, tableY - 6);
    ctx.lineTo(tx + tw, tableY + 8);
    ctx.lineTo(tx, tableY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tx, tableY + 8, tw, 44);
    ctx.fillStyle = '#2f6fe0';
    for (let x = tx; x < tx + tw; x += 20) ctx.fillRect(x, tableY + 8, 10, 44);
    ctx.fillStyle = '#ffcf3f';
    for (let x = tx + 6; x < tx + tw; x += 14) {
      ctx.beginPath();
      ctx.arc(x, tableY + 52, 6, 0, Math.PI);
      ctx.fill();
    }

    // A miss sails on behind the stack; a hit is drawn in front of it.
    const b = this.ball;
    if (b && b.phase === 'gone') drawBaseball(ctx, b.x, b.y, BALL_R * b.scale, t * 14);
    const order = [...this.bottles].sort((a, c) => (a.standing === c.standing ? 0 : a.standing ? -1 : 1));
    for (const bo of order) if (!bo.back) this._drawMilkBottle(ctx, bo);
    if (b && b.phase !== 'gone') {
      contactShadow(ctx, b.x, Math.min(this.tableY + 30, b.y + 60 * b.scale), 10 * b.scale, 3 * b.scale, 0.2);
      drawBaseball(ctx, b.x, b.y, BALL_R * b.scale, t * 14);
    }

    drawCounter(ctx, W, H, counterY, 'blue');
    // Balls waiting on the counter (one is in your hand while you aim).
    const inHand = this.phase === 'aim' ? 1 : 0;
    const left = this.attemptsLeft - (this.ball ? 1 : 0) - (this._holding ? 1 : 0);
    for (let i = 0; i < left; i++) {
      const bx = this.launch.x + (i - (left - 1) / 2) * 34;
      contactShadow(ctx, bx, counterY + 4, 14, 4, 0.35);
      drawBaseball(ctx, bx, counterY - 12, 14, 0.4 + i);
    }
    if (this._holding && inHand) drawBaseball(ctx, this._holding.x, this._holding.y - 30, 20, 0);

    // Live score = bottles currently down.
    this.score = this.bottles.filter((bo) => bo.down).length;
    this.particles.render(ctx);
    this._drawHud(ctx);
  }

  // Classic carnival milk bottle: white glass, red bands, foil cap.
  // Drawn centred on (x, y) and rotated by a, filling a BW x BH box.
  _drawMilkBottle(ctx, b) {
    const r = BH / 2.45;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a || 0);
    if (b.back) ctx.scale(b.depth, b.depth);
    ctx.translate(0, BH / 2 - r);
    const bodyW = BW, bodyTop = -r * 0.55, bottom = r;
    const neckW = r * 0.8, neckTop = -r * 1.45;
    // Silhouette.
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, bottom);
    ctx.lineTo(-bodyW / 2, bodyTop);
    ctx.quadraticCurveTo(-bodyW / 2, bodyTop - r * 0.35, -neckW / 2, bodyTop - r * 0.5);
    ctx.lineTo(-neckW / 2, neckTop);
    ctx.lineTo(neckW / 2, neckTop);
    ctx.lineTo(neckW / 2, bodyTop - r * 0.5);
    ctx.quadraticCurveTo(bodyW / 2, bodyTop - r * 0.35, bodyW / 2, bodyTop);
    ctx.lineTo(bodyW / 2, bottom);
    ctx.closePath();
    const g = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
    g.addColorStop(0, '#c9d2dc');
    g.addColorStop(0.35, '#ffffff');
    g.addColorStop(1, '#aab4c0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,50,70,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Red bands.
    ctx.fillStyle = '#e0303e';
    ctx.fillRect(-bodyW / 2, r * 0.05, bodyW, r * 0.32);
    ctx.fillRect(-bodyW / 2, r * 0.55, bodyW, r * 0.14);
    // Foil cap.
    ctx.fillStyle = '#ffcf3f';
    rr(ctx, -neckW / 2 - 1, neckTop - 3, neckW + 2, 6, 2);
    ctx.fill();
    // Glass highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-bodyW * 0.3, bodyTop + 2, r * 0.16, r * 0.45);
    ctx.restore();
  }

  getResult() {
    const down = this.bottles.filter((b) => b.down).length;
    const allDown = down === this.bottles.length;
    return {
      gameKey: 'bottles',
      score: down,
      hits: down,
      attempts: this.attempts,
      won: down > 0,
      bigWin: allDown,
      coinBonus: allDown ? 30 : 0,
    };
  }
}
