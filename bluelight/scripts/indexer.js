// Simple client-side indexer for DICOMs under /dicoms/
// - Crawls directory listings from the same origin
// - Parses DICOM headers to group by Patient/Study/Series
// - Caches results in localStorage

(function () {
  const BASE_KEY = 'bl_index_base';
  function getBasePath() {
    try { return localStorage.getItem(BASE_KEY) || '/dicoms/'; } catch { return '/dicoms/'; }
  }
  function setBasePath(p) {
    try { localStorage.setItem(BASE_KEY, p); } catch { }
  }
  function cacheKey(base) { return 'bl_index:' + base; }
  function etagKey(url) { return 'bl_index_etag:' + url; }

  function $(id) { return document.getElementById(id); }
  function toAbs(p) {
    try { return new URL(p, location.origin).toString(); } catch { return p; }
  }

  function toAbsUrl(base, href) {
    try { return new URL(href, base).toString(); } catch { return null; }
  }

  function sameBase(url, base) {
    try { const u = new URL(url, location.origin); return u.pathname.startsWith(base); } catch { return false; }
  }

  async function listDirectory(url, base) {
    const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'))
      .map(a => a.getAttribute('href'))
      .filter(Boolean);
    const dirs = []; const files = [];
    for (const href of links) {
      if (href.startsWith('?') || href.startsWith('#') || href === '../') continue;
      const abs = toAbsUrl(res.url, href);
      if (!abs || !sameBase(abs, base)) continue;
      if (href.endsWith('/') || abs.endsWith('/')) dirs.push(abs);
      else files.push(abs);
    }
    return { dirs, files };
  }

  function isDicomLike(name) {
    const n = name.toLowerCase();
    if (n.endsWith('.dcm') || n.endsWith('.mht')) return true;
    // accept no extension as potential DICOM
    if (!n.includes('.')) return true;
    return false;
  }

  async function crawl(baseUrl, limit = 2000) {
    const seen = new Set();
    const queue = [new URL(baseUrl, location.origin).toString()];
    const files = [];
    while (queue.length && files.length < limit) {
      const url = queue.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const { dirs, files: f } = await listDirectory(url, baseUrl);
        for (const d of dirs) if (!seen.has(d)) queue.push(d);
        for (const file of f) if (isDicomLike(file)) files.push(file);
      } catch (e) {
        console.warn('Index: skip', url, e.message);
      }
    }
    return files;
  }

  function getTag(ds, tag) { try { return ds.string(tag) || ''; } catch { return ''; } }
  function getInt(ds, tag) { try { return ds.intString(tag) || 0; } catch { return 0; } }

  async function readMeta(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await res.arrayBuffer();
      const ds = dicomParser.parseDicom(new Uint8Array(buf));
      const patientId = getTag(ds, Tag.PatientID);
      const patientName = getTag(ds, Tag.PatientName);
      const studyUID = getTag(ds, Tag.StudyInstanceUID);
      const seriesUID = getTag(ds, Tag.SeriesInstanceUID);
      const sopUID = getTag(ds, Tag.SOPInstanceUID);
      const instNum = getInt(ds, Tag.InstanceNumber);
      const studyDate = getTag(ds, 'x00080020');
      const studyDesc = getTag(ds, 'x00081030');
      const seriesDesc = getTag(ds, 'x0008103e');
      const numberOfFrames = getInt(ds, Tag.NumberOfFrames);
      return { url, patientId, patientName, studyUID, seriesUID, sopUID, instNum, studyDate, studyDesc, seriesDesc, numberOfFrames };
    } catch (e) {
      return { url, error: e.message };
    }
  }

  async function buildIndex(fileUrls, base) {
    const meta = [];
    for (let i = 0; i < fileUrls.length; i++) {
      const u = fileUrls[i];
      $("IndexStatus").textContent = `Reading DICOM headers ${i + 1}/${fileUrls.length}`;
      // eslint-disable-next-line no-await-in-loop
      const m = await readMeta(u);
      if (!m.error && m.studyUID && m.seriesUID && m.sopUID) meta.push(m);
    }
    // group by patient->study->series
    const patients = {};
    for (const m of meta) {
      const p = patients[m.patientId] || (patients[m.patientId] = { patientId: m.patientId, patientName: m.patientName, studies: {} });
      const s = p.studies[m.studyUID] || (p.studies[m.studyUID] = { studyUID: m.studyUID, studyDate: m.studyDate, studyDesc: m.studyDesc, series: {} });
      const se = s.series[m.seriesUID] || (s.series[m.seriesUID] = { seriesUID: m.seriesUID, seriesDesc: m.seriesDesc, instances: [] });
      se.instances.push({ url: m.url, sopUID: m.sopUID, instNum: m.instNum, numberOfFrames: m.numberOfFrames });
    }
    // sort instances by InstanceNumber
    for (const pid of Object.keys(patients)) {
      const studies = patients[pid].studies;
      for (const st of Object.keys(studies)) {
        const series = studies[st].series;
        for (const se of Object.keys(series)) {
          series[se].instances.sort((a, b) => (a.instNum || 0) - (b.instNum || 0));
        }
      }
    }
    return { createdAt: Date.now(), base: base, patients };
  }

  function saveCache(index) { try { localStorage.setItem(cacheKey(index.base), JSON.stringify(index)); } catch { } }
  function loadCache(base) { try { const s = localStorage.getItem(cacheKey(base)); return s ? JSON.parse(s) : null; } catch { return null; } }
  function clearCache(base) { try { localStorage.removeItem(cacheKey(base)); } catch { } }

  const COLLAPSE_KEY = 'bl_index_collapse';
  function loadCollapse() { try { const s = localStorage.getItem(COLLAPSE_KEY); return s ? JSON.parse(s) : { patients: {}, studies: {} }; } catch { return { patients: {}, studies: {} }; } }
  function saveCollapse(state) { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state)); } catch {} }

  function renderIndex(index, target = 'Index') {
    const list = $(target + "List");
    if (!list) return;
    list.innerHTML = '';
    const patients = index.patients || {};
    const pids = Object.keys(patients);
    if (pids.length === 0) {
      list.textContent = 'No studies found.';
      return;
    }
    const created = new Date(index.createdAt).toLocaleString();
    const status = $(target + "Status");
    if (status) status.textContent = `Indexed ${pids.length} patient(s). Cached at ${created}.`;

    const collapseState = loadCollapse();
    for (const pid of pids) {
      const p = patients[pid];
      const pDiv = document.createElement('div');
      pDiv.style.marginBottom = '10px';
      pDiv.style.border = '1px solid rgba(255,255,255,0.08)';
      pDiv.style.borderRadius = '6px';
      pDiv.style.background = 'rgba(255,255,255,0.03)';
      // Patient header with toggle
      const pHeader = document.createElement('div');
      pHeader.style.display = 'flex';
      pHeader.style.alignItems = 'center';
      pHeader.style.justifyContent = 'space-between';
      pHeader.style.padding = '6px 8px';
      pHeader.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))';
      pHeader.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
      pHeader.setAttribute('data-role','patient-header');
      pHeader.dataset.pid = pid;
      pDiv.dataset.pid = pid;
      const pTitle = document.createElement('div');
      pTitle.style.fontWeight = '600';
      pTitle.style.color = '#e6e6f2';
      // Patient-level counts
      const studyKeys = Object.keys(p.studies);
      const studyCount = studyKeys.length;
      let seriesCount = 0, instanceCount = 0;
      for (const stUID of studyKeys) {
        const series = p.studies[stUID].series;
        seriesCount += Object.keys(series).length;
        for (const seUID of Object.keys(series)) instanceCount += (series[seUID].instances || []).length;
      }
      pTitle.textContent = `${p.patientName || ''} (${p.patientId || 'Unknown'}) — ${studyCount} study${studyCount!==1?'ies':'y'}, ${seriesCount} series, ${instanceCount} instances`;
      const pToggle = document.createElement('button');
      pToggle.textContent = collapseState.patients[pid] ? '▸' : '▾';
      pToggle.title = 'Collapse/Expand';
      pToggle.style.background = 'transparent';
      pToggle.style.color = '#ccd';
      pToggle.style.border = 'none';
      pToggle.style.cursor = 'pointer';
      pToggle.style.fontSize = '16px';
      // Close patient (left thumbnails)
      const pClose = document.createElement('button');
      pClose.textContent = 'Close';
      pClose.title = 'Remove this patient from left thumbnails';
      pClose.style.background = 'transparent';
      pClose.style.color = '#ccd';
      pClose.style.border = '1px solid rgba(255,255,255,0.2)';
      pClose.style.borderRadius = '4px';
      pClose.style.cursor = 'pointer';
      pClose.style.marginLeft = '8px';
      pClose.onclick = () => { try {
        const nodes = document.getElementsByClassName('OutLeftImg');
        for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].PatientId === pid) nodes[i].parentNode.removeChild(nodes[i]);
      } catch (e) { console.log(e); } try { if (window.IndexRefreshHighlights) window.IndexRefreshHighlights(); } catch (ex) {} };
      const pRight = document.createElement('div'); pRight.style.display = 'flex'; pRight.style.alignItems = 'center'; pRight.style.gap = '6px';
      pRight.appendChild(pClose);
      pRight.appendChild(pToggle);
      pHeader.appendChild(pTitle);
      pHeader.appendChild(pRight);
      pDiv.appendChild(pHeader);

      const studies = p.studies || {}; const sUL = document.createElement('ul'); sUL.style.margin = '6px 0 0 16px';
      const pBody = document.createElement('div');
      pBody.appendChild(sUL);
      pDiv.appendChild(pBody);
      let pCollapsed = !!collapseState.patients[pid];
      pBody.style.display = pCollapsed ? 'none' : '';
      pToggle.onclick = async () => {
        pCollapsed = !pCollapsed; collapseState.patients[pid] = pCollapsed; saveCollapse(collapseState);
        pBody.style.display = pCollapsed ? 'none' : ''; pToggle.textContent = pCollapsed ? '▸' : '▾';
        if (!pCollapsed) {
          try {
            const idx = loadCache(getBasePath());
            const stObj = idx && idx.patients && idx.patients[pid] && idx.patients[pid].studies;
            if (!stObj || Object.keys(stObj).length === 0) {
              if (typeof ensurePatientLoaded === 'function') await ensurePatientLoaded(pid);
            }
          } catch {}
        }
      };

      // Load all studies for this patient
      const loadAll = document.createElement('button');
      loadAll.textContent = 'Load all studies';
      loadAll.style.marginLeft = '8px';
      loadAll.style.background = '#39405d';
      loadAll.style.color = '#eef';
      loadAll.style.border = '1px solid rgba(255,255,255,0.15)';
      loadAll.style.borderRadius = '4px';
      loadAll.style.padding = '2px 6px';
      loadAll.style.cursor = 'pointer';
      loadAll.onclick = () => {
        const urls = [];
        for (const stUID of Object.keys(studies)) {
          const series = studies[stUID].series;
          for (const seUID of Object.keys(series)) {
            const inst = series[seUID].instances;
            for (const i of inst) urls.push(i.url);
          }
        }
        loadSeries(urls);
      };
      pHeader.appendChild(loadAll);
      for (const stUID of Object.keys(studies)) {
        const st = studies[stUID];
        const li = document.createElement('li'); li.style.marginBottom = '4px';
        // Study header with toggle
        const stHeader = document.createElement('div');
        stHeader.style.display = 'flex';
        stHeader.style.alignItems = 'center';
        stHeader.style.justifyContent = 'space-between';
        stHeader.style.padding = '2px 4px';
        stHeader.style.color = '#d8d8eb';
        stHeader.setAttribute('data-role','study-header');
        stHeader.dataset.pid = pid;
        stHeader.dataset.study = stUID;
        const stTitle = document.createElement('div');
        // Study-level counts
        const seKeys = Object.keys(st.series);
        const seCount = seKeys.length;
        let instCount = 0; for (const seUID2 of seKeys) instCount += (st.series[seUID2].instances || []).length;
        stTitle.textContent = `${st.studyDesc || 'Study'} ${st.studyDate || ''} — ${seCount} series, ${instCount} instances`;
        const stToggle = document.createElement('button');
        const key = pid + '|' + stUID;
        stToggle.textContent = collapseState.studies[key] ? '▸' : '▾';
        stToggle.title = 'Collapse/Expand series';
        stToggle.style.background = 'transparent';
        stToggle.style.color = '#ccd';
        stToggle.style.border = 'none';
        stToggle.style.cursor = 'pointer';
        stToggle.style.fontSize = '14px';
        // Load entire study button
        const stLoad = document.createElement('button');
        stLoad.textContent = 'Load study';
        stLoad.title = 'Load all series in study';
        stLoad.style.marginLeft = '8px';
        stLoad.style.background = '#39405d';
        stLoad.style.color = '#eef';
        stLoad.style.border = '1px solid rgba(255,255,255,0.15)';
        stLoad.style.borderRadius = '4px';
        stLoad.style.padding = '2px 6px';
        stLoad.style.cursor = 'pointer';
        stLoad.onclick = () => {
          const urls = [];
          for (const seUID3 of Object.keys(st.series)) {
            for (const inst of st.series[seUID3].instances) urls.push(inst.url);
          }
          loadSeries(urls);
        };
        const rightBox = document.createElement('div');
        rightBox.style.display = 'flex';
        rightBox.style.alignItems = 'center';
        rightBox.style.gap = '6px';
        rightBox.appendChild(stLoad);
        rightBox.appendChild(stToggle);
        stHeader.appendChild(stTitle);
        stHeader.appendChild(rightBox);
        li.appendChild(stHeader);

        const series = st.series; const seUL = document.createElement('ul'); seUL.style.marginLeft = '14px';
        for (const seUID of Object.keys(series)) {
          const se = series[seUID];
          const seLI = document.createElement('li'); seLI.style.margin = '6px 0';
          const row = document.createElement('div'); row.style.display = 'flex'; row.style.flexDirection = 'column'; row.style.gap = '4px';
          // Split into static and cine (multi-frame)
          const statics = se.instances.filter(i => !i.numberOfFrames || i.numberOfFrames <= 1);
          const cines = se.instances.filter(i => i.numberOfFrames && i.numberOfFrames > 1);

          if (statics.length > 0) {
            const btnSeries = document.createElement('button');
            btnSeries.textContent = `Load series: ${se.seriesDesc || se.seriesUID} (${statics.length})`;
            btnSeries.onclick = () => loadSeries(statics.map(i => i.url));
            styleSeriesBtn(btnSeries);
            row.appendChild(btnSeries);
          }
          // Cine entries
          for (const cine of cines) {
            const btnCine = document.createElement('button');
            btnCine.textContent = `Load cine: ${se.seriesDesc || se.seriesUID} (${cine.numberOfFrames} frames)`;
            btnCine.onclick = () => loadSeries([cine.url]);
            styleCineBtn(btnCine);
            row.appendChild(btnCine);
          }
          seLI.appendChild(row);
          seUL.appendChild(seLI);
        }
        li.appendChild(seUL);
        let stCollapsed = !!collapseState.studies[key];
        seUL.style.display = stCollapsed ? 'none' : '';
        stToggle.onclick = () => { stCollapsed = !stCollapsed; collapseState.studies[key] = stCollapsed; saveCollapse(collapseState); seUL.style.display = stCollapsed ? 'none' : ''; stToggle.textContent = stCollapsed ? '▸' : '▾'; };
        sUL.appendChild(li);
      }
      list.appendChild(pDiv);
    }
    // Apply highlight states after rendering
    try { refreshLoadHighlights(); } catch (e) {}
  }

  async function ensurePatientLoaded(pid) {
    const base = getBasePath();
    const idx = loadCache(base);
    if (!idx || !idx.patients || !idx.patients[pid]) return;
    if (idx.patients[pid]._loaded) return;
    // Try two locations: /<base>/patients/<pid>.json and /dicoms.index/patients/<pid>.json
    const enc = encodeURIComponent(pid || '');
    const candidates = [
      (base.endsWith('/') ? base : base + '/') + 'patients/' + enc + '.json',
      '/dicoms.index/patients/' + enc + '.json'
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) continue;
        const pjson = await res.json();
        if (pjson && pjson.patientId) {
          idx.patients[pid].studies = pjson.studies || {};
          idx.patients[pid]._loaded = true;
          saveCache(idx);
          renderIndex(idx, 'IndexSidebar');
          renderIndex(idx, 'Index');
          return;
        }
      } catch { }
    }
  }

  async function runIndex() {
    try {
      const base = getBasePath();
      const drawerStatus = $("IndexStatus"); if (drawerStatus) drawerStatus.textContent = `Scanning ${base} ...`;
      const sidebarStatus = $("IndexSidebarStatus"); if (sidebarStatus) sidebarStatus.textContent = `Scanning ${base} ...`;
      const files = await crawl(base, 100000);
      if (drawerStatus) drawerStatus.textContent = `Found ${files.length} file(s). Reading headers...`;
      if (sidebarStatus) sidebarStatus.textContent = `Found ${files.length} file(s). Reading headers...`;
      const index = await buildIndex(files, base);
      saveCache(index);
      renderIndex(index, 'Index');
      renderIndex(index, 'IndexSidebar');
    } catch (e) {
      const s1 = $("IndexStatus"); if (s1) s1.textContent = `Index error: ${e.message}`;
      const s2 = $("IndexSidebarStatus"); if (s2) s2.textContent = `Index error: ${e.message}`;
    }
  }

  async function fetchServerIndex(base, timeoutMs = 2500) {
    let basePath = base || '/dicoms/';
    if (!basePath.startsWith('/')) basePath = '/' + basePath;
    if (!basePath.endsWith('/')) basePath += '/';
    const candidates = [
      toAbs(basePath + 'index.json'),
      toAbs('/dicoms.index.json')
    ];
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const id = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      for (const url of candidates) {
        try {
          const headers = { 'Accept': 'application/json' };
          try { const et = localStorage.getItem(etagKey(url)); if (et) headers['If-None-Match'] = et; } catch {}
          const res = await fetch(url, { headers, signal: ctrl ? ctrl.signal : undefined });
          if (res.status === 304) {
            const cached = loadCache(base);
            if (cached) return cached;
            continue;
          }
          if (!res.ok) continue;
          const ctype = (res.headers && res.headers.get('Content-Type')) || '';
          if (ctype && ctype.indexOf('application/json') === -1) {
            // Not JSON; avoid trying to parse directory listing/HTML
            continue;
          }
          const text = await res.text();
          let json = null; try { json = JSON.parse(text); } catch { continue; }
          const etag = res.headers ? res.headers.get('ETag') : null;
          try { if (etag) localStorage.setItem(etagKey(url), etag); } catch {}
          if (json && json.patients) return json;
        } catch { /* ignore and try next */ }
      }
    } finally {
      if (id) clearTimeout(id);
    }
    return null;
  }

  async function fetchManifest(base, timeoutMs = 2500) {
    let basePath = base || '/dicoms/';
    if (!basePath.startsWith('/')) basePath = '/' + basePath;
    if (!basePath.endsWith('/')) basePath += '/';
    const candidates = [
      toAbs(basePath + 'manifest.json'),
      toAbs('/dicoms.index/manifest.json')
    ];
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const id = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      for (const url of candidates) {
        try {
          const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined });
          if (!res.ok) continue;
          const ctype = (res.headers && res.headers.get('Content-Type')) || '';
          if (ctype && ctype.indexOf('application/json') === -1) continue;
          const text = await res.text();
          let json = null; try { json = JSON.parse(text); } catch { continue; }
          if (json && json.patients) return json;
        } catch { }
      }
    } finally { if (id) clearTimeout(id); }
    return null;
  }

  function toggleDrawer() {
    const drawer = $("IndexDrawer");
    drawer.style.display = drawer.style.display === 'none' ? '' : 'none';
  }

  function initUI() {
    const btn = $("IndexButton");
    if (!btn) return;
    btn.onclick = function () {
      toggleDrawer();
      // populate base path input
      const baseInput = $("IndexBasePath"); if (baseInput) baseInput.value = getBasePath();
      const cache = loadCache(getBasePath());
      if (cache) renderIndex(cache, 'Index');
      else { const s = $("IndexStatus"); if (s) s.textContent = 'No cache yet. Click "Index" to build one.'; const l = $("IndexList"); if (l) l.innerHTML = ''; }
    };
    const runBtn = $("RunIndex");
    if (runBtn) runBtn.onclick = runIndex;
    const clearBtn = $("ClearIndex");
    if (clearBtn) clearBtn.onclick = function () { clearCache(getBasePath()); const s = $("IndexStatus"); if (s) s.textContent = 'Cache cleared.'; const l = $("IndexList"); if (l) l.innerHTML = ''; };

    const saveBase = $("SaveIndexBase");
    if (saveBase) saveBase.onclick = function () { const v = $("IndexBasePath").value || '/dicoms/'; setBasePath(v); };

    const useSrv = $("UseServerIndex");
    if (useSrv) useSrv.onclick = async function () {
      const base = getBasePath();
      const s = $("IndexStatus"); if (s) s.textContent = 'Fetching server index...';
      try {
        const idx = await fetchServerIndex(base, 5000);
        if (idx) { saveCache(idx); renderIndex(idx, 'Index'); if (s) s.textContent = 'Loaded server index.'; }
        else if (s) s.textContent = 'Server index not found or invalid JSON.';
      } catch (e) {
        if (s) s.textContent = 'Error: ' + e.message;
      }
    };

    // Sidebar wiring
    const list = $("IndexSidebarList");
    if (list) {
      const cache2 = loadCache(getBasePath());
      if (cache2) renderIndex(cache2, 'IndexSidebar');
      const rBtn = $("IndexSidebarRefresh"); if (rBtn) rBtn.onclick = runIndex;
      const sInput = $("IndexSidebarSearch"); if (sInput) sInput.addEventListener('input', () => filterIndex(sInput.value));
      const toggle = $("IndexSidebarToggle"); if (toggle) toggle.onclick = function () {
        setSidebarVisible($("IndexSidebar").style.display === 'none');
      };
      // Ensure pinned open by default
      setSidebarVisible(true);
      // Try loading server index by default for fast startup
      (async () => {
        const base = getBasePath();
        const s = $("IndexSidebarStatus"); if (s) s.textContent = 'Checking server index...';
        let idx = await fetchServerIndex(base, 2000);
        if (idx) {
          // Update base if index suggests one
          if (idx.base) setBasePath(idx.base);
          saveCache(idx);
          renderIndex(idx, 'IndexSidebar');
          const s2 = $("IndexStatus"); if (s2) s2.textContent = 'Loaded server index.';
          if (s) s.textContent = 'Loaded server index.';
        } else {
          // Try manifest for lazy per-patient loads
          const man = await fetchManifest(base, 2000);
          if (man) {
            const partial = { createdAt: man.createdAt || Date.now(), base: man.base || base, patients: {} };
            for (const p of man.patients || []) partial.patients[p.patientId] = { patientId: p.patientId, patientName: p.patientName, studies: {} };
            saveCache(partial);
            renderIndex(partial, 'IndexSidebar');
            if (s) s.textContent = 'Loaded server manifest (lazy patients).';
          } else {
            if (s) s.textContent = 'No server index. Use Index or local cache.';
          }
        }
      })();
      // Expand/Collapse all controls
      const expAll = $("IndexExpandAll"); if (expAll) expAll.onclick = () => setAllCollapsed(false);
      const colAll = $("IndexCollapseAll"); if (colAll) colAll.onclick = () => setAllCollapsed(true);
      const useSrv2 = $("IndexSidebarUseServer"); if (useSrv2) useSrv2.onclick = async function () {
        const base = getBasePath();
        const s = $("IndexSidebarStatus"); if (s) s.textContent = 'Fetching server index...';
        try {
          const idx = await fetchServerIndex(base, 5000);
          if (idx) { saveCache(idx); renderIndex(idx, 'IndexSidebar'); if (s) s.textContent = 'Loaded server index.'; }
          else if (s) s.textContent = 'Server index not found or invalid JSON.';
        } catch (e) {
          if (s) s.textContent = 'Error: ' + e.message;
        }
      };
    }
  }

  async function loadSeries(urls) {
    if (!urls || urls.length === 0) return;
    // Load first image and show; then queue the rest to update counts
    try {
      loadDICOMFromUrl(urls[0], true);
      for (let i = 1; i < urls.length; i++) {
        // stagger the loads a bit to keep UI responsive
        setTimeout(() => loadDICOMFromUrl(urls[i], false), i * 50);
      }
    } catch (e) {
      console.error('Load series error', e);
    }
  }

  function filterIndex(query) {
    const q = (query || '').toLowerCase();
    function filterContainer(prefix) {
      const container = $(prefix + 'List'); if (!container) return;
      const items = container.querySelectorAll('div');
      items.forEach(div => {
        const text = (div.textContent || '').toLowerCase();
        div.style.display = q && !text.includes(q) ? 'none' : '';
      });
    }
    filterContainer('Index');
    filterContainer('IndexSidebar');
  }

  function setSidebarVisible(visible) {
    const panel = $("IndexSidebar"); const container = $("container");
    const header = document.getElementById('page-header');
    if (!panel || !container) return;
    const headerH = header ? header.offsetHeight : 64;
    panel.style.top = headerH + 'px';
    panel.style.height = `calc(100vh - ${headerH}px)`;
    if (visible) { panel.style.display = ''; container.style.width = 'calc(100vw - 330px)'; }
    else { panel.style.display = 'none'; container.style.width = '100vw'; }
  }

  function setAllCollapsed(flag) {
    // Set collapse state for all keys currently in cache, not only existing keys
    const cache = loadCache(getBasePath());
    if (!cache) return;
    const state = { patients: {}, studies: {} };
    const patients = cache.patients || {};
    for (const pid of Object.keys(patients)) {
      state.patients[pid] = flag;
      const studies = patients[pid].studies || {};
      for (const stUID of Object.keys(studies)) state.studies[pid + '|' + stUID] = flag;
    }
    saveCollapse(state);
    renderIndex(cache, 'IndexSidebar');
    renderIndex(cache, 'Index');
  }

  function styleSeriesBtn(btn) {
    btn.style.background = '#2d3553';
    btn.style.color = '#eaf';
    btn.style.border = '1px solid rgba(255,255,255,0.15)';
    btn.style.borderRadius = '4px';
    btn.style.padding = '4px 6px';
    btn.style.cursor = 'pointer';
    btn.onmouseenter = () => btn.style.background = '#3a4367';
    btn.onmouseleave = () => btn.style.background = '#2d3553';
  }

  function styleCineBtn(btn) {
    btn.style.background = '#335a3a';
    btn.style.color = '#eaf';
    btn.style.border = '1px solid rgba(255,255,255,0.15)';
    btn.style.borderRadius = '4px';
    btn.style.padding = '4px 6px';
    btn.style.cursor = 'pointer';
    btn.onmouseenter = () => btn.style.background = '#3f6b45';
    btn.onmouseleave = () => btn.style.background = '#335a3a';
  }

  function applyPatientHighlight(header, on) {
    header.style.boxShadow = on ? 'inset 0 0 0 2px #8aa1ff' : 'none';
    header.style.background = on ? 'linear-gradient(90deg, rgba(138,161,255,0.25), rgba(255,255,255,0.05))' : 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))';
  }

  function applyStudyHighlight(header, on) {
    header.style.boxShadow = on ? 'inset 0 0 0 2px #9fe3a1' : 'none';
    header.style.background = on ? 'rgba(159,227,161,0.18)' : 'transparent';
    header.style.color = on ? '#eef' : '#d8d8eb';
  }

  function refreshLoadHighlights() {
    try {
      const leftPatients = new Set();
      const pNodes = document.getElementsByClassName('OutLeftImg');
      for (let i = 0; i < pNodes.length; i++) leftPatients.add(pNodes[i].PatientId);

      const leftSeries = new Set();
      const sNodes = document.getElementsByClassName('LeftImgAndMark');
      for (let i = 0; i < sNodes.length; i++) if (sNodes[i].series) leftSeries.add(sNodes[i].series);

      // Patients
      const pHeaders = document.querySelectorAll('#IndexSidebarList [data-role="patient-header"]');
      pHeaders.forEach(h => applyPatientHighlight(h, leftPatients.has(h.dataset.pid)));

      // Studies
      const cache = loadCache(getBasePath());
      if (!cache) return;
      const sHeaders = document.querySelectorAll('#IndexSidebarList [data-role="study-header"]');
      sHeaders.forEach(h => {
        const pid = h.dataset.pid; const study = h.dataset.study;
        const st = cache.patients && cache.patients[pid] && cache.patients[pid].studies && cache.patients[pid].studies[study];
        let on = false;
        if (st && st.series) {
          for (const seUID of Object.keys(st.series)) { if (leftSeries.has(seUID)) { on = true; break; } }
        }
        applyStudyHighlight(h, on);
      });
    } catch (e) { }
  }

  // Expose for other modules to trigger updates
  window.IndexRefreshHighlights = refreshLoadHighlights;


  // Register init after page load hooks
  if (typeof onloadFunction !== 'undefined' && onloadFunction.push2Last) {
    onloadFunction.push2Last(initUI);
  } else {
    window.addEventListener('load', initUI);
  }
})();
