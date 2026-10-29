/* ============================================================
   拆镜 — 一支 50mm f/1.4 的内部，和它如何决定你的照片
   单页静态站点 · 纯前端 · three.js 本地化（./three.min.js）
   ============================================================ */
(function () {
  'use strict';

  var D = document;
  var FOCAL = 50, COC = 0.03, S_FOCUS = 500;      // mm
  var X_SENSOR = 70, X_STOP = 0, SENSOR_W = 24;   // mm
  var isNarrow = function () { return window.innerWidth < 768; };

  /* ---------- 光圈档位（1/3 档） ---------- */
  var APERTURES = [1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0,
                   5.6, 6.3, 7.1, 8.0, 9.0, 10, 11, 13, 14, 16];

  /* ---------- 7 片 6 组 处方（近轴优化求解，平行光在 x=70 汇聚） ---------- */
  var ELEMENTS = [
    { id:'E1', x1:-24.0, t: 8.0, r:25.0, n:1.70, R1: 111.13, R2: 122.59,
      name:'正弯月透镜', grp:'前组 1/3',
      fn:'收集大角度入射光，初步压缩光束口径', mat:'镧冕玻璃 (LaK)', size:'⌀50.0 × 8.0 mm' },
    { id:'E2', x1:-16.0, t: 2.4, r:24.0, n:1.62, R1:  66.17, R2:  30.32,
      name:'负弯月透镜', grp:'前组 2/3', cemented:false,
      fn:'与前片配对，校正球差与像场弯曲', mat:'重火石玻璃 (SF)', size:'⌀48.0 × 2.4 mm' },
    { id:'E3', x1:-13.6, t:11.5, r:23.0, n:1.70, R1:  56.17, R2: -60.00,
      name:'双凸透镜', grp:'前组 3/3',
      fn:'前组主聚光元件，承担系统主要屈光度', mat:'镧冕玻璃 (LaK)', size:'⌀46.0 × 11.5 mm' },
    { id:'E4', x1:  5.5, t: 2.4, r:21.0, n:1.62, R1: -50.53, R2:  62.20,
      name:'双凹透镜', grp:'后组 1/4',
      fn:'与后组正片配对，校正佩兹伐场曲', mat:'重火石玻璃 (SF)', size:'⌀42.0 × 2.4 mm' },
    { id:'E5', x1:  7.9, t:11.5, r:20.5, n:1.70, R1:  75.43, R2: -42.00,
      name:'双凸透镜', grp:'后组 2/4',
      fn:'后组主正片，与下一片胶合成双片组', mat:'镧冕玻璃 (LaK)', size:'⌀41.0 × 11.5 mm' },
    { id:'E6', x1: 19.4, t: 2.4, r:20.5, n:1.62, R1: -42.00, R2:-301.93,
      name:'负弯月透镜（胶合）', grp:'后组 3/4', cemented:true,
      fn:'与 E5 胶合成双片，重点校正色差与像散', mat:'重火石玻璃 (SF)', size:'⌀41.0 × 2.4 mm' },
    { id:'E7', x1: 21.8, t: 7.0, r:20.0, n:1.70, R1: 135.00, R2: -60.00,
      name:'双凸透镜', grp:'后组 4/4',
      fn:'收束出射光，控制像方数值孔径与边缘照度', mat:'镧冕玻璃 (LaK)', size:'⌀40.0 × 7.0 mm' }
  ];

  var sag = function (R, h) {
    if (!isFinite(R) || R === 0) return 0;
    var q = 1 - (h / R) * (h / R);
    return q <= 0 ? R : R * (1 - Math.sqrt(q));
  };

  /* 面串：14 个折射面 */
  function buildSurfaces(offsets, dn) {
    dn = dn || 0;
    var out = [];
    for (var i = 0; i < ELEMENTS.length; i++) {
      var e = ELEMENTS[i], dx = offsets ? offsets[i] : 0;
      var n = 1 + (e.n - 1) * (1 + dn);
      out.push({ el:i, x:e.x1 + dx,        R:e.R1, n1:1, n2:n, r:e.r, side:'F' });
      out.push({ el:i, x:e.x1 + e.t + dx,  R:e.R2, n1:n, n2:1, r:e.r, side:'B' });
    }
    return out;
  }

  /* 近轴追迹：从 x=-34 处平行入射，返回折线点与是否被光阑截断 */
  function traceRay(S, y0, rStop, x0) {
    var xs = (x0 === undefined) ? -34 : x0;
    var y = y0, u = 0, xp = xs;
    var pts = [{ x:xs, y:y0 }];
    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      if (xp < X_STOP && s.x >= X_STOP) {
        var ys = y + u * (X_STOP - xp);
        if (Math.abs(ys) > rStop) { pts.push({ x:X_STOP, y:ys }); return { pts:pts, blocked:true }; }
        pts.push({ x:X_STOP, y:ys });
        xp = X_STOP; y = ys;
      }
      var xh = s.x + sag(s.R, y);
      y = y + u * (xh - xp);
      pts.push({ x:xh, y:y });
      u = (s.n1 * u - y * (s.n2 - s.n1) / s.R) / s.n2;
      xp = xh;
    }
    pts.push({ x:X_SENSOR, y:y + u * (X_SENSOR - xp) });
    return { pts:pts, blocked:false };
  }

  /* 入射→光阑 的横向放大率（决定入射半高） */
  function heightGain() {
    var S = buildSurfaces(null, 0), y = 1, u = 0, xp = -34;
    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      if (xp < X_STOP && s.x >= X_STOP) return y + u * (X_STOP - xp);
      var xh = s.x + sag(s.R, y);
      y = y + u * (xh - xp);
      u = (s.n1 * u - y * (s.n2 - s.n1) / s.R) / s.n2;
      xp = xh;
    }
    return y;
  }

  var GAIN = heightGain();
  var RSTOP_MAX = FOCAL / (2 * 1.4);
  var H_IN = RSTOP_MAX / GAIN;

  /* ---------- 景深 ---------- */
  function dof(N) {
    var H = FOCAL * FOCAL / (N * COC) + FOCAL;
    var s = S_FOCUS;
    return { H:H, near:H * s / (H + s), far:H * s / (H - s) };
  }

  /* ---------- 散景弥散圆 ---------- */
  var BOKEH_PTS = [
    { s:400,  x:0.34, y:0.34, c:'255,214,150' },
    { s:500,  x:0.60, y:0.58, c:'168,236,255' },
    { s:1200, x:0.70, y:0.30, c:'255,170,214' }
  ];
  function blurPx(N, sobj, cvPx) {
    var v = FOCAL * sobj / (sobj - FOCAL);
    var v0 = FOCAL * S_FOCUS / (S_FOCUS - FOCAL);
    var A = FOCAL / N;
    var c = A * Math.abs(v - v0) / v;                 // mm
    return c * (cvPx / SENSOR_W) * 4;                  // ×4 示意放大
  }
  function blob(ctx, cx, cy, R, round, col, alpha) {
    var N = 9, step = Math.PI / 9, k = Math.cos(step);
    ctx.beginPath();
    for (var i = 0; i <= 120; i++) {
      var th = i / 120 * Math.PI * 2;
      var loc = ((th % (2 * step)) + 2 * step) % (2 * step) - step;
      var rPoly = R * k / Math.cos(loc);
      var r = rPoly + (R - rPoly) * round;
      var x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, Math.max(R, 1));
    g.addColorStop(0, 'rgba(' + col + ',' + (alpha * 0.55) + ')');
    g.addColorStop(0.72, 'rgba(' + col + ',' + alpha + ')');
    g.addColorStop(1, 'rgba(' + col + ',' + (alpha * 0.16) + ')');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + col + ',' + (alpha * 0.55) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function drawBokeh(cv, N) {
    var ctx = cv.getContext('2d');
    var w = cv.width, h = cv.height, S = w / 160;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0A0E14';
    ctx.fillRect(0, 0, w, h);
    var round = Math.min(1, (1.4 / N) * 0.85);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < BOKEH_PTS.length; i++) {
      var p = BOKEH_PTS[i];
      var R = Math.max(1.1, blurPx(N, p.s, 160 * S) / 2);
      blob(ctx, p.x * w, p.y * h, R, round, p.c, 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ============================================================
     状态
     ============================================================ */
  var state = {
    dis: 0, apIdx: 0, mode: 'structure', rayMix: 0, ca: false,
    hover: -1, opening: true, quizOpen: false, opAcc: 0, rayUntil: 0
  };
  function N() { return APERTURES[state.apIdx]; }
  function rStop() { return FOCAL / (2 * N()); }

  /* ============================================================
     three.js
     ============================================================ */
  var canvas = D.getElementById('gl');
  var renderer, scene, camP, camO, ok3d = true;
  try {
    renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:!isNarrow(), alpha:true, powerPreference:'high-performance' });
  } catch (err) { ok3d = false; }

  if (!ok3d) {
    D.getElementById('boot').innerHTML = '<span style="max-width:80vw;text-align:center;line-height:1.9">' +
      '当前浏览器未启用 WebGL，无法渲染三维镜头。<br>请使用 Chrome / Safari / Edge 最新版本打开。</span>';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camP = new THREE.PerspectiveCamera(18, 1, 1, 2400);
  camO = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.1, 2000);

  var C_LINE = 0x4DD8E6, C_ANNO = 0xFF6B5B;

  function meshy(op) {
    return new THREE.MeshBasicMaterial({ color:C_LINE, transparent:true, opacity:op,
      depthWrite:false, side:THREE.DoubleSide });
  }
  function liney(op) {
    return new THREE.LineBasicMaterial({ color:C_LINE, transparent:true, opacity:op,
      depthWrite:false });
  }
  var C_DIM = 0x2E8494;
  function lineyDim(op) {
    return new THREE.LineBasicMaterial({ color:C_DIM, transparent:true, opacity:op,
      depthWrite:false });
  }

  /* ---------- 旋转体：同时产出填充网格 + 线框 ---------- */
  function revolve(profile, opt) {
    opt = opt || {};
    var seg = opt.seg || 40, azi = opt.azi || 12, ringIdx = opt.rings || [];
    var pos = [], idx = [], n = profile.length, i, a;
    for (i = 0; i < n; i++) {
      var p = profile[i];
      for (a = 0; a < seg; a++) {
        var th = a / seg * Math.PI * 2;
        pos.push(p.x, p.r * Math.sin(th), p.r * Math.cos(th));
      }
    }
    for (i = 0; i < n - 1; i++) {
      for (a = 0; a < seg; a++) {
        var a2 = (a + 1) % seg;
        var i0 = i * seg + a, i1 = i * seg + a2, i2 = (i + 1) * seg + a, i3 = (i + 1) * seg + a2;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    if (opt.shade) {
      var LC = [-0.45, 0.60, 0.66], LN = Math.hypot(LC[0], LC[1], LC[2]);
      LC[0] /= LN; LC[1] /= LN; LC[2] /= LN;
      var cols = [];
      for (i = 0; i < n; i++) {
        var pa = profile[Math.max(i - 1, 0)], pb = profile[Math.min(i + 1, n - 1)];
        var tx = pb.x - pa.x, tr = pb.r - pa.r;
        var nn = Math.hypot(-tr, tx) || 1;
        var nx = -tr / nn, nr = tx / nn;
        if (nr < 0) { nx = -nx; nr = -nr; }
        for (a = 0; a < seg; a++) {
          var th2 = a / seg * Math.PI * 2;
          var d = Math.abs(nx * LC[0] + nr * Math.sin(th2) * LC[1] + nr * Math.cos(th2) * LC[2]);
          var b = 0.14 + 0.86 * Math.pow(d, 0.8);
          cols.push(b, b, b);
        }
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    }

    var L = [];
    var seg2 = function (x1, y1, z1, x2, y2, z2) { L.push(x1, y1, z1, x2, y2, z2); };
    for (a = 0; a < azi; a++) {
      var ta = a / azi * Math.PI * 2, sy = Math.sin(ta), cz = Math.cos(ta);
      for (i = 0; i < n - 1; i++) {
        seg2(profile[i].x, profile[i].r * sy, profile[i].r * cz,
             profile[i + 1].x, profile[i + 1].r * sy, profile[i + 1].r * cz);
      }
    }
    for (var ri = 0; ri < ringIdx.length; ri++) {
      var q = profile[ringIdx[ri]];
      if (!q || q.r <= 0.01) continue;
      for (a = 0; a < seg; a++) {
        var t1 = a / seg * Math.PI * 2, t2 = (a + 1) / seg * Math.PI * 2;
        seg2(q.x, q.r * Math.sin(t1), q.r * Math.cos(t1),
             q.x, q.r * Math.sin(t2), q.r * Math.cos(t2));
      }
    }
    var lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    return { geo:geo, lgeo:lgeo };
  }

  var root = new THREE.Group();
  scene.add(root);

  /* ---------- 镜片 ---------- */
  var lensGroups = [], lensMeshes = [], lensLines = [], lensCoats = [];
  var SAMP = 16;

  ELEMENTS.forEach(function (e, i) {
    var prof = [], k, rr;
    for (k = 0; k <= SAMP; k++) { rr = e.r * k / SAMP; prof.push({ x:e.x1 + sag(e.R1, rr), r:rr }); }
    for (k = SAMP; k >= 0; k--) { rr = e.r * k / SAMP; prof.push({ x:e.x1 + e.t + sag(e.R2, rr), r:rr }); }

    var g = new THREE.Group();
    var rv = revolve(prof, { seg:44, azi:3, rings:[SAMP, SAMP + 1], shade:true });

    var m = new THREE.Mesh(rv.geo, new THREE.MeshBasicMaterial({
      color:C_LINE, vertexColors:true, transparent:true, opacity:0.42,
      depthWrite:false, side:THREE.DoubleSide }));
    m.userData.el = i;
    var l = new THREE.LineSegments(rv.lgeo, liney(0.72));
    l.userData.el = i;
    g.add(m); g.add(l);
    lensMeshes.push(m); lensLines.push(l);

    // 镀膜层（L4）
    var coat = new THREE.Mesh(rv.geo, new THREE.MeshBasicMaterial({
      color: i % 2 ? 0x7CE6C0 : 0xB98CFF, transparent:true, opacity:0,
      depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending
    }));
    coat.visible = false;
    g.add(coat);
    lensCoats.push(coat);

    var glow = new THREE.LineSegments(rv.lgeo, new THREE.LineBasicMaterial({
      color:C_ANNO, transparent:true, opacity:0, depthWrite:false
    }));
    g.add(glow);
    m.userData.glow = glow;

    root.add(g);
    lensGroups.push(g);
  });

  /* ---------- 镜筒零件 ---------- */
  function tube(x0, x1, r0, r1, opt) {
    var prof = [{ x:x0, r:r0 }, { x:x0, r:r1 }, { x:x1, r:r1 }, { x:x1, r:r0 }];
    if (opt && opt.close) prof.push({ x:x0, r:r0 });
    return revolve(prof, { seg:44, azi:8, rings:opt && opt.rings !== undefined ? opt.rings : [0] });
  }
  function bar(x, r0, r1) { return [{ x:x, r:r0 }, { x:x, r:r1 }]; }

  var parts = {};
  function addPart(key, layer, rev, meta, op) {
    var g = new THREE.Group();
    var m = new THREE.Mesh(rev.geo, new THREE.MeshBasicMaterial({ color:C_DIM, transparent:true, opacity:op === undefined ? 0.05 : op, depthWrite:false, side:THREE.DoubleSide }));
    var l = new THREE.LineSegments(rev.lgeo, lineyDim(0.55));
    g.add(m); g.add(l);
    root.add(g);
    parts[key] = { g:g, m:m, l:l, layer:layer, meta:meta, base:0 };
    return g;
  }

  addPart('hood', 1, tube(-33.0, -30.4, 26.0, 29.6, { rings:[0, 1, 2, 3] }),
    { code:'L1-1', sub:'外观层', name:'遮光罩卡口', fn:'固定遮光罩，抑制视场外杂光', mat:'铝合金阳极氧化', size:'⌀59.2 mm' });
  addPart('filter', 1, tube(-30.4, -26.0, 26.0, 29.2, { rings:[0, 3] }),
    { code:'L1-2', sub:'外观层', name:'滤镜螺纹', fn:'58mm 滤镜接口，螺纹牙距 0.75mm', mat:'黄铜镀铬', size:'⌀58 mm' });
  addPart('focus', 1, tube(-20.0, -7.6, 29.9, 31.8, { rings:[0, 3] }),
    { code:'L1-3', sub:'外观层', name:'对焦环', fn:'旋转时通过螺旋机构前后移动整组镜片', mat:'橡胶包覆铝环', size:'⌀63.6 mm' });
  addPart('apring', 1, tube(-7.4, 3.2, 29.9, 31.8, { rings:[0, 3] }),
    { code:'L1-4', sub:'外观层', name:'光圈环', fn:'改变 9 片叶片围成的多边形孔径', mat:'铝合金阳极氧化', size:'⌀63.6 mm' });
  addPart('mount', 1, tube(24.0, 29.6, 25.2, 27.8, { rings:[0, 1, 2, 3] }),
    { code:'L1-5', sub:'外观层', name:'卡口', fn:'与机身耦合，保证法兰距精确', mat:'不锈钢', size:'⌀55.6 mm' });

  // L2 机械层
  addPart('helicoid', 2, tube(-18.0, 2.0, 26.2, 28.6, { rings:[0, 3] }),
    { code:'L2-1', sub:'机械层', name:'螺旋对焦机构', fn:'helicoid 多头螺纹，把旋转变成轴向位移', mat:'黄铜 + 润滑脂', size:'行程 12.4 mm' });
  addPart('baffle', 2, tube(3.6, 24.0, 25.0, 26.9, { rings:[0, 3] }),
    { code:'L2-2', sub:'机械层', name:'镜筒内壁消光螺纹', fn:'锯齿消光纹，把杂散光反射回镜筒外', mat:'黑色消光涂层', size:'牙距 0.6 mm' });

  // 内壁锯齿（消光螺纹）：一圈小三角
  (function () {
    var L = [], n = 120, r = 25.0;
    for (var i = 0; i < n; i++) {
      var th = i / n * Math.PI * 2;
      L.push(3.6, r * Math.sin(th), r * Math.cos(th), 4.6, (r + 1.5) * Math.sin(th), (r + 1.5) * Math.cos(th));
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    var seg = new THREE.LineSegments(g, liney(0.32));
    parts.baffle.g.add(seg);
    parts.baffle.zig = seg;
  })();

  // 对焦环刻纹
  (function () {
    var L = [], n = 72;
    for (var i = 0; i < n; i++) {
      var th = i / n * Math.PI * 2;
      L.push(-19.4, 31.8 * Math.sin(th), 31.8 * Math.cos(th), -8.2, 31.8 * Math.sin(th), 31.8 * Math.cos(th));
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    parts.focus.g.add(new THREE.LineSegments(g, liney(0.26)));
  })();

  /* ---------- 9 片光圈叶片 ---------- */
  var bladeGroup = new THREE.Group();
  root.add(bladeGroup);
  var BL_N = 9;
  var bladeFillGeo = new THREE.BufferGeometry();
  var bladeVert = new Float32Array(BL_N * 8 * 3);
  bladeFillGeo.setAttribute('position', new THREE.BufferAttribute(bladeVert, 3));
  var bladeIdx = [];
  for (var bi = 0; bi < BL_N; bi++) {
    var o = bi * 4;
    bladeIdx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  bladeFillGeo.setIndex(bladeIdx);
  var bladeMesh = new THREE.Mesh(bladeFillGeo, new THREE.MeshBasicMaterial({
    color:C_LINE, transparent:true, opacity:0.10, depthWrite:false, side:THREE.DoubleSide
  }));
  bladeGroup.add(bladeMesh);

  var bladeEdgeGeo = new THREE.BufferGeometry();
  var bladeEdge = new Float32Array(BL_N * 4 * 2 * 3);
  bladeEdgeGeo.setAttribute('position', new THREE.BufferAttribute(bladeEdge, 3));
  var bladeLines = new THREE.LineSegments(bladeEdgeGeo, liney(0.72));
  bladeGroup.add(bladeLines);

  var apPolyGeo = new THREE.BufferGeometry();
  var apPoly = new Float32Array((BL_N + 1) * 3);
  apPolyGeo.setAttribute('position', new THREE.BufferAttribute(apPoly, 3));
  var apPolyLine = new THREE.Line(apPolyGeo, new THREE.LineBasicMaterial({
    color:C_ANNO, transparent:true, opacity:0.95, depthWrite:false
  }));
  bladeGroup.add(apPolyLine);

  var bladeOuter = 24.0;
  function updateBlades() {
    var rs = rStop(), k = Math.cos(Math.PI / BL_N);
    var rp = rs / k;                                  // 多边形外接半径
    for (var i = 0; i < BL_N; i++) {
      var a1 = i / BL_N * Math.PI * 2 + 0.0;
      var a2 = (i + 1) / BL_N * Math.PI * 2;
      var jx = i * 0.06;
      var p1 = [rp * Math.sin(a1), rp * Math.cos(a1)];
      var p2 = [rp * Math.sin(a2), rp * Math.cos(a2)];
      var q1 = [bladeOuter * Math.sin(a1 + 0.24), bladeOuter * Math.cos(a1 + 0.24)];
      var q2 = [bladeOuter * Math.sin(a2 + 0.10), bladeOuter * Math.cos(a2 + 0.10)];
      var quad = [p1, p2, q2, q1];
      for (var v = 0; v < 4; v++) {
        var o = (i * 4 + v) * 3;
        bladeVert[o] = jx; bladeVert[o + 1] = quad[v][0]; bladeVert[o + 2] = quad[v][1];
      }
      for (var e2 = 0; e2 < 4; e2++) {
        var a = quad[e2], b = quad[(e2 + 1) % 4];
        var o2 = (i * 8 + e2 * 2) * 3;
        bladeEdge[o2] = jx; bladeEdge[o2 + 1] = a[0]; bladeEdge[o2 + 2] = a[1];
        bladeEdge[o2 + 3] = jx; bladeEdge[o2 + 4] = b[0]; bladeEdge[o2 + 5] = b[1];
      }
    }
    for (var p = 0; p <= BL_N; p++) {
      var ap = p / BL_N * Math.PI * 2;
      apPoly[p * 3] = 0;
      apPoly[p * 3 + 1] = rp * Math.sin(ap);
      apPoly[p * 3 + 2] = rp * Math.cos(ap);
    }
    bladeFillGeo.attributes.position.needsUpdate = true;
    bladeEdgeGeo.attributes.position.needsUpdate = true;
    apPolyGeo.attributes.position.needsUpdate = true;
    bladeFillGeo.computeBoundingSphere();
    bladeEdgeGeo.computeBoundingSphere();
    apPolyGeo.computeBoundingSphere();
  }

  /* ---------- L5 像面 ---------- */
  var sensorGroup = new THREE.Group();
  (function () {
    var w = SENSOR_W, h = 16, th = 1.4;
    var box = new THREE.BoxGeometry(th, h, w);
    var m = new THREE.Mesh(box, meshy(0.07));
    var ed = new THREE.LineSegments(new THREE.EdgesGeometry(box), liney(0.8));
    sensorGroup.add(m); sensorGroup.add(ed);
    // 微透镜阵列
    var L = [], nx = 10, ny = 7, dx = w / nx, dy = h / ny;
    for (var i = 0; i <= nx; i++) L.push(th / 2 + 0.01, -h / 2, -w / 2 + i * dx, th / 2 + 0.01, h / 2, -w / 2 + i * dx);
    for (var j = 0; j <= ny; j++) L.push(th / 2 + 0.01, -h / 2 + j * dy, -w / 2, th / 2 + 0.01, -h / 2 + j * dy, w / 2);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    sensorGroup.add(new THREE.LineSegments(g, liney(0.3)));
    sensorGroup.position.x = X_SENSOR;
    root.add(sensorGroup);
  })();

  /* ---------- 光阑面（虚拟） ---------- */
  var stopRing = (function () {
    var L = [], r = 25.4;
    for (var a = 0; a < 96; a++) {
      var t1 = a / 96 * Math.PI * 2, t2 = (a + 1) / 96 * Math.PI * 2;
      L.push(0, r * Math.sin(t1), r * Math.cos(t1), 0, r * Math.sin(t2), r * Math.cos(t2));
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    var o = new THREE.LineSegments(g, liney(0.3));
    root.add(o);
    return o;
  })();

  /* ============================================================
     光线
     ============================================================ */
  var RAYS = 26;
  var MAXP = 22;                 // 每条光线最大点数（含幽灵光线）
  var passGeo = new THREE.BufferGeometry();
  var passBuf = new Float32Array(RAYS * MAXP * 2 * 3);
  passGeo.setAttribute('position', new THREE.BufferAttribute(passBuf, 3));
  var passLine = new THREE.LineSegments(passGeo, new THREE.LineBasicMaterial({
    color:C_LINE, transparent:true, opacity:0.9, depthWrite:false
  }));
  passLine.frustumCulled = false; root.add(passLine);

  var blkGeo = new THREE.BufferGeometry();
  var blkBuf = new Float32Array(RAYS * MAXP * 2 * 3);
  var blkDist = new Float32Array(RAYS * MAXP * 2);
  blkGeo.setAttribute('position', new THREE.BufferAttribute(blkBuf, 3));
  blkGeo.setAttribute('lineDistance', new THREE.BufferAttribute(blkDist, 1));
  var blkLine = new THREE.LineSegments(blkGeo, new THREE.LineDashedMaterial({
    color:C_ANNO, transparent:true, opacity:0.85, dashSize:1.6, gapSize:1.4, depthWrite:false
  }));
  blkLine.frustumCulled = false; root.add(blkLine);

  // 色差三通道
  var caGroups = [];
  ['255,96,120', '96,255,150', '110,150,255'].forEach(function () {
    var g = new THREE.BufferGeometry();
    var b = new Float32Array(RAYS * MAXP * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(b, 3));
    var m = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.62, depthWrite:false });
    var l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    l.visible = false;
    root.add(l);
    caGroups.push({ g:g, b:b, l:l, m:m });
  });

  var rayAlpha = 0;

  function buildRays() {
    var offs = curOffsets();
    var S0 = buildSurfaces(offs, 0);
    var rs = rStop();
    var np = 0, nb = 0, dp = 0;
    var passSegs = [], blkSegs = [];

    // ① 通过光线：永远 9 条，按当前光圈的入射半高铺开 → 光锥随光圈连续收窄
    var NRAY = isNarrow() ? 7 : 9;
    var hPass = Math.max(rs / GAIN, 0.04);
    var xStart = Math.min(-34, S0[0].x - 9);
    for (var r = 0; r < NRAY; r++) {
      var y0 = hPass * ((r / (NRAY - 1)) * 2 - 1);
      var res = traceRay(S0, y0, rs, xStart);
      var arr = res.blocked ? blkSegs : passSegs;
      for (var i = 0; i < res.pts.length - 1; i++) {
        arr.push([res.pts[i].x, res.pts[i].y, res.pts[i + 1].x, res.pts[i + 1].y]);
      }
    }
    // ② 幽灵光线：当前口径之外、满口径之内的光线，红色虚线截断在光阑
    var NG = isNarrow() ? 3 : 5;
    if (H_IN > hPass + 0.12) {
      for (var g = 1; g <= NG; g++) {
        var hy = hPass + (H_IN - hPass) * g / NG;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var resG = traceRay(S0, hy * sgn, rs, xStart);
          for (var j2 = 0; j2 < resG.pts.length - 1; j2++) {
            blkSegs.push([resG.pts[j2].x, resG.pts[j2].y, resG.pts[j2 + 1].x, resG.pts[j2 + 1].y]);
          }
        }
      }
    }
    // 按中点 x 排序，便于逐段显现
    passSegs.sort(function (a, b) { return (a[0] + a[2]) - (b[0] + b[2]); });
    blkSegs.sort(function (a, b) { return (a[0] + a[2]) - (b[0] + b[2]); });

    for (var s = 0; s < passSegs.length && np < RAYS * MAXP; s++) {
      var q = passSegs[s], o = np * 6;
      passBuf[o] = q[0]; passBuf[o + 1] = q[1]; passBuf[o + 2] = 0;
      passBuf[o + 3] = q[2]; passBuf[o + 4] = q[3]; passBuf[o + 5] = 0;
      np++;
    }
    for (var s2 = 0; s2 < blkSegs.length && nb < RAYS * MAXP; s2++) {
      var q2 = blkSegs[s2], o2 = nb * 6;
      blkBuf[o2] = q2[0]; blkBuf[o2 + 1] = q2[1]; blkBuf[o2 + 2] = 0;
      blkBuf[o2 + 3] = q2[2]; blkBuf[o2 + 4] = q2[3]; blkBuf[o2 + 5] = 0;
      var len = Math.hypot(q2[2] - q2[0], q2[3] - q2[1]);
      blkDist[nb * 2] = dp; blkDist[nb * 2 + 1] = dp + len;
      dp += len;
      nb++;
    }
    // 未使用的段归零（避免残留）
    for (var z = np; z < RAYS * MAXP; z++) { passBuf[z * 6 + 1] = 0; passBuf[z * 6 + 4] = 0; }
    for (var z2 = nb; z2 < RAYS * MAXP; z2++) { blkBuf[z2 * 6 + 1] = 0; blkBuf[z2 * 6 + 4] = 0; }

    passGeo.attributes.position.needsUpdate = true;
    passGeo.setDrawRange(0, Math.floor(np * 2 * rayAlpha));
    blkGeo.attributes.position.needsUpdate = true;
    blkGeo.attributes.lineDistance.needsUpdate = true;
    blkGeo.setDrawRange(0, Math.floor(nb * 2 * rayAlpha));

    // 色差
    if (state.ca) {
      var dns = [-0.0045, 0, 0.0045];
      caGroups.forEach(function (cg, ci) {
        var S = buildSurfaces(offs, dns[ci]);
        var n2 = 0;
        for (var r2 = 0; r2 < 9; r2++) {
          var y2 = Math.max(rs / GAIN, 0.04) * ((r2 / 8) * 2 - 1) * 0.9;
          var res2 = traceRay(S, y2, rs, xStart);
          if (res2.blocked) continue;
          for (var k = 0; k < res2.pts.length - 1 && n2 < RAYS * MAXP; k++) {
            var o3 = n2 * 6;
            cg.b[o3] = res2.pts[k].x; cg.b[o3 + 1] = res2.pts[k].y; cg.b[o3 + 2] = 0;
            cg.b[o3 + 3] = res2.pts[k + 1].x; cg.b[o3 + 4] = res2.pts[k + 1].y; cg.b[o3 + 5] = 0;
            n2++;
          }
        }
        cg.g.attributes.position.needsUpdate = true;
        cg.g.setDrawRange(0, Math.floor(n2 * 2 * rayAlpha));
        cg.l.visible = true;
      });
    } else {
      caGroups.forEach(function (cg) { cg.l.visible = false; });
    }
  }

  /* ============================================================
     拆解阶段模型
     ============================================================ */
  function ss(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  function pOf(d, start, span) { return ss((d - start) / span); }

  // L3 先散开、后（进入像面层时）重新合拢
  function p3(i, d) {
    var up = ss((d - 40 - i * 1.2) / 12);
    var down = ss((d - 72) / 18);
    return up * (1 - down);
  }

  function curOffsets() {
    var d = state.dis, arr = [];
    for (var i = 0; i < ELEMENTS.length; i++) {
      arr.push((i - 3) * 5.8 * p3(i, d) * (1 - state.rayMix));
    }
    return arr;
  }

  var LAYER_DEF = [
    { keys:['hood', 'filter', 'focus', 'apring', 'mount'], s:0,  e:20,  dir:1,  fade:true },
    { keys:['helicoid', 'baffle'],                        s:20, e:40,  dir:-1, fade:true }
  ];

  function applyExplode() {
    var d = state.dis, rm = state.rayMix;

    for (var li = 0; li < LAYER_DEF.length; li++) {
      var def = LAYER_DEF[li], p = pOf(d, def.s, def.e - def.s);
      for (var k = 0; k < def.keys.length; k++) {
        var part = parts[def.keys[k]];
        if (!part) continue;
        part.g.position.y = def.dir * (li === 0 ? 42 : 30) * p * (1 - rm);
        var mBase = (li === 0 ? 0.055 : 0.05) * (1 - 0.78 * p);
        var lBase = 0.55 * (1 - 0.68 * p);
        part.m.material.opacity = mBase * (1 - rm) + 0.030 * rm;
        part.l.material.opacity = lBase * (1 - rm) + 0.30 * rm;
        if (part.zig) part.zig.material.opacity = (0.32 * (1 - 0.9 * p)) * (1 - rm) + 0.12 * rm;
        part.g.visible = (part.m.material.opacity + part.l.material.opacity) > 0.02;
      }
    }

    // 7 片镜片：散开 / 合拢
    for (var i = 0; i < lensGroups.length; i++) {
      lensGroups[i].position.x = (i - 3) * 5.8 * p3(i, d) * (1 - rm);
      var p4 = pOf(d, 60, 20);
      var coat = lensCoats[i];
      coat.visible = p4 > 0.02;
      coat.material.opacity = 0.20 * p4 * (1 - 0.55 * rm);
    }

    // 像面层
    var p5 = pOf(d, 80, 20);
    sensorGroup.visible = p5 > 0.02;
    sensorGroup.position.x = X_SENSOR + (1 - p5) * 14;
    sensorGroup.scale.setScalar(0.9 + 0.1 * p5);
    for (var c = 0; c < sensorGroup.children.length; c++) {
      var o = sensorGroup.children[c];
      if (!o.material) continue;
      var base = (o.type === 'Mesh') ? 0.07 : (o.geometry.index ? 0.8 : 0.30);
      o.material.opacity = base * p5;
    }

    // 光圈叶片恒定停在光阑处——它是光锥被截断的原因，不允许淡出
    bladeGroup.position.y = 0;
    var boost = 1 + 0.14 * rm;
    bladeMesh.material.opacity = 0.10 * boost;
    bladeLines.material.opacity = 0.72 * boost;
    apPolyLine.material.opacity = 0.95 * boost;

    var pB = pOf(d, 20, 20);
    stopRing.material.opacity = 0.26 * (1 - 0.5 * pB);
  }

  /* ============================================================
     相机
     ============================================================ */
  var cam = { az:42, el:18, dist:280, tx:-4, ty:0 };
  var camT = { az:42, el:18, dist:280, tx:-4, ty:0 };
  var drag = { on:false, x:0, y:0, vy:0, vx:0 };

  function fitDist() {
    var aspect = window.innerWidth / Math.max(1, window.innerHeight);
    var t = Math.tan(9 * Math.PI / 180);
    return Math.max(50 / t, 72 / (t * Math.max(0.35, aspect)));
  }

  function applyCamera() {
    var az = cam.az * Math.PI / 180, el = cam.el * Math.PI / 180;
    var r = cam.dist;
    camP.position.set(
      cam.tx + r * Math.cos(el) * Math.sin(az),
      cam.ty + r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az)
    );
    camP.lookAt(cam.tx, cam.ty, 0);
  }

  function setOrtho() {
    var W = window.innerWidth, H = window.innerHeight;
    var aspect = W / Math.max(1, H);
    var avail = isNarrow() ? 1 : (W - 300) / W;
    var viewW = 118 / Math.max(0.5, avail - 0.08);
    var viewH = viewW / aspect;
    if (viewH > 172) { viewH = 172; viewW = viewH * aspect; }
    var cx = isNarrow() ? 20 : 20 + viewW * (0.5 - avail / 2) * 0.92;
    var yOff = isNarrow() ? -32 : 2;
    camO.left = -viewW / 2; camO.right = viewW / 2;
    camO.top = viewH / 2; camO.bottom = -viewH / 2;
    camO.position.set(cx, yOff, 420);
    camO.up.set(0, 1, 0);
    camO.lookAt(cx, yOff, 0);
    camO.updateProjectionMatrix();
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    camP.aspect = w / h;
    camP.updateProjectionMatrix();
    setOrtho();
    layoutLeaderSlots();
    var fd = fitDist();
    camT.dist = fd; cam.dist = fd;
    var halfH = fd * Math.tan(9 * Math.PI / 180);
    var mmPerPx = 2 * halfH / h;
    cam.ty = camT.ty = isNarrow() ? -16 : 0;
    cam.tx = camT.tx = isNarrow() ? -4 : -4 + 168 * mmPerPx;
  }
  window.addEventListener('resize', resize);

  /* ============================================================
     交互：拖拽旋转 / 悬停
     ============================================================ */
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();

  canvas.addEventListener('pointerdown', function (e) {
    if (state.mode !== 'structure') return;
    abortOpening();
    drag.on = true; drag.x = e.clientX; drag.y = e.clientY;
    drag.vx = 0; drag.vy = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (drag.on) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      var ny = camT.az - dx * 0.28;
      var ne = camT.el + dy * 0.20;
      camT.az = clampAngle(ny);
      camT.el = Math.max(-20, Math.min(38, ne));
      drag.vx = -dx * 0.28; drag.vy = dy * 0.20;
      return;
    }
    hoverTest(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', function () { drag.on = false; });

  function clampAngle(a) {
    // 基准 42°，±35°
    var base = 42, delta = a - base;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    delta = Math.max(-35, Math.min(35, delta));
    return base + delta;
  }

  function hoverTest(cx, cy) {
    if (state.mode !== 'structure') return;
    var r = canvas.getBoundingClientRect();
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camP);
    var hit = raycaster.intersectObjects(lensMeshes, false);
    var idx = hit.length ? hit[0].object.userData.el : -1;
    // 镜筒零件
    if (idx < 0) {
      var ps = [];
      Object.keys(parts).forEach(function (k) { ps.push(parts[k].m); });
      var h2 = raycaster.intersectObjects(ps, false);
      if (h2.length) { showPartCard(h2[0].object); return; }
    }
    setHover(idx);
  }

  var partMetaMap = new WeakMap();
  Object.keys(parts).forEach(function (k) {
    parts[k].m.userData.meta = parts[k].meta;
    partMetaMap.set(parts[k].m, parts[k].meta);
  });

  function showPartCard(mesh) {
    var meta = mesh.userData.meta;
    if (!meta) return;
    setHover(-1);
    D.getElementById('cardCode').textContent = meta.code;
    D.getElementById('cardGrp').textContent = meta.sub;
    D.getElementById('cardName').textContent = meta.name;
    D.getElementById('cardFn').textContent = meta.fn;
    D.getElementById('mFn').textContent = meta.fn;
    D.getElementById('mMat').textContent = meta.mat;
    D.getElementById('mSize').textContent = meta.size;
  }

  function setHover(idx) {
    if (idx === state.hover) return;
    if (state.hover >= 0) {
      lensLines[state.hover].material.opacity = 0.86;
      lensMeshes[state.hover].material.opacity = 0.10;
    }
    state.hover = idx;
    if (idx >= 0) {
      lensLines[idx].material.opacity = 1;
      lensMeshes[idx].material.opacity = 0.26;
      var e = ELEMENTS[idx];
      D.getElementById('cardCode').textContent = e.id;
      D.getElementById('cardGrp').textContent = e.grp;
      D.getElementById('cardName').textContent = e.name;
      D.getElementById('cardFn').textContent = e.fn;
      D.getElementById('mFn').textContent = e.fn;
      D.getElementById('mMat').textContent = e.mat;
      D.getElementById('mSize').textContent = e.size;
    }
  }

  /* ============================================================
     引线标注
     ============================================================ */
  var svg = D.getElementById('leaders');
  var leaderEls = [];
  (function () {
    for (var i = 0; i < ELEMENTS.length; i++) {
      var ln = D.createElementNS('http://www.w3.org/2000/svg', 'line');
      var ci = D.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ci.setAttribute('r', '1.8');
      var tx = D.createElementNS('http://www.w3.org/2000/svg', 'text');
      tx.textContent = ELEMENTS[i].id + ' ' + ELEMENTS[i].name.replace(/透镜|（胶合）|（.*?）/g, '');
      svg.appendChild(ln); svg.appendChild(ci); svg.appendChild(tx);
      leaderEls.push({ ln:ln, ci:ci, tx:tx });
    }
  })();
  var slots = [];
  function layoutLeaderSlots() {
    slots.length = 0;
    var h = window.innerHeight;
    var top = Math.max(120, h * 0.22), bot = h - Math.max(200, h * 0.28);
    for (var i = 0; i < ELEMENTS.length; i++) {
      slots.push(top + (bot - top) * i / (ELEMENTS.length - 1));
    }
  }
  layoutLeaderSlots();

  var v3 = new THREE.Vector3();
  var NS = 'http://www.w3.org/2000/svg';
  var scaleTag = (function () {
    var ln = D.createElementNS(NS, 'line');
    var tx = D.createElementNS(NS, 'text');
    tx.setAttribute('text-anchor', 'start');
    svg.appendChild(ln); svg.appendChild(tx);
    return { ln:ln, tx:tx, line:null };
  })();

  function updateLeaders() {
    // 尺度跃迁提示（L5）
    (function () {
      var p5 = pOf(state.dis, 80, 20);
      if (p5 < 0.35 || isNarrow() || state.rayMix > 0.4) {
        scaleTag.ln.style.display = 'none';
        scaleTag.tx.style.display = 'none';
        return;
      }
      var W = window.innerWidth, H = window.innerHeight;
      v3.set(X_SENSOR - 14 * (1 - p5), 8, 0).project(camP);
      var sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
      if (sx < -200 || sx > W + 200) { scaleTag.ln.style.display = 'none'; scaleTag.tx.style.display = 'none'; return; }
      var ex = Math.min(W - 150, sx + 46), ey = sy - 42;
      scaleTag.ln.setAttribute('x1', sx); scaleTag.ln.setAttribute('y1', sy);
      scaleTag.ln.setAttribute('x2', ex); scaleTag.ln.setAttribute('y2', ey);
      scaleTag.ln.style.display = ''; scaleTag.ln.style.opacity = (0.5 * p5).toFixed(2);
      scaleTag.tx.setAttribute('x', ex + 6); scaleTag.tx.setAttribute('y', ey);
      scaleTag.tx.textContent = 'L5 尺度跃迁 · 网格单位 mm → µm';
      scaleTag.tx.style.display = ''; scaleTag.tx.style.opacity = (0.9 * p5).toFixed(2);
    })();

    var show = (state.mode === 'structure') && !isNarrow() && state.dis > 26;
    if (!show) {
      for (var i = 0; i < leaderEls.length; i++) {
        leaderEls[i].ln.style.display = 'none';
        leaderEls[i].ci.style.display = 'none';
        leaderEls[i].tx.style.display = 'none';
      }
      return;
    }
    var W = window.innerWidth, H = window.innerHeight;
    var op = ss((state.dis - 26) / 18);
    for (var j = 0; j < ELEMENTS.length; j++) {
      var e = ELEMENTS[j], el = leaderEls[j];
      v3.set(e.x1 + e.t * 0.5 + lensGroups[j].position.x, e.r, 0).project(camP);
      var sx = (v3.x * 0.5 + 0.5) * W;
      var sy = (-v3.y * 0.5 + 0.5) * H;
      if (sx < -60 || sx > W + 60) {
        el.ln.style.display = 'none'; el.ci.style.display = 'none'; el.tx.style.display = 'none';
        continue;
      }
      var ly = sy - 22 - (j % 2) * 26;
      el.ln.setAttribute('x1', sx); el.ln.setAttribute('y1', sy - 5);
      el.ln.setAttribute('x2', sx); el.ln.setAttribute('y2', ly);
      el.ln.style.display = ''; el.ln.style.opacity = (0.72 * op).toFixed(2);
      el.ci.setAttribute('cx', sx); el.ci.setAttribute('cy', sy);
      el.ci.style.display = ''; el.ci.style.opacity = (0.9 * op).toFixed(2);
      el.tx.setAttribute('x', sx);
      el.tx.setAttribute('y', ly - 6);
      el.tx.setAttribute('text-anchor', 'middle');
      el.tx.style.display = ''; el.tx.style.opacity = (0.95 * op).toFixed(2);
    }
  }

  /* ============================================================
     UI 绑定
     ============================================================ */
  var elDis = D.getElementById('dis'), elAp = D.getElementById('ap');
  var elDisVal = D.getElementById('disVal'), elApVal = D.getElementById('apVal');
  var elRowAp = D.getElementById('rowAp'), elRowCa = D.getElementById('rowCa');
  var elPaper = D.getElementById('card');
  var elDof = D.getElementById('dof');
  var bokehCv = D.getElementById('bokeh');

  elDis.addEventListener('input', function () {
    abortOpening();
    state.dis = +elDis.value;
    elDisVal.textContent = state.dis + '%';
  });
  elAp.addEventListener('input', function () {
    abortOpening();
    state.apIdx = +elAp.value;
    syncAperture();
  });
  elAp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
  });

  D.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () {
      abortOpening();
      setMode(b.getAttribute('data-mode'));
    });
  });

  var caBtn = D.getElementById('caBtn');
  caBtn.addEventListener('click', function () {
    state.ca = !state.ca;
    caBtn.setAttribute('aria-pressed', state.ca ? 'true' : 'false');
    if (state.ca && state.mode !== 'ray') setMode('ray');
  });

  function setMode(m) {
    if (state.mode === m) return;
    state.mode = m;
    D.querySelectorAll('.mode').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === m);
    });
    var ray = m === 'ray';
    document.body.classList.toggle('raymode', ray);
    elRowAp.hidden = !ray;
    elDof.hidden = !ray;
    elPaper.style.display = (ray && isNarrow()) ? 'none' : '';
    if (ray) {
      camT.az = 7; camT.el = 0;
      D.getElementById('cardCode').textContent = 'APERTURE';
      D.getElementById('cardGrp').textContent = '光路模式';
      D.getElementById('cardName').textContent = 'f/' + N().toFixed(1);
      D.getElementById('cardFn').textContent = '正交侧视剖面。平行光自左侧射入，逐面折射后汇聚于像面。';
      D.getElementById('mFn').textContent = '有效口径 ⌀' + (FOCAL / N()).toFixed(1) + ' mm';
      D.getElementById('mMat').textContent = '9 片叶片';
      D.getElementById('mSize').textContent = '近轴近似';
    } else {
      D.getElementById('cardCode').textContent = 'LENS';
      D.getElementById('cardGrp').textContent = '前组';
      D.getElementById('cardName').textContent = '50mm f/1.4 定焦';
      D.getElementById('cardFn').textContent = '改良双高斯（Double-Gauss），7 片 6 组。悬停任意镜片查看细节。';
      D.getElementById('mFn').textContent = '—';
      D.getElementById('mMat').textContent = '—';
      D.getElementById('mSize').textContent = '—';
    }
  }

  function syncAperture() {
    var n = N();
    elApVal.textContent = 'f/' + (n < 10 ? n.toFixed(1) : n.toFixed(0));
    updateBlades();
    var d = dof(n);
    var near = D.getElementById('dofNear'), far = D.getElementById('dofFar');
    near.textContent = d.near.toFixed(1);
    far.textContent = d.far.toFixed(1);
    D.getElementById('dofSum').textContent = (d.far - d.near).toFixed(1) + ' mm';
    var band = D.getElementById('dofBand');
    var lo = 440, hi = 560;
    var t = Math.max(0, (d.near - lo) / (hi - lo));
    var hh = Math.max(0.6, (d.far - d.near) / (hi - lo) * 100);
    band.style.top = (t * 100) + '%';
    band.style.height = hh + '%';
    drawBokeh(bokehCv, n);
    if (state.mode === 'ray') {
      D.getElementById('cardName').textContent = 'f/' + (n < 10 ? n.toFixed(1) : n.toFixed(0));
      D.getElementById('mFn').textContent = '有效口径 ⌀' + (FOCAL / n).toFixed(1) + ' mm';
    }
  }

  /* ---------- 开场 ---------- */
  function abortOpening() {
    if (!state.opening) return;
    state.opening = false;
  }

  function runOpening(t) {
    if (t < 1500) {
      state.dis = 60 * ss(t / 1500);
      elDis.value = state.dis;
      elDisVal.textContent = Math.round(state.dis) + '%';
    } else if (t < 2500) {
      state.dis = 60;
      elDis.value = 60; elDisVal.textContent = '60%';
    } else if (t < 4600) {
      state.dis = 60;
      elDis.value = 60; elDisVal.textContent = '60%';
      camT.az = 8; camT.el = 4;
      camT.dist = fitDist() * 1.45;
      rayAlpha = ss((t - 2500) / 1600);
      if (t > 4560) showQuiz();
      return;
    } else {
      state.opening = false;
      state.rayUntil = performance.now() + 2600;
      camT.dist = fitDist(); camT.az = 42; camT.el = 18;
      showQuiz();
      return;
    }
  }

  /* ---------- 盲测 ---------- */
  var elQuiz = D.getElementById('quiz');
  function showQuiz() {
    if (state.quizOpen) return;
    state.quizOpen = true;
    drawBokeh(D.getElementById('quizCanvas'), 1.4);
    document.body.classList.add('quizzing');
    elQuiz.hidden = false;
    requestAnimationFrame(function () { elQuiz.classList.add('on'); });
  }
  function hideQuiz() {
    document.body.classList.remove('quizzing');
    elQuiz.classList.remove('on');
    setTimeout(function () { elQuiz.hidden = true; }, 360);
  }
  D.querySelectorAll('.quiz-opts button').forEach(function (b) {
    b.addEventListener('click', function () {
      var ans = parseFloat(b.getAttribute('data-n'));
      D.querySelectorAll('.quiz-opts button').forEach(function (x) {
        x.classList.toggle('hit', x === b);
        if (x !== b) x.classList.add('dim');
      });
      var rv = D.getElementById('quizReveal');
      rv.innerHTML = '光斑直径 ∝ 1 ÷ 光圈值。f/1.4 的孔径是 f/11 的 <b>7.9 倍</b>，背景光点也被放大 7.9 倍。' +
        (ans === 1.4 ? '' : '<br>正确答案是 f/1.4。');
      rv.hidden = false;
      setTimeout(hideQuiz, 3200);
    });
  });
  D.getElementById('quizSkip').addEventListener('click', hideQuiz);

  /* ============================================================
     主循环
     ============================================================ */
  var last = performance.now(), acc = 0, frame = 0;

  function tick(now) {
    var dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;

    if (state.opening) {
      // 用累计帧时驱动，后台标签页恢复时不会一次性跳过整段开场
      state.opAcc = (state.opAcc || 0) + Math.min(50, dt * 1000);
      runOpening(state.opAcc);
    }

    // 相机惯性 & 插值
    if (!drag.on) {
      camT.az = clampAngle(camT.az - drag.vx * 0.02);
      camT.el = Math.max(-20, Math.min(38, camT.el - drag.vy * 0.02));
      drag.vx *= 0.86; drag.vy *= 0.86;
    }
    var k = 1 - Math.pow(0.0016, dt);
    cam.az += (camT.az - cam.az) * k;
    cam.el += (camT.el - cam.el) * k;
    cam.dist += (camT.dist - cam.dist) * k;

    // rayMix
    var wantMix = state.mode === 'ray' ? 1 : 0;
    state.rayMix += (wantMix - state.rayMix) * (1 - Math.pow(0.0008, dt));
    if (Math.abs(state.rayMix - wantMix) < 0.002) state.rayMix = wantMix;

    applyExplode();
    applyCamera();

    // 光线透明度
    var wantRay = 1;
    if (state.opening) {
      /* 由开场时间轴控制 */
    } else {
      wantRay = (state.mode === 'ray' || performance.now() < state.rayUntil) ? 1 : 0;
      rayAlpha += (wantRay - rayAlpha) * (1 - Math.pow(0.004, dt));
      if (rayAlpha < 0.004) rayAlpha = 0;
    }
    passLine.material.opacity = 0.9 * rayAlpha;
    blkLine.material.opacity = 0.85 * rayAlpha;
    caGroups.forEach(function (cg) { cg.m.opacity = 0.62 * rayAlpha; });

    if (rayAlpha > 0.002) buildRays();
    passLine.visible = rayAlpha > 0.002;
    blkLine.visible = rayAlpha > 0.002;

    // 色差开关在到达 L5 后出现
    elRowCa.hidden = !(state.dis >= 86);

    // 相机切换（透视/正交过渡用 rayMix 做淡出）
    var camNow = state.rayMix > 0.55 ? camO : camP;
    if (state.rayMix > 0.55) setOrtho();

    renderer.render(scene, camNow);

    // 每两帧更新一次引线
    frame++;
    if (frame % 2 === 0) updateLeaders();

    requestAnimationFrame(tick);
  }

  /* ---------- 深链接：?dis=62&f=16&mode=ray&open=0 ---------- */
  (function initFromUrl() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.get('open') === '0') state.opening = false;
    var d = parseFloat(q.get('dis'));
    if (isFinite(d)) {
      state.dis = Math.max(0, Math.min(100, d));
      elDis.value = state.dis;
      elDisVal.textContent = Math.round(state.dis) + '%';
    }
    var f = parseFloat(q.get('f'));
    if (isFinite(f)) {
      var bi = 0, bd = 1e9;
      for (var i = 0; i < APERTURES.length; i++) {
        var dd = Math.abs(APERTURES[i] - f);
        if (dd < bd) { bd = dd; bi = i; }
      }
      state.apIdx = bi; elAp.value = bi; syncAperture();
    }
    if (q.get('mode') === 'ray') { setMode('ray'); state.rayMix = 1; rayAlpha = 1; }
    if (q.get('ca') === '1') { state.ca = true; caBtn.setAttribute('aria-pressed', 'true'); }
  })();

  /* ---------- 启动 ---------- */
  resize();
  applyExplode();
  applyCamera();
  syncAperture();
  updateBlades();
  buildRays();
  renderer.render(scene, camP);

  setTimeout(function () {
    var b = D.getElementById('boot');
    b.classList.add('gone');
    setTimeout(function () { b.style.display = 'none'; }, 460);
  }, 220);

  state.opAcc = 0;
  requestAnimationFrame(tick);

  // 键盘可达
  D.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (D.activeElement === elAp && state.mode === 'ray') {
        state.apIdx = Math.max(0, Math.min(APERTURES.length - 1, state.apIdx + (e.key === 'ArrowRight' ? 1 : -1)));
        elAp.value = state.apIdx;
        syncAperture();
        e.preventDefault();
      }
    }
  });

})();
