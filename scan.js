'use strict';

// 00_andI has the same artwork and the same model as 00_andYou1, so the two
// can never be told apart; scanning either one resolves to 00_andYou1.
const SKIP = ['00_andI'];
const IDS = CARDS.filter(function (id) { return SKIP.indexOf(id) === -1; });

// A fingerprint is a GRID_W x GRID_H colour grid. Images are drawn into a
// canvas first so the browser does the heavy downscale with its own
// filtering, summed into CELL-pixel fine cells, and each grid cell is
// SUB x SUB fine cells.
const GRID_W = 12;
const GRID_H = 16;
const CELL = 8;
const SUB = 2;
const REF_W = GRID_W * SUB * CELL;
const REF_H = GRID_H * SUB * CELL;

// A hand-held card never sits exactly in the guide, so the camera crop takes
// PAD fine cells of slack on every side and every offset within it is tried.
const PAD_X = 3;
const PAD_Y = 4;
const LIVE_W = REF_W + 2 * PAD_X * CELL;
const LIVE_H = REF_H + 2 * PAD_Y * CELL;

// Distance is 1 - cosine similarity. Tuned offline on the card images with
// simulated hand-held shots: no wrong card and no non-card scene accepted.
const MAX_DIST = 0.5;
const MIN_MARGIN = 0.1;
const STREAK = 3;
const INTERVAL_MS = 150;

const LOAD_PARALLEL = 4;
const LOAD_TRIES = 3;

const video = document.getElementById('video');
const guide = document.getElementById('guide');
const statusEl = document.getElementById('status');
const debugEl = document.getElementById('debug');
const startBtn = document.getElementById('start');
const debug = new URLSearchParams(location.search).has('debug');

const work = document.createElement('canvas');
const ctx = work.getContext('2d', { willReadFrequently: true });

let refs = [];
let stream = null;
let timer = null;
let streakId = null;
let streak = 0;

function cardTitle(id) {
  return id.replace(/^\d+_/, '');
}

// Draw a region of source at w x h and sum RGB into CELL x CELL fine cells.
function fineCells(source, sx, sy, sw, sh, w, h) {
  if (work.width !== w) work.width = w;
  if (work.height !== h) work.height = h;
  // The padded crop can run past the video edge, which drawImage leaves
  // undrawn; clear so the previous frame cannot show through there.
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const fw = w / CELL;
  const fine = new Float32Array(fw * (h / CELL) * 3);
  for (let y = 0; y < h; y++) {
    const row = ((y / CELL) | 0) * fw;
    for (let x = 0; x < w; x++) {
      const i = (row + ((x / CELL) | 0)) * 3;
      const p = (y * w + x) * 4;
      fine[i] += px[p];
      fine[i + 1] += px[p + 1];
      fine[i + 2] += px[p + 2];
    }
  }
  return fine;
}

// Fingerprint of the grid whose top-left fine cell is (ox, oy). Each channel
// is z-scored and the whole vector scaled to unit length, so lighting and
// white balance shifts cancel out and a dot product is cosine similarity.
function fingerprint(fine, fw, ox, oy) {
  const cells = GRID_W * GRID_H;
  const v = new Float32Array(cells * 3);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const o = (gy * GRID_W + gx) * 3;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const i = ((oy + gy * SUB + sy) * fw + ox + gx * SUB + sx) * 3;
          v[o] += fine[i];
          v[o + 1] += fine[i + 1];
          v[o + 2] += fine[i + 2];
        }
      }
    }
  }

  let norm = 0;
  for (let c = 0; c < 3; c++) {
    let mean = 0;
    for (let i = c; i < v.length; i += 3) mean += v[i];
    mean /= cells;
    let sd = 0;
    for (let i = c; i < v.length; i += 3) sd += (v[i] - mean) * (v[i] - mean);
    sd = Math.sqrt(sd / cells) + 1e-6;
    for (let i = c; i < v.length; i += 3) {
      v[i] = (v[i] - mean) / sd;
      norm += v[i] * v[i];
    }
  }
  // A flat frame (lens covered, blank wall) has no contrast; leave it as a
  // zero vector so it is equally far from every card.
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function loadOnce(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error(src)); };
    img.src = src;
  });
}

async function loadImage(src) {
  for (let attempt = 1; ; attempt++) {
    try {
      // A distinct URL per retry so the browser cannot reuse the failure.
      return await loadOnce(attempt === 1 ? src : src + '?retry=' + attempt);
    } catch (e) {
      if (attempt >= LOAD_TRIES) throw e;
      await new Promise(function (r) { setTimeout(r, 300 * attempt); });
    }
  }
}

// A burst of every thumbnail at once makes some proxies answer 502
// (reproduced with Tailscale Serve), so only a few are in flight at a time.
async function loadAll(srcs) {
  const out = new Array(srcs.length);
  let next = 0;
  async function worker() {
    while (next < srcs.length) {
      const i = next++;
      out[i] = await loadImage(srcs[i]);
    }
  }
  const workers = [];
  for (let w = 0; w < LOAD_PARALLEL; w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// The video is shown with object-fit: cover, so map the on-screen guide back
// into video pixels before cropping.
function guideCrop() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const box = video.getBoundingClientRect();
  const scale = Math.max(box.width / vw, box.height / vh);
  const offX = box.left + (box.width - vw * scale) / 2;
  const offY = box.top + (box.height - vh * scale) / 2;
  const g = guide.getBoundingClientRect();
  return {
    sx: (g.left - offX) / scale,
    sy: (g.top - offY) / scale,
    sw: g.width / scale,
    sh: g.height / scale
  };
}

function tick() {
  if (!video.videoWidth) return;

  const c = guideCrop();
  const padX = c.sw * PAD_X * CELL / REF_W;
  const padY = c.sh * PAD_Y * CELL / REF_H;
  const fine = fineCells(video, c.sx - padX, c.sy - padY,
    c.sw + 2 * padX, c.sh + 2 * padY, LIVE_W, LIVE_H);

  // Closest distance to each card over every offset in the slack.
  const dist = new Float32Array(refs.length).fill(Infinity);
  for (let oy = 0; oy <= 2 * PAD_Y; oy++) {
    for (let ox = 0; ox <= 2 * PAD_X; ox++) {
      const f = fingerprint(fine, LIVE_W / CELL, ox, oy);
      for (let k = 0; k < refs.length; k++) {
        const r = refs[k];
        let dot = 0;
        for (let i = 0; i < f.length; i++) dot += f[i] * r[i];
        if (1 - dot < dist[k]) dist[k] = 1 - dot;
      }
    }
  }

  let best = -1;
  let d1 = Infinity;
  let d2 = Infinity;
  for (let k = 0; k < dist.length; k++) {
    const d = dist[k];
    if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) { d2 = d; }
  }

  const ok = d1 < MAX_DIST && d2 - d1 > MIN_MARGIN;
  if (ok && IDS[best] === streakId) {
    streak++;
  } else {
    streakId = ok ? IDS[best] : null;
    streak = ok ? 1 : 0;
  }
  guide.classList.toggle('hit', ok);

  if (debug) {
    debugEl.textContent = IDS[best] + ' d=' + d1.toFixed(3) +
      ' margin=' + (d2 - d1).toFixed(3) + ' streak=' + streak;
  }

  if (streak >= STREAK) found(streakId);
}

function stop() {
  clearInterval(timer);
  timer = null;
  if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
  stream = null;
  video.srcObject = null;
  streakId = null;
  streak = 0;
  guide.classList.remove('hit');
}

function found(id) {
  stop();
  startBtn.textContent = 'もう一度スキャン';
  startBtn.hidden = false;

  const url = arUrl(id);
  if (!url) {
    statusEl.textContent = cardTitle(id) + '（AR 表示は iPhone / Android でのみ利用できます）';
    return;
  }
  statusEl.textContent = cardTitle(id) + ' を表示します';
  location.href = url;
}

async function start() {
  startBtn.hidden = true;
  statusEl.textContent = 'カードを枠に合わせてください';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    stop();
    statusEl.textContent = 'カメラを使えませんでした（' + e.name + '）';
    startBtn.hidden = false;
    return;
  }
  timer = setInterval(tick, INTERVAL_MS);
}

async function main() {
  debugEl.hidden = !debug;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'カメラは HTTPS で開いたときだけ使えます';
    return;
  }

  try {
    const imgs = await loadAll(IDS.map(function (id) {
      return './images/thumb/' + id + '.jpg';
    }));
    refs = imgs.map(function (img) {
      const fine = fineCells(img, 0, 0, img.naturalWidth, img.naturalHeight, REF_W, REF_H);
      return fingerprint(fine, REF_W / CELL, 0, 0);
    });
  } catch (e) {
    statusEl.textContent = '見本画像を読み込めませんでした（' + e.message + '）';
    return;
  }

  statusEl.textContent = 'カードをスキャンします';
  startBtn.hidden = false;
}

startBtn.addEventListener('click', start);
main();
