/* HawQ-ai website scripts
   1. Hero: an illustrative floor plan where each camera's field of view is ray-cast
      against walls and columns, blind floor is hatched, and the configuration can be
      switched between "as drawn" and "VanGuard settings" (same cameras, same positions).
   2. VanGuard pipeline: the same building as an isometric architectural model. DXF
      lines, walls and furniture rise, a close look at one camera, light beams and a
      floor coverage map, then the cameras are re-aimed.
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
      scale = opts.size ? opts.size() : sizeCanvas(canvas, opts.w, opts.h);
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
  /* VanGuard pipeline: an isometric architectural model. DXF lines,     */
  /* walls and furniture rise, a close look at one camera, light beams   */
  /* and a floor coverage map, then the same cameras are re-aimed.       */
  /* ------------------------------------------------------------------ */
  function initPipeline() {
    var root = document.getElementById('pipeline');
    var canvas = document.getElementById('pipeline-canvas');
    if (!root || !canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var readout = document.getElementById('pipeline-cov');
    var readoutBox = root.querySelector('.player__readout');
    var legend = root.querySelector('.player__legend');
    var C = {
      bg: token('--ink', '#0B1726'),
      line: token('--on-ink-soft', '#B3C0CE'),
      mute: token('--on-ink-mute', '#8394A9'),
      glow: token('--signal-glow', '#82A9FF')
    };

    var W = 900, H = 560, S = 0.9, WALL = 32, MOUNT = 27;
    var OX = 372, OY = 64, CX = 0.866 * S, CY = 0.5 * S;
    function iso(x, y, z) { return [OX + (x - y) * CX, OY + (x + y) * CY - z * S]; }
    var rnd = seeded(23);

    /* floor finishes, painted once in plan space (2 px per 10 cm) */
    var PX = 2;
    var floorLayer = document.createElement('canvas');
    floorLayer.width = 600 * PX; floorLayer.height = 400 * PX;
    (function paintFloor() {
      var g = floorLayer.getContext('2d');
      g.scale(PX, PX);
      g.translate(-20, -20);
      var finish = {
        'Main hall': { c: '#1C2E46', grid: 12 }, 'Waiting area': { c: '#1C2E46', grid: 12 }, 'Corridor': { c: '#18293F', grid: 12 },
        'Office': { c: '#22324A', grid: 0 }, 'Staff room': { c: '#22324A', grid: 0 }, 'Security office': { c: '#1F3048', grid: 6 },
        'Storage': { c: '#172536', grid: 0 }, 'Server room': { c: '#131F2E', grid: 6 }
      };
      PLAN.rooms.forEach(function (r) {
        var f = finish[r.name] || finish['Main hall'];
        g.fillStyle = f.c;
        g.fillRect(r.x, r.y, r.w, r.h);
        for (var i = 0; i < r.w * r.h / 18; i++) {
          g.fillStyle = 'rgba(200, 215, 235, ' + (0.015 + rnd() * 0.045) + ')';
          g.fillRect(r.x + rnd() * r.w, r.y + rnd() * r.h, 0.6, 0.6);
        }
        if (f.grid) {
          g.strokeStyle = 'rgba(150, 175, 210, 0.2)';
          g.lineWidth = 0.35;
          g.beginPath();
          for (var x = r.x + f.grid; x < r.x + r.w; x += f.grid) { g.moveTo(x, r.y); g.lineTo(x, r.y + r.h); }
          for (var y = r.y + f.grid; y < r.y + r.h; y += f.grid) { g.moveTo(r.x, y); g.lineTo(r.x + r.w, y); }
          g.stroke();
        }
      });
    })();

    /* coverage map in plan space: cameras counted per pixel */
    var CW = 600, CH = 400;
    var countCanvas = document.createElement('canvas'); countCanvas.width = CW; countCanvas.height = CH;
    var cctx = countCanvas.getContext('2d', { willReadFrequently: true });
    var covLayer = document.createElement('canvas'); covLayer.width = CW; covLayer.height = CH;
    var vctx = covLayer.getContext('2d');
    var covImg = vctx.createImageData(CW, CH);
    var solid = new Uint8Array(CW * CH);
    PLAN.columns.forEach(function (c) {
      for (var y = c[1] - 20; y < c[1] - 20 + PLAN.COL; y++) for (var x = c[0] - 20; x < c[0] - 20 + PLAN.COL; x++) solid[y * CW + x] = 1;
    });
    function paintCoverage(polys) {
      cctx.globalCompositeOperation = 'source-over';
      cctx.clearRect(0, 0, CW, CH);
      cctx.globalCompositeOperation = 'lighter';
      cctx.fillStyle = 'rgb(0, 0, 40)';
      polys.forEach(function (p) {
        cctx.beginPath();
        cctx.moveTo(p[0] - 20, p[1] - 20);
        for (var i = 2; i < p.length; i += 2) cctx.lineTo(p[i] - 20, p[i + 1] - 20);
        cctx.closePath();
        cctx.fill();
      });
      var src = cctx.getImageData(0, 0, CW, CH).data, dst = covImg.data;
      for (var i = 0, px = 0; i < src.length; i += 4, px++) {
        if (solid[px]) { dst[i + 3] = 0; continue; }
        var n = Math.round(src[i + 2] / 40);
        if (n === 0) {
          var x = px % CW, y = (px / CW) | 0;
          dst[i] = 236; dst[i + 1] = 106; dst[i + 2] = 58; dst[i + 3] = (x + y) % 7 < 2 ? 215 : 34;
        } else if (n === 1) {
          dst[i] = 47; dst[i + 1] = 107; dst[i + 2] = 240; dst[i + 3] = 105;
        } else {
          dst[i] = 130; dst[i + 1] = 169; dst[i + 2] = 255; dst[i + 3] = 150;
        }
      }
      vctx.putImageData(covImg, 0, 0);
    }

    /* the model: walls, columns, furniture, people, sorted back to front */
    var PAL = {
      wall: { t: '#F2F4F7', s: ['#9FAAB7', '#D3D9E0'], e: ['#8390A0', '#B3BDC8'], edge: 'rgba(255, 255, 255, 0.85)' },
      column: { t: '#E3E7EC', s: ['#96A2B0', '#C5CCD5'], e: ['#7C8898', '#A8B2BF'], edge: 'rgba(255, 255, 255, 0.6)' },
      wood: { t: '#C9A37D', s: ['#8F6F4C', '#A5825C'], e: ['#775C40', '#8D6D4D'] },
      metal: { t: '#5A6574', s: ['#2E3641', '#3F4855'], e: ['#252C35', '#343C47'] },
      fabric: { t: '#7489A8', s: ['#4D6080', '#5E7291'], e: ['#415270', '#51637F'] },
      counter: { t: '#E8EBEF', s: ['#A9B2BE', '#CBD1D9'], e: ['#8E99A6', '#B0B9C4'], edge: 'rgba(255, 255, 255, 0.6)' }
    };
    var items = [];
    function addBox(x0, y0, x1, y1, h, kind, extra) {
      items.push({ x0: x0, y0: y0, x1: x1, y1: y1, h: h, kind: kind, extra: extra, depth: (x0 + x1 + y0 + y1) / 2 });
    }
    PLAN.walls.slice(0, PLAN.structural).forEach(function (w, i) {
      var T = i < 4 ? 3 : 1.6;
      addBox(Math.min(w[0], w[2]) - T / 2, Math.min(w[1], w[3]) - T / 2, Math.max(w[0], w[2]) + T / 2, Math.max(w[1], w[3]) + T / 2, WALL, 'wall');
    });
    PLAN.columns.forEach(function (c) { addBox(c[0], c[1], c[0] + PLAN.COL, c[1] + PLAN.COL, WALL, 'column'); });
    function around(cx, cy, hw, hd, h, kind, extra) { addBox(cx - hw, cy - hd, cx + hw, cy + hd, h, kind, extra); }
    [[385, 70], [435, 70], [385, 110], [435, 110], [525, 70], [575, 70], [525, 110], [575, 110]].forEach(function (d) {
      around(d[0], d[1], 8, 4, 7.4, 'wood');
      around(d[0], d[1] - 2, 3, 0.4, 11, 'metal');
    });
    [370, 390, 410, 430].forEach(function (x) { around(x, 345, 3.1, 5.5, 20, 'metal', 'leds'); around(x, 385, 3.1, 5.5, 20, 'metal', 'leds'); });
    around(168, 355, 2.5, 30, 21, 'metal');
    around(110, 312, 20, 2.5, 21, 'metal');
    around(260, 385, 18, 4.5, 7.6, 'wood');
    around(260, 413, 16, 0.6, 20, 'metal');
    around(550, 360, 12, 5.5, 7.4, 'wood');
    [[400, 180], [400, 210], [470, 180], [470, 210], [540, 180], [540, 210]].forEach(function (b) { around(b[0], b[1], 17, 2.75, 4.5, 'fabric'); });
    [80, 125, 170].forEach(function (x) { around(x, 55, 16, 4, 10.5, 'counter'); });
    var people = [[100, 130], [150, 95], [220, 160], [280, 90], [200, 235], [440, 195], [510, 242], [300, 180]];
    var clothes = ['#5D7394', '#9B7A62', '#6E8A6E', '#A7AFBA', '#8C6A83', '#6A8CB0', '#B09A62', '#7F8FA6'];
    people.forEach(function (p, i) { items.push({ person: true, x: p[0], y: p[1], col: clothes[i], depth: p[0] + p[1] }); });
    items.sort(function (a, b) { return a.depth - b.depth; });

    function quad(p0, p1, p2, p3) {
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
    }
    function shade(p0, p1, stops) {
      var g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      g.addColorStop(0, stops[0]); g.addColorStop(1, stops[1]);
      return g;
    }
    function drawBox(b, h) {
      var pal = PAL[b.kind];
      var s0 = iso(b.x0, b.y1, 0), s1 = iso(b.x1, b.y1, 0), s2 = iso(b.x1, b.y1, h), s3 = iso(b.x0, b.y1, h);
      quad(s0, s1, s2, s3); ctx.fillStyle = shade(s0, s3, pal.s); ctx.fill();
      var e0 = iso(b.x1, b.y0, 0), e2 = iso(b.x1, b.y0, h);
      quad(e0, s1, s2, e2); ctx.fillStyle = shade(e0, e2, pal.e); ctx.fill();
      var t0 = iso(b.x0, b.y0, h);
      quad(t0, e2, s2, s3); ctx.fillStyle = pal.t; ctx.fill();
      if (pal.edge) { ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.5; ctx.stroke(); }
      if (b.extra === 'leds' && h > 12) {
        for (var k = 0; k < 5; k++) {
          var l = iso(b.x0 + 1.2, b.y1, h - 3 - k * 3.2);
          ctx.fillStyle = k % 2 ? '#5CE0A0' : '#82A9FF';
          ctx.fillRect(l[0], l[1], 1.1, 0.8);
        }
      }
    }
    function drawPerson(p, rise) {
      if (rise < 0.95) return;
      var f = iso(p.x, p.y, 0), hip = iso(p.x, p.y, 8.5), neck = iso(p.x, p.y, 14.5), head = iso(p.x, p.y, 16.6);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath(); ctx.ellipse(f[0] + 1.2, f[1] + 0.3, 3, 1.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2B323B'; ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(f[0] - 0.8, f[1]); ctx.lineTo(hip[0] - 0.4, hip[1]); ctx.moveTo(f[0] + 0.8, f[1]); ctx.lineTo(hip[0] + 0.4, hip[1]); ctx.stroke();
      ctx.strokeStyle = p.col; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(hip[0], hip[1] - 1); ctx.lineTo(neck[0], neck[1]); ctx.stroke();
      ctx.fillStyle = '#D2A585';
      ctx.beginPath(); ctx.arc(head[0], head[1], 1.9, 0, Math.PI * 2); ctx.fill();
    }

    /* camera glyphs, drawn at mounting height */
    var DOMES = { 0: 1, 1: 1, 2: 1, 11: 1 };
    function drawCamera(i, p, alpha) {
      if (alpha <= 0) return;
      var a = p.dir * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      if (DOMES[i]) {
        var m = iso(p.x, p.y, MOUNT + 1.5);
        ctx.fillStyle = '#131A23';
        ctx.beginPath(); ctx.ellipse(m[0], m[1] + 1.2, 4.3, 3.6, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#EEF1F5';
        ctx.beginPath(); ctx.ellipse(m[0], m[1], 5.2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#B9C2CD'; ctx.lineWidth = 0.5; ctx.stroke();
        var l = iso(p.x + ca * 2.2, p.y + sa * 2.2, MOUNT - 1.5);
        ctx.fillStyle = C.glow;
        ctx.beginPath(); ctx.arc(l[0], l[1] + 1.2, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath(); ctx.ellipse(m[0] - 1.6, m[1] + 2.4, 0.9, 0.5, -0.4, 0, Math.PI * 2); ctx.fill();
      } else {
        var wallPt = iso(p.x - ca * 2.5, p.y - sa * 2.5, MOUNT + 1), m0 = iso(p.x + ca * 2, p.y + sa * 2, MOUNT);
        var m1 = iso(p.x + ca * 15, p.y + sa * 15, MOUNT - 4);
        ctx.strokeStyle = '#8D99A8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(wallPt[0], wallPt[1]); ctx.lineTo(m0[0], m0[1] + 0.5); ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 4.6;
        ctx.beginPath(); ctx.moveTo(m0[0] + 0.6, m0[1] + 1.4); ctx.lineTo(m1[0] + 0.6, m1[1] + 1.4); ctx.stroke();
        ctx.strokeStyle = '#E4E8ED'; ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(m0[0] - 0.3, m0[1] - 2.4); ctx.lineTo(m1[0] + (m1[0] - m0[0]) * 0.08, m1[1] - 2.6 + (m1[1] - m0[1]) * 0.08); ctx.stroke();
        ctx.fillStyle = '#0B0F14';
        ctx.beginPath(); ctx.arc(m1[0], m1[1], 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C.glow; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(m1[0], m1[1], 0.9, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function lensOf(i, p) {
      var a = p.dir * Math.PI / 180;
      return DOMES[i] ? iso(p.x + Math.cos(a) * 2.2, p.y + Math.sin(a) * 2.2, MOUNT - 0.5) : iso(p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 15, MOUNT - 4);
    }

    /* light beam: the fan from the lens to the floor, lit at the lens */
    function drawBeam(i, p, poly, alpha) {
      if (alpha <= 0) return;
      var apex = lensOf(i, p), reach = p.range * S;
      var g = ctx.createRadialGradient(apex[0], apex[1], 0, apex[0], apex[1], reach);
      g.addColorStop(0, 'rgba(170, 200, 255, ' + (0.34 * alpha) + ')');
      g.addColorStop(0.35, 'rgba(110, 155, 255, ' + (0.14 * alpha) + ')');
      g.addColorStop(1, 'rgba(47, 107, 240, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(apex[0], apex[1]);
      for (var k = 2; k < poly.length; k += 2) { var q = iso(poly[k], poly[k + 1], 0); ctx.lineTo(q[0], q[1]); }
      ctx.closePath();
      ctx.fill();
      var first = iso(poly[2], poly[3], 0), last = iso(poly[poly.length - 2], poly[poly.length - 1], 0);
      ctx.strokeStyle = 'rgba(170, 200, 255, ' + (0.55 * alpha) + ')';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(first[0], first[1]); ctx.lineTo(apex[0], apex[1]); ctx.lineTo(last[0], last[1]); ctx.stroke();
    }

    var CLOSE = 5;
    var A = PLAN.coverage(0).share, B = PLAN.coverage(1).share;
    var lastAim = -1, poses = [], polys = [];
    function updateAim(k) {
      if (k === lastAim) return;
      lastAim = k;
      poses = PLAN.cams.map(function (c) { return PLAN.pose(c, k); });
      polys = poses.map(PLAN.fieldPolygon);
      paintCoverage(polys);
    }

    var phases = [
      { start: 0, end: 2.6, caption: 'Reads the architect’s DXF and the camera layout.' },
      { start: 2.6, end: 7.0, caption: 'Builds the building in 3D and mounts each camera model.' },
      { start: 7.0, end: 10.0, caption: 'Traces what every camera sees, square metre by square metre.' },
      { start: 10.0, end: 16.0, caption: 'Re-aims the same cameras. No covered floor is lost.' }
    ];

    function draw(t, scale) {
      var aim = easeInOut(clamp01((t - 10.3) / 2.5));
      updateAim(aim);
      var rise = easeInOut(clamp01((t - 2.7) / 1.7));
      var h = WALL * rise;
      var allIn = clamp01((t - 8.2) / 1.4);

      // camera move: zoom onto one camera, then back out
      var zoomK = t < 4.8 ? 0 : t < 6.2 ? easeInOut((t - 4.8) / 1.4) : t < 7.8 ? 1 : 1 - easeInOut(clamp01((t - 7.8) / 1.4));
      var Z = 1 + 1.9 * zoomK;
      var F = lensOf(CLOSE, PLAN.pose(PLAN.cams[CLOSE], aim));
      var tx = F[0] * (1 - Z) + (W * 0.36 - F[0]) * zoomK, ty = F[1] * (1 - Z) + (H * 0.5 - F[1]) * zoomK;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale * Z, 0, 0, scale * Z, scale * tx, scale * ty);

      // slab shadow, floor finishes fading in after the plan step
      var c0 = iso(20, 20, 0), c1 = iso(620, 20, 0), c2 = iso(620, 420, 0), c3 = iso(20, 420, 0);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      quad([c0[0] + 6, c0[1] + 8], [c1[0] + 6, c1[1] + 8], [c2[0] + 6, c2[1] + 8], [c3[0] + 6, c3[1] + 8]);
      ctx.fill();
      ctx.fillStyle = '#15243A';
      quad(c0, c1, c2, c3);
      ctx.fill();
      var finish = easeInOut(clamp01((t - 2.6) / 1.4));
      ctx.save();
      ctx.transform(CX, CY, -CX, CY, OX, OY);
      if (finish > 0) {
        ctx.globalAlpha = finish;
        ctx.drawImage(floorLayer, 20, 20, 600, 400);
      }
      if (allIn > 0) {
        ctx.globalAlpha = allIn;
        ctx.drawImage(covLayer, 20, 20, 600, 400);
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // DXF: lines drawn one after another, fading as the walls rise
      var pPlan = clamp01(t / 2.3);
      var lineAlpha = t < 2.7 ? 1 : clamp01(1 - (t - 2.7) / 0.8);
      if (lineAlpha > 0) {
        ctx.strokeStyle = 'rgba(159, 192, 255, ' + lineAlpha + ')';
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        var n = PLAN.structural;
        for (var i = 0; i < n; i++) {
          var f = clamp01((pPlan - (i / n) * 0.7) / 0.3);
          if (f <= 0) continue;
          var w = PLAN.walls[i], a0 = iso(w[0], w[1], 0), a1 = iso(w[0] + (w[2] - w[0]) * f, w[1] + (w[3] - w[1]) * f, 0);
          ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]);
        }
        ctx.stroke();
        if (t < 3.2) {
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          ctx.globalAlpha = lineAlpha * clamp01(t * 3);
          ctx.fillStyle = C.mute;
          ctx.font = '500 13px "IBM Plex Mono", ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText('ground_floor.dxf · ' + Math.round(clamp01(pPlan / 0.7) * n) + ' walls · 12 cameras', 24, H - 24);
          ctx.restore();
        }
      }

      // walls, furniture and people, back to front
      if (h > 0.2) {
        items.forEach(function (it) {
          if (it.person) drawPerson(it, rise);
          else drawBox(it, it.kind === 'wall' || it.kind === 'column' ? h : it.h * rise);
        });
      }

      // light beams, then the cameras on top
      poses.forEach(function (p, i) {
        var beam = i === CLOSE ? Math.max(clamp01((t - 7.0) / 0.8), allIn) : allIn;
        drawBeam(i, p, polys[i], beam);
      });
      poses.forEach(function (p, i) { drawCamera(i, p, clamp01((t - 4.0 - i * 0.05) / 0.4)); });

      // the loop closes with a fade to the background
      var fadeOut = clamp01((t - 15.3) / 0.7);
      if (fadeOut > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = fadeOut;
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }

      var showUI = t >= 8.8 && fadeOut < 0.5;
      if (readoutBox) readoutBox.style.opacity = showUI ? 1 : 0;
      if (legend) legend.style.opacity = showUI ? 1 : 0;
      readout.textContent = ((A + (B - A) * aim) * 100).toFixed(1) + '%';
    }

    makePlayer({ root: root, canvas: canvas, phases: phases, w: W, h: H, draw: draw, rest: 14.5, caption: document.getElementById('pipeline-caption') });
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
  /* Demo video: shown once a file loads; chapters seek; plays in view   */
  /* ------------------------------------------------------------------ */
  function initDemoVideo() {
    var video = document.getElementById('vanguard-video');
    if (!video) return;
    var stage = video.parentNode;
    var placeholder = stage.querySelector('.stage__placeholder');
    var chapters = document.getElementById('vanguard-chapters');
    var buttons = chapters ? [].slice.call(chapters.querySelectorAll('button')) : [];

    var inView = false;
    function play() { var p = video.play(); if (p && p.catch) p.catch(function () {}); }

    function ready() {
      video.hidden = false;
      if (placeholder) placeholder.hidden = true;
      if (chapters) chapters.hidden = false;
      if (inView && !reduceMotion) play();
    }
    video.addEventListener('loadedmetadata', ready);
    if (video.readyState >= 1) ready();

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        video.currentTime = parseFloat(b.getAttribute('data-t'));
        play();
      });
    });
    video.addEventListener('timeupdate', function () {
      var idx = -1;
      buttons.forEach(function (b, i) { if (video.currentTime >= parseFloat(b.getAttribute('data-t')) - 0.25) idx = i; });
      buttons.forEach(function (b, i) { if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          inView = e.isIntersecting;
          if (video.hidden) return;
          if (!inView) video.pause();
          else if (!reduceMotion) play();
        });
      }, { threshold: 0.25 }).observe(stage);
    }
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
  initDemoVideo();
  initCopy();
})();
