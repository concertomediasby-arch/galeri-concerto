(function () {
  'use strict';
  const G = window.VIEWER_CONFIG || {};
  const $ = id => document.getElementById(id);
  const main = $('main'), modal = $('modal'), mbody = $('mbody');
  // Worker PDF.js dari CDN, dijadikan blob agar bisa jalan dari domain sendiri
  const WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let workerSiap = null;
  function siapkanWorker() {
    if (!workerSiap) workerSiap = fetch(WORKER_CDN).then(r => r.text()).then(t => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));
    }).catch(() => { pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_CDN; });
    return workerSiap;
  }
  document.title = G.namaSitus || 'Galeri';

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // =========================================================
  //  PROTEKSI (dipasang sekali)
  // =========================================================
  const block = e => e.preventDefault();
  ['contextmenu', 'dragstart', 'selectstart', 'copy', 'cut'].forEach(ev => document.addEventListener(ev, block));
  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if ((mod && ['s', 'p', 'u', 'c'].includes(k)) || (mod && e.shiftKey && ['i', 'j', 'c', 's'].includes(k)) || k === 'f12') e.preventDefault();
    if (k === 'printscreen') {
      document.body.classList.add('away');
      try { navigator.clipboard.writeText(''); } catch (_) {}
      setTimeout(() => document.body.classList.remove('away'), 1500);
    }
    if (k === 'escape') closeModal();
    if (modal.classList.contains('open') && modalMode === 'foto') {
      if (k === 'arrowright') lbGo(lbIndex() + 1);
      if (k === 'arrowleft') lbGo(lbIndex() - 1);
    }
  });
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('away', document.hidden));
  window.addEventListener('blur', () => document.body.classList.add('away'));
  window.addEventListener('focus', () => document.body.classList.remove('away'));
  document.addEventListener('pointerdown', () => document.body.classList.remove('away'));

  // =========================================================
  //  WATERMARK
  // =========================================================
  const now = new Date();
  const stamp = now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  let wmText = '';
  function setWatermark(teks) { wmText = (teks || '') + (G.watermarkTanggal ? '  •  ' + stamp : ''); }
  function watermark(ctx, w, h) {
    if (!wmText.trim()) return;
    const size = Math.max(14, Math.round(Math.max(w, h * .75) / 26));
    ctx.save();
    ctx.font = '600 ' + size + 'px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
    const stepX = ctx.measureText(wmText).width + size * 3, stepY = size * 5, R = Math.hypot(w, h);
    for (let y = -R; y < R; y += stepY) {
      const off = (Math.round(y / stepY) % 2) * stepX / 2;
      for (let x = -R; x < R; x += stepX) {
        ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillText(wmText, x + off + 1, y + 1);
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillText(wmText, x + off, y);
      }
    }
    ctx.restore();
  }

  // =========================================================
  //  PEMUAT FILE
  // =========================================================
  const MAXW = 1600;
  async function ambil(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  }
  function salin(src, w) {
    const h = Math.round(src.height * w / src.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }
  async function renderFoto(file, maxw) {
    const blob = await (await ambil(file)).blob();
    const url = URL.createObjectURL(blob);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    URL.revokeObjectURL(url);
    const w = Math.min(maxw || MAXW, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h); watermark(ctx, w, h);
    return c;
  }

  // Data tiap mobil diambil dari server (Supabase): hanya mobil yang di-scan,
  // dengan link file sementara yang kedaluwarsa dalam beberapa menit.
  async function muatData(kode) {
    const r = await fetch(G.apiUrl + '?kode=' + encodeURIComponent(kode), { cache: 'no-store' });
    if (r.status === 404) throw Object.assign(new Error('tidak ada'), { kind: 'notfound' });
    if (r.status === 410) throw Object.assign(new Error('kedaluwarsa'), { kind: 'expired' });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { kind: 'server' });
    return r.json();
  }
  const kodeDariHash = () => {
    const h = decodeURIComponent(location.hash.slice(1)).trim().toLowerCase();
    return /^[a-z0-9-]{3,40}$/.test(h) ? h : '';
  };

  // =========================================================
  //  NAVIGASI
  // =========================================================
  let gen = 0;               // penanda render terbaru (membatalkan render lama)
  let dariKatalog = null;    // kode katalog jika mobil dibuka dari katalog

  function setHeader(judul, sub, back) {
    const head = $('head'); head.innerHTML = '';
    if (back) { const b = el('button', 'back', '‹ Katalog'); b.onclick = () => history.back(); head.append(b); }
    head.append(el('h1', null, judul || ''));
    if (sub) head.append(el('p', 'sub', sub));
    document.title = judul ? judul + ' · ' + (G.namaSitus || '') : (G.namaSitus || 'Galeri');
  }
  function kosong(pesan) {
    setHeader(G.namaSitus || '', '', false);
    main.innerHTML = '';
    const box = el('div', 'empty'), ic = el('div', 'ic');
    ic.innerHTML = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 21H21v-3.5"/></svg>';
    box.append(ic, el('div', null, pesan)); main.append(box);
  }

  async function route() {
    const my = ++gen;
    closeModal(true);
    window.scrollTo(0, 0);
    const kode = kodeDariHash();
    if (!kode) { dariKatalog = null; return kosong(G.pesanTanpaKode || 'Silakan scan QR code.'); }
    main.innerHTML = '<div class="status">Memuat…</div>';
    let data;
    try { data = await muatData(kode); }
    catch (e) {
      if (my !== gen) return;
      if (e.kind === 'notfound') kosong('Kode tidak ditemukan. Pastikan QR yang di-scan benar.');
      else if (e.kind === 'expired') kosong('Link ini sudah tidak berlaku.');
      else kosong('Galeri sedang tidak dapat dimuat. Periksa koneksi internet lalu coba lagi.');
      return;
    }
    if (my !== gen) return;
    setWatermark(data.watermark || G.watermark);
    if (data.jenis === 'katalog') { dariKatalog = kode; renderKatalog(data, my); }
    else { renderMobil(data, my, dariKatalog && dariKatalog !== kode); }
  }
  window.addEventListener('hashchange', route);

  // =========================================================
  //  HALAMAN KATALOG
  // =========================================================
  function renderKatalog(data, my) {
    setHeader(data.judul || 'Katalog', data.subjudul, false);
    main.innerHTML = '';
    const list = data.mobil || [];
    if (!list.length) { main.append(el('div', 'status', 'Belum ada mobil.')); return; }
    const grid = el('div', 'cars'); grid.style.marginTop = '14px'; main.append(grid);
    list.forEach(async m => {
      const card = el('div', 'car'), cover = el('div', 'cover'), meta = el('div', 'meta');
      meta.append(el('div', 'name', m.nama || m.kode), el('div', 'go', 'Lihat ›'));
      card.append(cover, meta); grid.append(card);
      card.onclick = () => { location.hash = m.kode; };
      if (!m.sampul) cover.append(el('div', 'status', 'Belum ada foto'));
      if (m.sampul) {
        try { const c = await renderFoto(m.sampul, 900); if (my === gen) cover.append(c, el('div', 'shield')); }
        catch (e) { console.error(e); }
      }
    });
  }

  // =========================================================
  //  HALAMAN MOBIL
  // =========================================================
  let fotos = [], fotoCanvas = [], pdfs = [], pdfCache = [];

  function renderMobil(data, my, back) {
    setHeader(data.judul || 'Galeri', data.subjudul, back);
    const all = data.daftar || [];
    fotos = all.filter(x => x.jenis !== 'pdf'); pdfs = all.filter(x => x.jenis === 'pdf');
    fotoCanvas = []; pdfCache.forEach(p => p && p.pdf && p.pdf.destroy()); pdfCache = [];
    main.innerHTML = '';
    if (!all.length) { main.append(el('div', 'status', 'Belum ada file.')); return; }

    // ----- Slider foto -----
    if (fotos.length) {
      const h2 = el('h2', null, 'Foto'), cnt = el('span', null, '1 / ' + fotos.length); h2.append(cnt); main.append(h2);
      const wrap = el('div', 'slider-wrap'), slider = el('div', 'slider'); wrap.append(slider);
      const thumbs = el('div', 'thumbs');
      const cur = () => Math.max(0, Math.min(fotos.length - 1, Math.round(slider.scrollLeft / (slider.clientWidth - 22))));
      const go = i => { i = Math.max(0, Math.min(fotos.length - 1, i)); slider.children[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); };
      if (fotos.length > 1) {
        const l = el('button', 'arrow l', '‹'), r = el('button', 'arrow r', '›');
        l.onclick = () => go(cur() - 1); r.onclick = () => go(cur() + 1); wrap.append(l, r);
      }
      main.append(wrap); if (fotos.length > 1) main.append(thumbs);
      fotos.forEach((f, i) => {
        const s = el('div', 'slide'); s.append(el('div', 'status', 'Memuat…')); s.onclick = () => openFoto(i); slider.append(s);
        const t = el('div', 'thumb' + (i === 0 ? ' active' : '')); t.onclick = () => go(i); thumbs.append(t);
      });
      slider.addEventListener('scroll', () => {
        const i = cur(); cnt.textContent = (i + 1) + ' / ' + fotos.length;
        [...thumbs.children].forEach((t, j) => t.classList.toggle('active', j === i));
      }, { passive: true });
      fotos.forEach(async (f, i) => {
        const s = slider.children[i];
        try {
          const c = await renderFoto(f.url); if (my !== gen) return; fotoCanvas[i] = c;
          s.innerHTML = '';
          s.append(salin(c, Math.min(c.width, 1000)), el('div', 'shield'), el('div', 'hint', '⤢ Ketuk'));
          if (f.nama) s.append(el('div', 'cap', f.nama));
          thumbs.children[i].append(salin(c, 160), el('div', 'shield'));
        } catch (e) { if (my === gen) s.innerHTML = '<div class="status">Foto tidak dapat dimuat.</div>'; console.error(e); }
      });
    }

    // ----- Kartu dokumen -----
    if (pdfs.length) {
      main.append(el('h2', null, 'Dokumen'));
      const grid = el('div', 'docs'); main.append(grid);
      pdfs.forEach(async (p, i) => {
        const card = el('div', 'doc'), cover = el('div', 'cover'), meta = el('div', 'meta'), sub = el('div', 'sub', 'Memuat…');
        meta.append(el('div', 'name', p.nama || ('Dokumen ' + (i + 1))), sub);
        card.append(cover, meta); card.onclick = () => openPdf(i); grid.append(card);
        try {
          const buf = await (await ambil(p.url)).arrayBuffer();
          await siapkanWorker();
          const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
          if (my !== gen) { pdf.destroy(); return; }
          pdfCache[i] = { pdf };
          sub.textContent = 'PDF • ' + pdf.numPages + ' halaman';
          cover.append(await renderPage(i, 1, 600), el('div', 'shield'));
        } catch (e) { sub.textContent = 'Tidak dapat dimuat'; console.error(e); }
      });
    }
  }

  async function renderPage(i, n, width) {
    const page = await pdfCache[i].pdf.getPage(n);
    const vp = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    watermark(ctx, c.width, c.height);
    return c;
  }

  // =========================================================
  //  JENDELA (POP-UP)
  // =========================================================
  let modalMode = null, lb = null;
  $('mclose').onclick = () => closeModal();
  function openModal(mode, title) {
    modalMode = mode; $('mtitle').textContent = title; $('mcount').textContent = '';
    mbody.innerHTML = ''; modal.classList.add('open'); document.body.classList.add('locked');
    try { history.pushState({ modal: 1 }, ''); } catch (_) {}
  }
  function closeModal(fromNav) {
    if (!modal.classList.contains('open')) return;
    modal.classList.remove('open'); document.body.classList.remove('locked'); mbody.innerHTML = ''; modalMode = null; lb = null;
    if (fromNav !== true) { try { if (history.state && history.state.modal) history.back(); } catch (_) {} }
  }
  window.addEventListener('popstate', () => closeModal(true));

  const lbIndex = () => lb ? Math.round(lb.scrollLeft / lb.clientWidth) : 0;
  function lbGo(i) { if (!lb) return; i = Math.max(0, Math.min(fotos.length - 1, i)); lb.scrollTo({ left: i * lb.clientWidth, behavior: 'smooth' }); }
  function openFoto(start) {
    openModal('foto', fotos[start].nama || 'Foto');
    lb = el('div', 'lb'); mbody.append(lb);
    fotos.forEach((f, i) => {
      const it = el('div', 'item');
      if (fotoCanvas[i]) it.append(salin(fotoCanvas[i], fotoCanvas[i].width), el('div', 'shield'));
      else it.append(el('div', 'status', 'Memuat…'));
      lb.append(it);
    });
    const upd = () => { const i = Math.max(0, Math.min(fotos.length - 1, lbIndex()));
      $('mcount').textContent = (i + 1) + ' / ' + fotos.length; $('mtitle').textContent = fotos[i].nama || 'Foto'; };
    lb.addEventListener('scroll', upd, { passive: true });
    requestAnimationFrame(() => { lb.scrollLeft = start * lb.clientWidth; upd(); });
  }
  async function openPdf(i) {
    if (!pdfCache[i]) return;
    openModal('pdf', pdfs[i].nama || 'Dokumen');
    const { pdf } = pdfCache[i];
    $('mcount').textContent = pdf.numPages + ' hal.';
    const box = el('div', 'pages'); box.append(el('div', 'shield')); mbody.append(box);
    const width = Math.min(MAXW, Math.round(Math.min(box.clientWidth || 900, 900) * Math.min(devicePixelRatio || 1, 2)));
    for (let n = 1; n <= pdf.numPages; n++) {
      if (modalMode !== 'pdf' || !box.isConnected) return;
      const c = await renderPage(i, n, width);
      if (!box.isConnected) return;
      box.insertBefore(c, box.lastChild);
      box.insertBefore(el('div', 'pn', 'Halaman ' + n + ' / ' + pdf.numPages), box.lastChild);
    }
  }

  route();
})();
