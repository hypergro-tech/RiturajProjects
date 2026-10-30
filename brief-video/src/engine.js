/* BRIEF — deterministic motion engine.
   The whole film is a pure function of time: BRIEF.renderAt(t) poses every element for second t.
   Nothing animates on its own (no CSS transitions or keyframes), so frame-by-frame capture is exact. */
(function () {
  'use strict';

  const E = {
    linear: (t) => t,
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutQuint: (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  /** Eased 0→1 progress of t through [start, start + dur]. */
  const P = (t, start, dur, ease = E.outCubic) => ease(clamp((t - start) / dur));

  const SVGNS = 'http://www.w3.org/2000/svg';
  function append(el, kids) {
    for (const k of kids.flat()) {
      if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return el;
  }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'style') Object.assign(el.style, v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v);
    }
    return append(el, kids);
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return append(el, kids);
  }
  function attrs(el, a) {
    for (const k in a) el.setAttribute(k, a[k]);
  }

  /** Opacity + translate/scale in one write. Works for HTML and SVG elements. */
  function pose(el, o, x = 0, y = 0, sc = 1) {
    el.style.opacity = o <= 0.0005 ? '0' : o >= 0.9995 ? '1' : o.toFixed(4);
    el.style.transform =
      x || y || sc !== 1 ? `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${sc.toFixed(4)})` : '';
  }

  /** Split [[text, className], ...] into masked words. A newline inside text forces a line break. */
  function wordify(parent, segs) {
    const out = [];
    for (const [text, cls] of segs) {
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          parent.append(part.includes('\n') ? h('br') : document.createTextNode(' '));
          continue;
        }
        const inner = h('span', { class: 'wi' + (cls ? ' ' + cls : '') }, part);
        parent.append(h('span', { class: 'w' }, inner));
        out.push(inner);
      }
    }
    return out;
  }

  /** Masked rise-in starting at tin, rise-out starting at tout (null = stays on screen). */
  function rise(ws, t, tin, tout, o = {}) {
    const st = o.stagger ?? 0.055, d = o.dur ?? 0.9;
    const ost = o.outStagger ?? 0.02, od = o.outDur ?? 0.45, dist = o.dist ?? 120;
    for (let i = 0; i < ws.length; i++) {
      const kin = P(t, tin + i * st, d, E.outExpo);
      const kout = tout == null ? 0 : P(t, tout + i * ost, od, E.inCubic);
      const y = (1 - kin) * dist - kout * dist;
      ws[i].style.transform = y ? `translateY(${y.toFixed(3)}%)` : '';
    }
  }

  /** Absolutely positioned text block: {x|right|center, y, w, cls, style, segs|txt}. */
  function block(parent, o) {
    const el = h('div', { class: 'abs ' + (o.cls || '') });
    const st = el.style;
    if (o.center != null) {
      const w = o.w || 1920;
      st.left = (o.center === true ? 960 : o.center) - w / 2 + 'px';
      st.width = w + 'px';
      st.textAlign = 'center';
    } else if (o.right != null) {
      st.right = o.right + 'px';
      st.textAlign = 'right';
      if (o.w) st.width = o.w + 'px';
    } else {
      st.left = o.x + 'px';
      if (o.w) st.width = o.w + 'px';
    }
    st.top = o.y + 'px';
    if (o.style) Object.assign(st, o.style);
    const ws = o.segs ? wordify(el, o.segs) : null;
    if (o.txt != null) el.textContent = o.txt;
    parent.append(el);
    return { el, ws };
  }

  /** Seeded film grain, generated once and tiled (keeps navy gradients from banding in H.264). */
  function grain() {
    let a = 0x9e3779b9;
    const rnd = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd();
      const light = v > 0.5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 40);
    }
    ctx.putImageData(img, 0, 0);
    return `url(${c.toDataURL('image/png')})`;
  }

  const stage = document.getElementById('stage');
  stage.style.setProperty('--grain', grain());

  const scenes = [];
  const readyFns = [];

  /** Register a scene active on [start, end). build(root) returns render(localTime, globalTime). */
  function scene(start, end, build) {
    const root = h('div', { class: 'scene' });
    stage.append(root);
    const sc = { start, end, root, on: null };
    sc.render = build(root, sc);
    scenes.push(sc);
    return sc;
  }

  function renderAt(t) {
    for (const sc of scenes) {
      const on = t >= sc.start && t < sc.end;
      if (on !== sc.on) {
        sc.root.style.visibility = on ? 'visible' : 'hidden';
        sc.on = on;
      }
      if (on && sc.render) sc.render(t - sc.start, t);
    }
  }

  async function boot() {
    const sample = 'AaBb ₹→·—’ 0123';
    const faces = [
      '400 40px "Inter Tight"', '500 40px "Inter Tight"', '600 40px "Inter Tight"',
      '700 40px "Inter Tight"', '800 40px "Inter Tight"', 'italic 400 40px "Inter Tight"',
      '400 40px "Source Serif 4"', '600 40px "Source Serif 4"', '700 40px "Source Serif 4"',
      'italic 400 40px "Source Serif 4"',
      '400 40px "JetBrains Mono"', '500 40px "JetBrains Mono"', '700 40px "JetBrains Mono"',
    ];
    await Promise.all(faces.map((f) => document.fonts.load(f, sample)));
    await document.fonts.ready;
    // Show everything once so measurements see real layout, then pose frame 0.
    for (const sc of scenes) sc.root.style.visibility = 'visible';
    for (const fn of readyFns) fn();
    renderAt(0);
    return true;
  }

  window.BRIEF = {
    E, clamp, lerp, P, h, s, attrs, pose, wordify, rise, block, scene, stage, renderAt,
    DURATION: 90,
    onReady: (fn) => readyFns.push(fn),
    start() {
      this.ready = boot();
      return this.ready;
    },
  };
})();
