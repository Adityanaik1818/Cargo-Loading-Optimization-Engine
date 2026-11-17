/* ==========================================================================
   app.js
   Bulletproof Controller (Safe DOM Traversal, Fixed CSV, PWA)
   ========================================================================== */
lucide.createIcons();
let currentResults = [], telemetryLogArray = [], lastItems = [], lastW = 0, runCount = 0;
let worker = null, isSimulationRunning = false, previousFocus = null, activeDrawerResult = null;
let customDataset = null; 

let timeChartInst, scatterChartInst, donutChartInst, radarChartInst, lineChartInst;
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
document.getElementById('runKbd').innerText = isMac ? '⌘ ↵' : 'Ctrl ↵';
document.getElementById('exportKbd').innerText = isMac ? '⌘ ⇧ E' : 'Ctrl ⇧ E';

function initWorker() {
    if (worker) worker.terminate();
    worker = new Worker('algorithms.js');
    worker.onmessage = handleWorkerMessage;
}
initWorker();

function saveState() {
    const state = { n: document.getElementById('numItems').value, kind: document.getElementById('datasetKind').value, frac: document.getElementById('capacityFrac').value };
    const url = new URL(window.location);
    url.searchParams.set('n', state.n); url.searchParams.set('dist', state.kind); url.searchParams.set('cap', state.frac);
    window.history.replaceState({}, '', url);
    localStorage.setItem('nexusState', JSON.stringify({ theme: document.documentElement.getAttribute('data-theme'), telemetry: telemetryLogArray, runCount: runCount }));
}

function loadState() {
    const params = new URLSearchParams(window.location.search);
    if(params.has('n')) document.getElementById('numItems').value = params.get('n');
    if(params.has('dist')) document.getElementById('datasetKind').value = params.get('dist');
    if(params.has('cap')) document.getElementById('capacityFrac').value = params.get('cap');
    
    try {
        const state = JSON.parse(localStorage.getItem('nexusState'));
        if (state) {
            if (state.theme) { document.documentElement.setAttribute('data-theme', state.theme); document.getElementById('themeIcon')?.setAttribute('data-lucide', state.theme === 'dark' ? 'moon' : 'sun'); }
            if (state.telemetry) { telemetryLogArray = state.telemetry; runCount = state.runCount || 0; renderTelemetryFromState(); }
        }
    } catch (e) {}
    
    const capDisplay = document.getElementById('capDisplay');
    if(capDisplay) capDisplay.innerText = Math.round(parseFloat(document.getElementById('capacityFrac').value) * 100) + '%';
    saveState(); 
}

function copyDeepLink() {
    saveState();
    navigator.clipboard.writeText(window.location.href).then(() => showToast("Deep link copied! Share this URL."));
}

/* --- Enterprise CSV Drag & Drop --- */
const dropzone = document.getElementById('csv-dropzone');
const fileInput = document.getElementById('csv-upload');
const dropText = document.getElementById('dropzone-text');

if(dropzone && fileInput) {
    dropzone.addEventListener('dragover', (e) => { 
        e.preventDefault(); e.stopPropagation(); 
        dropzone.classList.replace('border-gray-500/30', 'border-[#17c964]'); 
        dropzone.classList.add('bg-[#17c964]/10');
    });
    
    dropzone.addEventListener('dragleave', (e) => { 
        e.preventDefault(); e.stopPropagation(); 
        dropzone.classList.replace('border-[#17c964]', 'border-gray-500/30'); 
        dropzone.classList.remove('bg-[#17c964]/10');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation(); 
        dropzone.classList.replace('border-[#17c964]', 'border-gray-500/30');
        if(e.dataTransfer.files && e.dataTransfer.files.length > 0) handleCSVUpload(e.dataTransfer.files[0]);
    });
    
    fileInput.addEventListener('change', (e) => { 
        if(e.target.files && e.target.files.length > 0) handleCSVUpload(e.target.files[0]); 
    });
}

function handleCSVUpload(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { showToast("Please upload a valid .csv file", "fail"); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const rows = e.target.result.split(/\r?\n/).filter(row => row.trim().length > 0);
            const parsedItems = [];

            for (let i = 0; i < rows.length; i++) {
                const cols = rows[i].replace(/['"]/g, '').split(',').map(c => c.trim()).filter(c => c !== "");
                if (cols.length >= 2) {
                    const w = parseInt(cols[cols.length - 2]), v = parseInt(cols[cols.length - 1]);
                    if (!isNaN(w) && !isNaN(v)) parsedItems.push({id: parsedItems.length, weight: w, value: v}); 
                }
            }

            if (parsedItems.length > 0) {
                customDataset = parsedItems;
                document.getElementById('numItems').value = customDataset.length;
                document.getElementById('datasetKind').value = 'uncorrelated';
                
                if(dropText) dropText.innerHTML = `Loaded: ${file.name}<br><span class="text-[9px] text-[#17c964] mt-1 block">(${customDataset.length} items ready)</span>`;
                if(dropzone) { dropzone.classList.remove('border-gray-500/30'); dropzone.classList.add('border-[#17c964]', 'bg-[#17c964]/10'); }
                
                showToast(`Successfully loaded ${customDataset.length} items from CSV.`); saveState();
                if (!isSimulationRunning) setTimeout(runSimulation, 100);
            } else throw new Error("No numeric data found.");
        } catch(err) { showToast("CSV Failed. Ensure format has numbers in last 2 columns.", "fail"); }
    };
    reader.readAsText(file); fileInput.value = ''; 
}

/* --- Listeners --- */
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); toggleSimulation(); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); if (!document.getElementById('exportBtn').disabled) exportCSV(); }
    if (e.key === 'Escape') closeDrawer();
});

document.getElementById('numItems')?.addEventListener('input', (e) => {
    document.getElementById('guardrail-warning')?.classList[parseInt(e.target.value) > 1000 ? 'remove' : 'add']('hidden');
    if (customDataset) {
        customDataset = null; 
        if(dropText) dropText.innerText = "Drop Custom CSV or Click"; 
        if(dropzone) { dropzone.classList.remove('border-[#17c964]', 'bg-[#17c964]/10'); dropzone.classList.add('border-gray-500/30'); }
        showToast("Switched back to mathematical generator.", "warn");
    }
    saveState();
});

document.getElementById('capacityFrac')?.addEventListener('input', (e) => { 
    const cd = document.getElementById('capDisplay'); if(cd) cd.innerText = Math.round(e.target.value * 100) + '%'; 
    saveState(); 
});
document.getElementById('datasetKind')?.addEventListener('change', () => { 
    if (customDataset) {
        customDataset = null; 
        if(dropText) dropText.innerText = "Drop Custom CSV or Click"; 
        if(dropzone) { dropzone.classList.remove('border-[#17c964]', 'bg-[#17c964]/10'); dropzone.classList.add('border-gray-500/30'); }
    }
    saveState(); 
});

function toggleTheme() {
    const html = document.documentElement, newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme); document.getElementById('themeIcon')?.setAttribute('data-lucide', newTheme === 'dark' ? 'moon' : 'sun');
    lucide.createIcons(); saveState();
    if (currentResults.length > 0) renderAllGraphs(currentResults);
    if (lastItems.length > 0) renderScatterChart(lastItems);
}

function setViewMode(mode) {
    const area = document.getElementById('resultsArea'), bGrid = document.getElementById('btn-grid'), bList = document.getElementById('btn-list');
    if(!area || !bGrid || !bList) return;
    if (mode === 'list') { area.classList.add('view-list'); bList.classList.replace('opacity-50', 'bg-gray-500/20'); bList.classList.add('text-white', 'shadow-sm'); bGrid.classList.replace('bg-gray-500/20', 'opacity-50'); bGrid.classList.remove('text-white', 'shadow-sm'); } 
    else { area.classList.remove('view-list'); bGrid.classList.replace('opacity-50', 'bg-gray-500/20'); bGrid.classList.add('text-white', 'shadow-sm'); bList.classList.replace('bg-gray-500/20', 'opacity-50'); bList.classList.remove('text-white', 'shadow-sm'); }
}

function rng(seed) { let a = (seed >>> 0) || 1; return function () { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* --- Execution --- */
function toggleSimulation() { isSimulationRunning ? abortSimulation() : runSimulation(); }

function abortSimulation() {
    initWorker(); isSimulationRunning = false;
    const btn = document.getElementById('runBtn'), expBtn = document.getElementById('exportBtn');
    if(btn) { btn.innerHTML = `<span class="flex items-center gap-2"><i data-lucide="play" class="w-4 h-4 fill-current"></i> <span id="btnText">Execute</span></span><kbd class="kbd-hint hidden md:inline-block">${isMac ? '⌘ ↵' : 'Ctrl ↵'}</kbd>`; btn.classList.remove('abort-btn'); btn.classList.add('primary-btn'); }
    if (currentResults.length > 0 && expBtn) { expBtn.disabled = false; expBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
    
    const pb = document.getElementById('progress-bar'), pp = document.getElementById('progress-percent');
    if(pb) pb.style.width = '0%'; if(pp) pp.classList.add('hidden');
    lucide.createIcons(); logTerminal("✗ Execution forcefully aborted."); showToast("Execution aborted.", "warn");
}

async function runSimulation() {
    isSimulationRunning = true;
    const btn = document.getElementById('runBtn'), expBtn = document.getElementById('exportBtn'), n = parseInt(document.getElementById('numItems')?.value || 25);
    
    if(btn) { btn.innerHTML = `<span class="flex items-center gap-2"><i data-lucide="x-circle" class="w-4 h-4"></i> <span id="btnText">Abort Pipeline</span></span><kbd class="kbd-hint hidden md:inline-block">${isMac ? '⌘ ↵' : 'Ctrl ↵'}</kbd>`; btn.classList.replace('primary-btn', 'abort-btn'); }
    if(expBtn) { expBtn.disabled = true; expBtn.classList.add('opacity-50', 'cursor-not-allowed'); }
    
    const resArea = document.getElementById('resultsArea');
    if(resArea) resArea.innerHTML = '<div class="col-span-full py-16 text-center opacity-50 font-mono"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>Processing...</div>';
    
    const pp = document.getElementById('progress-percent');
    if(pp) { pp.classList.remove('hidden'); pp.innerText = '0%'; }
    
    lucide.createIcons(); await new Promise(r => setTimeout(r, 50));

    let items = [], W = 0; const frac = parseFloat(document.getElementById('capacityFrac')?.value || 0.5);
    if(customDataset) {
        items = customDataset; let sum = 0; items.forEach(i => sum += i.weight); W = Math.floor(sum * frac);
    } else {
        const kind = document.getElementById('datasetKind')?.value || 'uncorrelated';
        const r = rng(Date.now()); let sum = 0, mx = 0;
        for (let i = 0; i < n; i++) {
            const weight = 1 + Math.floor(r() * 100);
            let value = (kind === "strong") ? weight + 10 : (kind === "weak" ? Math.max(1, weight * 10 + Math.floor(r() * 21)) : 1 + Math.floor(r() * 100));
            items.push({ id: i, weight, value }); sum += weight; if (weight > mx) mx = weight;
        }
        W = Math.max(mx, Math.floor(sum * frac));
    }
    
    lastItems = items; lastW = W; const term = document.getElementById('terminal-output'); if(term) term.innerHTML = ''; 
    renderScatterChart(items); worker.postMessage({ items, W }); 
}

function handleWorkerMessage(e) {
    if(e.data.type === 'log') { logTerminal(e.data.text); return; }
    if(e.data.type === 'progress') { 
        const pb = document.getElementById('progress-bar'), pp = document.getElementById('progress-percent');
        if(pb) pb.style.width = `${e.data.pct}%`;
        if(pp && e.data.msg) pp.innerText = `${e.data.pct}% - ${e.data.msg}`;
        return; 
    }
    
    isSimulationRunning = false; currentResults = e.data.data;
    const pb = document.getElementById('progress-bar'), pp = document.getElementById('progress-percent');
    if(pb) pb.style.width = '0%'; if(pp) pp.classList.add('hidden');
    
    const btn = document.getElementById('runBtn'), expBtn = document.getElementById('exportBtn');
    if(btn) { btn.innerHTML = `<span class="flex items-center gap-2"><i data-lucide="play" class="w-4 h-4 fill-current"></i> <span id="btnText">Execute</span></span><kbd class="kbd-hint hidden md:inline-block">${isMac ? '⌘ ↵' : 'Ctrl ↵'}</kbd>`; btn.classList.replace('abort-btn', 'primary-btn'); }
    if(expBtn) { expBtn.disabled = false; expBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
    
    logTelemetry(currentResults); renderCards(currentResults); renderAllGraphs(currentResults);
    lucide.createIcons(); showToast(`Pipeline completed.`);
}

/* --- Rendering --- */
function getUtilizedWeight(res, results, items) {
    if (!res) return 0;
    if (res.chosen) { let w = 0; for(let i=0; i<items.length; i++) if (res.chosen[i]) w += items[i].weight; return w; }
    if (res.key === 'dp1d' && res.status === 'ok') { const fallback = results.find(r => r.gapPct === 0 && r.chosen !== null); if (fallback) { let w = 0; for(let i=0; i<items.length; i++) if (fallback.chosen[i]) w += items[i].weight; return w; } }
    return 0;
}

function getThemeColors() {
    const s = getComputedStyle(document.documentElement);
    return { main: s.getPropertyValue('--text-main').trim() || '#EDEDED', muted: s.getPropertyValue('--text-muted').trim() || '#888888', border: s.getPropertyValue('--border-subtle').trim() || 'rgba(255,255,255,0.1)', panel: s.getPropertyValue('--bg-panel').trim() || '#0A0A0A', accent: '#17c964', warn: '#f5a524', blue: 'rgba(59, 130, 246, 0.8)' };
}

function renderScatterChart(items) {
    const canvasEl = document.getElementById('scatterChart'); if(!canvasEl) return; const c = getThemeColors();
    if (scatterChartInst) scatterChartInst.destroy();
    scatterChartInst = new Chart(canvasEl.getContext('2d'), {
        type: 'scatter', data: { datasets: [{ data: items.map(i => ({x: i.weight, y: i.value})), backgroundColor: c.blue, pointRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: {display: true, text: 'Weight', color: c.muted}, grid: { color: c.border, drawBorder: false } }, y: { title: {display: true, text: 'Value', color: c.muted}, grid: { color: c.border, drawBorder: false } } } }
    });
}

function renderAllGraphs(results) {
    const c = getThemeColors(); Chart.defaults.color = c.muted; Chart.defaults.font.family = "'JetBrains Mono', monospace"; Chart.defaults.font.size = 10;
    const tt = { backgroundColor: c.panel, titleColor: c.main, bodyColor: c.main, borderColor: c.border, borderWidth: 1, padding: 10 };

    const tc = document.getElementById('timeChart');
    if(tc) {
        if (timeChartInst) timeChartInst.destroy();
        timeChartInst = new Chart(tc.getContext('2d'), { type: 'bar', data: { labels: results.map(r => r.name.split(' ')[0]), datasets: [{ data: results.map(r => r.timeMs||0.01), backgroundColor: c.main, borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tt }, scales: { y: { type: 'logarithmic', grid: { color: c.border, drawBorder: false } }, x: { grid: { display: false, drawBorder: false } } } } });
    }

    const optIdx = findOptimalParadigm(results); let usedW = optIdx !== null ? getUtilizedWeight(results[optIdx], results, lastItems) : 0;
    const dc = document.getElementById('donutChart');
    if(dc) {
        if (donutChartInst) donutChartInst.destroy();
        donutChartInst = new Chart(dc.getContext('2d'), { type: 'doughnut', data: { labels: ['Used', 'Wasted'], datasets: [{ data: [usedW, Math.max(0, lastW - usedW)], backgroundColor: [c.accent, c.border], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: tt } } });
    }

    const radarData = results.filter(r => ['dp2d', 'greedy', 'dcMitm'].includes(r.key)).map(r => {
        let speed = Math.max(0, 100 - (Math.log10(r.timeMs||1) * 20)), mem = Math.max(0, 100 - (Math.log10(r.memBytes||1) * 15)), acc = r.status === 'ok' ? (100 - r.gapPct) : 0;
        return { label: r.name, data: [speed, mem, acc], borderColor: r.key==='dp2d'?c.accent: (r.key==='greedy'?c.warn:c.blue), backgroundColor: 'transparent' };
    });
    const rc = document.getElementById('radarChart');
    if(rc) {
        if (radarChartInst) radarChartInst.destroy();
        radarChartInst = new Chart(rc.getContext('2d'), { type: 'radar', data: { labels: ['Speed', 'Memory', 'Accuracy'], datasets: radarData }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tt }, scales: { r: { angleLines: { color: c.border }, grid: { color: c.border }, pointLabels: { color: c.muted }, ticks: { display: false, max: 100, min: 0 } } } } });
    }
    renderLineChart();
}

function renderLineChart() {
    const lc = document.getElementById('lineChart'); if(!lc) return; const c = getThemeColors();
    if (lineChartInst) lineChartInst.destroy(); if(telemetryLogArray.length === 0) return;
    const sorted = [...telemetryLogArray].sort((a,b) => a.n - b.n);
    lineChartInst = new Chart(lc.getContext('2d'), { type: 'line', data: { labels: sorted.map(t=>t.n), datasets: [{ label: 'Time (ms)', data: sorted.map(t=>t.time), borderColor: c.warn, backgroundColor: c.warn, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { type: 'logarithmic', grid: { color: c.border, drawBorder: false } }, x: { grid: { display: false, drawBorder: false } } } } });
}

function findOptimalParadigm(results) {
    let optimal = null, maxVal = -1, minTime = Infinity;
    results.forEach((r, idx) => { if(r.status === 'ok' && r.key !== 'fractional') { if(r.value > maxVal) { maxVal = r.value; minTime = r.timeMs; optimal = idx; } else if(r.value === maxVal && r.timeMs < minTime) { minTime = r.timeMs; optimal = idx; } } });
    return optimal;
}

function renderCards(results) {
    const container = document.getElementById('resultsArea'), template = document.getElementById('card-template'); 
    if(!container || !template) return; container.innerHTML = '';
    const optimalIdx = findOptimalParadigm(results);

    results.forEach((res, index) => {
        const clone = template.content.cloneNode(true), card = clone.querySelector('button');
        card.dataset.index = index; card.style.animationDelay = `${index * 0.05}s`;
        
        let w = getUtilizedWeight(res, results, lastItems);
        const pctFull = res.status === 'ok' ? Math.min(100, (w / lastW) * 100).toFixed(1) : 0, isOpt = res.gapPct === 0 && res.status === 'ok', isSkip = res.status === 'skipped' || res.status === 'timeout';
        
        if(index === optimalIdx) { card.classList.add('border-[#17c964]'); clone.querySelector('.recommend-badge')?.classList.remove('hidden'); }
        clone.querySelector('.status-dot')?.classList.add(isSkip ? (res.status === 'timeout' ? 'bg-fail' : 'bg-skip') : (isOpt ? 'bg-ok' : 'bg-warn'));
        
        const titleEl = clone.querySelector('.card-title'); if(titleEl) titleEl.textContent = res.name;
        const paradigmEl = clone.querySelector('.card-paradigm'); if(paradigmEl) { paradigmEl.textContent = res.paradigm; paradigmEl.setAttribute('data-tooltip', res.tooltip); }
        const noteEl = clone.querySelector('.card-note'); if(noteEl) noteEl.textContent = res.note; 
        const valEl = clone.querySelector('.card-value'); if(valEl) valEl.textContent = res.status === 'ok' ? res.value : '---';
        
        const gapSpan = clone.querySelector('.card-gap'); 
        if(gapSpan) { gapSpan.textContent = res.status === 'ok' ? res.gapPct.toFixed(1) + '%' : '---'; if (isOpt) gapSpan.classList.add('text-[#17c964]'); else if (!isSkip) gapSpan.classList.add('text-[#f5a524]'); else gapSpan.classList.add('opacity-50'); }
        
        const loadEl = clone.querySelector('.card-load'); if(loadEl) loadEl.innerHTML = `${w} <span class="opacity-60">/ ${lastW}</span>`;
        const bar = clone.querySelector('.capacity-bar'); if(bar) { bar.style.backgroundColor = isSkip ? 'var(--text-muted)' : (isOpt ? '#17c964' : '#f5a524'); setTimeout(() => { bar.style.width = `${pctFull}%`; }, 50); }
        container.appendChild(clone);
    });
}

function logTelemetry(results) {
    runCount++; const optimalIdx = findOptimalParadigm(results), bestAlgo = optimalIdx !== null ? results[optimalIdx] : null;
    telemetryLogArray.unshift({ id: runCount.toString().padStart(3, '0'), n: document.getElementById('numItems')?.value || 0, algo: bestAlgo ? bestAlgo.name : 'N/A', val: bestAlgo ? bestAlgo.value : 'N/A', time: bestAlgo ? bestAlgo.timeMs.toFixed(2) : 'N/A' });
    if(telemetryLogArray.length > 50) telemetryLogArray.pop();
    saveState(); renderTelemetryFromState(); renderLineChart();
}

function renderTelemetryFromState() {
    const tbody = document.getElementById('telemetryBody'); if(!tbody) return; tbody.innerHTML = '';
    if(telemetryLogArray.length === 0) return tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center opacity-50 font-sans">No history.</td></tr>`;
    telemetryLogArray.forEach(log => {
        const row = document.createElement('tr'); row.className = 'border-b border-gray-500/10 hover:bg-gray-500/5 animate-fade-up';
        row.innerHTML = `<td class="py-3 text-blue-400">#${log.id}</td><td class="py-3">${log.n}</td><td class="py-3 font-semibold text-white">${log.algo}</td><td class="py-3 text-[#17c964]">${log.val}</td><td class="py-3 opacity-80">${log.time}</td>`;
        tbody.appendChild(row);
    });
}

function logTerminal(msg) {
    const term = document.getElementById('terminal-output'); if(!term) return;
    const d = new Date(), div = document.createElement('div');
    if(msg.includes('✓')) div.className = 'text-[#17c964]'; else if(msg.includes('✗') || msg.includes('Halted')) div.className = 'text-[#f5a524]';
    div.innerHTML = `<span class="opacity-50 mr-2">[${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}]</span> ${msg}`;
    term.appendChild(div); term.scrollTop = term.scrollHeight; 
}

function openDrawer(index) {
    if(!currentResults[index]) return; const res = currentResults[index]; previousFocus = document.activeElement; activeDrawerResult = res;
    const overlay = document.getElementById('drawer-overlay'), drawer = document.getElementById('data-drawer');
    if(overlay) { overlay.classList.replace('opacity-0', 'opacity-100'); overlay.classList.replace('pointer-events-none', 'pointer-events-auto'); }
    if(drawer) drawer.classList.replace('translate-x-full', 'translate-x-0');
    
    const dTitle = document.getElementById('drawer-title'); if(dTitle) dTitle.innerText = res.name; 
    const dPara = document.getElementById('drawer-paradigm'); if(dPara) dPara.innerText = res.paradigm;
    
    const tbody = document.getElementById('drawer-body'); 
    if(tbody) {
        tbody.innerHTML = ''; let count = 0, totalW = 0; let targetArray = res.chosen;
        if (!targetArray && res.key === 'dp1d' && res.status === 'ok') { const fallback = currentResults.find(r => r.gapPct === 0 && r.chosen !== null); if (fallback) targetArray = fallback.chosen; }
        if (targetArray) lastItems.forEach((item, i) => { if (targetArray[i]) { count++; totalW += item.weight; tbody.innerHTML += `<tr><td class="py-2 opacity-60">#${item.id}</td><td class="py-2">${item.weight}</td><td class="py-2 text-[#17c964]">${item.value}</td></tr>`; }});
        if (count === 0) tbody.innerHTML = `<tr><td colspan="3" class="py-4 text-center opacity-50 font-sans">No items selected</td></tr>`;
        const dCount = document.getElementById('drawer-count'); if(dCount) dCount.innerText = count; 
        const dWeight = document.getElementById('drawer-weight'); if(dWeight) dWeight.innerText = totalW;
    }
    document.getElementById('drawer-close-btn')?.focus();
}

function closeDrawer() {
    const overlay = document.getElementById('drawer-overlay'), drawer = document.getElementById('data-drawer');
    if(overlay) { overlay.classList.replace('opacity-100', 'opacity-0'); overlay.classList.replace('pointer-events-auto', 'pointer-events-none'); }
    if(drawer) drawer.classList.replace('translate-x-0', 'translate-x-full');
    if (previousFocus) previousFocus.focus(); activeDrawerResult = null;
}

function copyPayload() {
    if(!activeDrawerResult) return;
    let itemsArr = [], targetArray = activeDrawerResult.chosen;
    if (!targetArray && activeDrawerResult.key === 'dp1d' && activeDrawerResult.status === 'ok') { const fallback = currentResults.find(r => r.gapPct === 0 && r.chosen !== null); if (fallback) targetArray = fallback.chosen; }
    if(targetArray) lastItems.forEach((item, i) => { if (targetArray[i]) itemsArr.push(item); });
    const payload = { algorithm: activeDrawerResult.name, paradigm: activeDrawerResult.paradigm, executionTimeMs: activeDrawerResult.timeMs, memoryKB: activeDrawerResult.memBytes / 1024, totalValue: activeDrawerResult.value, itemPayload: itemsArr };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => showToast("Payload JSON copied to clipboard!"));
}

function downloadChart(canvasId, filename) {
    const canvas = document.getElementById(canvasId); if(!canvas) return;
    const clone = document.createElement('canvas'); clone.width = canvas.width; clone.height = canvas.height;
    const ctx = clone.getContext('2d'); ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#0A0A0A' : '#FFFFFF';
    ctx.fillRect(0, 0, clone.width, clone.height); ctx.drawImage(canvas, 0, 0);
    const link = document.createElement('a'); link.download = `${filename}.png`; link.href = clone.toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast(`${filename}.png saved.`);
}

function exportCSV() {
    if (!currentResults.length) return; const n = parseInt(document.getElementById('numItems').value);
    let csv = `N=${n}, Capacity=${lastW}\nAlgorithm,Paradigm,Status,Total Value,Optimum Gap (%),Execution Time (ms),Memory Footprint (KB)\n`;
    currentResults.forEach(r => { csv += `"${r.name}","${r.paradigm}","${r.status}","${r.status === 'ok' ? r.value : 'N/A'}","${r.status === 'ok' ? r.gapPct.toFixed(2) : 'N/A'}","${r.timeMs.toFixed(3)}","${(r.memBytes/1024).toFixed(2)}"\n`; });
    const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv); link.download = `nexus_benchmark_n${n}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast(`Data exported: nexus_benchmark_n${n}.csv`);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container'); if(!container) return;
    const toast = document.createElement('div'); toast.className = `panel px-4 py-3 rounded-lg flex items-center gap-3 shadow-xl toast-enter pointer-events-auto`;
    toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4 ${type === 'success' ? 'text-[#17c964]' : 'text-[#f5a524]'}"></i><span class="text-sm font-medium opacity-90">${message}</span>`;
    container.appendChild(toast); lucide.createIcons();
    setTimeout(() => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); }, 4000);
}

window.onload = () => { loadState(); lucide.createIcons(); if(telemetryLogArray.length === 0) setTimeout(runSimulation, 200); else renderLineChart(); };