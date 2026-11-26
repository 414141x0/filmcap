/* FilmCap's home page: one day through the viewfinder.
 *
 * The world is a 360° photo drawn around the phone (softened and dimmed), and the phone's screen
 * is a window into the same world, through a film: each film's colour as the app develops it,
 * baked from the app itself into a 32³ table (img/films, `WebFilmsBake`). Look around with the
 * mouse, a drag, or the phone itself; swipe the picture for another film, as in the app; the
 * shutter keeps what you framed as a print in the darkroom further down. */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  const SCENES = {
    cafe: { full: "img/pano/cafe.jpg", soft: "img/pano/cafe-soft.jpg", u: 0.575, pitch: 2, tint: "#e9b98a", when: "Morning, 8:14", place: "The café" },
    lake: { full: "img/pano/lake.jpg", soft: "img/pano/lake-soft.jpg", u: 0.25, pitch: 4, tint: "#a9bcd6", when: "Evening, 6:40", place: "The lake" },
    night: { full: "img/pano/night.jpg", soft: "img/pano/night-soft.jpg", u: 0.385, pitch: -3, tint: "#f08a3c", when: "Night, 11:52", place: "The walk home" },
  };
  /* Grain for the page's picture (the films' own grain is spatial, which the tables leave out). */
  const GRAIN = {
    "grade.none": 0, "grade.natural": 0.016, "style.gold": 0.028, "emulsion.halcyon": 0.032, "grade.classic": 0.04,
    "style.tungsten": 0.032, "video.daylight-reel": 0.024, "emulsion.lantern": 0.045, "style.calypso": 0.028,
    "grade.monochrome": 0.045, "grade.studio": 0.06, "stock.portra400": 0.036,
  };
  const VFOV = (68 * Math.PI) / 180;
  const deg = (d) => (d * Math.PI) / 180;
  const yawOf = (u) => (u - 0.5) * Math.PI * 2;
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  /* ———————————————————————————————————————— Films */

  let films = [];
  const filmsReady = fetch("img/films/films.json").then((r) => r.json()).then((list) => {
    films = list.map((f) => ({ ...f, grain: GRAIN[f.id] ?? 0.03 }));
    return films;
  });

  /* ———————————————————————————————————————— The viewfinder */

  const canvas = $("world");
  const viewport = $("viewport");
  const stage = canvas.parentElement;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });

  const state = {
    scene: "cafe", next: null, mix: 0,
    film: 0, incoming: -1, split: -1, side: 1,
    yaw: yawOf(SCENES.cafe.u), pitch: deg(SCENES.cafe.pitch),
    baseYaw: yawOf(SCENES.cafe.u), basePitch: deg(SCENES.cafe.pitch),
    lookX: 0, lookY: 0, dragYaw: 0, tiltYaw: 0, tiltPitch: 0,
    flash: 0, running: false, lastUserFilm: -1e9,
  };

  const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
  const FRAG = `
    precision highp float;
    uniform sampler2D uPanoA, uPanoB, uSoftA, uSoftB, uLutA, uLutB;
    uniform vec4 uRect;
    uniform vec2 uCenter;
    uniform float uFocal, uYaw, uPitch, uMix, uSplit, uSide, uGrainA, uGrainB, uTime, uFlash;

    vec3 dirAt(vec2 p) {
      vec3 d = normalize(vec3((p - uCenter) / uFocal, -1.0));
      float cp = cos(uPitch), sp = sin(uPitch);
      d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
      float cy = cos(uYaw), sy = sin(uYaw);
      return vec3(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
    }
    vec2 uvOf(vec3 d) {
      return vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.1415927);
    }
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

    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 uv = uvOf(dirAt(p));
      vec2 local = (p - uRect.xy) / uRect.zw;
      if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
        vec3 c = texture2D(uPanoA, uv).rgb;
        if (uMix > 0.0) c = mix(c, texture2D(uPanoB, uv).rgb, uMix);
        bool next = uSplit >= 0.0 && (uSide > 0.0 ? local.x > uSplit : local.x < uSplit);
        vec3 film = next ? lut(uLutB, c) : lut(uLutA, c);
        float l = dot(film, vec3(0.299, 0.587, 0.114));
        float n = hash(floor(p) + floor(uTime * 24.0) * 7.31) - 0.5;
        film += n * (next ? uGrainB : uGrainA) * (1.0 - abs(l * 2.0 - 1.0)) * 2.2;
        if (uSplit >= 0.0) {
          float e = (local.x - uSplit) * uRect.z;
          film *= 1.0 - 0.4 * exp(-e * e / 30.0);
        }
        gl_FragColor = vec4(mix(film, vec3(1.0), uFlash), 1.0);
      } else {
        vec3 c = texture2D(uSoftA, uv).rgb;
        if (uMix > 0.0) c = mix(c, texture2D(uSoftB, uv).rgb, uMix);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(mix(vec3(l), c, 0.8) * 0.58, 1.0);
      }
    }`;

  let program, uni = {}, textures = {}, luts = {};

  function compile(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function setup() {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uPanoA", "uPanoB", "uSoftA", "uSoftB", "uLutA", "uLutB", "uRect", "uCenter", "uFocal", "uYaw", "uPitch",
      "uMix", "uSplit", "uSide", "uGrainA", "uGrainB", "uTime", "uFlash"]) uni[n] = gl.getUniformLocation(program, n);
    ["uPanoA", "uPanoB", "uSoftA", "uSoftB", "uLutA", "uLutB"].forEach((n, i) => gl.uniform1i(uni[n], i));
  }

  function texture(image, { repeat = false, raw = false } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // A film's table is data, not a picture: no colour management on the way in.
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, raw ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  /* A scene's softened world first (small), then its sharp one. */
  const sceneLoads = {};
  function loadScene(name, sharp) {
    const s = SCENES[name];
    const entry = sceneLoads[name] || (sceneLoads[name] = {});
    entry.soft = entry.soft || loadImage(s.soft).then((img) => { textures[name] = textures[name] || {}; textures[name].soft = texture(img, { repeat: true }); kick(); });
    if (sharp) {
      entry.full = entry.full || loadImage(s.full).then((img) => { textures[name] = textures[name] || {}; textures[name].full = texture(img, { repeat: true }); kick(); });
    }
    return entry.soft;
  }

  function loadLut(i) {
    const f = films[i];
    if (!f) return Promise.resolve();
    return luts[f.id] ? Promise.resolve() : (luts[f.id + ":p"] = luts[f.id + ":p"] ||
      loadImage(`img/films/${f.id}.png`).then((img) => { luts[f.id] = texture(img, { raw: true }); kick(); }));
  }

  function bind(unit, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t || null);
  }

  /* ———— Drawing */

  let dpr = 1, rect = { x: 0, y: 0, w: 1, h: 1 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function measure() {
    const c = canvas.getBoundingClientRect(), v = viewport.getBoundingClientRect();
    rect = { x: (v.left - c.left) * dpr, y: (c.bottom - v.bottom) * dpr, w: v.width * dpr, h: v.height * dpr };
  }

  function draw(time) {
    const a = textures[state.scene] || {}, b = (state.next && textures[state.next]) || {};
    const filmA = films[state.film], filmB = films[state.incoming];
    if (!a.soft || !filmA || !luts[filmA.id]) return false;
    measure();
    gl.viewport(0, 0, canvas.width, canvas.height);
    bind(0, a.full || a.soft); bind(1, b.full || b.soft || a.soft);
    bind(2, a.soft); bind(3, b.soft || a.soft);
    bind(4, luts[filmA.id]); bind(5, (filmB && luts[filmB.id]) || luts[filmA.id]);
    gl.uniform4f(uni.uRect, rect.x, rect.y, rect.w, rect.h);
    gl.uniform2f(uni.uCenter, rect.x + rect.w / 2, rect.y + rect.h / 2);
    gl.uniform1f(uni.uFocal, rect.h / 2 / Math.tan(VFOV / 2));
    gl.uniform1f(uni.uYaw, state.yaw);
    gl.uniform1f(uni.uPitch, state.pitch);
    gl.uniform1f(uni.uMix, state.next && b.soft ? state.mix : 0);
    gl.uniform1f(uni.uSplit, filmB && luts[filmB.id] ? state.split : -1);
    gl.uniform1f(uni.uSide, state.side);
    gl.uniform1f(uni.uGrainA, filmA.grain);
    gl.uniform1f(uni.uGrainB, filmB ? filmB.grain : 0);
    gl.uniform1f(uni.uTime, reduced ? 0 : time / 1000);
    gl.uniform1f(uni.uFlash, state.flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /* ———— The loop: only while the story is on screen. */

  let visible = true, frame = 0, last = performance.now();

  function tick(now) {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const drift = reduced ? 0 : Math.sin(now / 9000) * 0.06;
    const targetYaw = state.baseYaw + state.lookX + state.dragYaw + state.tiltYaw + drift;
    const targetPitch = Math.max(-1.1, Math.min(1.1, state.basePitch + state.lookY + state.tiltPitch));
    const k = 1 - Math.exp(-dt * (reduced ? 30 : 6));
    state.yaw += shortest(state.yaw, targetYaw) * k;
    state.pitch += (targetPitch - state.pitch) * k;
    draw(now);
    if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function kick() { if (!frame && visible && gl && program) { last = performance.now(); frame = requestAnimationFrame(tick); } }
  const shortest = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  function animate(duration, step, done) {
    if (reduced) duration = Math.min(duration, 1);
    const start = performance.now();
    const run = (now) => {
      const t = Math.min(1, (now - start) / duration);
      step(ease(t), t);
      kick();
      if (t < 1) requestAnimationFrame(run); else done && done();
    };
    requestAnimationFrame(run);
  }

  /* ———— Scenes */

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
      const fromYaw = state.baseYaw, toYaw = yawOf(target.u), turn = shortest(fromYaw, toYaw);
      const fromPitch = state.basePitch, toPitch = deg(target.pitch);
      animate(1400, (e) => {
        state.mix = e;
        state.baseYaw = fromYaw + turn * e;
        state.basePitch = fromPitch + (toPitch - fromPitch) * e;
      }, () => {
        state.scene = name; state.next = null; state.mix = 0;
        sceneBusy = false;
        if (sceneWanted !== name) setScene(sceneWanted);
      });
    });
  }

  /* ———— Films: a swipe slides the next one across, as in the app. */

  const pill = { name: $("pillname"), kind: $("pillkind"), dot: $("dot") };
  let nameTimer;

  function showFilm(i, announce) {
    const f = films[i];
    pill.name.textContent = f.name;
    pill.kind.textContent = f.character;
    pill.dot.style.background = f.dot;
    if (announce) {
      const big = $("filmname");
      big.textContent = f.name;
      big.classList.add("on");
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => big.classList.remove("on"), 900);
      $("live").textContent = `${f.name}: ${f.note}`;
    }
  }

  let filmBusy = false;
  function changeFilm(to, side, from = side > 0 ? 1 : 0) {
    if (filmBusy || !films.length) return;
    to = (to + films.length) % films.length;
    if (to === state.film) return;
    filmBusy = true;
    state.incoming = to;
    state.side = side;
    loadLut(to).then(() => {
      const target = side > 0 ? 0 : 1;
      animate(520, (e) => { state.split = from + (target - from) * e; }, () => commit(to));
    });
  }
  function commit(to) {
    state.film = to;
    state.incoming = -1;
    state.split = -1;
    filmBusy = false;
    showFilm(to, true);
    loadLut(to + 1);
    loadLut(to - 1 + films.length);
  }
  function chooseFilm(id) {
    const i = films.findIndex((f) => f.id === id);
    if (i >= 0 && i !== state.film) changeFilm(i, 1);
  }

  /* Swiping the picture. */
  let swipe = null;
  viewport.addEventListener("pointerdown", (e) => {
    if (filmBusy || !films.length) return;
    swipe = { x: e.clientX, t: performance.now(), w: viewport.clientWidth, moved: false, id: e.pointerId };
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    if (!swipe.moved && Math.abs(dx) < 6) return;
    if (!swipe.moved) {
      swipe.moved = true;
      viewport.classList.add("dragging");
    }
    const side = dx < 0 ? 1 : -1;
    const to = (state.film + side + films.length) % films.length;
    if (state.incoming !== to) { state.incoming = to; loadLut(to); }
    state.side = side;
    const progress = Math.min(1, Math.abs(dx) / swipe.w);
    state.split = side > 0 ? 1 - progress : progress;
    kick();
  });
  const endSwipe = (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe;
    swipe = null;
    viewport.classList.remove("dragging");
    if (!s.moved || state.incoming < 0) return;
    const dx = e.clientX - s.x, v = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    const progress = Math.min(1, Math.abs(dx) / s.w);
    const side = state.side, to = state.incoming, from = state.split;
    state.lastUserFilm = performance.now();
    quietHints();
    filmBusy = true;
    if (progress > 0.28 || v > 0.6) {
      loadLut(to).then(() => animate(340, (k) => { state.split = from + ((side > 0 ? 0 : 1) - from) * k; }, () => commit(to)));
    } else {
      animate(260, (k) => { state.split = from + ((side > 0 ? 1 : 0) - from) * k; }, () => {
        state.incoming = -1; state.split = -1; filmBusy = false;
      });
    }
  };
  viewport.addEventListener("pointerup", endSwipe);
  viewport.addEventListener("pointercancel", endSwipe);
  viewport.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); state.lastUserFilm = performance.now(); changeFilm(state.film + 1, 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); state.lastUserFilm = performance.now(); changeFilm(state.film - 1, -1); }
  });
  $("pill").addEventListener("click", () => { state.lastUserFilm = performance.now(); changeFilm(state.film + 1, 1); });

  /* ———— Looking around: the mouse, a drag beside the phone, or the phone itself. */

  const finePointer = matchMedia("(pointer: fine)").matches;
  if (finePointer) {
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !visible) return;
      state.lookX = (e.clientX / innerWidth - 0.5) * 0.9;
      state.lookY = (e.clientY / innerHeight - 0.5) * 0.4;
      kick();
    }, { passive: true });
  }
  let look = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || e.target.closest(".phone, button, a")) return;
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
        kick();
      });
    });
  }

  /* ———— The shutter: what you framed, kept. */

  const kept = [];
  $("shutter").addEventListener("click", () => {
    if (!gl || !program) return;
    state.flash = 0;
    if (!draw(performance.now())) return;
    const w = Math.max(1, Math.round(rect.w)), h = Math.max(1, Math.round(rect.h));
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(Math.round(rect.x), Math.round(rect.y), w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    animate(420, (e) => { state.flash = 0.9 * (1 - e); });
    const scale = Math.min(1, 900 / h);
    const full = document.createElement("canvas");
    full.width = w; full.height = h;
    const ctx = full.getContext("2d");
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(image, 0, 0);
    const out = document.createElement("canvas");
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    out.getContext("2d").drawImage(full, 0, 0, out.width, out.height);
    const film = films[state.film], scene = SCENES[state.scene];
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

  /* ———— Hints step aside once they have been used. */
  let quietTimer;
  function quietHints() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => $("hints").classList.add("quiet"), 2500);
  }

  /* ———— The day: each chapter brings its scene, and suggests its film. */

  const chapters = [...document.querySelectorAll(".chapter")];
  const chapterWatch = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target.classList.contains("intro")) document.body.classList.toggle("at-start", entry.isIntersecting);
      if (!entry.isIntersecting) continue;
      const { scene, film } = entry.target.dataset;
      setScene(scene);
      if (performance.now() - state.lastUserFilm > 9000) filmsReady.then(() => chooseFilm(film));
      // The next scene's sharp picture, ahead of time.
      const i = chapters.indexOf(entry.target), after = chapters[i + 1];
      if (after) loadScene(after.dataset.scene, true);
    }
  }, { threshold: 0.5 });

  const storyWatch = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) kick();
  });
  // The bar takes a backing of its own once the story has scrolled away.
  new IntersectionObserver(([entry]) => document.body.classList.toggle("past", !entry.isIntersecting),
    { rootMargin: "-64px 0px 0px 0px" }).observe($("story"));

  /* ———— Start */

  function startViewfinder() {
    if (!gl) throw new Error("No WebGL");
    setup();
    resize();
    addEventListener("resize", () => { resize(); kick(); });
    document.addEventListener("visibilitychange", kick);
    for (const name of Object.keys(SCENES)) loadScene(name, name === "cafe");
    filmsReady.then(() => {
      state.film = Math.max(0, films.findIndex((f) => f.id === "style.gold"));
      showFilm(state.film, false);
      return loadLut(state.film);
    }).then(() => { films.forEach((_, i) => setTimeout(() => loadLut(i), 600 + i * 120)); });
    chapters.forEach((c) => chapterWatch.observe(c));
    storyWatch.observe($("story"));
    kick();
  }

  try {
    startViewfinder();
  } catch {
    // No WebGL: the phone shows the app's own screenshot instead.
    viewport.querySelector(".fallback").hidden = false;
    $("hints").hidden = true;
    $("shutter").disabled = true;
    filmsReady.then(() => { state.film = Math.max(0, films.findIndex((f) => f.id === "style.gold")); showFilm(state.film, false); });
  }

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
        state.lastUserFilm = performance.now();
        chooseFilm(f.id);
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
  function settle() {
    [...line.children].forEach((p, i) => p.style.setProperty("--tilt", tilts[i % tilts.length] + "deg"));
  }
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
