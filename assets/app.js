const ENDPOINTS = {
  name: "Cloudflare",
  down(bytes) {
    // Cache-bust to avoid any intermediate caches influencing the result.
    return `https://speed.cloudflare.com/__down?bytes=${bytes}&t=${Date.now()}${Math.random().toString(16).slice(2)}`;
  },
  up() {
    return `https://speed.cloudflare.com/__up?t=${Date.now()}${Math.random().toString(16).slice(2)}`;
  },
};

const els = {
  btnStart: document.getElementById("btnStart"),
  btnStop: document.getElementById("btnStop"),
  status: document.getElementById("status"),
  downValue: document.getElementById("downValue"),
  upValue: document.getElementById("upValue"),
  pingValue: document.getElementById("pingValue"),
  liveValue: document.getElementById("liveValue"),
  liveLabel: document.getElementById("liveLabel"),
  gaugeFill: document.getElementById("gaugeFill"),
  chart: document.getElementById("chart"),
  serverValue: document.getElementById("serverValue"),
  netType: document.getElementById("netType"),
  downlink: document.getElementById("downlink"),
  rtt: document.getElementById("rtt"),
};

els.serverValue.textContent = `${ENDPOINTS.name} (publico)`;

function fmtNumber(n, digits = 1) {
  if (!Number.isFinite(n)) return "--";
  return n.toFixed(digits);
}

function median(values) {
  const nums = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (nums.length === 0) return NaN;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function setLive(mbps) {
  els.liveValue.textContent = Number.isFinite(mbps) ? fmtNumber(mbps, 1) : "--";
  // Map 0..300Mbps to gauge fill.
  const fill = clamp01((mbps || 0) / 300);
  els.gaugeFill.style.transform = `scaleX(${fill})`;
}

function setStatus(text) {
  els.status.textContent = text;
}

function connectionInfo() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return;
  const type = c.effectiveType ? `${c.effectiveType}` : "--";
  const downlink = Number.isFinite(c.downlink) ? `${c.downlink} Mbps` : "--";
  const rtt = Number.isFinite(c.rtt) ? `${c.rtt} ms` : "--";
  els.netType.textContent = type;
  els.downlink.textContent = downlink;
  els.rtt.textContent = rtt;
}

connectionInfo();

function initChart() {
  const ctx = els.chart.getContext("2d");
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const cssW = els.chart.clientWidth || 800;
  const cssH = els.chart.clientHeight || 170;
  els.chart.width = Math.floor(cssW * dpr);
  els.chart.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

let chartCtx = initChart();
window.addEventListener("resize", () => {
  chartCtx = initChart();
});

function drawChart(samples, color = "rgba(112, 243, 201, 0.9)") {
  const ctx = chartCtx;
  const w = els.chart.clientWidth || 800;
  const h = els.chart.clientHeight || 170;
  ctx.clearRect(0, 0, w, h);

  // Frame
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  if (samples.length < 2) return;

  const maxY = Math.max(10, ...samples.map((s) => s.mbps).filter((v) => Number.isFinite(v)));
  const pad = 10;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const maxT = samples[samples.length - 1].t;

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = pad + (innerH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + innerW, y);
    ctx.stroke();
  }

  // Path
  ctx.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const x = pad + (s.t / maxT) * innerW;
    const y = pad + innerH - clamp01(s.mbps / maxY) * innerH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill
  ctx.lineTo(pad + innerW, pad + innerH);
  ctx.lineTo(pad, pad + innerH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad, 0, pad + innerH);
  grad.addColorStop(0, "rgba(112, 243, 201, 0.22)");
  grad.addColorStop(1, "rgba(112, 243, 201, 0)");
  ctx.fillStyle = grad;
  ctx.fill();
}

async function readAllBytes(response, signal) {
  // Prefer streaming so we count actual bytes received.
  if (!response.body || !response.body.getReader) {
    const buf = await response.arrayBuffer();
    return buf.byteLength;
  }
  const reader = response.body.getReader();
  let total = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
  }
  return total;
}

async function pingTest({ attempts = 10, bytes = 2048, signal }) {
  const rtts = [];
  for (let i = 0; i < attempts; i++) {
    const t0 = performance.now();
    const res = await fetch(ENDPOINTS.down(bytes), { cache: "no-store", signal });
    await readAllBytes(res, signal);
    const t1 = performance.now();
    rtts.push(t1 - t0);
    await new Promise((r) => setTimeout(r, 60));
  }
  return median(rtts);
}

async function downloadTest({ durationMs = 7000, threads = 4, requestBytes = 6_000_000, onSample, signal }) {
  const tStart = performance.now();
  let totalBytes = 0;
  const samples = [];

  async function worker() {
    while (!signal.aborted && performance.now() - tStart < durationMs) {
      const t0 = performance.now();
      const res = await fetch(ENDPOINTS.down(requestBytes), { cache: "no-store", signal });
      const got = await readAllBytes(res, signal);
      const t1 = performance.now();
      totalBytes += got;

      const sec = Math.max(0.001, (t1 - t0) / 1000);
      const mbps = (got * 8) / sec / 1_000_000;
      const t = (t1 - tStart) / 1000;
      const s = { t, mbps };
      samples.push(s);
      onSample?.(s);
    }
  }

  const runners = Array.from({ length: threads }, () => worker());
  await Promise.allSettled(runners);

  const wallSec = Math.max(0.001, (performance.now() - tStart) / 1000);
  const avgMbps = (totalBytes * 8) / wallSec / 1_000_000;
  return { avgMbps, samples };
}

function makePayload(bytes) {
  // Fast pseudo-random so intermediaries are less likely to optimize patterns.
  const buf = new Uint8Array(bytes);
  let x = 0x12345678;
  for (let i = 0; i < buf.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    buf[i] = x & 0xff;
  }
  return buf;
}

async function uploadTest({ bytes = 5_000_000, attempts = 2, signal }) {
  const mbpsList = [];
  for (let i = 0; i < attempts; i++) {
    const payload = makePayload(bytes);
    const t0 = performance.now();
    const res = await fetch(ENDPOINTS.up(), {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/octet-stream" },
      cache: "no-store",
      signal,
    });
    // Ensure request/response completes before we stop the clock.
    await res.text().catch(() => "");
    const t1 = performance.now();

    const sec = Math.max(0.001, (t1 - t0) / 1000);
    const mbps = (bytes * 8) / sec / 1_000_000;
    mbpsList.push(mbps);
    await new Promise((r) => setTimeout(r, 120));
  }
  return median(mbpsList);
}

let current = null;

function setRunning(isRunning) {
  els.btnStart.disabled = isRunning;
  els.btnStop.disabled = !isRunning;
}

function resetUI() {
  els.downValue.textContent = "--";
  els.upValue.textContent = "--";
  els.pingValue.textContent = "--";
  setLive(NaN);
  drawChart([]);
  connectionInfo();
}

function explainError(err) {
  const msg = String(err?.message || err || "Erro desconhecido");
  if (msg.toLowerCase().includes("abort")) return "Parado.";
  // Common CORS / network errors show up as TypeError: Failed to fetch
  if (msg.toLowerCase().includes("failed to fetch")) {
    return "Falha ao acessar o servidor do teste (CORS/rede/adblock).";
  }
  return msg;
}

els.btnStart.addEventListener("click", async () => {
  if (current) return;
  resetUI();
  setRunning(true);
  setStatus("Iniciando...");

  const controller = new AbortController();
  current = { controller };

  const samples = [];

  try {
    setStatus("Medindo ping...");
    const pingMs = await pingTest({ signal: controller.signal });
    els.pingValue.textContent = fmtNumber(pingMs, 0);

    setStatus("Medindo download...");
    const down = await downloadTest({
      durationMs: 7500,
      threads: 4,
      requestBytes: 6_000_000,
      signal: controller.signal,
      onSample: (s) => {
        samples.push(s);
        // Smooth: median of last few points as "live".
        const tail = samples.slice(-5).map((x) => x.mbps);
        setLive(median(tail));
        drawChart(samples);
      },
    });
    els.downValue.textContent = fmtNumber(down.avgMbps, 1);
    setLive(down.avgMbps);

    setStatus("Medindo upload...");
    const upMbps = await uploadTest({
      bytes: 4_000_000,
      attempts: 2,
      signal: controller.signal,
    });
    els.upValue.textContent = fmtNumber(upMbps, 1);

    setStatus("Concluido.");
  } catch (err) {
    setStatus(explainError(err));
  } finally {
    current = null;
    setRunning(false);
  }
});

els.btnStop.addEventListener("click", () => {
  if (!current) return;
  current.controller.abort();
});

resetUI();
