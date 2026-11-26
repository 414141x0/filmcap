/* FilmCap's home page: one day through the viewfinder.
 *
 * The phone is FilmCap's real camera screen (img/ui, matted from the app) in an iPhone Air frame
 * (img/ui/air.svg). Under it, the world: a 360° photo drawn around the phone, softened and
 * dimmed, and through the phone's screen the same world through a film, each film's colour as the
 * app develops it (32³ tables baked from the app, img/films). What moves on the screen is live:
 * the histogram is the picture's, the level turns with the camera, a tap pulls focus, a swipe slides
 * the next film across, the shutter keeps the photo for the darkroom below. The video phone plays
 * a real clip through the same films. */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const $ = (id) => document.getElementById(id);
  const deg = (d) => (d * Math.PI) / 180;
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  const SCENES = {
    cafe: { full: "img/pano/cafe.jpg", mid: "img/pano/cafe-mid.jpg", soft: "img/pano/cafe-soft.jpg", u: 0.575, pitch: 2, tint: "#e9b98a", when: "Morning, 8:14", place: "The café" },
    lake: { full: "img/pano/lake.jpg", mid: "img/pano/lake-mid.jpg", soft: "img/pano/lake-soft.jpg", u: 0.25, pitch: 4, tint: "#a9bcd6", when: "Evening, 6:40", place: "The lake" },
    night: { full: "img/pano/night.jpg", mid: "img/pano/night-mid.jpg", soft: "img/pano/night-soft.jpg", u: 0.385, pitch: -3, tint: "#f08a3c", when: "Night, 11:52", place: "The walk home" },
  };
  /* Grain for the page's picture (the films' own grain is spatial, which the tables leave out). */
  const GRAIN = {
    "grade.none": 0, "grade.natural": 0.016, "style.gold": 0.028, "emulsion.halcyon": 0.032, "grade.classic": 0.04,
    "style.tungsten": 0.032, "video.daylight-reel": 0.024, "emulsion.lantern": 0.045, "style.calypso": 0.028,
    "grade.monochrome": 0.045, "grade.studio": 0.06, "stock.portra400": 0.036,
  };
  const VFOV = deg(68);
  const yawOf = (u) => (u - 0.5) * Math.PI * 2;
  const shortest = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  function animate(duration, step, done) {
    if (reduced) duration = Math.min(duration, 1);
    const start = performance.now();
    const run = (now) => {
      const t = Math.min(1, (now - start) / duration);
      step(ease(t), t);
      if (t < 1) requestAnimationFrame(run); else if (done) done();
    };
    requestAnimationFrame(run);
  }

  /* ———————————————————————————————————————— Films and pictures */

  let films = [];
  const filmsReady = fetch("img/films/films.json").then((r) => r.json()).then((list) => {
    films = list.map((f) => ({ ...f, grain: GRAIN[f.id] ?? 0.03 }));
    return films;
  });
  const images = {};
  const picture = (src) => images[src] || (images[src] = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  }));

  /* ———————————————————————————————————————— WebGL, the little of it needed */

  const COMMON = `
    precision highp float;
    // A film's table: 32 slices of blue, 8 across and 4 down, red across and green down each.
    vec3 lut(sampler2D t, vec3 c) {
      c = clamp(c, 0.0, 1.0) * 31.0;
      float b0 = floor(c.b), b1 = min(b0 + 1.0, 31.0);
      vec2 rg = c.rg + 0.5;
      vec2 o0 = vec2(mod(b0, 8.0), floor(b0 / 8.0)) * 32.0;
      vec2 o1 = vec2(mod(b1, 8.0), floor(b1 / 8.0)) * 32.0;
      vec2 size = vec2(256.0, 128.0);
      return mix(texture2D(t, (o0 + rg) / size).rgb, texture2D(t, (o1 + rg) / size).rgb, c.b - b0);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // The film on a picture: the next film across the split as a swipe brings it, grain in the mid-tones.
    vec3 develop(vec3 c, float x, vec2 p, sampler2D a, sampler2D b, float split, float side, float ga, float gb, float time) {
      bool next = split >= 0.0 && (side > 0.0 ? x > split : x < split);
      vec3 film = next ? lut(b, c) : lut(a, c);
      float l = dot(film, vec3(0.299, 0.587, 0.114));
      float n = hash(floor(p) + floor(time * 24.0) * 7.31) - 0.5;
      return film + n * (next ? gb : ga) * (1.0 - abs(l * 2.0 - 1.0)) * 2.2;
    }`;

  function glKit(canvas, frag, names) {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) return null;
    const shader = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, COMMON + frag));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(program, n);
    const kit = {
      gl, u, luts: {},
      texture(source, { repeat = false, raw = false } = {}, existing) {
        const t = existing || gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        // A film's table is data, not a picture: no colour management on the way in.
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, raw ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        if (!existing) {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        return t;
      },
      bind(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t || null); },
      /* A film's table on this context: at once if it is here, loading (and `then` redrawn) if not. */
      lut(i, then) {
        const f = films[i];
        if (!f) return null;
        if (kit.luts[f.id]) return kit.luts[f.id];
        if (!kit.luts[f.id + ":p"]) {
          kit.luts[f.id + ":p"] = picture(`img/films/${f.id}.png`).then((img) => { kit.luts[f.id] = kit.texture(img, { raw: true }); if (then) then(); });
        }
        return null;
      },
      need(i) { return kit.lut(i) ? Promise.resolve() : kit.luts[films[i].id + ":p"]; },
    };
    ["uFilmA", "uFilmB"].forEach((n, i) => { if (u[n]) gl.uniform1i(u[n], 4 + i); });
    return kit;
  }

  /* ———————————————————————————————————————— A screen's films: the pill, the swipe, the name */

  function filmRoll({ kit, viewport, pill, name, kind, dot, big, live, kick, onTap }) {
    const r = { film: 0, incoming: -1, split: -1, side: 1, busy: false, lastUser: -1e9 };
    let nameTimer;
    r.show = (i, announce) => {
      const f = films[i];
      name.textContent = f.name;
      kind.textContent = f.character;
      dot.style.background = f.dot;
      if (!announce) return;
      big.textContent = f.name;
      big.classList.add("on");
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => big.classList.remove("on"), 900);
      if (live) live.textContent = `${f.name}: ${f.note}`;
    };
    const commit = (to) => {
      r.film = to; r.incoming = -1; r.split = -1; r.busy = false;
      r.show(to, true);
      kit.lut((to + 1) % films.length, kick);
      kit.lut((to - 1 + films.length) % films.length, kick);
      kick();
    };
    r.change = (to, side, from = side > 0 ? 1 : 0) => {
      if (r.busy || !films.length) return;
      to = (to + films.length) % films.length;
      if (to === r.film) return;
      r.busy = true; r.incoming = to; r.side = side;
      kit.lut(to, kick);
      kit.need(to).then(() => {
        const target = side > 0 ? 0 : 1;
        animate(520, (e) => { r.split = from + (target - from) * e; kick(); }, () => commit(to));
      });
    };
    r.choose = (id) => { const i = films.findIndex((f) => f.id === id); if (i >= 0 && i !== r.film) r.change(i, 1); };
    r.start = (id) => {
      r.film = Math.max(0, films.findIndex((f) => f.id === id));
      r.show(r.film, false);
      kit.lut(r.film, kick);
    };

    let swipe = null;
    viewport.addEventListener("pointerdown", (e) => {
      if (r.busy || !films.length) return;
      swipe = { x: e.clientX, t: performance.now(), w: viewport.getBoundingClientRect().width, moved: false, id: e.pointerId };
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dx = e.clientX - swipe.x;
      if (!swipe.moved && Math.abs(dx) < 6) return;
      if (!swipe.moved) { swipe.moved = true; viewport.classList.add("dragging"); }
      const side = dx < 0 ? 1 : -1;
      const to = (r.film + side + films.length) % films.length;
      if (r.incoming !== to) { r.incoming = to; kit.lut(to, kick); }
      r.side = side;
      const progress = Math.min(1, Math.abs(dx) / swipe.w);
      r.split = side > 0 ? 1 - progress : progress;
      kick();
    });
    const end = (e) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const s = swipe;
      swipe = null;
      viewport.classList.remove("dragging");
      if (!s.moved) {
        if (performance.now() - s.t < 500 && onTap) {
          const box = viewport.getBoundingClientRect();
          onTap((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
        }
        return;
      }
      if (r.incoming < 0) return;
      const dx = e.clientX - s.x, v = Math.abs(dx) / Math.max(1, performance.now() - s.t);
      const progress = Math.min(1, Math.abs(dx) / s.w);
      const side = r.side, to = r.incoming, from = r.split;
      r.lastUser = performance.now();
      r.busy = true;
      if (progress > 0.28 || v > 0.6) {
        kit.need(to).then(() => animate(340, (k) => { r.split = from + ((side > 0 ? 0 : 1) - from) * k; kick(); }, () => commit(to)));
      } else {
        animate(260, (k) => { r.split = from + ((side > 0 ? 1 : 0) - from) * k; kick(); }, () => { r.incoming = -1; r.split = -1; r.busy = false; kick(); });
      }
    };
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", end);
    viewport.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); r.lastUser = performance.now(); r.change(r.film + 1, 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); r.lastUser = performance.now(); r.change(r.film - 1, -1); }
    });
    pill.addEventListener("click", () => { r.lastUser = performance.now(); r.change(r.film + 1, 1); });
    return r;
  }

  /* ———————————————————————————————————————— The shutter's face: the picture's histogram */

  const sample = document.createElement("canvas");
  sample.width = 32; sample.height = 24;
  const sampler = sample.getContext("2d", { willReadFrequently: true });

  /* Sixteen columns of eight dots, as the app's shutter: each column a band of brightness, lit
     from the bottom as far as the picture holds it; a column's top dot takes the colour of the
     channel that leads there. */
  function histogram(source, sx, sy, sw, sh, out) {
    if (sw < 2 || sh < 2) return;
    sampler.drawImage(source, sx, sy, sw, sh, 0, 0, 32, 24);
    const px = sampler.getImageData(0, 0, 32, 24).data;
    const lum = new Float32Array(16), rgb = [new Float32Array(16), new Float32Array(16), new Float32Array(16)];
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      lum[Math.min(15, (0.299 * r + 0.587 * g + 0.114 * b) >> 4)]++;
      rgb[0][r >> 4]++; rgb[1][g >> 4]++; rgb[2][b >> 4]++;
    }
    const most = Math.max(...lum, 1);
    const ctx = out.getContext("2d");
    const k = out.width / 82.67;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, 82.67, 50.33);
    const colours = ["#ff5a4e", "#5ee07a", "#5aa7ff"];
    for (let c = 0; c < 16; c++) {
      const height = Math.round(8 * Math.sqrt(lum[c] / most));
      let lead = -1, best = lum[c] * 1.25;
      for (let ch = 0; ch < 3; ch++) if (rgb[ch][c] > best) { best = rgb[ch][c]; lead = ch; }
      for (let row = 0; row < 8; row++) {
        const lit = 7 - row < height, top = 7 - row === height - 1;
        ctx.fillStyle = lit ? (top && lead >= 0 ? colours[lead] : "#fff") : "rgba(255,255,255,0.16)";
        ctx.beginPath();
        ctx.arc(9.33 + c * 4.267, 8.67 + row * 4.762, lit ? 1.35 : 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const sizeHist = (c) => { c.width = 248; c.height = 151; };

  /* ———————————————————————————————————————— The day: the world and the phone */

  const canvas = $("world");
  const stage = canvas.parentElement;
  const phone = $("phone");
  const screen = phone.querySelector(".screen");
  const viewport = $("viewport");
  const hist = $("hist");
  sizeHist(hist);

  const WORLD = `
    uniform sampler2D uPanoA, uPanoB, uSoftA, uSoftB, uFilmA, uFilmB;
    uniform vec4 uRect, uScreen;
    uniform vec2 uCenter;
    uniform float uRadius, uFocal, uYaw, uPitch, uRoll, uMix, uSplit, uSide, uGrainA, uGrainB, uTime, uFlash, uBlur;

    vec3 dirAt(vec2 p) {
      vec2 q = (p - uCenter) / uFocal;
      float cr = cos(uRoll), sr = sin(uRoll);
      vec3 d = normalize(vec3(q.x * cr - q.y * sr, q.x * sr + q.y * cr, -1.0));
      float cp = cos(uPitch), sp = sin(uPitch);
      d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
      float cy = cos(uYaw), sy = sin(uYaw);
      return vec3(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
    }
    vec2 uvOf(vec3 d) { return vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.1415927); }
    float box(vec2 p, vec4 r, float radius) {
      vec2 q = abs(p - (r.xy + r.zw * 0.5)) - (r.zw * 0.5 - radius);
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    }
    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 uv = uvOf(dirAt(p));
      vec3 soft = texture2D(uSoftA, uv).rgb;
      if (uMix > 0.0) soft = mix(soft, texture2D(uSoftB, uv).rgb, uMix);
      if (box(p, uScreen, uRadius) < 0.0) {
        // The phone: the viewfinder sharp, the glass over the rest softened, all of it through the film.
        vec2 local = (p - uRect.xy) / uRect.zw;
        vec3 c = soft;
        bool inside = local.y >= 0.0 && local.y <= 1.0;
        if (inside) {
          c = texture2D(uPanoA, uv).rgb;
          if (uMix > 0.0) c = mix(c, texture2D(uPanoB, uv).rgb, uMix);
          c = mix(c, soft, uBlur);
        }
        vec3 film = develop(c, local.x, p, uFilmA, uFilmB, uSplit, uSide, uGrainA, uGrainB, uTime);
        if (inside && uSplit >= 0.0) {
          float e = (local.x - uSplit) * uRect.z;
          film *= 1.0 - 0.4 * exp(-e * e / 30.0);
        }
        gl_FragColor = vec4(inside ? mix(film, vec3(1.0), uFlash) : film, 1.0);
      } else {
        float l = dot(soft, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(mix(vec3(l), soft, 0.8) * 0.6, 1.0);
      }
    }`;

  const state = {
    scene: "cafe", next: null, mix: 0,
    yaw: yawOf(SCENES.cafe.u), pitch: deg(SCENES.cafe.pitch), roll: 0,
    baseYaw: yawOf(SCENES.cafe.u), basePitch: deg(SCENES.cafe.pitch),
    lookX: 0, lookY: 0, lookRoll: 0, dragYaw: 0, tiltYaw: 0, tiltPitch: 0, tiltRoll: null,
    flash: 0, blur: 0,
  };
  let kit = null, roll = null, visible = true, frame = 0, last = performance.now(), dpr = 1, lastHist = 0;
  const textures = {};
  let rect = { x: 0, y: 0, w: 1, h: 1 }, scr = { x: 0, y: 0, w: 1, h: 1 };

  function fit() {
    const mobile = innerWidth <= 820;
    const h = stage.clientHeight, w = stage.clientWidth;
    const s = mobile ? Math.min((h * 0.5) / 943, (w * 0.6) / 458) : Math.min((h * 0.84) / 943, (w * 0.3) / 458);
    stage.style.setProperty("--s", s.toFixed(4));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(canvas.clientWidth * dpr), ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  }

  function measure() {
    const c = canvas.getBoundingClientRect(), v = viewport.getBoundingClientRect(), s = screen.getBoundingClientRect();
    rect = { x: (v.left - c.left) * dpr, y: (c.bottom - v.bottom) * dpr, w: v.width * dpr, h: v.height * dpr };
    scr = { x: (s.left - c.left) * dpr, y: (c.bottom - s.bottom) * dpr, w: s.width * dpr, h: s.height * dpr };
  }

  /* A scene in three steps: softened (the world around the phone), then sharp enough for the
     viewfinder (2048 wide, quick), then full (4096). The viewfinder is never left soft: a scene is
     only shown once a sharp picture of it is in (`sharp`). */
  const sceneLoads = {};
  function loadScene(name, sharp) {
    const s = SCENES[name], entry = sceneLoads[name] || (sceneLoads[name] = {});
    const t = textures[name] || (textures[name] = {});
    const keep = (key) => (img) => { t[key] = kit.texture(img, { repeat: true }); kick(); };
    entry.soft = entry.soft || picture(s.soft).then(keep("soft"));
    if (sharp && !entry.sharp) {
      entry.sharp = Promise.all([entry.soft, picture(s.mid).then(keep("mid"))]);
      entry.sharp.then(() => picture(s.full)).then(keep("full")).catch(() => {});
    }
    return sharp ? entry.sharp : entry.soft;
  }
  const sharpOf = (t) => t.full || t.mid;

  function draw(time) {
    const a = textures[state.scene] || {}, b = (state.next && textures[state.next]) || {};
    if (!films.length) return false;
    const lutA = kit.lut(roll.film, kick), lutB = roll.incoming >= 0 ? kit.lut(roll.incoming, kick) : null;
    if (!a.soft || !lutA) return false;
    const { gl, u } = kit;
    measure();
    gl.viewport(0, 0, canvas.width, canvas.height);
    // The opening scene may be soft for the moment its sharp picture takes; a new scene never is.
    kit.bind(0, sharpOf(a) || a.soft); kit.bind(1, sharpOf(b) || sharpOf(a) || a.soft);
    kit.bind(2, a.soft); kit.bind(3, b.soft || a.soft);
    kit.bind(4, lutA); kit.bind(5, lutB || lutA);
    gl.uniform4f(u.uRect, rect.x, rect.y, rect.w, rect.h);
    gl.uniform4f(u.uScreen, scr.x, scr.y, scr.w, scr.h);
    gl.uniform1f(u.uRadius, (scr.w / 420) * 62);
    gl.uniform2f(u.uCenter, rect.x + rect.w / 2, rect.y + rect.h / 2);
    gl.uniform1f(u.uFocal, rect.h / 2 / Math.tan(VFOV / 2));
    gl.uniform1f(u.uYaw, state.yaw);
    gl.uniform1f(u.uPitch, state.pitch);
    gl.uniform1f(u.uRoll, state.roll);
    gl.uniform1f(u.uMix, state.next && sharpOf(b) ? state.mix : 0);
    gl.uniform1f(u.uSplit, lutB ? roll.split : -1);
    gl.uniform1f(u.uSide, roll.side);
    gl.uniform1f(u.uGrainA, films[roll.film].grain);
    gl.uniform1f(u.uGrainB, roll.incoming >= 0 ? films[roll.incoming].grain : 0);
    gl.uniform1f(u.uTime, reduced ? 0 : time / 1000);
    gl.uniform1f(u.uFlash, state.flash);
    gl.uniform1f(u.uBlur, state.blur);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // The shutter's face, from what was just drawn (a few times a second).
    if (time - lastHist > 110) {
      lastHist = time;
      histogram(canvas, rect.x, canvas.height - rect.y - rect.h, rect.w, rect.h, hist);
    }
    return true;
  }

  /* The level: the camera's roll, from the phone held in the hand or (on a computer) the mouse. */
  const level = $("level");
  function showLevel() {
    const d = (state.roll * 180) / Math.PI;
    level.setAttribute("transform", `rotate(${(-d).toFixed(2)} 210 280)`);
    level.classList.toggle("true", Math.abs(d) < 0.6);
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const drift = reduced ? 0 : Math.sin(now / 9000) * 0.06;
    const yaw = state.baseYaw + state.lookX + state.dragYaw + state.tiltYaw + drift;
    const pitch = Math.max(-1.1, Math.min(1.1, state.basePitch + state.lookY + state.tiltPitch));
    const rollTo = state.tiltRoll != null ? state.tiltRoll : state.lookRoll;
    const k = 1 - Math.exp(-dt * (reduced ? 30 : 6));
    state.yaw += shortest(state.yaw, yaw) * k;
    state.pitch += (pitch - state.pitch) * k;
    state.roll += (rollTo - state.roll) * k;
    showLevel();
    draw(now);
    if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function kick() { if (!frame && visible && kit) { last = performance.now(); frame = requestAnimationFrame(tick); } }

  let sceneBusy = false, sceneWanted = null;
  function setScene(name) {
    if (!SCENES[name]) return;
    sceneWanted = name;
    if (sceneBusy || name === state.scene) return;
    sceneBusy = true;
    const target = SCENES[name];
    document.documentElement.style.setProperty("--scene", target.tint);
    loadScene(name, true).then(() => {
      state.next = name;
      const fromYaw = state.baseYaw, turn = shortest(fromYaw, yawOf(target.u));
      const fromPitch = state.basePitch, toPitch = deg(target.pitch);
      animate(1400, (e) => {
        state.mix = e;
        state.baseYaw = fromYaw + turn * e;
        state.basePitch = fromPitch + (toPitch - fromPitch) * e;
        kick();
      }, () => {
        state.scene = name; state.next = null; state.mix = 0; sceneBusy = false;
        if (sceneWanted !== name) setScene(sceneWanted);
      });
    });
  }

  /* Focus: a tap puts the square on the point, and the picture pulls into focus there. */
  const focus = $("focus");
  function focusAt(x, y) {
    focus.style.left = `${x * 420}px`;
    focus.style.top = `${y * 560}px`;
    focus.classList.remove("on"); void focus.offsetWidth; focus.classList.add("on");
    animate(520, (e, t) => { state.blur = Math.sin(Math.PI * t) * 0.85; kick(); }, () => { state.blur = 0; kick(); });
  }

  /* Looking around: the mouse, a drag beside the phone, or the phone itself. */
  if (finePointer) {
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !visible) return;
      state.lookX = (e.clientX / innerWidth - 0.5) * 0.9;
      state.lookY = (e.clientY / innerHeight - 0.5) * 0.4;
      state.lookRoll = deg((e.clientX / innerWidth - 0.5) * -5);
      kick();
    }, { passive: true });
  }
  let look = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || e.target.closest(".device, button, a")) return;
    look = { x: e.clientX, yaw: state.dragYaw, id: e.pointerId };
  });
  addEventListener("pointermove", (e) => {
    if (!look || e.pointerId !== look.id) return;
    state.dragYaw = look.yaw - (e.clientX - look.x) * 0.006;
    quietHints();
    kick();
  }, { passive: true });
  addEventListener("pointerup", () => { look = null; });
  addEventListener("pointercancel", () => { look = null; });

  const tilt = $("tilt");
  if (!finePointer && "DeviceOrientationEvent" in window) {
    tilt.hidden = false;
    tilt.addEventListener("click", async () => {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function" &&
            (await DeviceOrientationEvent.requestPermission()) !== "granted") return;
      } catch { return; }
      tilt.hidden = true;
      let origin = null;
      addEventListener("deviceorientation", (e) => {
        if (e.alpha == null || e.beta == null) return;
        if (!origin) origin = { alpha: e.alpha, beta: e.beta };
        let turn = e.alpha - origin.alpha;
        if (turn > 180) turn -= 360;
        if (turn < -180) turn += 360;
        state.tiltYaw = deg(-turn);
        state.tiltPitch = deg(origin.beta - e.beta);
        state.tiltRoll = deg(-(e.gamma || 0));
        kick();
      });
    });
  }

  /* The shutter: what you framed, kept. */
  const kept = [];
  $("shutter").addEventListener("click", () => {
    if (!kit || !roll) return;
    state.flash = 0;
    if (!draw(performance.now())) return;
    const gl = kit.gl;
    const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h));
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(Math.round(rect.x), Math.round(rect.y), w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    animate(420, (e) => { state.flash = 0.9 * (1 - e); kick(); });
    const full = document.createElement("canvas");
    full.width = w; full.height = h;
    const ctx = full.getContext("2d");
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(image, 0, 0);
    const scale = Math.min(1, 900 / h);
    const out = document.createElement("canvas");
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    out.getContext("2d").drawImage(full, 0, 0, out.width, out.height);
    const film = films[roll.film], scene = SCENES[state.scene];
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      kept.push({ url, film: film.name, when: scene.when, place: scene.place });
      hang(kept[kept.length - 1]);
      const pocket = $("pocket"), img = $("pocketimg");
      img.src = url; img.hidden = false;
      pocket.classList.remove("got"); void pocket.offsetWidth; pocket.classList.add("got");
      $("live").textContent = `Kept, through ${film.name}. It is hanging in the darkroom below.`;
    }, "image/jpeg", 0.9);
    quietHints();
  });

  let quietTimer;
  function quietHints() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => $("hints").classList.add("quiet"), 2500);
  }

  /* Each chapter brings its scene, and suggests its film. */
  const chapters = [...document.querySelectorAll(".chapter")];
  const chapterWatch = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target.classList.contains("intro")) document.body.classList.toggle("at-start", entry.isIntersecting);
      if (!entry.isIntersecting) continue;
      const { scene, film } = entry.target.dataset;
      setScene(scene);
      if (roll && performance.now() - roll.lastUser > 9000) filmsReady.then(() => roll.choose(film));
      const after = chapters[chapters.indexOf(entry.target) + 1];
      if (after) loadScene(after.dataset.scene, true);
    }
  }, { threshold: 0.5 });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); }).observe($("story"));
  new IntersectionObserver(([entry]) => document.body.classList.toggle("past", !entry.isIntersecting),
    { rootMargin: "-64px 0px 0px 0px" }).observe($("story"));

  try {
    kit = glKit(canvas, WORLD, ["uPanoA", "uPanoB", "uSoftA", "uSoftB", "uFilmA", "uFilmB", "uRect", "uScreen", "uCenter", "uRadius",
      "uFocal", "uYaw", "uPitch", "uRoll", "uMix", "uSplit", "uSide", "uGrainA", "uGrainB", "uTime", "uFlash", "uBlur"]);
    if (!kit) throw new Error("No WebGL");
    ["uPanoA", "uPanoB", "uSoftA", "uSoftB"].forEach((n, i) => kit.gl.uniform1i(kit.u[n], i));
    roll = filmRoll({ kit, viewport, pill: $("pill"), name: $("pillname"), kind: $("pillkind"), dot: $("dot"),
      big: $("filmname"), live: $("live"), kick, onTap: focusAt });
    fit();
    addEventListener("resize", () => { fit(); kick(); });
    document.addEventListener("visibilitychange", kick);
    for (const name of Object.keys(SCENES)) loadScene(name, name === "cafe");
    filmsReady.then(() => {
      roll.start("style.gold");
      films.forEach((_, i) => setTimeout(() => kit.lut(i, kick), 600 + i * 120));
    });
    chapters.forEach((c) => chapterWatch.observe(c));
    kick();
  } catch {
    kit = null;
    fit();
    addEventListener("resize", fit);
    viewport.querySelector(".fallback").hidden = false;
    $("hints").hidden = true;
    $("shutter").disabled = true;
  }

  /* ———————————————————————————————————————— Video: a real clip through the films */

  (function videoPhone() {
    const vp = $("vviewport"), video = $("clip"), vhist = $("vhist");
    sizeHist(vhist);
    const film = document.createElement("canvas");
    film.className = "film";
    film.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    vp.prepend(film);
    const VIDEO = `
      uniform sampler2D uVideo, uFilmA, uFilmB;
      uniform vec2 uSize, uScale;
      uniform float uSplit, uSide, uGrainA, uGrainB, uTime;
      void main() {
        vec2 local = gl_FragCoord.xy / uSize;
        vec2 uv = (vec2(local.x, 1.0 - local.y) - 0.5) * uScale + 0.5;   // the clip covers the viewfinder
        vec3 c = texture2D(uVideo, uv).rgb;
        vec3 f = develop(c, local.x, gl_FragCoord.xy, uFilmA, uFilmB, uSplit, uSide, uGrainA, uGrainB, uTime);
        if (uSplit >= 0.0) { float e = (local.x - uSplit) * uSize.x; f *= 1.0 - 0.4 * exp(-e * e / 30.0); }
        gl_FragColor = vec4(f, 1.0);
      }`;
    let vkit = null;
    try { vkit = glKit(film, VIDEO, ["uVideo", "uFilmA", "uFilmB", "uSize", "uScale", "uSplit", "uSide", "uGrainA", "uGrainB", "uTime"]); } catch { vkit = null; }
    let shown = false, vframe = 0, texture = null, vroll = null, lastVHist = 0;
    if (!vkit) { video.classList.add("plain"); film.remove(); }
    else vkit.gl.uniform1i(vkit.u.uVideo, 0);

    function vdraw(now) {
      vframe = 0;
      if (!vkit || !vroll) return;
      const { gl, u } = vkit;
      const box = vp.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(box.width * d), h = Math.round(box.height * d);
      if (film.width !== w || film.height !== h) { film.width = w; film.height = h; }
      const lutA = vkit.lut(vroll.film, vkick), lutB = vroll.incoming >= 0 ? vkit.lut(vroll.incoming, vkick) : null;
      if (video.readyState >= 2 && lutA) {
        texture = vkit.texture(video, {}, texture);
        gl.viewport(0, 0, w, h);
        vkit.bind(0, texture); vkit.bind(4, lutA); vkit.bind(5, lutB || lutA);
        gl.uniform2f(u.uSize, w, h);
        const va = video.videoWidth / video.videoHeight, sa = w / h;
        gl.uniform2f(u.uScale, va > sa ? sa / va : 1, va > sa ? 1 : va / sa);
        gl.uniform1f(u.uSplit, lutB ? vroll.split : -1);
        gl.uniform1f(u.uSide, vroll.side);
        gl.uniform1f(u.uGrainA, films[vroll.film].grain);
        gl.uniform1f(u.uGrainB, vroll.incoming >= 0 ? films[vroll.incoming].grain : 0);
        gl.uniform1f(u.uTime, reduced ? 0 : now / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (now - lastVHist > 110) { lastVHist = now; histogram(film, 0, 0, w, h, vhist); }
      }
      if (shown && !document.hidden && (!video.paused || vroll.busy || video.readyState < 2)) vframe = requestAnimationFrame(vdraw);
    }
    function vkick() { if (!vframe && shown) vframe = requestAnimationFrame(vdraw); }

    if (vkit) {
      filmsReady.then(() => {
        vroll = filmRoll({ kit: vkit, viewport: vp, pill: $("vpill"), name: $("vpillname"), kind: $("vpillkind"), dot: $("vdot"),
          big: $("vfilmname"), live: $("live"), kick: vkick });
        vroll.start("emulsion.halcyon");
        vkick();
      });
    }
    video.addEventListener("loadeddata", vkick);
    video.addEventListener("play", vkick);
    new IntersectionObserver(([entry]) => {
      shown = entry.isIntersecting;
      if (shown) {
        video.preload = "auto";
        if (!reduced) video.play().catch(() => {}); else video.load();
        vkick();
      } else video.pause();
    }, { rootMargin: "120px" }).observe($("vphone"));

    // Record: the display outlined in red and the time counting, as in the app.
    const rec = $("rec");
    let recording = null;
    $("vshutter").addEventListener("click", () => {
      if (recording) { clearInterval(recording); recording = null; rec.classList.remove("on"); return; }
      let seconds = 0;
      rec.dataset.time = "00:00";
      rec.classList.add("on");
      recording = setInterval(() => { seconds++; rec.dataset.time = `00:${String(seconds % 60).padStart(2, "0")}`; }, 1000);
    });
  })();

  /* ———————————————————————————————————————— The film wall */

  filmsReady.then((list) => {
    const wall = $("wall");
    for (const f of list) {
      const li = document.createElement("li");
      li.innerHTML = `
        <button type="button" aria-label="Load ${f.name} in the viewfinder">
          <div class="frame"><img src="img/views/lake-${f.id}.webp" alt="The lake at dusk through ${f.name}" loading="lazy" width="480" height="640"></div>
          <p class="kind">${f.character}</p>
          <p class="name"><i style="background:${f.dot}"></i>${f.name}</p>
          <p class="line1">${f.id.startsWith("stock.") ? "Colour negative film stock." : f.note}</p>
        </button>`;
      li.querySelector("button").addEventListener("click", () => {
        if (roll) { roll.lastUser = performance.now(); roll.choose(f.id); }
        $("story").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
        viewport.focus({ preventScroll: true });
      });
      wall.appendChild(li);
    }
  });

  /* ———————————————————————————————————————— Plain against film */

  const compare = $("compare");
  $("handle").addEventListener("input", (e) => compare.style.setProperty("--at", e.target.value + "%"));

  /* ———————————————————————————————————————— The darkroom line */

  const line = $("line");
  const tilts = [-2.4, 1.8, -1.1, 2.6, -1.9, 1.2, -2.8, 2.1];
  const settle = () => [...line.children].forEach((p, i) => p.style.setProperty("--tilt", tilts[i % tilts.length] + "deg"));
  settle();
  const words = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const count = (n) => words[n] || String(n);

  function hang(photo) {
    const fig = document.createElement("figure");
    fig.className = "print yours fresh";
    const img = new Image();
    img.src = photo.url;
    img.alt = `Your photo of ${photo.place.toLowerCase()}, through ${photo.film}`;
    const cap = document.createElement("figcaption");
    cap.textContent = photo.place;
    const small = document.createElement("small");
    small.textContent = `${photo.film} · ${photo.when}`;
    cap.appendChild(small);
    fig.append(img, cap);
    line.prepend(fig);
    // The newest at the front, in view (the line would keep its place and push it off to the left).
    line.scrollLeft = 0;
    settle();
    const yours = kept.length;
    $("darkroomtitle").textContent = `Today, you kept ${count(yours)}.`;
    $("darkroomline").textContent = "They are hanging here, beside the developer’s own. In FilmCap they would be RAW photos, on your iPhone, in your Photos library, to look at whenever you like.";
    $("keptline").textContent = yours === 1 ? "Your photo is drying in the darkroom below." : `Your ${count(yours)} photos are drying in the darkroom below.`;
  }

  // The line sways a little as the page moves.
  if (!reduced) {
    let lastY = scrollY, sway = 0, swaying = 0;
    const swing = () => {
      sway *= 0.9;
      [...line.children].forEach((p, i) => p.style.setProperty("--tilt", (tilts[i % tilts.length] + sway * (i % 2 ? 1 : -1)) + "deg"));
      swaying = Math.abs(sway) > 0.02 ? requestAnimationFrame(swing) : 0;
    };
    addEventListener("scroll", () => {
      const v = scrollY - lastY;
      lastY = scrollY;
      sway = Math.max(-4, Math.min(4, sway + v * 0.02));
      if (!swaying) swaying = requestAnimationFrame(swing);
    }, { passive: true });
  }
})();
