/* HawQ-ai website scripts
   1. Hero: an illustrative floor plan where each camera's field of view is ray-cast
      against walls and columns, blind floor is hatched, and the configuration can be
      switched between "as drawn" and "VanGuard settings" (same cameras, same positions).
   2. Sentinel: a simulated wide-angle camera view (barrel distortion applied to a room).
   3. Copy-to-clipboard for the contact address. */
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
  /* Sentinel: simulated wide-angle view                                 */
  /* ------------------------------------------------------------------ */
  function initCamView() {
    var g = document.getElementById('camview-grid');
    if (!g) return;
    var NS = 'http://www.w3.org/2000/svg';
    var CX = 320, CY = 180, R = Math.hypot(320, 180), K1 = -0.22;
    var VX = 330, VY = 150;

    function distort(x, y) {
      var dx = x - CX, dy = y - CY, f = 1 + K1 * (dx * dx + dy * dy) / (R * R);
      return [CX + dx * f, CY + dy * f];
    }
    // cross-section of the room at depth z
    function section(z) {
      return { l: VX - 560 / z, r: VX + 500 / z, t: VY - 230 / z, b: VY + 260 / z };
    }
    function line(x0, y0, x1, y1, cls) {
      var d = '';
      for (var i = 0; i <= 40; i++) {
        var s = i / 40, p = distort(x0 + (x1 - x0) * s, y0 + (y1 - y0) * s);
        d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      }
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      if (cls) path.setAttribute('class', cls);
      g.appendChild(path);
    }

    var near = section(1), far = section(4.2);
    // depth rings
    [1.35, 1.8, 2.4, 3.2].forEach(function (z) {
      var s = section(z);
      line(s.l, s.b, s.r, s.b);
      line(s.l, s.t, s.r, s.t);
      line(s.l, s.t, s.l, s.b);
      line(s.r, s.t, s.r, s.b);
    });
    // floor and ceiling boards running into the room
    [0.2, 0.4, 0.6, 0.8].forEach(function (f) {
      line(near.l + (near.r - near.l) * f, near.b, far.l + (far.r - far.l) * f, far.b);
      line(near.l + (near.r - near.l) * f, near.t, far.l + (far.r - far.l) * f, far.t);
    });
    // room edges and back wall
    line(near.l, near.b, far.l, far.b, 'cv-wall');
    line(near.r, near.b, far.r, far.b, 'cv-wall');
    line(near.l, near.t, far.l, far.t, 'cv-wall');
    line(near.r, near.t, far.r, far.t, 'cv-wall');
    line(far.l, far.t, far.r, far.t, 'cv-wall');
    line(far.l, far.b, far.r, far.b, 'cv-wall');
    line(far.l, far.t, far.l, far.b, 'cv-wall');
    line(far.r, far.t, far.r, far.b, 'cv-wall');
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
  initCamView();
  initCopy();
})();
