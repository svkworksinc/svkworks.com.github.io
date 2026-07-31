/* ============================================
   SVK Works — Interactive Wiring Diagram Viewer
   ============================================

   Renders a schematic from the data in data/wiring-data.js. Nothing here is
   hand-drawn: nodes are laid out into three columns, wires are auto-routed
   through vertical channels, and the whole SVG is rebuilt whenever the
   platform changes. Adding a platform is a data edit, not a drawing job.

   Pan and zoom work by moving the SVG viewBox rather than applying a CSS
   transform. A CSS transform scales the element out of its container and
   makes hit-testing and panning fight each other; a viewBox keeps the
   coordinate system honest, so pointer positions map straight back to
   diagram space and strokes stay crisp at any zoom.
   ============================================ */

const SVKWiring = {
  // ---- Layout constants (diagram-space units) ----
  W: 1280,              // canvas width
  PAD: 40,
  NODE_W: 190,
  NODE_HEADER: 30,
  PIN_H: 26,            // vertical spacing between a node's pins
  NODE_GAP: 28,         // vertical gap between stacked nodes in a column
  ECU_W: 250,
  CHANNEL_GAP: 13,      // horizontal spacing between routing channels
  STUB: 22,             // horizontal stub length leaving a pin

  // ---- State ----
  platformId: null,
  platform: null,
  circuits: [],         // resolved circuit objects for the active platform
  layout: null,         // { nodes, wires, height }
  selectedId: null,
  activeCategories: null, // Set of category keys, or null for "all"
  searchQuery: '',
  view: { x: 0, y: 0, w: 0, h: 0 },
  fitView: null,
  isPanning: false,

  /* ======================================================================
     Data resolution
     ====================================================================== */

  /** Merges a library circuit with any platform override into one object. */
  resolveCircuit(entry, platform) {
    const base = CIRCUIT_LIBRARY[entry.id];
    if (!base) {
      console.warn(`[wiring] Unknown circuit id: ${entry.id}`);
      return null;
    }
    const override = (platform.overrides && platform.overrides[entry.id]) || {};
    const merged = Object.assign({}, base, override);
    const cat = CIRCUIT_CATEGORIES[merged.category] || CIRCUIT_CATEGORIES.sensor;
    const gauge = WIRE_GAUGES[merged.gauge] || null;

    return Object.assign(merged, {
      id: entry.id,
      from: entry.from,
      to: entry.to,
      color: merged.color || cat.color,
      categoryLabel: cat.label,
      gaugeInfo: gauge,
      // ecuPin is intentionally absent unless a platform supplies a verified
      // value — see the note at the top of data/wiring-data.js.
      ecuPin: override.ecuPin || null,
    });
  },

  load(platformId) {
    const platform = WIRING_PLATFORMS[platformId];
    if (!platform) return false;
    this.platformId = platformId;
    this.platform = platform;
    this.circuits = platform.circuits
      .map(e => this.resolveCircuit(e, platform))
      .filter(Boolean);
    this.layout = this.computeLayout();
    return true;
  },

  /* ======================================================================
     Layout — three columns, auto-routed wires
     ====================================================================== */

  computeLayout() {
    const p = this.platform;
    const left   = p.nodes.filter(n => n.side === 'left');
    const right  = p.nodes.filter(n => n.side === 'right');
    const ecuDef = p.nodes.find(n => n.side === 'center');

    // Which circuits touch each node, and in what order — this determines
    // how many pins a node needs and where each wire attaches.
    const pinsFor = (nodeId) =>
      this.circuits.filter(c => c.from === nodeId || c.to === nodeId);

    const nodes = {};
    const colX = {
      left: this.PAD,
      center: 0, // filled below
      right: 0,
    };

    // Column heights drive vertical centring.
    const stackHeight = (list) =>
      list.reduce((h, n) => h + this.NODE_HEADER + pinsFor(n.id).length * this.PIN_H + 18, 0)
      + Math.max(0, list.length - 1) * this.NODE_GAP;

    const ecuPins = pinsFor(ecuDef.id);
    const ecuH = this.NODE_HEADER + Math.max(ecuPins.length, 6) * this.PIN_H + 26;
    const contentH = Math.max(stackHeight(left), stackHeight(right), ecuH);
    const height = contentH + this.PAD * 2;

    // Horizontal placement: left column, channel band, ECU, channel band, right.
    const leftChannels = this.circuits.filter(c =>
      left.some(n => n.id === c.from || n.id === c.to)).length;
    const rightChannels = this.circuits.filter(c =>
      right.some(n => n.id === c.from || n.id === c.to)).length;

    const leftBand  = Math.max(90, leftChannels * this.CHANNEL_GAP + 40);
    const rightBand = Math.max(90, rightChannels * this.CHANNEL_GAP + 40);

    colX.center = colX.left + this.NODE_W + leftBand;
    colX.right  = colX.center + this.ECU_W + rightBand;
    this.W = colX.right + this.NODE_W + this.PAD;

    // Place a column of nodes, vertically centred as a stack.
    const placeColumn = (list, x) => {
      let y = this.PAD + (contentH - stackHeight(list)) / 2;
      list.forEach(def => {
        const pins = pinsFor(def.id);
        const h = this.NODE_HEADER + pins.length * this.PIN_H + 18;
        nodes[def.id] = {
          ...def, x, y, w: this.NODE_W, h,
          pins: pins.map((c, i) => ({
            circuitId: c.id,
            label: c.name,
            color: c.color,
            y: y + this.NODE_HEADER + 14 + i * this.PIN_H,
          })),
        };
        y += h + this.NODE_GAP;
      });
    };

    placeColumn(left, colX.left);
    placeColumn(right, colX.right);

    // ECU sits centred with its own pin list.
    const ecuY = this.PAD + (contentH - ecuH) / 2;
    nodes[ecuDef.id] = {
      ...ecuDef, x: colX.center, y: ecuY, w: this.ECU_W, h: ecuH,
      pins: ecuPins.map((c, i) => ({
        circuitId: c.id,
        label: c.name,
        color: c.color,
        y: ecuY + this.NODE_HEADER + 18 + i * this.PIN_H,
      })),
    };

    // ---- Route each wire ----
    // Every wire leaves a pin horizontally, runs down a dedicated vertical
    // channel, then enters the destination pin horizontally. Giving each wire
    // its own channel x is what stops the bundle turning into a hairball.
    let leftCh = 0, rightCh = 0;
    const wires = this.circuits.map(c => {
      const a = nodes[c.from], b = nodes[c.to];
      if (!a || !b) return null;
      const pinA = a.pins.find(p => p.circuitId === c.id);
      const pinB = b.pins.find(p => p.circuitId === c.id);
      if (!pinA || !pinB) return null;

      // Determine which side of the ECU this wire lives on.
      const onLeft = (a.side === 'left' || b.side === 'left');
      const bandStart = onLeft ? colX.left + this.NODE_W : colX.center + this.ECU_W;
      const idx = onLeft ? leftCh++ : rightCh++;
      const channelX = bandStart + 26 + idx * this.CHANNEL_GAP;

      // Exit/entry x depends on which edge of each node the wire uses.
      const ax = a.side === 'left' ? a.x + a.w : (a.side === 'right' ? a.x : a.x + a.w);
      const bx = b.side === 'left' ? b.x + b.w : (b.side === 'right' ? b.x : b.x + b.w);
      // For a wire between ECU and a right-hand node, the ECU end exits right
      // and the node end enters left.
      const axAdj = (a.side === 'center' && b.side === 'right') ? a.x + a.w
                  : (a.side === 'center' && b.side === 'left')  ? a.x
                  : ax;
      const bxAdj = (b.side === 'center' && a.side === 'right') ? b.x + b.w
                  : (b.side === 'center' && a.side === 'left')  ? b.x
                  : bx;

      const dirA = axAdj < channelX ? 1 : -1;
      const dirB = bxAdj < channelX ? 1 : -1;
      const r = 6; // corner radius

      const path = this.orthPath(
        axAdj + dirA * this.STUB * 0, pinA.y,
        bxAdj + dirB * this.STUB * 0, pinB.y,
        channelX, r
      );

      return {
        circuit: c,
        d: path,
        start: { x: axAdj, y: pinA.y },
        end: { x: bxAdj, y: pinB.y },
        channelX,
      };
    }).filter(Boolean);

    return { nodes, wires, height, contentH };
  },

  /**
   * Builds an orthogonal path with rounded corners:
   * horizontal out of the pin → vertical down the channel → horizontal in.
   */
  orthPath(x1, y1, x2, y2, cx, r) {
    if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const s1 = Math.sign(cx - x1) || 1;
    const s2 = Math.sign(x2 - cx) || 1;
    const sy = Math.sign(y2 - y1) || 1;
    const rr = Math.min(r, Math.abs(y2 - y1) / 2, Math.abs(cx - x1) || r, Math.abs(x2 - cx) || r);
    return [
      `M ${x1} ${y1}`,
      `L ${cx - s1 * rr} ${y1}`,
      `Q ${cx} ${y1} ${cx} ${y1 + sy * rr}`,
      `L ${cx} ${y2 - sy * rr}`,
      `Q ${cx} ${y2} ${cx + s2 * rr} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ');
  },

  /* ======================================================================
     Rendering
     ====================================================================== */

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  render() {
    const { nodes, wires, height } = this.layout;
    const svg = document.getElementById('wd-svg');
    if (!svg) return;

    const nodeSvg = Object.values(nodes).map(n => this.renderNode(n)).join('');
    const wireSvg = wires.map(w => this.renderWire(w)).join('');

    svg.setAttribute('viewBox', `0 0 ${this.W} ${height}`);
    svg.innerHTML = `
      <defs>
        <pattern id="wd-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect class="wd-bg" width="${this.W}" height="${height}" fill="url(#wd-grid)"/>
      <g id="wd-wires">${wireSvg}</g>
      <g id="wd-nodes">${nodeSvg}</g>
    `;

    // A small negative inset gives the outermost nodes breathing room instead
    // of letting them sit flush against the frame edge.
    const m = this.W * 0.02;
    this.fitView = { x: -m, y: -m, w: this.W + m * 2, h: height + m * 2 };
    this.view = { ...this.fitView };
    this.applyView();
    this.bindSvgEvents();
  },

  renderNode(n) {
    const accent = n.kind === 'ecu' ? 'var(--magenta)' : (CIRCUIT_CATEGORIES[n.kind]?.color || '#9ca3af');
    const isEcu = n.kind === 'ecu';
    const pins = n.pins.map(p => {
      const px = n.side === 'left' ? n.x + n.w : (n.side === 'right' ? n.x : null);
      // ECU pins render dots on both edges; side nodes on their facing edge.
      const dots = isEcu
        ? `<circle cx="${n.x}" cy="${p.y}" r="3.5" fill="${p.color}"/>
           <circle cx="${n.x + n.w}" cy="${p.y}" r="3.5" fill="${p.color}"/>`
        : `<circle cx="${px}" cy="${p.y}" r="3.5" fill="${p.color}"/>`;
      const textX = n.side === 'right' ? n.x + 14 : n.x + n.w - 14;
      const anchor = n.side === 'right' ? 'start' : 'end';
      const label = isEcu
        ? `<text x="${n.x + n.w / 2}" y="${p.y + 3.5}" text-anchor="middle" class="wd-pin-label" data-circuit="${p.circuitId}">${this.esc(this.shortLabel(p.label))}</text>`
        : `<text x="${textX}" y="${p.y + 3.5}" text-anchor="${anchor}" class="wd-pin-label" data-circuit="${p.circuitId}">${this.esc(this.shortLabel(p.label))}</text>`;
      return dots + label;
    }).join('');

    return `
      <g class="wd-node" data-node="${n.id}">
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"
              fill="var(--bg-card)" stroke="${isEcu ? 'rgba(233,30,140,0.45)' : 'rgba(255,255,255,0.13)'}" stroke-width="1.5"/>
        <path d="M ${n.x} ${n.y + 10} a 10 10 0 0 1 10 -10 h ${n.w - 20} a 10 10 0 0 1 10 10 v ${this.NODE_HEADER - 10} h -${n.w} z"
              fill="${isEcu ? 'rgba(233,30,140,0.10)' : 'var(--bg-elevated)'}"/>
        <text x="${n.x + n.w / 2}" y="${n.y + 20}" text-anchor="middle" class="wd-node-title"
              fill="${accent}">${this.esc(n.label)}</text>
        ${pins}
      </g>`;
  },

  /** Pin labels need to be short; the full name lives in the inspector. */
  shortLabel(name) {
    return name
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\s*—.*$/, '')
      .replace(/Sensor$/, '')
      .trim()
      .slice(0, 26);
  },

  renderWire(w) {
    const c = w.circuit;
    return `
      <g class="wd-wire" data-circuit="${c.id}" data-category="${c.category}"
         tabindex="0" role="button"
         aria-label="${this.esc(c.name)} — ${this.esc(c.categoryLabel)} circuit. Press Enter to inspect.">
        <title>${this.esc(c.name)}</title>
        <path class="wd-wire-hit" d="${w.d}" fill="none" stroke="transparent" stroke-width="16"/>
        <path class="wd-wire-line" d="${w.d}" fill="none" stroke="${c.color}"
              stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;
  },

  /* ======================================================================
     Pan / zoom — viewBox based
     ====================================================================== */

  applyView() {
    const svg = document.getElementById('wd-svg');
    if (!svg) return;
    const v = this.view;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const pct = Math.round((this.fitView.w / v.w) * 100);
    const el = document.getElementById('wd-zoom-level');
    if (el) el.textContent = pct + '%';
  },

  zoomBy(factor, originClient) {
    const svg = document.getElementById('wd-svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const v = this.view;

    // Zoom about the pointer when we have one, otherwise the centre.
    const ox = originClient ? (originClient.x - rect.left) / rect.width : 0.5;
    const oy = originClient ? (originClient.y - rect.top) / rect.height : 0.5;

    const minW = this.fitView.w / 6;    // 600% max zoom in
    const maxW = this.fitView.w * 1.6;  // a little room to zoom out past fit
    let nw = Math.min(maxW, Math.max(minW, v.w / factor));
    const nh = nw * (v.h / v.w);

    this.view = {
      x: v.x + (v.w - nw) * ox,
      y: v.y + (v.h - nh) * oy,
      w: nw, h: nh,
    };
    this.applyView();
  },

  fit() {
    this.view = { ...this.fitView };
    this.applyView();
  },

  /** Frames a single wire so a deep-linked circuit is actually visible. */
  focusWire(circuitId, animate = true) {
    const wire = this.layout.wires.find(w => w.circuit.id === circuitId);
    if (!wire) return;
    const xs = [wire.start.x, wire.end.x, wire.channelX];
    const ys = [wire.start.y, wire.end.y];
    // Generous padding keeps the nodes at each end of the wire in frame —
    // seeing where a circuit *goes* is the whole point of tracing it.
    const pad = 190;
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    // Keep the container's aspect ratio so nothing is distorted.
    const ar = this.fitView.w / this.fitView.h;
    let vw = w, vh = h;
    if (vw / vh > ar) vh = vw / ar; else vw = vh * ar;
    // Never zoom past ~1.8x fit; beyond that the reader loses their bearings.
    const minW = this.fitView.w / 1.8;
    if (vw < minW) { vw = minW; vh = minW / ar; }
    const target = {
      x: x + w / 2 - vw / 2,
      y: y + h / 2 - vh / 2,
      w: Math.min(vw, this.fitView.w),
      h: Math.min(vh, this.fitView.h),
    };
    // Clamp so framing never drifts off the canvas edge. Bounds come from
    // fitView's own origin, which is inset rather than at 0,0. When the framed
    // view is larger than the diagram on an axis, centre on the content
    // instead of clamping — otherwise the wire ends up pinned to one edge with
    // dead space opposite it.
    const f = this.fitView;
    target.x = target.w >= f.w
      ? f.x + (f.w - target.w) / 2
      : Math.max(f.x - 40, Math.min(target.x, f.x + f.w - target.w + 40));
    target.y = target.h >= f.h
      ? f.y + (f.h - target.h) / 2
      : Math.max(f.y - 40, Math.min(target.y, f.y + f.h - target.h + 40));
    if (!animate) { this.view = target; this.applyView(); return; }
    this.animateView(target);
  },

  animateView(target) {
    const start = { ...this.view };
    const t0 = performance.now();
    const dur = 320;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = ease(t);
      this.view = {
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
        w: start.w + (target.w - start.w) * e,
        h: start.h + (target.h - start.h) * e,
      };
      this.applyView();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  bindSvgEvents() {
    const svg = document.getElementById('wd-svg');
    if (!svg || svg.dataset.bound) return;
    svg.dataset.bound = '1';

    // Wheel zoom, anchored on the pointer.
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX, y: e.clientY });
    }, { passive: false });

    // Drag to pan.
    let last = null;
    const toDiagram = (e) => {
      const r = svg.getBoundingClientRect();
      return {
        x: this.view.x + ((e.clientX - r.left) / r.width) * this.view.w,
        y: this.view.y + ((e.clientY - r.top) / r.height) * this.view.h,
      };
    };
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      last = toDiagram(e);
      this.isPanning = false;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!last) return;
      const now = toDiagram(e);
      const dx = now.x - last.x, dy = now.y - last.y;
      if (!this.isPanning && Math.hypot(dx, dy) < 3) return; // tolerate click jitter
      this.isPanning = true;
      svg.classList.add('is-panning');
      this.view.x -= dx;
      this.view.y -= dy;
      this.applyView();
    });
    const endPan = (e) => {
      if (last && svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      last = null;
      svg.classList.remove('is-panning');
      // Let the click handler know whether this was a drag.
      setTimeout(() => { this.isPanning = false; }, 0);
    };
    svg.addEventListener('pointerup', endPan);
    svg.addEventListener('pointercancel', endPan);

    // Click / keyboard activate a wire.
    svg.addEventListener('click', (e) => {
      if (this.isPanning) return;
      const g = e.target.closest('.wd-wire');
      if (g) this.select(g.dataset.circuit);
      else if (e.target.closest('.wd-node')) { /* node clicks are inert for now */ }
      else this.clearSelection();
    });
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest?.('.wd-wire');
      if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.select(g.dataset.circuit);
      }
    });
  },

  /* ======================================================================
     Selection, filtering, search
     ====================================================================== */

  select(circuitId, opts = {}) {
    const c = this.circuits.find(x => x.id === circuitId);
    if (!c) return;
    this.selectedId = circuitId;
    this.applyVisualState();
    this.renderInspector(c);
    if (opts.focus !== false) this.focusWire(circuitId);
    if (opts.push !== false) this.pushUrl();
    this.announce(`${c.name} selected.`);

    // On a stacked (narrow) layout the inspector sits below the diagram, so a
    // selection would otherwise appear to do nothing but dim some wires.
    if (opts.reveal !== false && window.matchMedia('(max-width: 1100px)').matches) {
      const panel = document.querySelector('.wd-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  clearSelection(opts = {}) {
    this.selectedId = null;
    this.applyVisualState();
    this.renderInspector(null);
    if (opts.push !== false) this.pushUrl();
  },

  /**
   * Single place that decides how every wire looks. Selection, category
   * filter and search all feed into this, so they can't fight each other
   * the way independent handlers would.
   */
  applyVisualState() {
    const q = this.searchQuery.trim().toLowerCase();
    const cats = this.activeCategories;
    let visible = 0;

    document.querySelectorAll('.wd-wire').forEach(g => {
      const id = g.dataset.circuit;
      const c = this.circuits.find(x => x.id === id);
      if (!c) return;

      const catOk = !cats || cats.has(c.category);
      const searchOk = !q || this.matchesSearch(c, q);
      const included = catOk && searchOk;
      const isSelected = this.selectedId === id;

      // Precedence matters here. While the user is searching, the search is
      // what they're looking at, so matches stay lit even though something is
      // selected — otherwise typing a query appears to blank the diagram.
      // With no query, a selection means "trace this one", so everything else
      // dims away.
      const dimmed = q ? !included
                       : (this.selectedId ? !isSelected : !included);

      g.classList.toggle('is-selected', isSelected);
      g.classList.toggle('is-match', included && !!q && !isSelected);
      g.classList.toggle('is-dimmed', dimmed);
      g.setAttribute('tabindex', included ? '0' : '-1');
      if (included) visible++;
    });

    // Node pin labels follow whatever their wire is doing.
    document.querySelectorAll('.wd-pin-label').forEach(t => {
      const id = t.dataset.circuit;
      const wire = document.querySelector(`.wd-wire[data-circuit="${CSS.escape(id)}"]`);
      t.classList.toggle('is-selected', this.selectedId === id);
      t.classList.toggle('is-dimmed', !!wire && wire.classList.contains('is-dimmed'));
    });

    this.updateResultCount(visible, q, cats);
  },

  /**
   * Two-tier search. A query that matches circuit names or categories returns
   * only those — typing "ground" should surface the three ground circuits, not
   * the fifteen whose description happens to mention grounding. Only when
   * nothing matches by name does it fall back to full-text, which is what
   * makes symptom searches like "misfire" or "no start" work.
   */
  searchTier(q) {
    // Cache key includes the platform — the same query resolves to different
    // circuits on a different platform.
    const key = this.platformId + ' ' + q;
    if (this._tierQ === key) return this._tierIds;
    const strong = this.circuits.filter(c =>
      c.name.toLowerCase().includes(q) || c.categoryLabel.toLowerCase().includes(q)
    ).map(c => c.id);
    this._tierQ = key;
    this._tierIds = strong.length ? new Set(strong) : null; // null = use full text
    return this._tierIds;
  },

  matchesSearch(c, q) {
    const strong = this.searchTier(q);
    if (strong) return strong.has(c.id);
    const hay = [
      c.name, c.categoryLabel, c.signalType, c.normalRange, c.gauge,
      c.gaugeInfo?.awg, c.fn, (c.faults || []).join(' '), c.testing, c.id,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  },

  updateResultCount(visible, q, cats) {
    const el = document.getElementById('wd-result-count');
    if (!el) return;
    const total = this.circuits.length;
    if (!q && !cats) {
      el.textContent = `${total} circuits`;
      el.classList.remove('is-empty');
      return;
    }
    el.textContent = visible === 0
      ? 'No circuits match'
      : `${visible} of ${total} circuits`;
    el.classList.toggle('is-empty', visible === 0);
  },

  setSearch(q) {
    this.searchQuery = q;
    this.applyVisualState();
  },

  toggleCategory(cat) {
    if (!this.activeCategories) this.activeCategories = new Set(Object.keys(CIRCUIT_CATEGORIES));
    if (this.activeCategories.has(cat)) this.activeCategories.delete(cat);
    else this.activeCategories.add(cat);
    // Everything on == no filter, which keeps the "all" state unambiguous.
    if (this.activeCategories.size === Object.keys(CIRCUIT_CATEGORIES).length) {
      this.activeCategories = null;
    }
    this.renderLegend();
    this.applyVisualState();
  },

  showAllCategories() {
    this.activeCategories = null;
    this.renderLegend();
    this.applyVisualState();
  },

  announce(msg) {
    const el = document.getElementById('wd-live');
    if (el) el.textContent = msg;
  },

  /* ======================================================================
     URL deep-linking
     ====================================================================== */

  pushUrl(replace = false) {
    const params = new URLSearchParams();
    params.set('platform', this.platformId);
    if (this.selectedId) params.set('circuit', this.selectedId);
    const url = `${location.pathname}?${params}`;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  },

  readUrl() {
    const params = new URLSearchParams(location.search);
    return {
      platform: params.get('platform'),
      circuit: params.get('circuit'),
    };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SVKWiring };
}
