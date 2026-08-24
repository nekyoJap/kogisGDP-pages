/**
 * 上り抜け - 前走の上りタイム抽出ビュー
 * kogisGDP - 競輪AI予想システム
 *
 * データ元: https://storage.googleapis.com/asilogkeirin/race_info/race_info_YYYYMMDD.json
 * データのキー「前日上り」＝前走（その開催の前日のレース）のゴール前200mのタイム・秒。
 * これを昇順に並べ、レースごとの上位N人を抽出する。同じ走りの着順が「前日着」。
 */

const DATA_BASE = 'https://storage.googleapis.com/asilogkeirin/race_info/race_info_';

/** 何日前まで自動でさかのぼるか */
const MAX_BACKTRACK_DAYS = 7;

/** 日付ごとの取得結果キャッシュ */
const dayCache = new Map();

/** 現在描画中のデータ */
let currentData = null;

/** 読み込みの世代番号。日付を続けて切り替えたとき、古い応答で上書きしないための番号 */
let loadSeq = 0;

// ===== 日付ユーティリティ =====

/** Date -> "YYYY-MM-DD"（ローカル時刻基準） */
function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" -> Date（ローカル時刻の0時） */
function fromISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** "YYYY-MM-DD" -> "YYYYMMDD" */
function toCompact(iso) {
    return iso.replace(/-/g, '');
}

/** "YYYY-MM-DD" に n 日足す */
function addDays(iso, n) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
}

/** "YYYY-MM-DD" -> "2026年8月21日(金)" */
function formatJP(iso) {
    const d = fromISO(iso);
    const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${w})`;
}

// ===== 上りタイムのパース =====

/**
 * 「前日上り」を数値に変換する。
 * 空文字・非数値・0以下は「記録なし」として null を返す。
 * （データ側に 0.0 が入るケースがある。落車などで計測されなかったもので、
 *   そのまま扱うと常に最速として先頭に来てしまうため除外する）
 */
function parseAgari(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const v = parseFloat(s);
    if (!isFinite(v) || v <= 0) return null;
    return v;
}

/** タイムの表示形式（小数第1位固定） */
function fmtTime(v) {
    return v.toFixed(1);
}

/** 差の表示形式（浮動小数の誤差を落とす） */
function fmtDiff(v) {
    return Math.abs(v).toFixed(1);
}

// ===== 抽出ロジック =====

/**
 * 1レース分の選手を「前日上り」昇順に並べ、順位を振る。
 * 同タイムは同順位（1, 2, 2, 4 形式）。
 * 記録なしの選手は対象外。
 */
function rankRacers(racers) {
    const valid = [];
    for (const r of racers) {
        const t = parseAgari(r['前日上り']);
        if (t === null) continue;
        valid.push({ racer: r, t });
    }
    valid.sort((a, b) => a.t - b.t);

    let rank = 0;
    let prevT = null;
    valid.forEach((item, i) => {
        if (prevT === null || item.t !== prevT) {
            rank = i + 1;
            prevT = item.t;
        }
        item.rank = rank;
    });

    // 差分: 1位は「2位との差」、2位以下は「1位との差」
    if (valid.length > 0) {
        const best = valid[0].t;
        const second = valid.find((x) => x.t > best);
        for (const item of valid) {
            if (item.rank === 1) {
                item.diff = second ? second.t - best : null;
                item.diffType = 'lead';
            } else {
                item.diff = item.t - best;
                item.diffType = 'behind';
            }
        }
    }
    return valid;
}

/** 上位N人（同順位は全員含む） */
function pickTop(ranked, topN) {
    return ranked.filter((x) => x.rank <= topN);
}

/** その開催に前走の上りデータがあるか */
function meetHasData(meet) {
    if (Number(meet.race_day) === 1) return false;
    return (meet.races || []).some((race) =>
        (race.racers || []).some((r) => parseAgari(r['前日上り']) !== null)
    );
}

// ===== データ取得 =====

class FetchMissing extends Error {}

async function fetchDay(iso) {
    if (dayCache.has(iso)) {
        const cached = dayCache.get(iso);
        if (cached.missing) throw new FetchMissing(iso);
        return cached.data;
    }
    let res;
    try {
        res = await fetch(DATA_BASE + toCompact(iso) + '.json', { cache: 'no-cache' });
    } catch (e) {
        // ネットワーク/CORSレベルの失敗はキャッシュしない
        throw new Error('ネットワークエラー: ' + e.message);
    }
    if (!res.ok) {
        dayCache.set(iso, { missing: true });
        throw new FetchMissing(iso);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
        dayCache.set(iso, { missing: true });
        throw new FetchMissing(iso);
    }
    dayCache.set(iso, { data });
    return data;
}

/** 指定日から最大7日さかのぼってデータのある日を探す */
async function loadWithFallback(startISO) {
    let networkError = null;
    for (let i = 0; i <= MAX_BACKTRACK_DAYS; i++) {
        const iso = addDays(startISO, -i);
        try {
            const data = await fetchDay(iso);
            return { iso, data, backtracked: i };
        } catch (e) {
            if (e instanceof FetchMissing) continue;
            networkError = e;
            break;
        }
    }
    if (networkError) throw networkError;
    throw new Error(
        `${formatJP(startISO)} から ${MAX_BACKTRACK_DAYS} 日さかのぼりましたが、開催データが見つかりませんでした。`
    );
}

// ===== 描画ヘルパー =====

function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 車番バッジ（競輪の正式枠色 1白 2黒 3赤 4青 5黄 6緑 7橙 8桃 9紫） */
function carBadge(num) {
    const n = Number(num);
    const cls = n >= 1 && n <= 9 ? `car-${n}` : '';
    return `<span class="car-badge ${cls}">${escapeHtml(num)}</span>`;
}

function diffChip(item) {
    if (item.diffType === 'lead') {
        if (item.diff === null || item.diff === undefined) {
            return `<span class="diff-chip">比較なし</span>`;
        }
        return `<span class="diff-chip lead" title="2位との差">2位と <span class="time">${fmtDiff(item.diff)}</span></span>`;
    }
    return `<span class="diff-chip behind" title="1位との差">1位と <span class="time">+${fmtDiff(item.diff)}</span></span>`;
}

/**
 * 着順バッジ。上りタイムと同じ1走の着順を表す。
 * 数値以外に 落（落車）/ 故（故障）が入るため、そのまま「◯着」と繋げない。
 */
const CHAKU_LABELS = { '落': '落車', '故': '故障' };

function chakuBadge(raw) {
    const s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (!s) return '<span class="chaku chaku-none" title="この上りタイムを出した走りの着順">—</span>';
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        const cls = n <= 3 ? `chaku-${n}` : 'chaku-other';
        return `<span class="chaku ${cls}" title="この上りタイムを出した走りの着順">${escapeHtml(s)}着</span>`;
    }
    return `<span class="chaku chaku-x" title="この上りタイムを出した走りの着順">${escapeHtml(CHAKU_LABELS[s] || s)}</span>`;
}

const RANK_MARKS = { 1: '1st', 2: '2nd', 3: '3rd' };

function rankMark(rank) {
    return RANK_MARKS[rank] || `${rank}th`;
}

// ===== タイム数直線 =====

/**
 * レース単位のタイム数直線。
 * 上りタイムを横軸（左=速い / 右=遅い）に配置し、速い選手がどれだけ
 * 離れているかを視覚的に見せる。位置決めは描画後に layoutTimelines() が行う。
 */
function renderTimeline(ranked, pickedSet) {
    if (ranked.length === 0) return '';

    const times = ranked.map((x) => x.t);
    const min = Math.min(...times);
    const max = Math.max(...times);

    const markers = ranked
        .map((item) => {
            const isPickup = pickedSet.has(item.racer['車番']);
            const cls = isPickup ? 'is-pickup' : 'is-dimmed';
            return `<div class="tl-marker ${cls}" data-t="${item.t}" title="${escapeHtml(item.racer['選手名'])} ${fmtTime(item.t)}">
                <div class="tl-stem"></div>
                <div class="tl-badge-wrap">
                    ${carBadge(item.racer['車番'])}
                    <span class="tl-time time">${fmtTime(item.t)}</span>
                </div>
            </div>`;
        })
        .join('');

    return `<div class="timeline-block">
        <div class="timeline-caption">
            <span>◀ 速い</span>
            <span>遅い ▶</span>
        </div>
        <div class="timeline" data-min="${min}" data-max="${max}">
            <div class="timeline-track"></div>
            <div class="timeline-end left"><span class="time">${fmtTime(min)}</span></div>
            <div class="timeline-end right"><span class="time">${fmtTime(max)}</span></div>
            ${markers}
        </div>
    </div>`;
}

/**
 * 数直線のマーカーを実寸で配置する。
 * 重なるマーカーは下の段（レーン）へ送り、375px幅でも潰れないようにする。
 */
function layoutTimelines(root) {
    const narrow = window.innerWidth <= 768;
    const MARKER_W = narrow ? 36 : 44;    // マーカー同士の最小間隔（横）
    const MARKER_BODY = narrow ? 42 : 46; // バッジ + タイム表記の高さ
    const LANE_GAP = 4;                   // 段と段のすき間
    const LANE_H = MARKER_BODY + LANE_GAP; // 上の段のタイム表記が下の段のバッジに被らない高さ
    const INSET = narrow ? 20 : 24;       // 端でバッジが切れないための余白
    const TRACK_TOP = 16;                 // 軸線の位置

    root.querySelectorAll('.timeline').forEach((tl) => {
        const markers = Array.from(tl.querySelectorAll('.tl-marker'));
        if (markers.length === 0) return;

        const width = tl.clientWidth;
        if (width === 0) return;

        const min = parseFloat(tl.dataset.min);
        const max = parseFloat(tl.dataset.max);
        const usable = Math.max(width - INSET * 2, 1);
        const span = max - min;

        // タイム昇順（= 左から右）に並べ替えてからレーンを割り当てる
        const sorted = markers
            .map((el) => ({ el, t: parseFloat(el.dataset.t) }))
            .sort((a, b) => a.t - b.t);

        const laneLastX = [];
        let maxLane = 0;

        for (const m of sorted) {
            const ratio = span > 0 ? (m.t - min) / span : 0.5;
            const x = INSET + ratio * usable;

            let lane = 0;
            while (lane < laneLastX.length && x - laneLastX[lane] < MARKER_W) {
                lane++;
            }
            laneLastX[lane] = x;
            if (lane > maxLane) maxLane = lane;

            m.el.style.left = `${x}px`;
            m.el.style.top = `${TRACK_TOP}px`;
            m.el.style.transform = 'translateX(-50%)';
            m.el.querySelector('.tl-stem').style.height = `${4 + lane * LANE_H}px`;
        }

        tl.style.height = `${TRACK_TOP + maxLane * LANE_H + 4 + MARKER_BODY}px`;
    });
}

// ===== セクション描画 =====

function renderPickup(data, topN) {
    const container = document.getElementById('pickupContainer');
    const parts = [];

    for (const meet of data) {
        const head = meetHeader(meet);

        if (!meetHasData(meet)) {
            parts.push(`<div class="meet">
                ${head}
                <div class="meet-body">
                    <div class="no-data">
                        <strong>前走の上りデータなし</strong>
                        ${Number(meet.race_day) === 1
                            ? '初日（1日目）のため前走がありません。'
                            : '前走の上りが記録されている選手がいません。'}
                    </div>
                </div>
            </div>`);
            continue;
        }

        const cards = [];
        for (const race of sortedRaces(meet)) {
            const ranked = rankRacers(race.racers || []);
            if (ranked.length === 0) continue;
            const picked = pickTop(ranked, topN);

            const rows = picked
                .map((item) => {
                    const r = item.racer;
                    return `<div class="pickup-row rank-${item.rank}">
                        <span class="rank-mark">${rankMark(item.rank)}</span>
                        ${carBadge(r['車番'])}
                        <span class="pickup-name">
                            <span class="nm">${escapeHtml(r['選手名'])}</span>
                            <span class="meta">${escapeHtml(r['級班'] || '')} ${escapeHtml(r['脚質'] || '')}${
                                r['競走得点'] ? ' ' + escapeHtml(r['競走得点']) : ''
                            }</span>
                        </span>
                        <span class="pickup-time">
                            <span class="t-row">
                                <span class="t time">${fmtTime(item.t)}</span>
                                ${chakuBadge(r['前日着'])}
                            </span>
                            ${diffChip(item)}
                        </span>
                    </div>`;
                })
                .join('');

            cards.push(`<div class="pickup-card">
                <div class="pickup-card-head">
                    <span class="pickup-race-num">${escapeHtml(race.race_num)}R</span>
                    <span class="pickup-place">${escapeHtml(meet.place)}</span>
                    <span class="pickup-race-name">${escapeHtml(race.race_name || '')}</span>
                </div>
                ${rows}
            </div>`);
        }

        parts.push(`<div class="meet">
            ${head}
            <div class="meet-body">
                <div class="pickup-grid">${cards.join('')}</div>
            </div>
        </div>`);
    }

    container.innerHTML = parts.join('');
}

function renderAllRaces(data, topN) {
    const container = document.getElementById('racesContainer');
    const parts = [];

    for (const meet of data) {
        const hasData = meetHasData(meet);
        const blocks = [];

        for (const race of sortedRaces(meet)) {
            const racers = race.racers || [];
            const ranked = rankRacers(racers);
            const picked = pickTop(ranked, topN);
            const pickedSet = new Set(picked.map((x) => x.racer['車番']));
            const rankByCar = new Map(ranked.map((x) => [x.racer['車番'], x]));

            const body = ranked.length > 0
                ? renderTimeline(ranked, pickedSet)
                : `<div class="no-data">このレースには前走の上り記録がありません。</div>`;

            const rows = racers
                .slice()
                .sort((a, b) => Number(a['車番']) - Number(b['車番']))
                .map((r) => {
                    const item = rankByCar.get(r['車番']);
                    const isPickup = pickedSet.has(r['車番']);
                    const agari = item
                        ? `<span class="time">${fmtTime(item.t)}</span>`
                        : '<span class="is-empty">—</span>';
                    return `<tr class="${isPickup ? 'is-pickup' : ''}">
                        <td class="td-car">${carBadge(r['車番'])}</td>
                        <td class="td-name">${escapeHtml(r['選手名'])}</td>
                        <td>${escapeHtml(r['級班'] || '')}</td>
                        <td>${escapeHtml(r['脚質'] || '')}</td>
                        <td class="time">${escapeHtml(r['競走得点'] ?? '')}</td>
                        <td class="td-agari">${agari}</td>
                        <td>${chakuBadge(r['前日着'])}</td>
                        <td>${item ? item.rank : '<span class="is-empty">—</span>'}</td>
                    </tr>`;
                })
                .join('');

            blocks.push(`<div class="race-block">
                <div class="race-block-head">
                    <span class="rn">${escapeHtml(race.race_num)}R</span>
                    <span class="nm">${escapeHtml(race.race_name || '')}</span>
                    ${race.lines ? `<span class="lines">並び ${escapeHtml(race.lines)}</span>` : ''}
                </div>
                ${body}
                <details class="races">
                    <summary>出走表を開く</summary>
                    <div class="races-body">
                        <div class="table-wrapper">
                            <table class="racer-table">
                                <thead>
                                    <tr>
                                        <th>車番</th>
                                        <th>選手名</th>
                                        <th>級班</th>
                                        <th>脚質</th>
                                        <th>得点</th>
                                        <th>前走上り</th>
                                        <th>前走着</th>
                                        <th>順位</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </details>
            </div>`);
        }

        parts.push(`<div class="meet">
            ${meetHeader(meet)}
            <div class="meet-body">
                ${hasData ? '' : `<div class="no-data"><strong>前走の上りデータなし</strong>${
                    Number(meet.race_day) === 1
                        ? '初日（1日目）のため前走がありません。出走表のみ表示します。'
                        : '前走の上りが記録されている選手がいません。'
                }</div>`}
                ${blocks.join('')}
            </div>
        </div>`);
    }

    container.innerHTML = parts.join('');
    layoutTimelines(container);
}

function meetHeader(meet) {
    return `<div class="meet-header">
        <span class="meet-place">${escapeHtml(meet.place)}</span>
        ${meet.grade ? `<span class="meet-grade">${escapeHtml(meet.grade)}</span>` : ''}
        <span class="meet-day">${escapeHtml(meet.race_day)}日目</span>
        <span class="meet-day">${(meet.races || []).length}R</span>
    </div>`;
}

function sortedRaces(meet) {
    return (meet.races || []).slice().sort((a, b) => Number(a.race_num) - Number(b.race_num));
}

// ===== ステータス =====

function setStatus(msg, kind) {
    const bar = document.getElementById('statusBar');
    bar.className = 'status-bar' + (kind ? ' ' + kind : '');
    bar.innerHTML = msg;
}

function clearOutput() {
    document.getElementById('pickupContainer').innerHTML = '';
    document.getElementById('racesContainer').innerHTML = '';
}

// ===== メイン =====

function render() {
    if (!currentData) return;
    const topN = Number(document.getElementById('topNSelect').value);
    renderPickup(currentData, topN);
    renderAllRaces(currentData, topN);
}

async function load(requestedISO) {
    const dateInput = document.getElementById('dateInput');
    const reloadBtn = document.getElementById('reloadBtn');
    const seq = ++loadSeq;
    reloadBtn.disabled = true;
    setStatus('読み込み中…');
    clearOutput();

    try {
        const { iso, data, backtracked } = await loadWithFallback(requestedISO);
        if (seq !== loadSeq) return; // より新しい読み込みが始まっている
        currentData = data;
        dateInput.value = iso;

        const withData = data.filter(meetHasData).length;
        let msg = `<strong>${formatJP(iso)}</strong> の開催 ${data.length} 場（前走上りあり ${withData} 場）`;
        if (backtracked > 0) {
            msg =
                `${formatJP(requestedISO)} にデータがないため、${backtracked} 日さかのぼって ` + msg;
            setStatus(msg, 'warning');
        } else {
            setStatus(msg);
        }
        render();
    } catch (e) {
        if (seq !== loadSeq) return;
        currentData = null;
        clearOutput();
        setStatus(escapeHtml(e.message), 'error');
    } finally {
        if (seq === loadSeq) reloadBtn.disabled = false;
    }
}

function init() {
    const dateInput = document.getElementById('dateInput');
    const topNSelect = document.getElementById('topNSelect');

    dateInput.value = toISO(new Date());

    dateInput.addEventListener('change', () => {
        if (dateInput.value) load(dateInput.value);
    });
    topNSelect.addEventListener('change', render);
    document.getElementById('reloadBtn').addEventListener('click', () => {
        dayCache.clear();
        load(dateInput.value);
    });
    document.getElementById('prevDay').addEventListener('click', () => {
        load(addDays(dateInput.value, -1));
    });
    document.getElementById('nextDay').addEventListener('click', () => {
        load(addDays(dateInput.value, 1));
    });

    // 幅が変わったら数直線を組み直す
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            layoutTimelines(document.getElementById('racesContainer'));
        }, 150);
    });

    // 出走表を開いたときに数直線がずれないよう再計算
    document.getElementById('racesContainer').addEventListener('toggle', (e) => {
        if (e.target.tagName === 'DETAILS') {
            layoutTimelines(document.getElementById('racesContainer'));
        }
    }, true);

    load(dateInput.value);
}

document.addEventListener('DOMContentLoaded', init);
