/* HawQ-ai website scripts
   1. Hero: an illustrative floor plan where each camera's field of view is ray-cast
      against walls and columns, blind floor is hatched, and the configuration can be
      switched between "as drawn" and "VanGuard settings" (same cameras, same positions).
   2. VanGuard pipeline: the same building read as DXF lines, extruded in 3D, coloured by
      coverage, then optimised.
   3. DORI: a face rendered at the pixel density a 4K dome delivers at each distance.
   4. Sentinel: photos become a 3D point twin, the view drops into a distorted CCTV image,
      and a person is detected.
   5. Demo figures count up; copy-to-clipboard for the contact address. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Plan model (pure: no DOM). Units: 1 = 10 cm. Floor is 60 x 40 m.     */
  /* ------------------------------------------------------------------ */
  var PLAN = (function () {
    var W = 640, H = 440;
    var FLOOR = { x: 20, y: 20, w: 600, h: 400 };

    var walls = [
      // outer shell
      [20, 20, 620, 20], [620, 20, 620, 420], [620, 420, 20, 420], [20, 420, 20, 20],
      // main hall, east wall (door to waiting area)
      [340, 20, 340, 180], [340, 215, 340, 260],
      // main hall, south side: wide opening onto the corridor
      [20, 260, 120, 260], [260, 260, 340, 260],
      // waiting area, south wall (door)
      [340, 260, 540, 260], [570, 260, 620, 260],
      // offices, south wall (two doors) and party wall
      [340, 140, 380, 140], [410, 140, 560, 140], [590, 140, 620, 140],
      [480, 20, 480, 140],
      // corridor, south wall (four doors)
      [20, 300, 120, 300], [150, 300, 200, 300], [230, 300, 420, 300], [450, 300, 500, 300], [530, 300, 620, 300],
      // south rooms, party walls
      [180, 300, 180, 420], [340, 300, 340, 420], [480, 300, 480, 420]
    ];
    var structural = walls.length;

    var COL = 14;
    var columns = [[100, 110], [210, 110], [270, 190]];
    columns.forEach(function (c) {
      var x = c[0], y = c[1];
      walls.push([x, y, x + COL, y], [x + COL, y, x + COL, y + COL], [x + COL, y + COL, x, y + COL], [x, y + COL, x, y]);
    });

    var rooms = [
      { x: 20, y: 20, w: 320, h: 240, name: 'Main hall' },
      { x: 340, y: 20, w: 140, h: 120, name: 'Office' },
      { x: 480, y: 20, w: 140, h: 120, name: 'Office' },
      { x: 340, y: 140, w: 280, h: 120, name: 'Waiting area' },
      { x: 20, y: 260, w: 600, h: 40, name: 'Corridor', lx: 470 },
      { x: 20, y: 300, w: 160, h: 120, name: 'Storage' },
      { x: 180, y: 300, w: 160, h: 120, name: 'Security office' },
      { x: 340, y: 300, w: 140, h: 120, name: 'Server room' },
      { x: 480, y: 300, w: 140, h: 120, name: 'Staff room' }
    ];

    // k: optical constant, so that range = k / tan(fov / 2).
    // Widening a lens shortens how far the camera still delivers its required detail.
    // drawn / vg: [pan in degrees (0 = east, 90 = south), horizontal field of view in degrees].
    // The vg settings were searched offline under VanGuard's rule: no floor that the drawn
    // layout covers may become blind. Four cameras keep their drawn settings.
    var cams = [
      { x: 23, y: 23, k: 150, drawn: [60, 58], vg: [60, 58] },
      { x: 337, y: 23, k: 150, drawn: [118, 58], vg: [118, 58] },
      { x: 23, y: 257, k: 150, drawn: [-78, 58], vg: [-64, 50] },
      { x: 23, y: 280, k: 100, drawn: [7, 40], vg: [7, 40] },
      { x: 617, y: 280, k: 100, drawn: [173, 40], vg: [173, 40] },
      { x: 23, y: 417, k: 140, drawn: [-84, 64], vg: [-48, 82] },
      { x: 337, y: 303, k: 140, drawn: [172, 64], vg: [144, 72] },
      { x: 343, y: 417, k: 140, drawn: [-14, 64], vg: [-38, 76] },
      { x: 617, y: 303, k: 140, drawn: [96, 64], vg: [132, 82] },
      { x: 343, y: 23, k: 140, drawn: [30, 72], vg: [38, 76] },
      { x: 617, y: 23, k: 140, drawn: [176, 64], vg: [140, 80] },
      { x: 343, y: 257, k: 170, drawn: [-20, 56], vg: [-28, 56] }
    ];

    var RAD = Math.PI / 180;

    function lerpAngle(a, b, t) {
      var d = ((b - a + 540) % 360) - 180;
      return a + d * t;
    }

    function pose(cam, t) {
      var dir = lerpAngle(cam.drawn[0], cam.vg[0], t);
      var fov = cam.drawn[1] + (cam.vg[1] - cam.drawn[1]) * t;
      return { x: cam.x, y: cam.y, dir: dir, fov: fov, range: cam.k / Math.tan(fov * RAD / 2) };
    }

    // Distance along a ray to the nearest wall, capped at maxT.
    function castRay(px, py, ang, maxT) {
      var dx = Math.cos(ang), dy = Math.sin(ang), best = maxT;
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var sx = w[2] - w[0], sy = w[3] - w[1];
        var den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-9) continue;
        var ax = w[0] - px, ay = w[1] - py;
        var t = (ax * sy - ay * sx) / den;
        var u = (ax * dy - ay * dx) / den;
        if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
      }
      return best;
    }

    function fieldPolygon(p) {
      var pts = [p.x, p.y];
      var steps = Math.max(12, Math.ceil(p.fov * 1.5));
      var a0 = (p.dir - p.fov / 2) * RAD, da = (p.fov * RAD) / steps;
      for (var i = 0; i <= steps; i++) {
        var a = a0 + da * i, d = castRay(p.x, p.y, a, p.range);
        pts.push(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
      }
      return pts;
    }

    function blocked(ax, ay, bx, by) {
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var d1 = (w[2] - w[0]) * (ay - w[1]) - (w[3] - w[1]) * (ax - w[0]);
        var d2 = (w[2] - w[0]) * (by - w[1]) - (w[3] - w[1]) * (bx - w[0]);
        if ((d1 > 0) === (d2 > 0)) continue;
        var d3 = (bx - ax) * (w[1] - ay) - (by - ay) * (w[0] - ax);
        var d4 = (bx - ax) * (w[3] - ay) - (by - ay) * (w[2] - ax);
        if ((d3 > 0) !== (d4 > 0)) return true;
      }
      return false;
    }

    function sees(p, x, y) {
      var dx = x - p.x, dy = y - p.y, dist = Math.hypot(dx, dy);
      if (dist > p.range) return false;
      var diff = Math.abs(((Math.atan2(dy, dx) / RAD - p.dir + 540) % 360) - 180);
      if (diff > p.fov / 2) return false;
      return !blocked(p.x, p.y, x, y);
    }

    function inColumn(x, y) {
      for (var i = 0; i < columns.length; i++) {
        var c = columns[i];
        if (x > c[0] && x < c[0] + COL && y > c[1] && y < c[1] + COL) return true;
      }
      return false;
    }

    // Coverage on a 1 m grid (10 x 10 units per cell).
    function coverage(t) {
      var poses = cams.map(function (c) { return pose(c, t); });
      var CELL = 10, cells = [], covered = 0, total = 0;
      for (var y = FLOOR.y + CELL / 2; y < FLOOR.y + FLOOR.h; y += CELL) {
        for (var x = FLOOR.x + CELL / 2; x < FLOOR.x + FLOOR.w; x += CELL) {
          if (inColumn(x, y)) { cells.push(-1); continue; }
          var n = 0;
          for (var i = 0; i < poses.length; i++) if (sees(poses[i], x, y)) n++;
          cells.push(n);
          total++;
          if (n > 0) covered++;
        }
      }
      return { covered: covered, total: total, share: covered / total, blindM2: total - covered, cells: cells };
    }

    return {
      W: W, H: H, FLOOR: FLOOR, walls: walls, structural: structural, columns: columns, COL: COL,
      rooms: rooms, cams: cams, pose: pose, sees: sees, fieldPolygon: fieldPolygon, coverage: coverage
    };
  })();

  if (typeof module !== 'undefined' && module.exports) module.exports = PLAN;
  if (typeof document === 'undefined') return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ------------------------------------------------------------------ */
  /* Hero plan                                                           */
  /* ------------------------------------------------------------------ */
  function initPlan() {
    var canvas = document.getElementById('plan');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var hatch = document.createElement('canvas');
    var hctx = hatch.getContext('2d');

    var C = {
      floor: token('--ink', '#0B1726'),
      grid: token('--ink-line', '#273E5A'),
      wall: token('--on-ink-soft', '#B3C0CE'),
      label: token('--on-ink-mute', '#8394A9'),
      glow: token('--signal-glow', '#82A9FF'),
      blind: token('--blind', '#EC6A3A'),
      bg: token('--ink-2', '#102035')
    };

    var btnDrawn = document.getElementById('cfg-drawn');
    var btnVg = document.getElementById('cfg-vanguard');
    var roCovered = document.getElementById('ro-covered');
    var roBlind = document.getElementById('ro-blind');

    var stats = { a: PLAN.coverage(0), b: PLAN.coverage(1) };
    var t = 0, raf = 0, scale = 1, touched = false, pattern = null;

    function makePattern(target) {
      var tile = document.createElement('canvas');
      tile.width = 6; tile.height = 6;
      var p = tile.getContext('2d');
      p.strokeStyle = C.blind; p.lineWidth = 1.1; p.lineCap = 'square';
      p.beginPath();
      p.moveTo(0, 6); p.lineTo(6, 0);
      p.moveTo(-1, 1); p.lineTo(1, -1);
      p.moveTo(5, 7); p.lineTo(7, 5);
      p.stroke();
      return target.createPattern(tile, 'repeat');
    }

    function resize() {
      var cssW = canvas.clientWidth || PLAN.W;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pxW = Math.round(cssW * dpr), pxH = Math.round(cssW * dpr * PLAN.H / PLAN.W);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW; canvas.height = pxH;
        hatch.width = pxW; hatch.height = pxH;
      }
      scale = pxW / PLAN.W;
      pattern = makePattern(hctx);
    }

    function tracePoly(c, pts) {
      c.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      c.closePath();
    }

    function draw() {
      var F = PLAN.FLOOR;
      var poses = PLAN.cams.map(function (c) { return PLAN.pose(c, t); });
      var polys = poses.map(PLAN.fieldPolygon);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // floor + 5 m grid
      ctx.fillStyle = C.floor;
      ctx.fillRect(F.x, F.y, F.w, F.h);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (var gx = F.x + 50; gx < F.x + F.w; gx += 50) { ctx.moveTo(gx, F.y); ctx.lineTo(gx, F.y + F.h); }
      for (var gy = F.y + 50; gy < F.y + F.h; gy += 50) { ctx.moveTo(F.x, gy); ctx.lineTo(F.x + F.w, gy); }
      ctx.stroke();

      // blind floor: hatch everything, then cut out what any camera sees
      hctx.setTransform(1, 0, 0, 1, 0, 0);
      hctx.globalCompositeOperation = 'source-over';
      hctx.clearRect(0, 0, hatch.width, hatch.height);
      hctx.setTransform(scale, 0, 0, scale, 0, 0);
      hctx.fillStyle = pattern;
      hctx.fillRect(F.x, F.y, F.w, F.h);
      hctx.globalCompositeOperation = 'destination-out';
      hctx.fillStyle = '#000';
      polys.forEach(function (p) { hctx.beginPath(); tracePoly(hctx, p); hctx.fill(); });
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(hatch, 0, 0);
      ctx.restore();

      // fields of view: additive, so overlap reads brighter
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(47, 107, 240, 0.26)';
      polys.forEach(function (p) { ctx.beginPath(); tracePoly(ctx, p); ctx.fill(); });
      ctx.globalCompositeOperation = 'source-over';

      // walls and columns
      ctx.strokeStyle = C.wall;
      ctx.lineWidth = 3;
      ctx.lineCap = 'square';
      ctx.beginPath();
      for (var i = 0; i < PLAN.structural; i++) {
        var w = PLAN.walls[i];
        ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]);
      }
      ctx.stroke();
      ctx.fillStyle = C.wall;
      PLAN.columns.forEach(function (c) { ctx.fillRect(c[0], c[1], PLAN.COL, PLAN.COL); });

      // room names
      ctx.fillStyle = C.label;
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      PLAN.rooms.forEach(function (r) {
        var lx = r.lx || r.x + r.w / 2, ly = r.y + r.h / 2;
        if (r.name === 'Main hall') ly = r.y + r.h - 30;
        ctx.fillText(r.name.toUpperCase(), lx, ly);
      });

      // cameras
      poses.forEach(function (p) {
        var a = p.dir * Math.PI / 180;
        ctx.strokeStyle = C.glow;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(a) * 11, p.y + Math.sin(a) * 11);
        ctx.stroke();
        ctx.fillStyle = C.floor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }

    function fmtPct(v) { return (v * 100).toFixed(1) + '%'; }
    function fmtM2(v) { return Math.round(v).toLocaleString('en-US') + ' m²'; }

    function readout() {
      var share = stats.a.share + (stats.b.share - stats.a.share) * t;
      var blind = stats.a.blindM2 + (stats.b.blindM2 - stats.a.blindM2) * t;
      roCovered.textContent = fmtPct(share);
      roBlind.textContent = fmtM2(blind);
    }

    function render() { draw(); readout(); }

    function setPressed(target) {
      btnDrawn.setAttribute('aria-pressed', String(target === 0));
      btnVg.setAttribute('aria-pressed', String(target === 1));
    }

    function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

    function animateTo(target) {
      setPressed(target);
      cancelAnimationFrame(raf);
      if (reduceMotion) { t = target; render(); return; }
      var from = t, start = 0, dur = 1500 * Math.abs(target - from);
      if (dur < 1) { t = target; render(); return; }
      function step(now) {
        if (!start) start = now;
        var k = Math.min(1, (now - start) / dur);
        t = from + (target - from) * ease(k);
        render();
        if (k < 1) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
    }

    btnDrawn.addEventListener('click', function () { touched = true; animateTo(0); });
    btnVg.addEventListener('click', function () { touched = true; animateTo(1); });

    resize();
    render();

    if (window.ResizeObserver) {
      new ResizeObserver(function () { resize(); render(); }).observe(canvas);
    } else {
      window.addEventListener('resize', function () { resize(); render(); });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);

    // One orchestrated moment: after a beat, the same cameras move to VanGuard's settings.
    setTimeout(function () { if (!touched) animateTo(1); }, reduceMotion ? 0 : 1400);
  }

  /* ------------------------------------------------------------------ */
  /* Shared helpers for the animated players                             */
  /* ------------------------------------------------------------------ */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function hash01(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function seeded(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Size a canvas's backing store to its CSS width; returns px per logical unit.
  function sizeCanvas(canvas, w, h) {
    var cssW = canvas.clientWidth || w;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(cssW * dpr), ph = Math.round(cssW * dpr * h / w);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    return pw / w;
  }

  // Runs frame(dt) on every animation frame while el is on screen.
  function loopWhileVisible(el, frame) {
    var raf = 0, last = 0, on = false;
    function tick(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      frame(dt);
      if (on) raf = requestAnimationFrame(tick);
    }
    function start() { if (on) return; on = true; last = 0; raf = requestAnimationFrame(tick); }
    function stop() { on = false; cancelAnimationFrame(raf); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.12 }).observe(el);
    } else {
      start();
    }
  }

  function onResize(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(fn).observe(el);
    else window.addEventListener('resize', fn);
  }

  function hatchPattern(ctx, color) {
    var tile = document.createElement('canvas');
    tile.width = 6; tile.height = 6;
    var p = tile.getContext('2d');
    p.strokeStyle = color; p.lineWidth = 1.1; p.lineCap = 'square';
    p.beginPath();
    p.moveTo(0, 6); p.lineTo(6, 0);
    p.moveTo(-1, 1); p.lineTo(1, -1);
    p.moveTo(5, 7); p.lineTo(7, 5);
    p.stroke();
    return ctx.createPattern(tile, 'repeat');
  }

  // A looping, step-labelled animation: phase buttons show progress and jump on click.
  function makePlayer(opts) {
    var root = opts.root, canvas = opts.canvas, phases = opts.phases;
    var total = phases[phases.length - 1].end;
    var buttons = [].slice.call(root.querySelectorAll('.phase'));
    var caption = opts.caption;
    var t = reduceMotion ? opts.rest : 0, scale = 1, current = -1;

    function phaseIndex(time) {
      for (var i = 0; i < phases.length; i++) if (time < phases[i].end) return i;
      return phases.length - 1;
    }
    function syncUI() {
      var idx = phaseIndex(t);
      buttons.forEach(function (b, i) {
        var ph = phases[i];
        var p = reduceMotion ? (i === idx ? 1 : 0) : clamp01((t - ph.start) / (ph.end - ph.start));
        b.style.setProperty('--p', i < idx ? 1 : i > idx ? 0 : p);
        if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      if (idx !== current) {
        current = idx;
        if (caption) caption.textContent = phases[idx].caption;
      }
    }
    function render() {
      scale = sizeCanvas(canvas, opts.w, opts.h);
      opts.draw(t, scale);
      syncUI();
    }
    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        var ph = phases[i];
        t = reduceMotion ? ph.end - 0.01 : ph.start;
        render();
      });
    });
    onResize(canvas, render);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    render();
    if (!reduceMotion) {
      loopWhileVisible(canvas, function (dt) {
        t += dt;
        if (t >= total) t -= total;
        render();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* VanGuard pipeline: DXF lines, 3D extrusion, coverage, optimisation  */
  /* ------------------------------------------------------------------ */
  function initPipeline() {
    var root = document.getElementById('pipeline');
    var canvas = document.getElementById('pipeline-canvas');
    if (!root || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var readout = document.getElementById('pipeline-cov');
    var readoutBox = root.querySelector('.player__readout');

    var C = {
      bg: token('--ink', '#0B1726'),
      floor: token('--ink-2', '#102035'),
      grid: token('--ink-line', '#273E5A'),
      line: token('--on-ink-soft', '#B3C0CE'),
      mute: token('--on-ink-mute', '#8394A9'),
      glow: token('--signal-glow', '#82A9FF'),
      blind: token('--blind', '#EC6A3A')
    };

    var W = 900, H = 560, S = 0.9, WALL = 36;
    var OX = 372, OY = 58;
    function iso(x, y, z) { return [OX + (x - y) * 0.866 * S, OY + (x + y) * 0.5 * S - z * S]; }

    var A = PLAN.coverage(0), B = PLAN.coverage(1);
    var cells = [];
    var idx = 0;
    for (var cy = PLAN.FLOOR.y + 5; cy < PLAN.FLOOR.y + PLAN.FLOOR.h; cy += 10) {
      for (var cx = PLAN.FLOOR.x + 5; cx < PLAN.FLOOR.x + PLAN.FLOOR.w; cx += 10) {
        var a = A.cells[idx], b = B.cells[idx];
        idx++;
        if (a < 0) continue;
        cells.push({
          x: cx, y: cy, a: a, b: b,
          reveal: ((cx + cy - 40) / 1000) * 0.72,
          flip: 8.35 + 1.9 * hash01(idx)
        });
      }
    }
    var total = cells.length;

    var walls = PLAN.walls.slice(0, PLAN.structural).map(function (w) {
      return { w: w, depth: (w[0] + w[2] + w[1] + w[3]) / 2, alongX: w[1] === w[3] };
    });
    var drawOrder = walls.slice().sort(function (p, q) { return p.depth - q.depth; });

    var pattern = null, patternScale = 0;

    var phases = [
      { start: 0, end: 2.6, caption: 'Reads the architect’s DXF and the camera layout.' },
      { start: 2.6, end: 5.0, caption: 'Builds walls, openings and columns in 3D.' },
      { start: 5.0, end: 8.0, caption: 'Tests every square metre against every camera.' },
      { start: 8.0, end: 13.0, caption: 'Re-aims the same cameras. No covered floor is lost.' }
    ];

    function rhombus(x, y) {
      var p0 = iso(x - 5, y - 5, 0), p1 = iso(x + 5, y - 5, 0), p2 = iso(x + 5, y + 5, 0), p3 = iso(x - 5, y + 5, 0);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
    }

    function wallQuad(w, h) {
      var p0 = iso(w[0], w[1], 0), p1 = iso(w[2], w[3], 0), p2 = iso(w[2], w[3], h), p3 = iso(w[0], w[1], h);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
    }

    function draw(t, scale) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (!pattern || patternScale !== scale) { pattern = hatchPattern(ctx, C.blind); patternScale = scale; }

      var F = PLAN.FLOOR;
      var pPlan = clamp01(t / 2.6);
      var h = WALL * easeInOut(clamp01((t - 2.6) / 2.2));
      var pCov = clamp01((t - 5.0) / 2.6);
      var kAim = easeInOut(clamp01((t - 8.2) / 2.1));

      // floor slab
      var c0 = iso(F.x, F.y, 0), c1 = iso(F.x + F.w, F.y, 0), c2 = iso(F.x + F.w, F.y + F.h, 0), c3 = iso(F.x, F.y + F.h, 0);
      ctx.fillStyle = C.floor;
      ctx.beginPath();
      ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath();
      ctx.fill();

      // 5 m grid
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (var gx = F.x + 50; gx < F.x + F.w; gx += 50) { var g0 = iso(gx, F.y, 0), g1 = iso(gx, F.y + F.h, 0); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); }
      for (var gy = F.y + 50; gy < F.y + F.h; gy += 50) { var g2 = iso(F.x, gy, 0), g3 = iso(F.x + F.w, gy, 0); ctx.moveTo(g2[0], g2[1]); ctx.lineTo(g3[0], g3[1]); }
      ctx.stroke();

      // coverage cells, batched by state
      if (t >= 5.0) {
        var buckets = { blind: [], one: [], multi: [], gained: [] };
        var covered = 0;
        for (var i = 0; i < cells.length; i++) {
          var cell = cells[i];
          if (t < 8.0 && pCov < cell.reveal) continue;
          var state = t >= cell.flip ? cell.b : cell.a;
          if (state > 0) covered++;
          if (state === 0) buckets.blind.push(cell);
          else if (t >= cell.flip && cell.a === 0 && t - cell.flip < 0.6) buckets.gained.push(cell);
          else if (state === 1) buckets.one.push(cell);
          else buckets.multi.push(cell);
        }
        [['blind', pattern], ['one', 'rgba(47, 107, 240, 0.55)'], ['multi', 'rgba(130, 169, 255, 0.72)'], ['gained', 'rgba(190, 212, 255, 0.95)']].forEach(function (pair) {
          var list = buckets[pair[0]];
          if (!list.length) return;
          ctx.fillStyle = pair[1];
          ctx.beginPath();
          list.forEach(function (c) { rhombus(c.x, c.y); });
          ctx.fill();
        });
        if (t >= 8.0) readout.textContent = (covered / total * 100).toFixed(1) + '%';
        else readout.textContent = (A.share * 100).toFixed(1) + '%';
      }
      if (readoutBox) readoutBox.style.opacity = t >= 6.2 ? 1 : 0;

      // walls: DXF lines first, then extruded, translucent volumes
      if (h < 0.5) {
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        walls.forEach(function (o, i) {
          var f = clamp01((pPlan - (i / walls.length) * 0.7) / 0.3);
          if (f <= 0) return;
          var w = o.w, p0 = iso(w[0], w[1], 0), p1 = iso(w[0] + (w[2] - w[0]) * f, w[1] + (w[3] - w[1]) * f, 0);
          ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
        });
        ctx.stroke();
        ctx.fillStyle = C.line;
        PLAN.columns.forEach(function (c) {
          if (pPlan < 0.6) return;
          var q0 = iso(c[0], c[1], 0), q1 = iso(c[0] + PLAN.COL, c[1], 0), q2 = iso(c[0] + PLAN.COL, c[1] + PLAN.COL, 0), q3 = iso(c[0], c[1] + PLAN.COL, 0);
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.closePath(); ctx.fill();
        });
        // file label, like a CAD import
        ctx.fillStyle = C.mute;
        ctx.font = '500 13px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = clamp01(pPlan * 3);
        ctx.fillText('ground_floor.dxf · ' + Math.round(clamp01(pPlan / 0.7) * walls.length) + ' walls · 12 cameras', 24, H - 24);
        ctx.globalAlpha = 1;
      } else {
        drawOrder.forEach(function (o) {
          wallQuad(o.w, h);
          ctx.fillStyle = o.alongX ? 'rgba(238, 242, 246, 0.10)' : 'rgba(238, 242, 246, 0.17)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(179, 192, 206, 0.35)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          var t0 = iso(o.w[0], o.w[1], h), t1 = iso(o.w[2], o.w[3], h);
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.stroke();
        });
        PLAN.columns.forEach(function (c) {
          var x = c[0], y = c[1], s = PLAN.COL;
          [[x, y + s, x + s, y + s], [x + s, y, x + s, y + s]].forEach(function (w) {
            wallQuad(w, h);
            ctx.fillStyle = 'rgba(179, 192, 206, 0.55)';
            ctx.fill();
          });
          var r0 = iso(x, y, h), r1 = iso(x + s, y, h), r2 = iso(x + s, y + s, h), r3 = iso(x, y + s, h);
          ctx.fillStyle = C.line;
          ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.lineTo(r2[0], r2[1]); ctx.lineTo(r3[0], r3[1]); ctx.closePath(); ctx.fill();
        });
      }

      // cameras, riding on top of the walls
      var camAlpha = clamp01((pPlan - 0.7) / 0.2);
      if (camAlpha > 0) {
        ctx.globalAlpha = camAlpha;
        PLAN.cams.forEach(function (cam) {
          var p = PLAN.pose(cam, kAim);
          var a = p.dir * Math.PI / 180, z = h + 3;
          var o = iso(p.x, p.y, z), e = iso(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, z);
          ctx.strokeStyle = C.glow;
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
          ctx.fillStyle = C.bg;
          ctx.beginPath(); ctx.arc(o[0], o[1], 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }
    }

    makePlayer({ root: root, canvas: canvas, phases: phases, w: W, h: H, draw: draw, rest: 12.9, caption: document.getElementById('pipeline-caption') });
  }

  /* ------------------------------------------------------------------ */
  /* DORI: a face gets coarser as the person walks away from the camera  */
  /* ------------------------------------------------------------------ */
  function initDori() {
    var canvas = document.getElementById('dori-canvas');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var levelsEl = [].slice.call(document.querySelectorAll('.dori__levels .lvl'));
    var face = document.createElement('canvas');
    var fctx = face.getContext('2d');

    var C = {
      bg: token('--paper-2', '#F7F9FA'),
      ink: token('--text', '#0B1726'),
      soft: token('--text-soft', '#3A4A5E'),
      mute: token('--text-mute', '#58697D'),
      line: token('--paper-line', '#D2DAE2'),
      signal: token('--signal', '#2F6BF0'),
      bands: [token('--dori-i', '#0B1726'), token('--dori-r', '#1E56D6'), token('--dori-o', '#6F98F4'), token('--dori-d', '#B9CDF8')]
    };
    var LEVELS = [
      { name: 'Identify', max: 5.2 },
      { name: 'Recognise', max: 10.3 },
      { name: 'Observe', max: 20.9 },
      { name: 'Detect', max: 51.7 }
    ];
    // 4K dome, 3,840 px across a 112° field of view: pixels per metre at distance d.
    function pxPerM(d) { return 3840 / (2 * d * Math.tan(56 * Math.PI / 180)); }

    // Wide screens: side view left, camera image right. Phones: camera image on top.
    var WIDE = { W: 900, H: 300, GROUND: 214, X0: 64, X1: 588, POLE: 30, IX: 636, IY: 24, IS: 240 };
    var NARROW = { W: 440, H: 480, GROUND: 420, X0: 44, X1: 412, POLE: 22, IX: 100, IY: 12, IS: 240 };
    var L = WIDE, SPAN = 55;
    function xAt(d) { return L.X0 + (d / SPAN) * (L.X1 - L.X0); }

    var keys = [
      { t: 0, d: 5.2 }, { t: 1.6, d: 5.2 },
      { t: 2.6, d: 10.3 }, { t: 4.2, d: 10.3 },
      { t: 5.4, d: 20.9 }, { t: 7.0, d: 20.9 },
      { t: 8.8, d: 51.7 }, { t: 10.8, d: 51.7 },
      { t: 12.8, d: 5.2 }
    ];
    var TOTAL = keys[keys.length - 1].t;
    function distanceAt(t) {
      for (var i = 1; i < keys.length; i++) {
        if (t <= keys[i].t) {
          var k0 = keys[i - 1], k1 = keys[i];
          return k0.d + (k1.d - k0.d) * easeInOut((t - k0.t) / (k1.t - k0.t));
        }
      }
      return keys[0].d;
    }

    // Head-and-shoulders portrait, drawn on a 100 x 100 grid and rendered at n x n pixels.
    function paintFace(n) {
      face.width = n; face.height = n;
      fctx.setTransform(n / 100, 0, 0, n / 100, 0, 0);
      var g = fctx.createLinearGradient(0, 0, 0, 100);
      g.addColorStop(0, '#CDD5DE'); g.addColorStop(1, '#AEB9C6');
      fctx.fillStyle = g; fctx.fillRect(0, 0, 100, 100);
      fctx.fillStyle = '#22324A';
      fctx.beginPath(); fctx.moveTo(6, 100); fctx.bezierCurveTo(8, 78, 26, 70, 50, 69); fctx.bezierCurveTo(74, 70, 92, 78, 94, 100); fctx.closePath(); fctx.fill();
      fctx.fillStyle = '#E4E8EC';
      fctx.beginPath(); fctx.moveTo(41, 70); fctx.lineTo(59, 70); fctx.lineTo(50, 86); fctx.closePath(); fctx.fill();
      fctx.fillStyle = '#B98566'; fctx.fillRect(44, 56, 12, 15);
      fctx.fillStyle = '#CFA07F';
      fctx.beginPath(); fctx.ellipse(50, 41, 15.5, 19.5, 0, 0, Math.PI * 2); fctx.fill();
      fctx.fillStyle = '#2A211B';
      fctx.beginPath(); fctx.ellipse(50, 26, 16.5, 10, 0, Math.PI, 0); fctx.fill();
      fctx.fillRect(34, 25, 4, 12); fctx.fillRect(62, 25, 4, 12);
      fctx.fillStyle = '#1B1B1B';
      fctx.beginPath(); fctx.ellipse(44, 41, 2, 1.6, 0, 0, Math.PI * 2); fctx.ellipse(56, 41, 2, 1.6, 0, 0, Math.PI * 2); fctx.fill();
      fctx.strokeStyle = '#2A211B'; fctx.lineWidth = 1.4;
      fctx.beginPath(); fctx.moveTo(40, 36.5); fctx.lineTo(47, 36); fctx.moveTo(53, 36); fctx.lineTo(60, 36.5); fctx.stroke();
      fctx.strokeStyle = '#A9785C'; fctx.lineWidth = 1.2;
      fctx.beginPath(); fctx.moveTo(50, 42); fctx.lineTo(48.5, 49); fctx.lineTo(51, 49.5); fctx.stroke();
      fctx.strokeStyle = '#8C4B45'; fctx.lineWidth = 1.6;
      fctx.beginPath(); fctx.moveTo(45, 54); fctx.quadraticCurveTo(50, 56.5, 55, 54); fctx.stroke();
      fctx.fillStyle = '#F2F4F6'; fctx.fillRect(63, 80, 13, 9);
      fctx.fillStyle = '#2F6BF0'; fctx.fillRect(63, 80, 13, 3);
    }

    var lastN = 0, activeLevel = -1;

    function draw(t, scale) {
      var GROUND = L.GROUND, X1 = L.X1, POLE = L.POLE, TOP = GROUND - 144;
      var d = distanceAt(t);
      var ppm = pxPerM(d);
      var level = 4;
      for (var i = 0; i < LEVELS.length; i++) if (d <= LEVELS[i].max + 0.05) { level = i; break; }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // camera on its pole, and its field of view
      ctx.fillStyle = 'rgba(47, 107, 240, 0.07)';
      ctx.beginPath(); ctx.moveTo(POLE + 10, TOP - 6); ctx.lineTo(X1 + 8, TOP - 40); ctx.lineTo(X1 + 8, GROUND); ctx.lineTo(POLE + 66, GROUND); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.soft; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(POLE, GROUND); ctx.lineTo(POLE, TOP); ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(POLE - 6, TOP - 14, 30, 16, 3); else ctx.rect(POLE - 6, TOP - 14, 30, 16); ctx.fill();
      ctx.fillStyle = C.signal; ctx.beginPath(); ctx.arc(POLE + 22, TOP - 6, 4, 0, Math.PI * 2); ctx.fill();

      // ground, DORI bands, ticks
      ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(POLE - 10, GROUND); ctx.lineTo(X1 + 12, GROUND); ctx.stroke();
      var from = 0;
      LEVELS.forEach(function (L, i) {
        ctx.fillStyle = C.bands[i];
        ctx.globalAlpha = i === level ? 1 : 0.55;
        ctx.fillRect(xAt(from), GROUND + 6, xAt(L.max) - xAt(from) - 1, 12);
        from = L.max;
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.mute;
      ctx.font = '400 12px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var m = 0; m <= 50; m += 10) {
        ctx.fillRect(xAt(m) - 0.5, GROUND + 20, 1, 5);
        ctx.fillText(m === 50 ? '50 m' : String(m), xAt(m), GROUND + 30);
      }

      // the person
      var px = xAt(d);
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(px, GROUND - 62, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - 11, GROUND - 50); ctx.lineTo(px + 11, GROUND - 50); ctx.lineTo(px + 9, GROUND - 22); ctx.lineTo(px + 6, GROUND); ctx.lineTo(px + 1, GROUND); ctx.lineTo(px, GROUND - 20); ctx.lineTo(px - 1, GROUND); ctx.lineTo(px - 6, GROUND); ctx.lineTo(px - 9, GROUND - 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.soft;
      ctx.font = '500 13px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(d.toFixed(1) + ' m', px, GROUND - 80);

      // what the camera sees: a 0.6 m wide crop at the current pixel density
      var n = Math.max(5, Math.min(170, Math.round(0.6 * ppm)));
      if (n !== lastN) { paintFace(n); lastN = n; }
      var IX = L.IX, IY = L.IY, IS = L.IS;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(face, 0, 0, n, n, IX, IY, IS, IS);
      ctx.imageSmoothingEnabled = true;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      ctx.strokeRect(IX + 0.5, IY + 0.5, IS - 1, IS - 1);
      ctx.fillStyle = 'rgba(11, 23, 38, 0.78)';
      ctx.fillRect(IX, IY + IS - 30, IS, 30);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.font = '600 13px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillText(level < 4 ? LEVELS[level].name : 'Below detect', IX + 10, IY + IS - 10);
      ctx.textAlign = 'right';
      ctx.font = '400 12px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(Math.round(ppm) + ' px/m', IX + IS - 10, IY + IS - 10);

      if (level !== activeLevel) {
        activeLevel = level;
        levelsEl.forEach(function (el, i) { el.classList.toggle('is-active', i === level); });
      }
    }

    var t = reduceMotion ? 2.8 : 0;
    function render() {
      var next = (canvas.parentNode.clientWidth || 900) < 560 ? NARROW : WIDE;
      if (next !== L) { L = next; canvas.style.aspectRatio = L.W + ' / ' + L.H; }
      draw(t, sizeCanvas(canvas, L.W, L.H));
    }
    onResize(canvas, render);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    render();
    if (!reduceMotion) loopWhileVisible(canvas, function (dt) { t = (t + dt) % TOTAL; render(); });
  }

  /* ------------------------------------------------------------------ */
  /* Sentinel: photos -> 3D point twin -> CCTV view -> detection         */
  /* ------------------------------------------------------------------ */
  function initSentinel() {
    var root = document.getElementById('sentinel-player');
    var canvas = document.getElementById('sentinel-canvas');
    if (!root || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var W = 900, H = 506;
    var C = {
      bg: token('--ink', '#0B1726'),
      bg2: token('--ink-2', '#102035'),
      glow: token('--signal-glow', '#82A9FF'),
      signal: token('--signal', '#2F6BF0'),
      soft: token('--on-ink-soft', '#B3C0CE'),
      blind: token('--blind', '#EC6A3A')
    };

    var rnd = seeded(7);
    var pts = [];
    function jitter(hex, amt) {
      var n = parseInt(hex.slice(1), 16), v = (rnd() - 0.5) * amt;
      var r = Math.max(0, Math.min(255, (n >> 16) + v)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + v)), b = Math.max(0, Math.min(255, (n & 255) + v));
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }
    function add(x, y, z, col, size, person) { pts.push({ x: x, y: y, z: z, col: col, size: size || 0.09, person: !!person }); }

    // room: floor, back wall with window and door, left wall, a column, a desk
    for (var i = 0; i < 1900; i++) { var fx = rnd() * 8, fz = rnd() * 6; add(fx, 0, fz, jitter(((Math.floor(fx) + Math.floor(fz)) % 2) ? '#727982' : '#676E77', 16)); }
    for (i = 0; i < 1150; i++) {
      var bx = rnd() * 8, by = rnd() * 3, col = '#B9C1CA';
      if (bx > 1.2 && bx < 3.4 && by > 1.1 && by < 2.4) col = '#7FA3C6';
      else if (bx > 6.2 && bx < 7.2 && by < 2.1) col = '#55606D';
      add(bx, by, 6, jitter(col, 16));
    }
    for (i = 0; i < 850; i++) add(0, rnd() * 3, rnd() * 6, jitter('#A6AEB8', 14));
    for (i = 0; i < 220; i++) {
      var side = i % 4, u = rnd(), cyy = rnd() * 3;
      var px = side === 0 ? 5.3 + u * 0.4 : side === 1 ? 5.7 : side === 2 ? 5.3 + u * 0.4 : 5.3;
      var pz = side === 0 ? 2.3 : side === 1 ? 2.3 + u * 0.4 : side === 2 ? 2.7 : 2.3 + u * 0.4;
      add(px, cyy, pz, jitter('#AEB6BF', 14));
    }
    for (i = 0; i < 170; i++) {
      if (i < 110) add(1.4 + rnd() * 1.6, 0.75, 3.8 + rnd() * 0.8, jitter('#8A6A4C', 20));
      else add(1.4 + rnd() * 1.6, rnd() * 0.75, 3.8, jitter('#6F5540', 16));
    }
    // a person, added for the detection test
    for (i = 0; i < 420; i++) {
      var part = rnd(), a = rnd() * Math.PI * 2, x0, y0, z0, c;
      if (part < 0.34) { var leg = rnd() < 0.5 ? -0.11 : 0.11; x0 = leg + Math.cos(a) * 0.08; z0 = Math.sin(a) * 0.08; y0 = rnd() * 0.85; c = '#2A313C'; }
      else if (part < 0.8) { x0 = Math.cos(a) * 0.2; z0 = Math.sin(a) * 0.13; y0 = 0.85 + rnd() * 0.62; c = '#2F4A73'; }
      else { var ph = rnd() * Math.PI; x0 = Math.cos(a) * Math.sin(ph) * 0.11; z0 = Math.sin(a) * Math.sin(ph) * 0.12; y0 = 1.6 + Math.cos(ph) * 0.12; c = '#C79A7A'; }
      add(x0, y0, z0, jitter(c, 14), 0.07, true);
    }

    // capture positions (a walk through the room), each looking at the room
    var shots = [[1.2, 0.9], [2.6, 0.6], [4.2, 0.7], [5.8, 0.9], [7.0, 1.5], [7.3, 3.0], [6.6, 4.5]].map(function (p) { return { x: p[0], y: 1.6, z: p[1] }; });
    var LOOK = { x: 3.2, y: 1.1, z: 4.0 };
    pts.forEach(function (p, i) { p.shot = shots[i % shots.length]; p.delay = rnd() * 1.3; });

    function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
    function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
    function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    function norm(a) { var l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
    function mix(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }; }

    function camera(eye, target, focal, k1) {
      var f = norm(sub(target, eye)), r = norm(cross(f, { x: 0, y: 1, z: 0 })), u = cross(r, f);
      var R2 = (W / 2) * (W / 2) + (H / 2) * (H / 2);
      return function (p) {
        var d = sub(p, eye), zc = dot(d, f);
        if (zc < 0.15) return null;
        var sx = dot(d, r) / zc * focal, sy = -dot(d, u) / zc * focal;
        var g = 1 + k1 * (sx * sx + sy * sy) / R2;
        return { x: W / 2 + sx * g, y: H / 2 + sy * g, z: zc, s: focal / zc };
      };
    }

    var ORBIT_C = { x: 4, y: 0.8, z: 3 };
    var CCTV = { eye: { x: 7.75, y: 2.75, z: 0.25 }, target: { x: 3.4, y: 0.75, z: 3.7 } };
    var phases = [
      { start: 0, end: 3.0, caption: 'A walk-through video of the site is enough.' },
      { start: 3.0, end: 6.5, caption: 'Gaussian Splatting rebuilds it as a 3D twin.' },
      { start: 6.5, end: 9.0, caption: 'Each camera’s real image: lens, distortion, resolution.' },
      { start: 9.0, end: 13.0, caption: 'Synthetic people test your detector, camera by camera.' }
    ];
    var order = [];

    function draw(t, scale) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, C.bg2); g.addColorStop(1, C.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      var theta = 0.12 + 0.045 * Math.min(t, 6.5);
      var orbitEye = { x: ORBIT_C.x + 12.5 * Math.sin(theta), y: 6.8, z: ORBIT_C.z - 12.5 * Math.cos(theta) };
      var kView = easeInOut(clamp01((t - 6.5) / 1.5));
      var eye = mix(orbitEye, CCTV.eye, kView), target = mix(ORBIT_C, CCTV.target, kView);
      var project = camera(eye, target, 980 + (430 - 980) * kView, -0.3 * kView);
      var fade = t > 12.5 ? clamp01((13 - t) / 0.5) : 1;

      // capture frustums
      var shotsAlpha = t < 3 ? 1 : clamp01(1 - (t - 4.6) / 1.2);
      if (shotsAlpha > 0) {
        shots.forEach(function (s, i) {
          var appear = clamp01((t - 0.25 - i * 0.33) / 0.25);
          if (appear <= 0) return;
          var f = norm(sub(LOOK, s)), r = norm(cross(f, { x: 0, y: 1, z: 0 })), u = cross(r, f);
          var c = { x: s.x + f.x * 0.5, y: s.y + f.y * 0.5, z: s.z + f.z * 0.5 };
          var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (q) {
            return project({ x: c.x + r.x * q[0] * 0.32 + u.x * q[1] * 0.2, y: c.y + r.y * q[0] * 0.32 + u.y * q[1] * 0.2, z: c.z + r.z * q[0] * 0.32 + u.z * q[1] * 0.2 });
          });
          var apex = project(s);
          if (!apex || corners.some(function (q) { return !q; })) return;
          var flash = clamp01(1 - (t - 0.25 - i * 0.33) / 0.5);
          ctx.globalAlpha = appear * shotsAlpha * fade;
          ctx.fillStyle = 'rgba(130, 169, 255, ' + (0.12 + 0.5 * flash) + ')';
          ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); corners.forEach(function (q) { ctx.lineTo(q.x, q.y); }); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = C.glow; ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.beginPath(); corners.forEach(function (q) { ctx.moveTo(apex.x, apex.y); ctx.lineTo(q.x, q.y); }); ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }

      // points: fly from the photo that captured them to their place in the twin
      var personIn = clamp01((t - 9.1) / 0.6);
      var walk = clamp01((t - 9.1) / 3.4);
      var body = { x: 5.5 - 0.8 * walk, z: 1.9 + 0.6 * walk };
      var proj = [], minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q, alpha;
        if (p.person) {
          if (personIn <= 0) continue;
          q = { x: body.x + p.x, y: p.y, z: body.z + p.z };
          alpha = personIn;
        } else {
          var k = easeInOut(clamp01((t - 3.0 - p.delay) / 1.6));
          if (k <= 0) continue;
          q = k >= 1 ? p : mix(p.shot, p, k);
          alpha = k;
        }
        var s = project(q);
        if (!s || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) continue;
        s.col = p.col; s.a = alpha; s.r = Math.max(0.8, Math.min(9, p.size * s.s * 0.55));
        proj.push(s);
        if (p.person) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
      }
      proj.sort(function (a, b) { return b.z - a.z; });
      for (i = 0; i < proj.length; i++) {
        var o = proj[i];
        ctx.globalAlpha = o.a * 0.9 * fade;
        ctx.fillStyle = o.col;
        if (o.r < 1.6) { ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2); } else { ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;

      // simulated camera frame
      var hud = clamp01((t - 7.4) / 0.6) * fade;
      if (hud > 0) {
        ctx.globalAlpha = hud;
        ctx.strokeStyle = C.soft; ctx.lineWidth = 2;
        var m = 18, L = 26;
        ctx.beginPath();
        ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
        ctx.moveTo(W - m - L, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + L);
        ctx.moveTo(W - m, H - m - L); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m - L, H - m);
        ctx.moveTo(m + L, H - m); ctx.lineTo(m, H - m); ctx.lineTo(m, H - m - L);
        ctx.stroke();
        ctx.fillStyle = 'rgba(11, 23, 38, 0.7)';
        ctx.fillRect(m + 10, m + 10, 238, 44);
        ctx.fillStyle = C.soft;
        ctx.font = '400 13px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('CAM 07 · 2.8 mm · 112°', m + 18, m + 29);
        ctx.fillText('k1 −0.30 · 2688 × 1520', m + 18, m + 47);
        ctx.textAlign = 'right';
        ctx.fillText('SIMULATED VIEW', W - m - 12, H - m - 12);
        ctx.fillStyle = C.blind;
        ctx.beginPath(); ctx.arc(W - m - 14, m + 16, 5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // detection
      var boxIn = clamp01((t - 9.7) / 0.4) * fade;
      if (boxIn > 0 && maxX > minX) {
        var pad = 6, bx = minX - pad, by = minY - pad, bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
        var score = 0.91 * clamp01((t - 9.7) / 0.9);
        ctx.globalAlpha = boxIn;
        ctx.strokeStyle = C.glow; ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = C.signal;
        ctx.fillRect(bx - 1, by - 22, 112, 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '500 13px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('person ' + score.toFixed(2), bx + 7, by - 6);
        ctx.globalAlpha = 1;
      }
    }

    makePlayer({ root: root, canvas: canvas, phases: phases, w: W, h: H, draw: draw, rest: 11.5, caption: document.getElementById('sentinel-caption') });
  }

  /* ------------------------------------------------------------------ */
  /* Demo figures count up the first time they come into view            */
  /* ------------------------------------------------------------------ */
  function initCountUp() {
    var els = [].slice.call(document.querySelectorAll('[data-count]'));
    if (!els.length || reduceMotion || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el = e.target, node = el.firstChild, end = parseFloat(el.getAttribute('data-count'));
        var dec = parseInt(el.getAttribute('data-decimals') || '0', 10), start = 0;
        function step(now) {
          if (!start) start = now;
          var k = clamp01((now - start) / 1400);
          node.nodeValue = (end * easeInOut(k)).toFixed(dec);
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ */
  /* Copy the contact address                                            */
  /* ------------------------------------------------------------------ */
  function initCopy() {
    var btn = document.getElementById('copy-email');
    var addr = document.getElementById('contact-email');
    if (!btn || !addr) return;
    function selectText() {
      var range = document.createRange();
      range.selectNodeContents(addr);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    btn.addEventListener('click', function () {
      var text = addr.textContent.trim();
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, selectText);
      } else {
        selectText();
      }
    });
  }

  initPlan();
  initPipeline();
  initDori();
  initSentinel();
  initCountUp();
  initCopy();
})();
