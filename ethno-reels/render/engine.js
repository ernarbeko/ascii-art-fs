// Deterministic motion-graphics engine for 1080x1920 reels.
// Everything on screen is a pure function of time: window.seek(t) sets every style,
// so the renderer can capture frame N at exactly t = N / fps.

const NS = 'http://www.w3.org/2000/svg';
const PALETTES = {
  burgundy: { bg1: '#25060d', bg2: '#7c1a2b', gold: '#e9b95b', gold2: '#b0802c', cream: '#f8ecd4', accent: '#2fb5a9' },
  sky:      { bg1: '#03202e', bg2: '#0a6f92', gold: '#f6c552', gold2: '#c58e22', cream: '#fff7e6', accent: '#e4553e' },
  indigo:   { bg1: '#080b22', bg2: '#2a3272', gold: '#e4b45b', gold2: '#a6782b', cream: '#f3eadb', accent: '#d2553f' },
};

// ---------- math helpers ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (u, a, b) => clamp((u - a) / (b - a));
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeBack = p => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

// ---------- DOM helpers ----------
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function div(cls, parent, html) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  if (parent) parent.appendChild(d);
  return d;
}

// ---------- ornament geometry ----------
// Ram-horn spiral ("қошқар мүйіз"): starts at (ox,oy), climbs, curls outward and winds in.
function hornPts(ox, oy, r0, turns, k, dirX, dirY) {
  const pts = [], N = 160, total = turns * 2 * Math.PI;
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * total, r = r0 * Math.exp(-k * s);
    const x = r0 - r * Math.cos(s), y = -r * Math.sin(s);
    pts.push([ox + dirX * x, oy + dirY * y]);
  }
  return pts;
}
const toPath = pts => 'M' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L');

// Classic double ram-horn motif in a 200x200 box.
function koshkarPaths(r0 = 40) {
  const top = 98, bot = 150;
  return [
    { d: `M100 ${top} L100 ${bot}`, w: 1 },
    { d: toPath(hornPts(100, top, r0, 1.5, .19, 1, 1)), w: 1 },
    { d: toPath(hornPts(100, top, r0, 1.5, .19, -1, 1)), w: 1 },
    { d: toPath(hornPts(100, bot, r0 * .55, 1.3, .22, 1, -1)), w: .85 },
    { d: toPath(hornPts(100, bot, r0 * .55, 1.3, .22, -1, -1)), w: .85 },
    { d: 'M100 112 L109 124 L100 136 L91 124 Z', fill: 'accent', w: .7 },
  ];
}

// Shanyrak (yurt crown) seen from below.
function shanyrakPaths() {
  const p = [];
  p.push({ d: circ(100, 100, 82), w: 1.1 });
  p.push({ d: circ(100, 100, 70), w: .8 });
  for (const o of [-30, 0, 30]) {
    const h = Math.sqrt(70 * 70 - o * o);
    p.push({ d: `M${100 + o} ${100 - h} Q${100 + o * 1.25} 100 ${100 + o} ${100 + h}`, w: .9 });
    p.push({ d: `M${100 - h} ${100 + o} Q100 ${100 + o * 1.25} ${100 + h} ${100 + o}`, w: .9 });
  }
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, r1 = 86, r2 = i % 2 ? 96 : 104;
    p.push({ d: `M${100 + r1 * Math.cos(a)} ${100 + r1 * Math.sin(a)} L${100 + r2 * Math.cos(a)} ${100 + r2 * Math.sin(a)}`, w: .55 });
  }
  return p;
}
function circ(cx, cy, r) { return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`; }

// Small horn-pair used to decorate icons (scaled into a box).
function miniHorns(cx, cy, s, flip = 1) {
  return [
    { d: toPath(hornPts(cx, cy, 10 * s, 1.3, .22, 1, flip)), w: .6 },
    { d: toPath(hornPts(cx, cy, 10 * s, 1.3, .22, -1, flip)), w: .6 },
  ];
}

const ICONS = {
  koshkar: () => koshkarPaths(),
  shanyrak: () => shanyrakPaths(),
  saukele: () => [
    { d: 'M74 166 C80 120 88 72 94 42 Q100 32 106 42 C112 72 120 120 126 166 Z', fill: 'accent', w: 1 },
    { d: 'M58 164 Q100 152 142 164 L142 182 Q100 170 58 182 Z', fill: 'gold', w: 1 },
    { d: 'M80 132 Q100 128 120 132 M85 106 Q100 103 115 106 M89 80 Q100 78 111 80', w: .7 },
    { d: 'M100 112 L106 119 L100 126 L94 119 Z M100 86 L105 93 L100 100 L95 93 Z', fill: 'gold', w: .6 },
    { d: circ(100, 36, 5), fill: 'gold', w: .6 },
    { d: 'M100 31 C95 18 85 12 74 15 M100 31 C99 16 94 6 88 1 M100 31 C101 16 106 6 112 1 M100 31 C105 18 115 12 126 15', w: .65 },
    { d: 'M64 180 L63 197 M72 177 L72 194 M128 177 L128 194 M136 180 L137 197', w: .6 },
    ...miniHorns(100, 150, .7, -1),
  ],
  dombra: () => [
    { d: 'M100 92 C138 96 154 150 128 178 C114 192 86 192 72 178 C46 150 62 96 100 92 Z', fill: 'accent', w: 1.1 },
    { d: 'M95 96 L95 22 L105 22 L105 96', w: .9 },
    { d: 'M92 22 L92 4 L108 4 L108 22 Z', fill: 'gold', w: .8 },
    { d: 'M92 9 L84 7 M92 16 L84 16 M108 9 L116 7 M108 16 L116 16', w: .6 },
    { d: 'M98.5 6 L98.5 170 M101.5 6 L101.5 170', w: .35 },
    { d: 'M95 34 L105 34 M95 46 L105 46 M95 58 L105 58 M95 70 L105 70 M95 82 L105 82', w: .45 },
    { d: 'M88 168 L112 168', w: .9 },
    { d: circ(100, 132, 7), fill: 'gold', w: .6 },
    ...miniHorns(100, 150, .9, 1),
  ],
  kese: () => [
    { d: 'M38 92 L162 92 C158 146 132 170 100 170 C68 170 42 146 38 92 Z', fill: 'accent', w: 1.1 },
    { d: 'M38 92 Q100 108 162 92 Q100 78 38 92 Z', fill: 'gold', w: .8 },
    { d: 'M76 170 L80 182 L120 182 L124 170', w: .9 },
    { d: 'M52 122 Q100 134 148 122', w: .5 },
    ...miniHorns(100, 140, .9, 1),
    ...miniHorns(66, 136, .55, 1), ...miniHorns(134, 136, .55, 1),
    { d: 'M78 70 C70 58 86 50 78 36 M100 66 C92 52 108 44 100 26 M122 70 C114 58 130 50 122 36', w: .55 },
  ],
  bilezik: () => [
    { d: 'M30 112 C30 76 170 76 170 112 C170 148 30 148 30 112 Z', w: 1.2 },
    { d: 'M46 112 C46 90 154 90 154 112 C154 134 46 134 46 112 Z', w: .8 },
    { d: circ(100, 141, 9), fill: 'accent', w: .8 },
    { d: circ(66, 136, 6.5), fill: 'accent', w: .7 },
    { d: circ(134, 136, 6.5), fill: 'accent', w: .7 },
    { d: circ(42, 124, 5), fill: 'gold', w: .6 },
    { d: circ(158, 124, 5), fill: 'gold', w: .6 },
    ...miniHorns(84, 140, .45, -1), ...miniHorns(116, 140, .45, -1),
    { d: 'M100 40 L104 54 L118 58 L104 62 L100 76 L96 62 L82 58 L96 54 Z', fill: 'gold', w: .5 },
  ],
  gift: () => [
    { d: 'M46 96 L154 96 L154 182 L46 182 Z', fill: 'accent', w: 1.1 },
    { d: 'M38 76 L162 76 L162 98 L38 98 Z', fill: 'gold', w: 1 },
    { d: 'M92 76 L92 182 M108 76 L108 182', w: .9 },
    ...miniHorns(100, 76, 2.1, -1),
    ...miniHorns(70, 140, .8, 1), ...miniHorns(130, 140, .8, 1),
  ],
  yurt: () => [
    { d: 'M26 118 Q100 22 174 118 Z', fill: 'gold', w: 1.1 },
    { d: 'M30 118 L30 182 L170 182 L170 118', w: 1.1 },
    { d: 'M86 182 L86 138 Q100 128 114 138 L114 182 Z', fill: 'accent', w: 1 },
    { d: 'M30 140 L52 118 M30 162 L74 118 M30 182 L86 138 M114 138 L134 118 M114 160 L156 118 M114 182 L170 126 M170 140 L148 118 M170 162 L126 118 M170 182 L114 126 M86 126 L66 118 M86 150 L52 118 M86 172 L36 118', w: .4 },
    { d: circ(100, 58, 10), w: .8 },
    ...miniHorns(100, 104, .8, -1),
  ],
  shapan: () => [
    { d: 'M62 40 L84 28 Q100 50 116 28 L138 40 L150 182 L50 182 Z', fill: 'accent', w: 1.1 },
    { d: 'M62 40 L26 112 L44 122 L66 80 M138 40 L174 112 L156 122 L134 80', w: 1 },
    { d: 'M84 28 Q100 50 116 28 M100 48 L100 182 M50 168 L150 168 M30 104 L46 113 M170 104 L154 113', w: .8 },
    { d: 'M96 70 L104 70 M96 92 L104 92 M96 114 L104 114', w: .7 },
    ...miniHorns(76, 132, .8, 1), ...miniHorns(124, 132, .8, 1),
  ],
  plane: () => [
    { d: 'M20 96 L180 28 L132 172 L98 118 Z', fill: 'cream', w: 1 },
    { d: 'M98 118 L180 28', w: .8 },
  ],
};

// Build a stroke-animatable SVG icon. Returns {svg, update(drawP, fillP)}.
function makeIcon(name, size, pal, opts = {}) {
  const svg = el('svg', { viewBox: opts.viewBox || '0 0 200 200', width: size, height: size });
  const g = el('g', {}, svg);
  const sw = opts.stroke || 5;
  const parts = ICONS[name]().map(p => {
    const fillCol = p.fill ? pal[p.fill] : 'none';
    const fillEl = p.fill ? el('path', { d: p.d, fill: fillCol, opacity: 0 }, g) : null;
    if (fillEl && p.fill === 'accent') fillEl.setAttribute('fill-opacity', '.55');
    const s = el('path', {
      d: p.d, fill: 'none', stroke: opts.color || pal.gold, 'stroke-width': sw * (p.w || 1),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1',
    }, g);
    return { s, fillEl };
  });
  if (opts.glow !== false) svg.style.filter = `drop-shadow(0 0 18px ${pal.gold}55) drop-shadow(0 10px 24px rgba(0,0,0,.45))`;
  return {
    svg,
    update(drawP, fillP) {
      parts.forEach((p, i) => {
        const stagger = parts.length > 1 ? i / (parts.length - 1) * .35 : 0;
        const dp = easeInOut(clamp((drawP - stagger) / .65));
        p.s.setAttribute('stroke-dashoffset', (1 - dp).toFixed(4));
        if (p.fillEl) p.fillEl.setAttribute('opacity', easeOut(fillP).toFixed(3));
      });
    },
  };
}

// Twinkling 4-point stars around a point.
function makeSparkles(parent, pal, cx, cy, radius, n, seed) {
  const svg = el('svg', { width: 1080, height: 1920, style: 'position:absolute;left:0;top:0' }, parent);
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const stars = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = radius * (.75 + rnd() * .5);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, k = 8 + rnd() * 14;
    const p = el('path', { d: `M${x} ${y - k}L${x + k * .28} ${y - k * .28}L${x + k} ${y}L${x + k * .28} ${y + k * .28}L${x} ${y + k}L${x - k * .28} ${y + k * .28}L${x - k} ${y}L${x - k * .28} ${y - k * .28}Z`, fill: pal.gold }, svg);
    stars.push({ p, ph: rnd() * 6.28, sp: 2 + rnd() * 3, delay: rnd() * .8 });
  }
  return u => stars.forEach(st => {
    const on = prog(u, .5 + st.delay, 1 + st.delay);
    st.p.setAttribute('opacity', (on * (.35 + .65 * Math.max(0, Math.sin(u * st.sp + st.ph)))).toFixed(3));
  });
}

// Split "text with *gold words*" into [{w, hl}] tokens.
function tokens(text) {
  const out = [];
  let hl = false;
  for (const part of text.split(/(\*)/)) {
    if (part === '*') { hl = !hl; continue; }
    for (const w of part.split(/\s+/).filter(Boolean)) out.push({ w, hl });
  }
  return out;
}
const richHTML = text => text.split('\n').map(line =>
  '<span class="line">' + line.replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>') + '</span>').join('');

// Shrink an element's font until its text fits on one line within maxW.
function fitText(node, maxW, size) {
  node.style.fontSize = size + 'px';
  const probe = node.cloneNode(true);
  Object.assign(probe.style, { position: 'absolute', left: '-9999px', right: 'auto', width: 'auto', letterSpacing: '24px' });
  document.body.appendChild(probe);
  while (probe.scrollWidth > maxW && size > 40) { size -= 2; probe.style.fontSize = size + 'px'; }
  probe.remove();
  node.style.fontSize = size + 'px';
}

// ---------- persistent background ----------
function buildBackground(pal) {
  const bg = document.getElementById('bg');
  const big = makeIcon('shanyrak', 1500, pal, { stroke: 3, glow: false, color: pal.gold });
  Object.assign(big.svg.style, { position: 'absolute', left: '-210px', top: '120px', opacity: .07 });
  big.update(1, 1);
  bg.appendChild(big.svg);

  // Ornament bands at the top and bottom edges.
  const frame = document.getElementById('frame');
  const bands = [];
  for (const [y, flip] of [[0, 1], [1920 - 150, -1]]) {
    const svg = el('svg', { width: 1080, height: 150, style: `position:absolute;left:0;top:${y}px` }, frame);
    el('rect', { x: 0, y: 0, width: 1080, height: 150, fill: 'rgba(0,0,0,.28)' }, svg);
    const ly = flip > 0 ? 146 : 4;
    el('path', { d: `M0 ${ly} L1080 ${ly}`, stroke: pal.gold, 'stroke-width': 3 }, svg);
    el('path', { d: `M0 ${flip > 0 ? 134 : 16} L1080 ${flip > 0 ? 134 : 16}`, stroke: pal.gold, 'stroke-width': 1.2, opacity: .6 }, svg);
    const g = el('g', {}, svg);
    for (let i = -1; i < 12; i++) {
      const sub = el('g', { transform: `translate(${i * 110 + 55 - 50},${flip > 0 ? 18 : 132}) scale(.5,${.5 * flip})` }, g);
      for (const p of koshkarPaths(36))
        el('path', { d: p.d, fill: p.fill ? pal.accent : 'none', 'fill-opacity': .7, stroke: pal.gold, 'stroke-width': 7 * (p.w || 1), 'stroke-linecap': 'round', opacity: .9 }, sub);
    }
    bands.push({ g, dir: flip });
  }
  return t => {
    big.svg.style.transform = `rotate(${(t * 3).toFixed(3)}deg)`;
    bands.forEach(b => b.g.setAttribute('transform', `translate(${((t * 18 * b.dir) % 110).toFixed(2)},0)`));
  };
}

// ---------- scene builders ----------
const BUILDERS = {
  hook(sc, root, pal) {
    const y = sc.y || 880;
    let orn = null;
    if (sc.icon !== 'none') {
      orn = makeIcon(sc.icon || 'koshkar', 380, pal, { stroke: 5.5 });
      Object.assign(orn.svg.style, { position: 'absolute', left: '350px', top: (y - 540) + 'px' });
      root.appendChild(orn.svg);
    }
    const box = div('center big', root);
    box.style.top = (y - 120) + 'px';
    const words = tokens(sc.text).map(t => {
      const s = document.createElement('span');
      s.className = 'w' + (t.hl ? ' hl' : '');
      s.textContent = t.w;
      box.appendChild(s);
      return s;
    });
    let sub = null;
    if (sc.sub) { sub = div('center caption', root, sc.sub); sub.style.top = (y + 330) + 'px'; }
    return u => {
      if (orn) orn.update(prog(u, 0, 1.1), prog(u, .7, 1.2));
      words.forEach((w, i) => {
        const p = prog(u, .1 + i * .13, .45 + i * .13);
        w.style.opacity = p;
        w.style.transform = `translateY(${(1 - easeOut(p)) * 50}px) scale(${.8 + .2 * easeBack(p)})`;
      });
      if (sub) sub.style.opacity = prog(u, .3 + words.length * .13, .7 + words.length * .13);
    };
  },

  item(sc, root, pal) {
    const icon = makeIcon(sc.icon, 560, pal, { stroke: 4.2 });
    Object.assign(icon.svg.style, { position: 'absolute', left: '260px', top: '400px' });
    root.appendChild(icon.svg);
    const spark = makeSparkles(root, pal, 540, 680, 330, 7, sc.seed || 3);
    let kicker = null;
    if (sc.kicker) { kicker = div('center kicker', root, sc.kicker); kicker.style.top = '1035px'; }
    const tw = div('center title-wrap', root);
    tw.style.top = sc.kicker ? '1130px' : '1080px';
    const title = div('title', tw, sc.title.replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>'));
    let cap = null;
    if (sc.caption) { cap = div('center caption', root, sc.caption); cap.style.top = sc.kicker ? '1300px' : '1250px'; }
    let tag = null;
    if (sc.tag) { tag = div('center tag', root, sc.tag); tag.style.top = '330px'; }
    return (u, d) => {
      icon.update(prog(u, 0, 1.3), prog(u, .9, 1.5));
      const z = 1 + .05 * (u / d);
      icon.svg.style.transform = `translateY(${Math.sin(u * 1.6) * 8}px) scale(${z}) rotate(${(sc.tilt || 0)}deg)`;
      spark(u);
      if (kicker) { const p = prog(u, .2, .6); kicker.style.opacity = p; kicker.style.transform = `translateX(${(1 - easeOut(p)) * -60}px)`; }
      const tp = easeOut(prog(u, .35, .85));
      title.style.transform = `translateY(${(1 - tp) * 115}%)`;
      if (cap) cap.style.opacity = prog(u, .8, 1.2) * .9;
      if (tag) tag.style.opacity = prog(u, .1, .5) * .9;
    };
  },

  fact(sc, root, pal) {
    const box = div('center fact', root, richHTML(sc.text));
    box.style.top = (sc.y || 1150) + 'px';
    const lines = [...box.querySelectorAll('.line')];
    let icon = null;
    if (sc.icon) {
      icon = makeIcon(sc.icon, 420, pal, { stroke: 5 });
      Object.assign(icon.svg.style, { position: 'absolute', left: '330px', top: '520px' });
      root.appendChild(icon.svg);
    }
    return u => {
      lines.forEach((l, i) => {
        const p = easeOut(prog(u, .15 + i * .22, .6 + i * .22));
        l.style.opacity = p;
        l.style.transform = `translateY(${(1 - p) * 40}px)`;
      });
      if (icon) icon.update(prog(u, 0, 1.2), prog(u, .8, 1.4));
    };
  },

  photo(sc, root, pal) {
    const W = 840, Hh = 1000, L = (1080 - W) / 2, T = 260;
    const frame = div('', root);
    Object.assign(frame.style, { position: 'absolute', left: L + 'px', top: T + 'px', width: W + 'px', height: Hh + 'px',
      borderRadius: '36px', overflow: 'hidden', border: `6px solid ${pal.gold}`, boxShadow: '0 24px 60px rgba(0,0,0,.55)' });
    const img = document.createElement('img');
    img.src = '../' + sc.src;
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', transformOrigin: sc.focus || '50% 50%' });
    frame.appendChild(img);
    PENDING.push(img.decode().catch(() => { throw new Error('cannot load photo ' + sc.src); }));
    const corners = [];
    for (const [x, y, sx, sy] of [[L - 40, T - 40, 1, 1], [L + W + 40, T - 40, -1, 1], [L - 40, T + Hh + 40, 1, -1], [L + W + 40, T + Hh + 40, -1, -1]]) {
      const c = makeIcon('koshkar', 170, pal, { stroke: 7 });
      Object.assign(c.svg.style, { position: 'absolute', left: (x - 85) + 'px', top: (y - 85) + 'px', transform: `scale(${sx},${sy}) rotate(-45deg)` });
      root.appendChild(c.svg);
      corners.push(c);
    }
    let kicker = null;
    if (sc.kicker) { kicker = div('center kicker', root, sc.kicker); kicker.style.top = '1310px'; }
    const tw = div('center title-wrap', root);
    tw.style.top = sc.kicker ? '1400px' : '1330px';
    const title = div('title', tw, (sc.title || '').replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>'));
    title.style.fontSize = '88px';
    const dir = (sc.seed || 1) % 2 ? 1 : -1;
    return (u, d) => {
      const k = u / d;
      img.style.transform = `scale(${1.04 + .12 * k}) translateX(${dir * (k - .5) * 3}%)`;
      corners.forEach(c => c.update(prog(u, .1, 1.1), prog(u, .7, 1.2)));
      if (kicker) { const p = prog(u, .25, .65); kicker.style.opacity = p; kicker.style.transform = `translateX(${(1 - easeOut(p)) * -60}px)`; }
      title.style.transform = `translateY(${(1 - easeOut(prog(u, .4, .9))) * 115}%)`;
    };
  },

  cta(sc, root, pal, brand) {
    const logo = makeIcon('shanyrak', 400, pal, { stroke: 4.5 });
    Object.assign(logo.svg.style, { position: 'absolute', left: '340px', top: '360px' });
    root.appendChild(logo.svg);
    const name = div('center brand', root, brand.name);
    name.style.top = '840px';
    name.style.whiteSpace = 'nowrap';
    fitText(name, 860, 118);
    const tl = div('center tagline', root, sc.tagline || brand.tagline || '');
    tl.style.top = '990px';
    const bw = div('center', root);
    bw.style.top = '1140px';
    const btn = div('btn', bw);
    const plane = makeIcon('plane', 60, { ...pal, cream: '#2a1606', gold: '#2a1606' }, { stroke: 9, glow: false });
    btn.appendChild(plane.svg);
    btn.appendChild(document.createTextNode(sc.button || 'Директке жазыңыз'));
    const info = [brand.handle, brand.address, brand.phone].filter(Boolean);
    const inf = info.length ? div('center info', root, info.join('<br>')) : null;
    if (inf) inf.style.top = '1340px';
    return u => {
      logo.update(prog(u, 0, 1.3), prog(u, 1, 1.5));
      logo.svg.style.transform = `rotate(${u * 6}deg)`;
      const np = easeOut(prog(u, .3, .9));
      name.style.opacity = np;
      name.style.transform = `scale(${.85 + .15 * np})`;
      name.style.letterSpacing = (24 - 16 * np) + 'px';
      tl.style.opacity = prog(u, .7, 1.1);
      const bp = prog(u, 1, 1.4);
      bw.style.opacity = bp;
      plane.update(1, 1);
      btn.style.transform = `scale(${(.9 + .1 * easeBack(bp)) * (1 + .035 * Math.max(0, Math.sin((u - 1.4) * 5)) * (u > 1.4))})`;
      if (inf) inf.style.opacity = prog(u, 1.3, 1.7);
    };
  },
};

// ---------- timeline ----------
let SCENES = [], BG = null, PIN = null, TOTAL = 0;
const PENDING = [];

window.setup = async function (spec) {
  const pal = PALETTES[spec.palette] || PALETTES.burgundy;
  for (const [k, v] of Object.entries(pal)) document.documentElement.style.setProperty('--' + k, v);
  BG = buildBackground(pal);
  const host = document.getElementById('scenes');
  TOTAL = spec.total;
  SCENES = spec.scenes.map((sc, i) => {
    const root = div('scene', host);
    const upd = BUILDERS[sc.type](sc, root, pal, spec.brand || {});
    return { sc, root, upd, first: i === 0, last: i === spec.scenes.length - 1 };
  });
  if (spec.pin) {
    const p = spec.pin;
    const icon = makeIcon(p.icon, p.size || 640, pal, { stroke: 4.5 });
    Object.assign(icon.svg.style, { position: 'absolute', left: (540 - (p.size || 640) / 2) + 'px', top: (p.top || 330) + 'px' });
    document.getElementById('pin').appendChild(icon.svg);
    const spark = makeSparkles(document.getElementById('pin'), pal, 540, (p.top || 330) + (p.size || 640) / 2, (p.size || 640) * .55, 8, 11);
    PIN = t => {
      const u = t - p.start;
      const vis = Math.min(prog(u, 0, .3), 1 - prog(t, p.end - .4, p.end));
      icon.svg.style.opacity = vis;
      icon.update(prog(u, 0, p.draw || 2.2), prog(u, (p.draw || 2.2) * .7, (p.draw || 2.2) + .4));
      icon.svg.style.transform = `scale(${1 + .03 * Math.sin(u * .9)})`;
      spark(u);
    };
  }
  await Promise.all(PENDING);
};

window.seek = function (t) {
  BG(t);
  if (PIN) PIN(t);
  for (const S of SCENES) {
    const u = t - S.sc.start, d = S.sc.dur;
    if (u < -0.01 || u > d + 0.01) { S.root.style.opacity = 0; S.root.style.display = 'none'; continue; }
    S.root.style.display = 'block';
    const inP = S.first ? 1 : easeOut(prog(u, 0, .35));
    const outP = S.last ? 0 : easeInOut(prog(u, d - .3, d));
    S.root.style.opacity = (inP * (1 - outP)).toFixed(3);
    S.root.style.transform = `scale(${(1.04 - .04 * inP + .05 * outP).toFixed(4)})`;
    S.upd(u, d);
  }
};
