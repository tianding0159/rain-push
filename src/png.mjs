// 纯JS PNG编码器：零依赖，Worker与Node共用（都原生支持 CompressionStream）
const CRC = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc32(b) { let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflate(raw) {
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter(); w.write(raw); w.close();
  const parts = []; const r = cs.readable.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); }
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h * 4); }
  set(x, y, [r, g, b, a = 255]) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, p = this.px;
    if (a >= 255) { p[i] = r; p[i+1] = g; p[i+2] = b; p[i+3] = 255; return; }
    const sa = a / 255, da = p[i+3] / 255, oa = sa + da * (1 - sa);
    if (oa === 0) return;
    p[i]   = (r * sa + p[i]   * da * (1 - sa)) / oa;
    p[i+1] = (g * sa + p[i+1] * da * (1 - sa)) / oa;
    p[i+2] = (b * sa + p[i+2] * da * (1 - sa)) / oa;
    p[i+3] = oa * 255;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  // 圆角矩形（用于 iOS 图标外形）
  roundRect(x, y, w, h, r, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let dx = 0, dy = 0;
      if (i < r) dx = r - i; else if (i >= w - r) dx = i - (w - r) + 1;
      if (j < r) dy = r - j; else if (j >= h - r) dy = j - (h - r) + 1;
      if (dx && dy && dx * dx + dy * dy > r * r) continue;
      this.set(x + i, y + j, c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++)
      if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) this.set(cx + i, cy + j, c);
  }
  // 椭圆环（光环用）：外椭圆内、内椭圆外
  ring(cx, cy, rx, ry, th, c) {
    const irx = rx - th, iry = ry - th;
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      const o = (i * i) / (rx * rx) + (j * j) / (ry * ry);
      const inn = irx > 0 && iry > 0 ? (i * i) / (irx * irx) + (j * j) / (iry * iry) : 2;
      if (o <= 1 && inn > 1) this.set(cx + i, cy + j, c);
    }
  }
  disc(cx, cy, rad, c) {
    for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++)
      if (i * i + j * j <= rad * rad) this.set(cx + i, cy + j, c);
  }
  // 超采样缩小：SS倍画布 → 目标尺寸，得到抗锯齿边缘
  downsample(ss) {
    const W = this.w / ss | 0, H = this.h / ss | 0;
    const out = new Canvas(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const k = ((y * ss + j) * this.w + (x * ss + i)) * 4;
        const pa = this.px[k+3] / 255;
        r += this.px[k] * pa; g += this.px[k+1] * pa; b += this.px[k+2] * pa; a += pa;
      }
      const n = ss * ss;
      if (a > 0) { const o = (y * W + x) * 4;
        out.px[o] = r / a; out.px[o+1] = g / a; out.px[o+2] = b / a; out.px[o+3] = (a / n) * 255; }
    }
    return out;
  }
  async png() {
    const { w, h, px } = this;
    const raw = new Uint8Array(h * (w * 4 + 1));
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;                                   // filter: None
      raw.set(px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    }
    const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, h);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8bit RGBA
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
}
