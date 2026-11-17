const now = () => performance.now();

function result(key, name, paradigm, tooltip, o) {
    return Object.assign({ key, name, paradigm, tooltip, status: "ok", value: null, chosen: null, timeMs: 0, memBytes: 0, ops: 0, note: "" }, o);
}

let streamProgress = (pct, msg) => {};
const yieldThread = () => new Promise(r => setTimeout(r, 0)); 

async function greedy(items, W) {
    const t0 = now(); const n = items.length; const idx = new Array(n).fill(0).map((_, i) => i);
    idx.sort((a, b) => items[b].value * items[a].weight - items[a].value * items[b].weight);
    let rem = W, value = 0; const chosen = new Uint8Array(n);
    for (let k = 0; k < n; k++) { const i = idx[k]; if (items[i].weight <= rem) { rem -= items[i].weight; value += items[i].value; chosen[i] = 1; } }
    return result("greedy", "Greedy", "Greedy", "Makes locally optimal choices by highest value-to-weight ratio.", { value, chosen, timeMs: now() - t0, memBytes: n * 8 + n, note: "Suboptimal for discrete items" });
}

async function greedyPlus(items, W) {
    const t0 = now(); const g = await greedy(items, W); let bestI = -1;
    for (let i = 0; i < items.length; i++) if (items[i].weight <= W && (bestI < 0 || items[i].value > items[bestI].value)) bestI = i;
    let value = g.value, chosen = g.chosen;
    if (bestI >= 0 && items[bestI].value > value) { value = items[bestI].value; chosen = new Uint8Array(items.length); chosen[bestI] = 1; }
    return result("greedyPlus", "Greedy+", "Greedy", "Compares standard Greedy vs picking the single highest-value item.", { value, chosen, timeMs: now() - t0, memBytes: g.memBytes, note: "Guarantees 50% of optimum" });
}

async function fractionalGreedy(items, W) {
    const t0 = now(); const idx = items.map((_, i) => i).sort((a, b) => items[b].value * items[a].weight - items[a].value * items[b].weight);
    let rem = W, value = 0;
    for (const i of idx) {
        if (rem <= 0) break;
        if (items[i].weight <= rem) { rem -= items[i].weight; value += items[i].value; } else { value += items[i].value * (rem / items[i].weight); rem = 0; }
    }
    return result("fractional", "Fractional Greedy", "Bound", "Allows breaking items into fractions.", { value: Math.floor(value), chosen: null, timeMs: now() - t0, memBytes: items.length * 8, note: "Upper bound ceiling test" });
}

async function dp2D(items, W, cellLimit = 6e7) {
    const n = items.length, cols = W + 1;
    if ((n + 1) * cols > cellLimit) return result("dp2d", "DP (2D Table)", "Dynamic Prog.", "Classic 0/1 Knapsack matrix. Uses O(nW) space.", { status: "skipped", memBytes: (n + 1) * cols * 4, note: "Memory limit exceeded" });
    const t0 = now(); const T = new Int32Array((n + 1) * cols);
    let lastYield = now();
    for (let i = 1; i <= n; i++) {
        const wt = items[i - 1].weight, v = items[i - 1].value, row = i * cols, prev = (i - 1) * cols;
        for (let c = 0; c <= W; c++) { let best = T[prev + c]; if (c >= wt) { const alt = T[prev + c - wt] + v; if (alt > best) best = alt; } T[row + c] = best; }
        if (now() - lastYield > 50) { streamProgress(Math.round((i/n)*100), `Matrix row ${i}/${n}`); await yieldThread(); lastYield = now(); }
    }
    const chosen = new Uint8Array(n); let c = W;
    for (let i = n; i >= 1; i--) { if (T[i * cols + c] !== T[(i - 1) * cols + c]) { chosen[i - 1] = 1; c -= items[i - 1].weight; } }
    return result("dp2d", "DP (2D Table)", "Dynamic Prog.", "Classic 0/1 Knapsack matrix. Uses O(nW) space.", { value: T[n * cols + W], chosen, timeMs: now() - t0, memBytes: (n + 1) * cols * 4 + n, note: "Guaranteed Optimum; high memory" });
}

async function dp1D(items, W) {
    const n = items.length;
    if (n * W > 2e9 || W > 6e7) return result("dp1d", "DP (1D Row)", "Dynamic Prog.", "Space-optimized DP using a single rolling row. O(W) space.", { status: "skipped", memBytes: (W + 1) * 4, note: "Skipped: limit exceeded" });
    const t0 = now(); const dp = new Int32Array(W + 1);
    let lastYield = now();
    for (let i = 0; i < n; i++) { 
        const wt = items[i].weight, v = items[i].value; for (let c = W; c >= wt; c--) { const t = dp[c - wt] + v; if (t > dp[c]) dp[c] = t; } 
        if (now() - lastYield > 50) { streamProgress(Math.round((i/n)*100), `Vector space ${i}/${n}`); await yieldThread(); lastYield = now(); }
    }
    return result("dp1d", "DP (1D Row)", "Dynamic Prog.", "Space-optimized DP using a single rolling row. O(W) space.", { value: dp[W], chosen: null, timeMs: now() - t0, memBytes: (W + 1) * 4, note: "Guaranteed Optimum; low memory" });
}

async function dcNaive(items, W, nodeLimit = 4e7) {
    const n = items.length;
    if (n > 28) return result("dcNaive", "D&C Naive", "Divide & Conquer", "Evaluates all subsets. O(2^n) time.", { status: "skipped", timeMs: 0, memBytes: n * 64, note: "Circuit Breaker: n > 28 halts execution" });
    const t0 = now(); let nodes = 0, best = -1, aborted = false;
    const sel = new Uint8Array(n); let bestSel = new Uint8Array(n);
    function rec(i, rem, cur) {
        if (aborted) return; if (++nodes > nodeLimit) { aborted = true; return; }
        if (i === n) { if (cur > best) { best = cur; bestSel = sel.slice(); } return; }
        sel[i] = 0; rec(i + 1, rem, cur);
        if (!aborted && items[i].weight <= rem) { sel[i] = 1; rec(i + 1, rem - items[i].weight, cur + items[i].value); sel[i] = 0; }
    }
    rec(0, W, 0);
    if (aborted) return result("dcNaive", "D&C Naive", "Divide & Conquer", "Evaluates all subsets. O(2^n) time.", { status: "timeout", timeMs: now() - t0, memBytes: n * 64, note: "Timeout: Exponential Time" });
    return result("dcNaive", "D&C Naive", "Divide & Conquer", "Evaluates all subsets. O(2^n) time.", { value: best, chosen: bestSel, timeMs: now() - t0, memBytes: n * 64 + 2 * n, note: "Exact, but extremely slow O(2^n)" });
}

function enumerateHalf(items, idxs, W) {
    let w = new Float64Array([0]), v = new Float64Array([0]), m = new Uint32Array([0]); let peak = 1;
    for (let t = 0; t < idxs.length; t++) {
        const wt = items[idxs[t]].weight, val = items[idxs[t]].value, bit = (1 << t) >>> 0;
        const L = w.length; const nw = new Float64Array(2 * L), nv = new Float64Array(2 * L), nm = new Uint32Array(2 * L);
        peak = Math.max(peak, 3 * L); let i = 0, j = 0, k = 0;
        while (i < L || j < L) {
            let fromA; if (i >= L) fromA = false; else if (j >= L) fromA = true; else fromA = w[i] <= w[j] + wt;
            let cw, cv, cm; if (fromA) { cw = w[i]; cv = v[i]; cm = m[i]; i++; } else { cw = w[j] + wt; cv = v[j] + val; cm = (m[j] | bit) >>> 0; j++; }
            if (cw > W) continue;
            if (k > 0 && cw === nw[k - 1]) { if (cv > nv[k - 1]) { nv[k - 1] = cv; nm[k - 1] = cm; } continue; }
            if (k > 0 && cv <= nv[k - 1]) continue;
            nw[k] = cw; nv[k] = cv; nm[k] = cm; k++;
        }
        w = nw.subarray(0, k); v = nv.subarray(0, k); m = nm.subarray(0, k);
    }
    return { w, v, m, len: w.length, peak, idxs };
}

async function dcMeetInMiddle(items, W, maxN = 40) {
    const n = items.length; if (n > maxN) return result("dcMitm", "D&C MitM", "Divide & Conquer", "Splits problem in half. O(2^(n/2)).", { status: "skipped", note: "Skipped: Guardrail (n > 40)" });
    const t0 = now(); const half = n >> 1; const idxA = [], idxB = [];
    for (let i = 0; i < n; i++) (i < half ? idxA : idxB).push(i);
    const A = enumerateHalf(items, idxA, W), B = enumerateHalf(items, idxB, W);
    let p = B.len - 1, best = -1, bi = 0, bj = 0;
    for (let a = 0; a < A.len; a++) {
        while (p >= 0 && A.w[a] + B.w[p] > W) p--; if (p < 0) break;
        const tot = A.v[a] + B.v[p]; if (tot > best) { best = tot; bi = a; bj = p; }
    }
    const chosen = new Uint8Array(n);
    for (let t = 0; t < idxA.length; t++) if ((A.m[bi] >>> t) & 1) chosen[idxA[t]] = 1;
    for (let t = 0; t < idxB.length; t++) if ((B.m[bj] >>> t) & 1) chosen[idxB[t]] = 1;
    return result("dcMitm", "D&C MitM", "Divide & Conquer", "Splits problem in half. O(2^(n/2)).", { value: best, chosen, timeMs: now() - t0, memBytes: (A.peak + B.peak) * 20, note: "O(2^(n/2)) Time Optimization" });
}

async function dcHirschberg(items, W) {
    const n = items.length; if (n * W > 1e9 || W > 6e7) return result("dcHirsch", "D&C Hirschberg", "Divide & Conquer", "D&C + DP for O(W) space.", { status: "skipped", note: "Skipped: Memory limit" });
    const t0 = now(); const chosen = new Uint8Array(n);
    function lastRow(lo, hi, cap) {
        const dp = new Int32Array(cap + 1);
        for (let i = lo; i < hi; i++) { const wt = items[i].weight, v = items[i].value; for (let c = cap; c >= wt; c--) { const t = dp[c - wt] + v; if (t > dp[c]) dp[c] = t; } }
        return dp;
    }
    function splitPoint(lo, mid, hi, cap) {
        const left = lastRow(lo, mid, cap), right = lastRow(mid, hi, cap); let bestC = 0, bestV = -1;
        for (let c = 0; c <= cap; c++) { const t = left[c] + right[cap - c]; if (t > bestV) { bestV = t; bestC = c; } }
        return bestC;
    }
    function solve(lo, hi, cap) {
        if (hi - lo === 0) return; if (hi - lo === 1) { if (items[lo].weight <= cap) chosen[lo] = 1; return; }
        const mid = (lo + hi) >> 1; const c = splitPoint(lo, mid, hi, cap); solve(lo, mid, c); solve(mid, hi, cap - c);
    }
    solve(0, n, W); 
    let w = 0, v = 0; for (let i = 0; i < items.length; i++) if (chosen[i]) { w += items[i].weight; v += items[i].value; }
    return result("dcHirsch", "D&C Hirschberg", "Divide & Conquer", "D&C + DP for O(W) space.", { value: v, chosen, timeMs: now() - t0, memBytes: 2 * (W + 1) * 4 + n * 2, note: "O(W) memory hybrid solution" });
}

self.onmessage = async function(e) {
    const { items, W } = e.data;
    const out = [];
    const log = (msg) => self.postMessage({ type: 'log', text: msg });
    streamProgress = (pct, msg) => self.postMessage({ type: 'progress', pct, msg });
    
    log(`Initializing pipeline (n=${items.length}, W=${W})`);
    
    const run = async (fn, name) => {
        log(`> Executing ${name}...`);
        streamProgress(0, `Starting ${name}`);
        const res = await fn(items, W);
        out.push(res);
        if (res.status === 'ok') log(`  ✓ Completed in ${res.timeMs.toFixed(2)}ms`);
        else log(`  ✗ Halted: ${res.note}`);
        streamProgress(100, `Finished ${name}`);
    };
    
    await run(dcNaive, "D&C Naive");
    await run(dcMeetInMiddle, "D&C MitM");
    await run(dcHirschberg, "D&C Hirschberg");
    await run(greedy, "Greedy (Ratio)");
    await run(greedyPlus, "Greedy+ (1/2 Approx)");
    await run(fractionalGreedy, "Fractional Bound");
    await run(dp2D, "DP (2D Table)");
    await run(dp1D, "DP (1D Row)");
    
    const exact = ["dp2d", "dp1d", "dcNaive", "dcMitm", "dcHirsch"];
    let opt = null;
    for (const r of out) if (exact.includes(r.key) && r.status === "ok" && (opt === null || r.value > opt)) opt = r.value;
    for (const r of out) { r.optimal = opt; r.gapPct = opt && r.value != null ? (100 * (opt - r.value)) / opt : null; }
    
    streamProgress(0, '');
    log(`Pipeline execution finalized.`);
    self.postMessage({ type: 'done', data: out });
};