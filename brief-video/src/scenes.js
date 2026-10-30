/* BRIEF — 90-second silent explainer. Timeline + choreography.
   Story: hook → BRIEF reveal → four verticals → bridge → four moats (deck pp. 30–33) → proof → end card. */
(function () {
  'use strict';
  const { E, P, clamp, lerp, h, s, attrs, pose, rise, block, scene, stage, onReady } = window.BRIEF;

  const C = {
    navy: '#0A1F44', gold: '#B89241', gold2: '#C9A95C', slate: '#4A5A75', mute: '#6B7A92',
    line: '#D9DEE6', card: '#E2E6EC', wire: '#BCC4D0', rust: '#B9533C', faded: '#A3ADBB',
  };
  const fx = (n) => n.toFixed(2);
  const rad = (d) => (d * Math.PI) / 180;

  // ───────────── Timeline (seconds) ─────────────
  const T = {
    hook: [0, 7.0],
    name: [5.9, 10.9],
    paper: [10.9, 79.9],
    verticals: [10.0, 24.6],
    bridge: [24.2, 28.0],
    chrome: [27.5, 79.9],
    moats: [[27.7, 40.2], [40.0, 52.5], [52.3, 64.8], [64.6, 79.9]],
    outro: [79.0, 90.01],
  };

  // ───────────── shared helpers ─────────────
  const eyebrow = (parent, text, pos) =>
    parent.appendChild(h('div', { class: 'abs eyebrow', style: pos }, h('span', { class: 'eb-dot' }), text));

  /** A dot that repeatedly travels a → b. */
  function courier(parent, a, b, { start, period, offset = 0, travel, r = 3.5, color = C.gold }) {
    const g = s('g', { opacity: 0 });
    g.append(s('circle', { r: r * 2.6, fill: color, opacity: 0.16 }), s('circle', { r, fill: color }));
    parent.append(g);
    return (lt, gate = 1) => {
      const local = lt - start - offset;
      if (local < 0 || gate <= 0.001) return g.setAttribute('opacity', 0);
      const ph = local % period;
      if (ph > travel) return g.setAttribute('opacity', 0);
      const k = E.inOutSine(ph / travel);
      attrs(g, {
        transform: `translate(${fx(lerp(a.x, b.x, k))},${fx(lerp(a.y, b.y, k))})`,
        opacity: (Math.pow(Math.sin((Math.PI * ph) / travel), 0.6) * gate).toFixed(3),
      });
    };
  }
  /** Straight line drawn from (x1,y1) toward (x2,y2) by k. */
  const drawLine = (el, a, b, k) => attrs(el, { x1: a.x, y1: a.y, x2: fx(lerp(a.x, b.x, k)), y2: fx(lerp(a.y, b.y, k)), opacity: k > 0 ? 1 : 0 });
  /** Circle stroke drawn clockwise from 12 o'clock. */
  function ringDraw(el, k) {
    const c = 2 * Math.PI * +el.getAttribute('r');
    attrs(el, { 'stroke-dasharray': `${fx(c)} ${fx(c)}`, 'stroke-dashoffset': fx(c * (1 - k)), opacity: k > 0 ? 1 : 0 });
  }

  // ───────────── Backdrops ─────────────
  stage.append(h('div', { class: 'abs fill bg-navy' }, h('div', { class: 'abs fill grain' })));

  scene(0, 10.9, (root) => {
    const gs = [480, 960, 1440].map((x) => root.appendChild(h('div', { class: 'abs guide', style: { left: x + 'px' } })));
    return (lt) => gs.forEach((g, i) => pose(g, P(lt, 0.1 + i * 0.12, 1.4), 0, (1 - P(lt, 0.1 + i * 0.12, 1.6, E.outExpo)) * 80));
  });

  // ───────────── 1 · Hook ─────────────
  scene(...T.hook, (root) => {
    const wrap = root.appendChild(h('div', { class: 'abs fill' }));
    const eb = block(wrap, { x: 160, y: 352, cls: 'mono', style: { font: '500 20px var(--mono)', color: C.gold2, letterSpacing: '.24em' }, txt: 'Hypergro.ai  ·  2026' });
    const l1 = block(wrap, { x: 160, y: 398, cls: 'hook-line white', segs: [['Every campaign starts with a brief.']] });
    const l2 = block(wrap, { x: 160, y: 510, cls: 'hook-line', style: { color: '#7F93B3' }, segs: [['Then it waits on']] });
    const rot = h('span', { class: 'rot' });
    l2.el.append(document.createTextNode(' '), rot);
    const rw = ['research.', 'agencies.', 'media buyers.', 'telecallers.'].map((w) => rot.appendChild(h('span', { class: 'rot-w' }, w)));
    return (lt) => {
      const ke = P(lt, 0.3, 0.7);
      pose(eb.el, ke, 0, 10 * (1 - ke));
      rise(l1.ws, lt, 0.5, null, { stagger: 0.06 });
      l1.el.style.opacity = (1 - 0.6 * P(lt, 2.5, 0.6, E.inOutCubic)).toFixed(3);
      rise(l2.ws, lt, 2.55, null, { stagger: 0.06 });
      rw.forEach((w, j) => {
        const st = 3.0 + j * 0.78;
        const kin = P(lt, st, 0.5, E.outExpo);
        const kout = j < rw.length - 1 ? P(lt, st + 0.78, 0.4, E.inExpo) : 0;
        w.style.transform = `translateY(${fx((1 - kin) * 120 - kout * 120)}%)`;
      });
      const ko = P(lt, 6.05, 0.6, E.inCubic);
      pose(wrap, 1 - ko, 0, -50 * ko);
    };
  });

  // ───────────── 2 · Name reveal ─────────────
  scene(...T.name, (root) => {
    const wrap = root.appendChild(h('div', { class: 'abs fill' }));
    const intro = block(wrap, { center: true, y: 318, cls: 'mono', style: { font: '500 22px var(--mono)', color: C.gold2, letterSpacing: '.5em', paddingLeft: '.5em' }, txt: 'Introducing' });
    const mark = wrap.appendChild(h('div', { class: 'abs wordmark', style: { left: '0px', top: '360px', width: '1920px', textAlign: 'center' } }));
    const letters = [...'BRIEF'].map((ch) => {
      const inner = h('span', { class: 'wi' }, ch);
      mark.append(h('span', { class: 'w' }, inner));
      return inner;
    });
    const dot = mark.appendChild(h('span', { class: 'mark-dot' }));
    mark.style.transform = 'translateX(-28px)';
    const rule = wrap.appendChild(h('div', { class: 'abs', style: { left: '890px', top: '712px', width: '140px', height: '2px', background: C.gold2 } }));
    const tag = block(wrap, { center: true, y: 744, cls: 'name-tag', segs: [['The agentic execution layer for brand growth.']] });
    return (lt) => {
      const ki = P(lt, 0.25, 0.6);
      pose(intro.el, ki, 0, 8 * (1 - ki));
      rise(letters, lt, 0.6, null, { stagger: 0.075, dur: 1.0 });
      const kd = P(lt, 1.3, 0.5, E.outBack);
      dot.style.transform = `scale(${fx(Math.max(0, kd))})`;
      rule.style.transform = `scaleX(${fx(P(lt, 1.55, 0.7, E.outExpo))})`;
      rise(tag.ws, lt, 1.8, null, { stagger: 0.045 });
      const kz = P(lt, 4.0, 1.0, E.inOutCubic);
      pose(wrap, 1 - 0.5 * kz, 0, 0, 1 + 0.03 * kz);
    };
  });

  // Paper backdrop for the explanatory middle of the film.
  scene(...T.paper, (root) => {
    root.classList.add('bg-paper');
    return null;
  });

  // ───────────── 3 · Four verticals ─────────────
  const PILLARS = [
    { n: '01', tag: 'Listens', title: 'Research', desc: 'Synthetic audience twins pre-test every concept before launch.', stat: 'Hours', cap: 'Question to insight — not months' },
    { n: '02', tag: 'Makes', title: 'Creative', desc: 'Scripts, videos, statics and copy in 22+ Indic languages. Brand-safe.', stat: '~5 min', cap: 'From brief to on-brand asset' },
    { n: '03', tag: 'Spends', title: 'Media', desc: 'Buys across Meta, Google and programmatic. Pauses what isn’t working.', stat: 'Hourly', cap: 'Bids & pacing re-tuned' },
    { n: '04', tag: 'Talks', title: 'Voice', desc: 'Calls warm leads, qualifies them and hands off to your team to close.', stat: '<30 sec', cap: 'To call back a warm lead' },
  ];

  scene(...T.verticals, (root) => {
    const panels = [0, 1, 2, 3].map((i) =>
      root.appendChild(h('div', { class: 'abs panel paper', style: { left: i * 480 + 'px', backgroundPosition: `${-i * 480}px 0px` } })));
    const wrap = root.appendChild(h('div', { class: 'abs fill' }));
    const ebL = eyebrow(wrap, 'How BRIEF works', { left: '120px', top: '84px' });
    const ebR = block(wrap, { right: 120, y: 84, cls: 'eyebrow', txt: 'The four verticals' });
    const hair = wrap.appendChild(h('div', { class: 'abs', style: { left: '120px', top: '128px', width: '1680px', height: '1px', background: C.line, transformOrigin: '0 0' } }));
    const title = block(wrap, { x: 120, y: 152, cls: 'title', segs: [['One system. '], ['Four verticals.', 'gold']] });

    const cards = PILLARS.map((p, i) => {
      const el = wrap.appendChild(h('div', { class: 'abs pillar', style: { left: 120 + i * 435 + 'px' } }));
      const bar = el.appendChild(h('div', { class: 'abs bar' }));
      const num = el.appendChild(h('div', { class: 'abs num' }, p.n));
      const tag = el.appendChild(h('div', { class: 'abs tag' }, p.tag));
      const tl = block(el, { x: 36, y: 82, cls: 'ptitle', segs: [[p.title]] });
      const desc = el.appendChild(h('div', { class: 'abs desc' }, p.desc));
      const dv = el.appendChild(h('div', { class: 'abs div' }));
      const st = block(el, { x: 36, y: 404, cls: 'stat', segs: [[p.stat]] });
      const cap = el.appendChild(h('div', { class: 'abs cap' }, p.cap));
      tl.el.className = 'abs ptitle';
      st.el.className = 'abs stat';
      return { el, bar, num, tag, tl, desc, dv, st, cap };
    });

    // feedback loop: from Voice back to Research
    const svg = wrap.appendChild(s('svg', { class: 'layer', viewBox: '0 0 1920 1080' }));
    const clip = s('clipPath', { id: 'loopclip' }, s('rect', { x: 1640, y: 840, width: 0, height: 80 }));
    svg.append(s('defs', {}, clip));
    const loop = svg.appendChild(s('path', { d: 'M1612 862 V893 H307 V870', fill: 'none', stroke: C.gold, 'stroke-width': 2, 'stroke-dasharray': '7 7', 'clip-path': 'url(#loopclip)' }));
    const arrow = svg.appendChild(s('path', { d: 'M299 874 L307 860 L315 874 Z', fill: C.gold, opacity: 0 }));
    const runners = [0, 1, 2].map(() => svg.appendChild(s('circle', { r: 4, fill: C.gold, opacity: 0 })));
    let loopLen = 1;
    onReady(() => { loopLen = loop.getTotalLength(); });
    const bar = wrap.appendChild(h('div', { class: 'abs loopbar' },
      h('span', { class: 'gold2' }, 'Every result feeds the next brief.'), h('span', {}, '  The loop compounds.')));
    const barText = [...bar.children];

    return (lt) => {
      panels.forEach((p, i) => (p.style.transform = `translateY(${fx(1080 * (1 - P(lt, i * 0.07, 0.75, E.inOutQuint)))}px)`));
      const out = P(lt, 13.9, 0.6, E.inCubic);
      const kc = P(lt, 0.85, 0.6);
      pose(ebL, kc * (1 - out));
      pose(ebR.el, kc * (1 - out));
      hair.style.transform = `scaleX(${fx(P(lt, 0.8, 0.9, E.outExpo))})`;
      hair.style.opacity = 1 - out;
      rise(title.ws, lt, 1.0, 13.9, { stagger: 0.07 });

      cards.forEach((c, i) => {
        const si = 1.5 + i * 1.7;
        const kr = P(lt, si, 0.8, E.outExpo);
        c.el.style.clipPath = kr >= 1 ? 'none' : `inset(${fx((1 - kr) * 100)}% -40px -60px -40px)`;
        const ko = P(lt, 13.9 + i * 0.05, 0.55, E.inCubic);
        pose(c.el, kr > 0 ? 1 - ko : 0, 0, 40 * (1 - kr) + 40 * ko);
        c.bar.style.transform = `scaleX(${fx(P(lt, si + 0.35, 0.6, E.outExpo))})`;
        const kn = P(lt, si + 0.35, 0.5);
        pose(c.num, kn);
        pose(c.tag, kn);
        rise(c.tl.ws, lt, si + 0.4, null);
        const kd = P(lt, si + 0.6, 0.6);
        pose(c.desc, kd, 0, 14 * (1 - kd));
        c.dv.style.transform = `scaleX(${fx(P(lt, si + 0.75, 0.6, E.outExpo))})`;
        rise(c.st.ws, lt, si + 0.85, null);
        pose(c.cap, P(lt, si + 1.05, 0.5));
      });

      const kl = P(lt, 8.3, 1.2, E.inOutCubic);
      const w = 1370 * kl;
      attrs(clip.firstChild, { x: fx(1640 - w), width: fx(w) });
      loop.style.opacity = 1 - out;
      attrs(arrow, { opacity: (P(lt, 9.4, 0.2) * (1 - out)).toFixed(3) });
      runners.forEach((r, j) => {
        if (lt < 9.5 || out >= 1) return attrs(r, { opacity: 0 });
        const d = ((lt - 9.5) * 300 + (j * loopLen) / 3) % loopLen;
        const p = loop.getPointAtLength(d);
        attrs(r, { cx: fx(p.x), cy: fx(p.y), opacity: (P(lt, 9.5, 0.5) * (1 - out)).toFixed(3) });
      });
      const kb = P(lt, 9.3, 0.8, E.inOutCubic);
      bar.style.clipPath = `inset(0 ${fx(50 * (1 - kb))}% 0 ${fx(50 * (1 - kb))}%)`;
      pose(bar, kb > 0 ? 1 - out : 0, 0, 20 * out);
      const kt = P(lt, 9.85, 0.6);
      barText.forEach((t) => (t.style.opacity = kt.toFixed(3)));
    };
  });

  // ───────────── 4 · Bridge ─────────────
  scene(...T.bridge, (root) => {
    const a = block(root, { center: true, y: 404, cls: 'title', segs: [['Four verticals do the work.']] });
    const b = block(root, { center: true, y: 500, cls: 'title gold', segs: [['Four moats make it compound.']] });
    a.el.style.fontSize = b.el.style.fontSize = '84px';
    return (lt) => {
      rise(a.ws, lt, 0.3, 3.1, { stagger: 0.06 });
      rise(b.ws, lt, 0.95, 3.15, { stagger: 0.06 });
    };
  });

  // ───────────── 5 · Moats: persistent chrome ─────────────
  const MOAT_NAMES = ['Brand memory', 'Creative intelligence', 'Self-improving engine', 'Accumulated intelligence'];
  scene(...T.chrome, (root) => {
    const ebL = eyebrow(root, 'BRIEF — four moats', { left: '120px', top: '84px' });
    const right = root.appendChild(h('div', { class: 'abs', style: { right: '120px', top: '84px', width: '900px', height: '30px' } }));
    const labels = MOAT_NAMES.map((n, i) =>
      right.appendChild(h('div', { class: 'abs eyebrow', style: { right: '0px', top: '0px' } }, `Moat 0${i + 1} / 04 · ${n}`)));
    const hair = root.appendChild(h('div', { class: 'abs', style: { left: '120px', top: '128px', width: '1680px', height: '1px', background: C.line, transformOrigin: '0 0' } }));
    const prog = root.appendChild(h('div', { class: 'abs', style: { left: '120px', top: '127px', width: '1680px', height: '3px', background: C.gold, transformOrigin: '0 0' } }));
    const ticks = [1, 2, 3].map((q) => root.appendChild(h('div', { class: 'abs', style: { left: 120 + q * 420 + 'px', top: '123px', width: '1px', height: '11px', background: C.wire } })));
    const foot = root.appendChild(h('div', { class: 'abs', style: { left: '120px', top: '940px', width: '1680px', height: '1px', background: C.line, transformOrigin: '0 0' } }));
    return (lt, t) => {
      pose(ebL, P(lt, 0.1, 0.6));
      const kh = P(lt, 0, 0.9, E.outExpo);
      hair.style.transform = `scaleX(${fx(kh)})`;
      foot.style.transform = `scaleX(${fx(P(lt, 0.2, 0.9, E.outExpo))})`;
      ticks.forEach((tk) => pose(tk, P(lt, 0.5, 0.5)));
      let progress = 0;
      labels.forEach((lab, i) => {
        const s0 = T.moats[i][0], s1 = i < 3 ? T.moats[i + 1][0] : 79.0;
        const kin = i === 0 ? P(t, s0 - 0.1, 0.5) : P(t, s0, 0.5, E.outCubic);
        const kout = i < 3 ? P(t, s1, 0.35, E.inCubic) : 0;
        pose(lab, kin * (1 - kout), 0, 12 * (1 - kin) - 12 * kout);
        if (t >= s0) progress = (i + clamp((t - s0) / (s1 - s0))) / 4;
      });
      prog.style.transform = `scaleX(${fx(progress)})`;
    };
  });

  /** Common moat frame: label, headline, closing line, diagram svg. */
  function moat(i, cfg, build) {
    const [start, end] = T.moats[i];
    const dur = end - start;
    scene(start, end, (root) => {
      const lab = block(root, { x: 120, y: 162, cls: 'moat-label', txt: cfg.label });
      const hd = block(root, { x: 120, y: 190, w: 1700, cls: 'headline', segs: cfg.head });
      const cl = block(root, { x: 120, y: 966, cls: 'closing', segs: cfg.close });
      const svg = root.appendChild(s('svg', { class: 'layer', viewBox: '0 0 1920 1080' }));
      const draw = build(svg, root);
      const out = cfg.noExit ? null : dur - 0.6;
      return (lt) => {
        const ko = out == null ? 0 : P(lt, out, 0.5, E.inCubic);
        pose(lab.el, P(lt, 0.1, 0.5) * (1 - ko));
        rise(hd.ws, lt, 0.2, out, { stagger: 0.05 });
        rise(cl.ws, lt, cfg.closeAt, out, { stagger: 0.045 });
        pose(svg, 1 - ko, 0, -14 * ko);
        draw(lt);
      };
    });
  }

  // ───────────── Moat 01 · Brand memory (deck p.30) ─────────────
  moat(0, {
    label: 'The brand memory moat',
    head: [['BRIEF becomes your brand’s '], ['memory layer', 'gold'], ['.']],
    close: [['Generic AI creates content. '], ['BRIEF creates like your brand.', 'gold']],
    closeAt: 6.0,
  }, (svg) => {
    const cx = 960, cy = 640;
    const capL = svg.appendChild(s('text', { x: 606, y: 368, 'text-anchor': 'end', class: 'cap' }, 'INPUTS · BRAND SIGNALS'));
    const capR = svg.appendChild(s('text', { x: 1312, y: 368, class: 'cap' }, 'OUTPUTS · BRAND-SAFE WORK'));
    const ringDot = svg.appendChild(s('circle', { cx, cy, r: 198, fill: 'none', stroke: '#C3CBD6', 'stroke-width': 1.5, 'stroke-dasharray': '1 7', 'stroke-linecap': 'round' }));
    const ringGrey = svg.appendChild(s('circle', { cx, cy, r: 178, fill: 'none', stroke: '#D3D9E1', 'stroke-width': 1.25, transform: `rotate(-90 ${cx} ${cy})` }));
    const coreFill = svg.appendChild(s('circle', { cx, cy, r: 158, fill: '#FBFBFC' }));
    const glow = svg.appendChild(s('circle', { cx, cy, r: 158, fill: 'none', stroke: C.gold, 'stroke-width': 12, opacity: 0 }));
    const ringGold = svg.appendChild(s('circle', { cx, cy, r: 158, fill: 'none', stroke: C.gold, 'stroke-width': 2.25, transform: `rotate(-90 ${cx} ${cy})` }));
    const core = svg.appendChild(s('g', {},
      s('text', { x: cx + 3, y: cy - 48, 'text-anchor': 'middle', class: 'core-caps' }, 'BRIEF'),
      s('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', class: 'core-title' }, 'Brand'),
      s('text', { x: cx, y: cy + 58, 'text-anchor': 'middle', class: 'core-title' }, 'Memory Core')));

    const convL = { x: cx - 178, y: cy }, convR = { x: cx + 178, y: cy };
    const inputs = ['Brand guidelines', 'Tone of voice', 'Approved creatives', 'Rejected creatives', 'Compliance rules', 'Product claims', 'Audience preferences', 'Historical performance']
      .map((label, i) => {
        const y = 410 + (i * 460) / 7;
        const a = { x: 614, y };
        const line = svg.insertBefore(s('line', { stroke: C.wire, 'stroke-width': 1.25 }), coreFill);
        const dot = svg.appendChild(s('circle', { cx: 608, cy: y, r: 0, fill: C.gold }));
        const txt = svg.appendChild(s('text', { x: 590, y: y + 9, 'text-anchor': 'end', class: 'lbl' }, label));
        const run = courier(svg, a, convL, { start: 2.9, period: 2.2, offset: i * 0.27, travel: 1.0 });
        return { a, line, dot, txt, run, i };
      });
    const outputs = ['On-brand static ads', 'Brand-safe creatives', 'Correct messaging', 'Faster approvals', 'Higher consistency']
      .map((label, j) => {
        const y = 450 + j * 95;
        const b = { x: 1306, y };
        const line = svg.insertBefore(s('line', { stroke: C.gold, 'stroke-width': 1.25, 'stroke-opacity': 0.8 }), coreFill);
        const dot = svg.appendChild(s('circle', { cx: 1312, cy: y, r: 0, fill: C.gold }));
        const txt = svg.appendChild(s('text', { x: 1332, y: y + 9, class: 'lbl' }, label));
        const run = courier(svg, convR, b, { start: 4.6, period: 2.0, offset: j * 0.33, travel: 0.9 });
        return { b, line, dot, txt, run, j };
      });

    return (lt) => {
      pose(capL, P(lt, 1.3, 0.6));
      pose(capR, P(lt, 3.3, 0.6));
      ringDraw(ringGold, P(lt, 0.9, 1.2, E.inOutCubic));
      ringDraw(ringGrey, P(lt, 1.0, 1.1, E.inOutCubic));
      attrs(ringDot, { opacity: P(lt, 1.3, 0.8).toFixed(3), transform: `rotate(${fx(lt * 6)} ${cx} ${cy})` });
      coreFill.setAttribute('opacity', P(lt, 0.9, 0.6).toFixed(3));
      const kc = P(lt, 1.35, 0.6);
      pose(core, kc, 0, 10 * (1 - kc));
      let pulse = 0;
      for (const it of inputs) {
        const st = 1.6 + it.i * 0.11;
        const kt = P(lt, st, 0.5);
        pose(it.txt, kt, 16 * (1 - kt));
        it.dot.setAttribute('r', fx(4.5 * Math.max(0, P(lt, st, 0.4, E.outBack))));
        drawLine(it.line, it.a, convL, P(lt, st + 0.15, 0.7));
        it.run(lt);
        const since = lt - 2.9 - it.i * 0.27;
        if (since > 1.0) {
          const ph = since % 2.2;
          if (ph > 1.0) pulse += Math.exp(-(ph - 1.0) * 7);
        }
      }
      attrs(glow, { opacity: (Math.min(1, pulse) * 0.14).toFixed(3) });
      ringGold.setAttribute('stroke-width', fx(2.25 + Math.min(1, pulse) * 1.2));
      for (const o of outputs) {
        const st = 3.4 + o.j * 0.13;
        drawLine(o.line, convR, o.b, P(lt, st, 0.6));
        o.dot.setAttribute('r', fx(4.5 * Math.max(0, P(lt, st + 0.4, 0.4, E.outBack))));
        const kt = P(lt, st + 0.45, 0.5);
        pose(o.txt, kt, -16 * (1 - kt));
        o.run(lt);
      }
    };
  });

  // ───────────── Moat 02 · Creative intelligence (deck p.31) ─────────────
  moat(1, {
    label: 'The creative intelligence moat',
    head: [['BRIEF learns what creative works\n'], ['by industry, audience and channel.', 'gold']],
    close: [['Marketing moves from opinion '], ['to pattern recognition.', 'gold']],
    closeAt: 7.6,
  }, (svg) => {
    const cx = 960, cy = 668, R = 172;
    const NODES = ['Hook', 'Visual', 'Offer', 'CTA', 'Tone', 'Creator', 'Format', 'Audience', 'Channel', 'Outcome'];
    const pos = NODES.map((_, i) => {
      const a = rad(-90 + i * 36);
      return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), c: Math.cos(a), sn: Math.sin(a) };
    });
    const edges = [];
    for (let i = 0; i < 10; i++) edges.push([i, (i + 1) % 10], [i, (i + 2) % 10], [i, (i + 3) % 10]);
    for (let i = 0; i < 5; i++) edges.push([i, i + 5]);
    const edgeEls = edges.map(() => svg.appendChild(s('line', { stroke: '#C9D0DA', 'stroke-width': 1, opacity: 0 })));
    const pathHL = svg.appendChild(s('path', { fill: 'none', stroke: C.gold, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0 }));

    const capL = svg.appendChild(s('text', { x: 150, y: 470, class: 'cap' }, 'INDUSTRY · CONTEXT'));
    const capR = svg.appendChild(s('text', { x: 1440, y: 470, class: 'cap' }, 'DECISIONS · OUTPUTS'));
    const convL = { x: 660, y: cy }, convR = { x: 1260, y: cy };
    const busL = svg.appendChild(s('line', { stroke: C.wire, 'stroke-width': 1.25 }));
    const busR = svg.appendChild(s('line', { stroke: C.wire, 'stroke-width': 1.25 }));
    const ys = [-2, -1, 0, 1, 2].map((k) => cy + k * 68);
    const pills = ['Skincare', 'Fintech', 'Edtech', 'Travel', 'D2C retail'].map((label, k) => {
      const y = ys[k];
      const fan = svg.appendChild(s('line', { stroke: '#B5BECB', 'stroke-width': 1.5, 'stroke-dasharray': '1.5 6', 'stroke-linecap': 'round' }));
      const g = svg.appendChild(s('g', {}));
      const rect = g.appendChild(s('rect', { x: 150, y: y - 25, width: 230, height: 50, rx: 25, fill: '#FAFBFC', stroke: '#C9D0DA', 'stroke-width': 1.25 }));
      const txt = g.appendChild(s('text', { x: 265, y: y + 8, 'text-anchor': 'middle', class: 'lbl24' }, label));
      return { y, fan, g, rect, txt, a: { x: 380, y }, run: courier(svg, { x: 380, y }, convL, { start: 3.6, period: 2.4, offset: k * 0.41, travel: 1.0, r: 3 }) };
    });
    const outs = ['Better next creative', 'Better targeting', 'Faster iteration', 'Higher win rate', 'Less guesswork'].map((label, k) => {
      const y = ys[k];
      const fan = svg.appendChild(s('line', { stroke: '#B5BECB', 'stroke-width': 1.5, 'stroke-dasharray': '1.5 6', 'stroke-linecap': 'round' }));
      const dot = svg.appendChild(s('circle', { cx: 1446, cy: y, r: 0, fill: C.gold }));
      const txt = svg.appendChild(s('text', { x: 1466, y: y + 8, class: 'lbl24' }, label));
      txt.style.fontSize = '26px';
      return { y, fan, dot, txt, b: { x: 1440, y }, run: courier(svg, convR, { x: 1440, y }, { start: 4.4, period: 2.2, offset: k * 0.37, travel: 0.9, r: 3 }) };
    });
    const nodeEls = pos.map((p, i) => {
      const dot = svg.appendChild(s('circle', { cx: fx(p.x), cy: fx(p.y), r: 0, fill: '#fff', stroke: C.gold, 'stroke-width': 1.75 }));
      let x = p.x, y = p.y, anchor = 'middle';
      if (p.c > 0.2) { x += 18; y += 8; anchor = 'start'; }
      else if (p.c < -0.2) { x -= 18; y += 8; anchor = 'end'; }
      else if (p.sn < 0) y -= 20;
      else y += 38;
      const txt = svg.appendChild(s('text', { x: fx(x), y: fx(y), 'text-anchor': anchor, class: 'lbl24' }, NODES[i]));
      return { dot, txt };
    });
    const ring2 = svg.appendChild(s('circle', { cx, cy, r: 104, fill: 'none', stroke: '#D3D9E1', 'stroke-width': 1.25, transform: `rotate(-90 ${cx} ${cy})` }));
    const coreFill = svg.appendChild(s('circle', { cx, cy, r: 92, fill: '#FBFBFC', stroke: C.gold, 'stroke-width': 2, transform: `rotate(-90 ${cx} ${cy})` }));
    const core = svg.appendChild(s('g', {},
      s('text', { x: cx + 3, y: cy - 30, 'text-anchor': 'middle', class: 'core-caps' }, 'BRIEF'),
      s('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', class: 'core-title-sm' }, 'Creative'),
      s('text', { x: cx, y: cy + 40, 'text-anchor': 'middle', class: 'core-title-sm' }, 'Intelligence')));

    // Patterns BRIEF "learns": industry → creative levers → outcome
    const PATTERNS = [
      { pill: 1, nodes: [0, 2, 3], out: 3 },
      { pill: 3, nodes: [1, 5, 6], out: 0 },
      { pill: 0, nodes: [4, 7, 8], out: 1 },
    ];
    const pathLen = [];
    PATTERNS.forEach((pt) => {
      pt.d = 'M' + pt.nodes.map((n) => `${fx(pos[n].x)} ${fx(pos[n].y)}`).join(' L');
    });
    const goldMix = (k) => {
      const a = [0x0a, 0x1f, 0x44], b = [0xb8, 0x92, 0x41];
      return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;
    };

    return (lt) => {
      pose(capL, P(lt, 1.0, 0.6));
      pose(capR, P(lt, 3.2, 0.6));
      pills.forEach((p, k) => {
        const kp = P(lt, 1.0 + k * 0.1, 0.55);
        pose(p.g, kp, -20 * (1 - kp));
        drawLine(p.fan, p.a, convL, P(lt, 2.6 + k * 0.08, 0.7));
        p.run(lt);
      });
      drawLine(busL, convL, { x: cx - 92, y: cy }, P(lt, 3.1, 0.5));
      drawLine(busR, { x: cx + 92, y: cy }, convR, P(lt, 3.3, 0.5));
      ringDraw(coreFill, P(lt, 1.4, 1.0, E.inOutCubic));
      coreFill.setAttribute('stroke-dasharray', coreFill.getAttribute('stroke-dasharray'));
      ringDraw(ring2, P(lt, 1.5, 1.0, E.inOutCubic));
      const kc = P(lt, 1.8, 0.6);
      pose(core, kc, 0, 8 * (1 - kc));
      edgeEls.forEach((el, e) => {
        const [a, b] = edges[e];
        drawLine(el, pos[a], pos[b], P(lt, 1.9 + e * 0.035, 0.6));
      });
      // highlight state
      let hlPill = -1, hlOut = -1, hlNodes = [], hk = 0, pk = 0;
      PATTERNS.forEach((pt, n) => {
        const s0 = 4.9 + n * 1.75;
        const k = P(lt, s0, 0.35) * (1 - P(lt, s0 + 1.35, 0.35));
        if (k > hk) { hk = k; hlPill = pt.pill; hlOut = pt.out; hlNodes = pt.nodes; pk = P(lt, s0 + 0.1, 0.7, E.inOutCubic); pathHL.setAttribute('d', pt.d); }
      });
      if (hk > 0) {
        const L = pathHL.getTotalLength();
        attrs(pathHL, { 'stroke-dasharray': `${fx(L)} ${fx(L)}`, 'stroke-dashoffset': fx(L * (1 - pk)), opacity: hk.toFixed(3) });
      } else pathHL.setAttribute('opacity', 0);
      nodeEls.forEach((n, i) => {
        const on = hlNodes.includes(i) ? hk : 0;
        n.dot.setAttribute('r', fx(7 * Math.max(0, P(lt, 1.6 + i * 0.07, 0.45, E.outBack)) * (1 + 0.35 * on)));
        n.dot.setAttribute('fill', on > 0.01 ? goldMix(0) && `rgba(184,146,65,${fx(on)})` : '#fff');
        pose(n.txt, P(lt, 1.8 + i * 0.07, 0.5));
        n.txt.style.fill = goldMix(on);
      });
      pills.forEach((p, k) => {
        const on = k === hlPill ? hk : 0;
        attrs(p.rect, { stroke: on > 0.01 ? C.gold : '#C9D0DA', fill: on > 0.01 ? `rgba(184,146,65,${fx(0.12 * on)})` : '#FAFBFC' });
        p.txt.style.fill = goldMix(on);
        p.fan.setAttribute('stroke', on > 0.01 ? C.gold : '#B5BECB');
      });
      outs.forEach((o, k) => {
        const st = 3.6 + k * 0.12;
        drawLine(o.fan, convR, o.b, P(lt, st, 0.6));
        o.dot.setAttribute('r', fx(4.5 * Math.max(0, P(lt, st + 0.35, 0.4, E.outBack))));
        const kt = P(lt, st + 0.4, 0.5);
        pose(o.txt, kt, -16 * (1 - kt));
        const on = k === hlOut ? P(lt, 0, 1) * hk : 0;
        o.txt.style.fill = goldMix(on);
        o.fan.setAttribute('stroke', on > 0.01 ? C.gold : '#B5BECB');
        o.run(lt);
      });
    };
  });

  // ───────────── Moat 03 · Self-improving engine (deck p.32) ─────────────
  moat(2, {
    label: 'The reinforcement moat',
    head: [['BRIEF is a '], ['self-improving', 'gold'], ['\nmarketing engine.']],
    close: [['Automation does tasks. '], ['BRIEF improves judgment.', 'gold']],
    closeAt: 8.4,
  }, (svg) => {
    const cx = 560, cy = 676, R = 180;
    const t0 = 1.8;
    const cyc = (lt) => { const u = Math.max(0, lt - t0); return 0.3 * u + 0.045 * u * u; };
    const atCycle = (c) => t0 + (-0.3 + Math.sqrt(0.09 + 0.18 * c)) / 0.09;

    const r3 = svg.appendChild(s('circle', { cx, cy, r: 240, fill: 'none', stroke: '#D5DBE3', 'stroke-width': 1.25, 'stroke-dasharray': '1 7', 'stroke-linecap': 'round' }));
    const r2 = svg.appendChild(s('circle', { cx, cy, r: 224, fill: 'none', stroke: '#D5DBE3', 'stroke-width': 1.25, 'stroke-dasharray': '3 9' }));
    const r1 = svg.appendChild(s('circle', { cx, cy, r: 206, fill: 'none', stroke: '#DDE2E9', 'stroke-width': 1.25, transform: `rotate(-90 ${cx} ${cy})` }));
    const track = svg.appendChild(s('circle', { cx, cy, r: R, fill: 'none', stroke: '#E1E5EB', 'stroke-width': 1.5, transform: `rotate(-90 ${cx} ${cy})` }));
    const halo = svg.appendChild(s('circle', { cx, cy, r: R, fill: 'none', stroke: C.gold, 'stroke-width': 1.5, opacity: 0 }));
    const arcs = [[150, 0.3, 2.5], [90, 0.55, 2.75], [40, 1, 3]].map(([len, op, w]) =>
      ({ len, el: svg.appendChild(s('circle', { cx, cy, r: R, fill: 'none', stroke: C.gold, 'stroke-width': w, 'stroke-linecap': 'round', opacity: 0 })), op }));
    const head = svg.appendChild(s('path', { d: 'M-7 -8 L9 0 L-7 8 Z', fill: C.gold, opacity: 0 }));
    const inner = svg.appendChild(s('circle', { cx, cy, r: 98, fill: '#FBFBFC', stroke: C.gold, 'stroke-width': 1.5, transform: `rotate(-90 ${cx} ${cy})` }));
    const innerTxt = svg.appendChild(s('g', {},
      s('text', { x: cx + 3, y: cy - 38, 'text-anchor': 'middle', class: 'core-caps' }, 'FLYWHEEL'),
      s('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'lblb' }, 'Gains momentum'),
      s('text', { x: cx, y: cy + 30, 'text-anchor': 'middle', class: 'lblb' }, 'every cycle')));
    const counter = svg.appendChild(s('text', { x: cx + 1, y: cy + 66, 'text-anchor': 'middle', class: 'cap' }, 'CAMPAIGN 01'));

    const NODES = ['Signal', 'Decision', 'Execution', 'Result', 'Learning', 'Better next'];
    const nodes = NODES.map((name, j) => {
      const a = rad(-90 + j * 60);
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      const ring = svg.appendChild(s('circle', { cx: fx(x), cy: fx(y), r: 0, fill: '#fff', stroke: C.gold, 'stroke-width': 1.75 }));
      const dot = svg.appendChild(s('circle', { cx: fx(x), cy: fx(y), r: 0, fill: C.gold }));
      let tx = x, ty = y + 9, anchor = 'middle';
      if (j === 0) ty = y - 26;
      else if (j === 3) ty = y + 48;
      else if (j < 3) { tx = x + 26; anchor = 'start'; }
      else { tx = x - 26; anchor = 'end'; }
      const txt = svg.appendChild(s('text', { x: fx(tx), y: fx(ty), 'text-anchor': anchor, class: 'lblb' }, name));
      return { ring, dot, txt, f: j / 6 };
    });

    const LEARN = ['Urgent tone outperforms humorous tone in this segment', 'Hindi voiceovers convert better than English VO', 'Delivery-time message reduces drop-off', 'This offer wins on Reels, fails on display'];
    const learns = LEARN.map((txt, i) => {
      const y = 486 + i * 108;
      const g = svg.appendChild(s('g', {}));
      const bar = g.appendChild(s('line', { x1: 980, y1: y + 33, x2: 980, y2: y + 33, stroke: C.gold, 'stroke-width': 2.5 }));
      const lab = g.appendChild(s('text', { x: 1044, y: y + 10, class: 'cap' }, `REINFORCED LEARNING 0${i + 1}`));
      const body = g.appendChild(s('text', { x: 1044, y: y + 46, class: 'learn' }, txt));
      return { bar, lab, body, at: atCycle(i + 4 / 6) };
    });
    const goldMix = (k) => `rgb(${Math.round(lerp(10, 184, k))},${Math.round(lerp(31, 146, k))},${Math.round(lerp(68, 65, k))})`;

    return (lt) => {
      const kb = P(lt, 0.9, 1.1, E.inOutCubic);
      ringDraw(track, kb);
      ringDraw(r1, P(lt, 1.0, 1.1, E.inOutCubic));
      ringDraw(inner, P(lt, 1.1, 1.0, E.inOutCubic));
      const c = cyc(lt);
      attrs(r2, { opacity: P(lt, 1.2, 0.8).toFixed(3), transform: `rotate(${fx(c * 50)} ${cx} ${cy})` });
      attrs(r3, { opacity: P(lt, 1.3, 0.8).toFixed(3), transform: `rotate(${fx(-c * 30)} ${cx} ${cy})` });
      const ki = P(lt, 1.4, 0.6);
      pose(innerTxt, ki, 0, 8 * (1 - ki));
      pose(counter, P(lt, 2.0, 0.5));
      counter.textContent = `CAMPAIGN ${String(Math.min(99, Math.floor(c) + 1)).padStart(2, '0')}`;
      const phi = -90 + 360 * c;
      const show = P(lt, t0 - 0.1, 0.4);
      arcs.forEach((a) => {
        const len = Math.min(a.len, 360 * c);
        const circ = 2 * Math.PI * R;
        attrs(a.el, {
          'stroke-dasharray': `${fx((circ * len) / 360)} ${fx(circ)}`,
          transform: `rotate(${fx(phi - len)} ${cx} ${cy})`,
          opacity: (a.op * show).toFixed(3),
        });
      });
      attrs(head, {
        transform: `translate(${fx(cx + R * Math.cos(rad(phi)))},${fx(cy + R * Math.sin(rad(phi)))}) rotate(${fx(phi + 90)})`,
        opacity: show.toFixed(3),
      });
      attrs(halo, { opacity: (Math.min(0.35, 0.05 * c) * show).toFixed(3) });
      nodes.forEach((n, j) => {
        const kn = P(lt, 1.2 + j * 0.1, 0.45, E.outBack);
        let pulse = 0;
        if (c >= n.f) {
          const last = Math.floor(c - n.f) + n.f;
          pulse = Math.exp(-(lt - atCycle(last)) * 4);
        }
        n.ring.setAttribute('r', fx(Math.max(0, kn) * (10 + 5 * pulse)));
        n.dot.setAttribute('r', fx(Math.max(0, kn) * 3.5));
        pose(n.txt, P(lt, 1.4 + j * 0.1, 0.5));
        n.txt.style.fill = goldMix(pulse);
      });
      learns.forEach((l) => {
        const k = P(lt, l.at, 0.5, E.outExpo);
        l.bar.setAttribute('x2', fx(980 + 40 * k));
        pose(l.lab, P(lt, l.at + 0.1, 0.4));
        const kb2 = P(lt, l.at + 0.15, 0.6, E.outExpo);
        pose(l.body, kb2, 24 * (1 - kb2));
      });
    };
  });

  // ───────────── Moat 04 · Accumulated intelligence (deck p.33) ─────────────
  moat(3, {
    label: 'The switching-cost moat',
    head: [['BRIEF gets '], ['more valuable', 'gold'], [' the longer\na brand uses it.']],
    close: [['The switching cost isn’t migration. '], ['It’s intelligence loss.', 'gold']],
    closeAt: 9.4,
    noExit: true,
  }, (svg) => {
    const CARDS = [
      ['MONTH 1', ['Brand', 'foundation'], ['Brand rules', 'Tone of voice', 'Product claims']],
      ['MONTH 3', ['Creative', 'learnings'], ['Best-performing hooks', 'Winning visual styles', 'Channel learnings']],
      ['MONTH 6', ['Audience', 'intelligence'], ['Audience patterns', 'Objection insights', 'Lead-response intel']],
      ['MONTH 12', ['Predictive', 'playbooks'], ['Predictive playbooks', 'Faster approvals', 'Durable advantage']],
    ];
    const bottom = 905, heights = [270, 325, 380, 435], W = 250;
    const axis = svg.appendChild(s('text', { x: 0, y: 0, class: 'cap', 'text-anchor': 'middle', transform: 'translate(152 688) rotate(-90)' }, 'ACCUMULATED INTELLIGENCE'));
    const defs = svg.appendChild(s('defs'));
    const cards = CARDS.map(([m, title, items], i) => {
      const x = 190 + i * 270, top = bottom - heights[i];
      const clipRect = s('rect', { x: x - 2, y: bottom, width: W + 4, height: 0 });
      defs.append(s('clipPath', { id: `stair${i}` }, clipRect));
      const g = svg.appendChild(s('g', { 'clip-path': `url(#stair${i})` }));
      g.append(s('rect', { x, y: top, width: W, height: heights[i], rx: 4, fill: '#fff', stroke: C.card }));
      const bar = g.appendChild(s('line', { x1: x, y1: top + 1.5, x2: x, y2: top + 1.5, stroke: C.gold, 'stroke-width': 3 }));
      const txt = g.appendChild(s('g', {}));
      txt.append(s('text', { x: x + 24, y: top + 42, class: 'capg' }, m));
      title.forEach((ln, k) => txt.append(s('text', { x: x + 24, y: top + 84 + k * 33, class: 'card-title' }, ln)));
      items.forEach((it, k) => txt.append(s('text', { x: x + 24, y: top + 162 + k * 30, class: 'card-item' }, '· ' + it)));
      return { clipRect, bar, txt, x, top, h: heights[i], pt: { x: x + W / 2, y: top - 30 } };
    });
    const pts = cards.map((c) => c.pt).concat([{ x: 1262, y: 400 }]);
    const rising = svg.appendChild(s('path', { d: 'M' + pts.map((p) => `${p.x} ${p.y}`).join(' L'), fill: 'none', stroke: C.gold, 'stroke-width': 2 }));
    const tip = svg.appendChild(s('path', { d: 'M-8 -7 L8 0 L-8 7 Z', fill: C.gold, opacity: 0 }));
    const dots = cards.map((c) => svg.appendChild(s('circle', { cx: c.pt.x, cy: c.pt.y, r: 0, fill: C.gold })));
    const segLen = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const totLen = segLen.reduce((a, b) => a + b, 0);
    const ang = (Math.atan2(pts[4].y - pts[3].y, pts[4].x - pts[3].x) * 180) / Math.PI;

    // "Switching away means resetting"
    const rx = 1330, rtop = 470;
    const right = svg.appendChild(s('g', {}));
    right.append(s('rect', { x: rx, y: rtop, width: 470, height: 435, rx: 4, fill: '#fff', stroke: C.card }));
    right.append(s('line', { x1: rx, y1: rtop + 1.5, x2: rx + 470, y2: rtop + 1.5, stroke: C.gold, 'stroke-width': 3 }));
    right.append(s('text', { x: rx + 30, y: rtop + 48, class: 'capg' }, 'SWITCHING AWAY MEANS RESETTING'));
    const lose = ['Brand memory', 'Category learning', 'Historical decisions', 'Performance patterns', 'Conversion insights'].map((name, k) => {
      const y = rtop + 118 + k * 62;
      if (k) right.append(s('line', { x1: rx + 30, y1: y - 40, x2: rx + 440, y2: y - 40, stroke: C.card }));
      const txt = right.appendChild(s('text', { x: rx + 30, y, class: 'lbl' }, name));
      const strike = right.appendChild(s('line', { x1: rx + 26, y1: y - 9, x2: rx + 26, y2: y - 9, stroke: C.rust, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      return { txt, strike, y, w: 200 };
    });
    onReady(() => lose.forEach((l) => (l.w = l.txt.getComputedTextLength() + 8)));

    return (lt) => {
      pose(axis, P(lt, 1.0, 0.6));
      let reach = 0;
      cards.forEach((c, i) => {
        const si = 1.4 + i * 1.15;
        const k = P(lt, si, 0.75, E.outExpo);
        attrs(c.clipRect, { y: fx(bottom - (c.h + 6) * k), height: fx((c.h + 6) * k) });
        c.bar.setAttribute('x2', fx(c.x + W * P(lt, si + 0.3, 0.5, E.outExpo)));
        const kt = P(lt, si + 0.35, 0.5);
        pose(c.txt, kt, 0, 10 * (1 - kt));
        dots[i].setAttribute('r', fx(5.5 * Math.max(0, P(lt, si + 0.45, 0.4, E.outBack))));
        const kl = P(lt, si + 0.45, 0.6, E.inOutCubic);
        if (i === 0) reach = 0;
        else reach = Math.max(reach, segLen.slice(0, i - 1).reduce((a, b) => a + b, 0) + segLen[i - 1] * kl);
      });
      const kEnd = P(lt, 5.4, 0.6, E.inOutCubic);
      reach = Math.max(reach, kEnd > 0 ? segLen.slice(0, 3).reduce((a, b) => a + b, 0) + segLen[3] * kEnd : 0);
      attrs(rising, { 'stroke-dasharray': `${fx(totLen)} ${fx(totLen)}`, 'stroke-dashoffset': fx(totLen - reach), opacity: P(lt, 1.85, 0.2).toFixed(3) });
      const tp = { x: lerp(pts[3].x, pts[4].x, kEnd), y: lerp(pts[3].y, pts[4].y, kEnd) };
      attrs(tip, { transform: `translate(${fx(tp.x)},${fx(tp.y)}) rotate(${fx(ang)})`, opacity: (kEnd > 0.02 ? 1 : 0).toString() });
      const kr = P(lt, 6.2, 0.8, E.outExpo);
      pose(right, kr, 0, 40 * (1 - kr));
      lose.forEach((l, k) => {
        const ks = P(lt, 7.8 + k * 0.17, 0.35, E.inOutCubic);
        l.strike.setAttribute('x2', fx(1356 + l.w * ks));
        l.strike.setAttribute('opacity', ks > 0 ? 1 : 0);
        const g = Math.round(lerp(0, 1, ks) * 100) / 100;
        l.txt.style.fill = `rgb(${Math.round(lerp(10, 163, g))},${Math.round(lerp(31, 173, g))},${Math.round(lerp(68, 187, g))})`;
      });
    };
  });

  // ───────────── 6 · Proof + end card ─────────────
  scene(...T.outro, (root) => {
    const panels = [0, 1, 2, 3].map((i) =>
      root.appendChild(h('div', { class: 'abs panel navy', style: { left: i * 480 + 'px', backgroundPosition: `${-i * 480}px 0px` } },
        h('div', { class: 'abs fill grain', style: { left: -i * 480 + 'px' } }))));
    panels.forEach((p) => (p.style.overflow = 'hidden'));
    const proof = root.appendChild(h('div', { class: 'abs fill' }));
    const eb = block(proof, { center: true, y: 300, cls: 'stat-cap', style: { color: C.gold2, paddingLeft: '.26em' }, txt: 'Trusted by leading brands' });
    const nA = block(proof, { center: 600, w: 760, y: 410, cls: 'stat-big', segs: [['10M+']] });
    const nB = block(proof, { center: 1320, w: 760, y: 410, cls: 'stat-big', segs: [['₹500Cr+']] });
    const cA = block(proof, { center: 600, w: 760, y: 610, cls: 'stat-cap', style: { paddingLeft: '.26em' }, txt: 'Creatives generated' });
    const cB = block(proof, { center: 1320, w: 760, y: 610, cls: 'stat-cap', style: { paddingLeft: '.26em' }, txt: 'Revenue impact' });
    const divider = proof.appendChild(h('div', { class: 'abs', style: { left: '960px', top: '400px', width: '1px', height: '250px', background: 'rgba(255,255,255,.16)', transformOrigin: '0 0' } }));

    const end = root.appendChild(h('div', { class: 'abs fill' }));
    const mark = end.appendChild(h('div', { class: 'abs wordmark', style: { left: '0px', top: '268px', width: '1920px', textAlign: 'center', fontSize: '260px' } }));
    const letters = [...'BRIEF'].map((ch) => {
      const inner = h('span', { class: 'wi' }, ch);
      mark.append(h('span', { class: 'w' }, inner));
      return inner;
    });
    const dot = mark.appendChild(h('span', { class: 'mark-dot', style: { width: '35px', height: '35px', marginLeft: '14px' } }));
    mark.style.transform = 'translateX(-24px)';
    const tag = block(end, { center: true, y: 598, cls: 'end-tag', segs: [['BRIEF —'], [' That’s all you need.', 'gold2']] });
    const desc = block(end, { center: true, y: 686, cls: 'end-desc', txt: 'The agentic execution layer for brand growth.' });
    const foot = block(end, { center: true, y: 952, cls: 'end-foot', style: { paddingLeft: '.32em' }, txt: 'by Hypergro.ai' });

    return (lt) => {
      panels.forEach((p, i) => (p.style.transform = `translateY(${fx(1080 * (1 - P(lt, i * 0.07, 0.8, E.inOutQuint)))}px)`));
      const po = P(lt, 4.9, 0.6, E.inCubic);
      pose(eb.el, P(lt, 0.95, 0.5) * (1 - po), 0, -30 * po);
      rise(nA.ws, lt, 1.1, 4.9, { dur: 1.0 });
      rise(nB.ws, lt, 1.3, 4.95, { dur: 1.0 });
      const kc = P(lt, 1.7, 0.6);
      pose(cA.el, kc * (1 - po), 0, -30 * po);
      pose(cB.el, kc * (1 - po), 0, -30 * po);
      divider.style.transform = `scaleY(${fx(P(lt, 1.2, 0.8, E.outExpo) * (1 - po))})`;

      rise(letters, lt, 5.5, null, { stagger: 0.075, dur: 1.0 });
      dot.style.transform = `scale(${fx(Math.max(0, P(lt, 6.2, 0.5, E.outBack)))})`;
      rise(tag.ws, lt, 6.6, null, { stagger: 0.07 });
      const kd = P(lt, 7.3, 0.6);
      pose(desc.el, kd, 0, 10 * (1 - kd));
      pose(foot.el, P(lt, 7.7, 0.6));
      const kz = P(lt, 5.5, 5.5, E.linear);
      end.style.transform = `scale(${fx(1 + 0.015 * kz)})`;
    };
  });

  window.BRIEF.start();
})();
