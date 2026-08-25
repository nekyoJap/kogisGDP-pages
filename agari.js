/**
 * 上りレーダー - 前日の上りタイム抽出ビュー
 * kogisGDP - 競輪AI予想システム
 *
 * データ元: https://storage.googleapis.com/asilogkeirin/race_info/race_info_YYYYMMDD.json
 * データのキー「前日上り」＝その選手が前日に走ったレースのゴール前200mのタイム・秒。
 * これを昇順に並べ、レースごとの上位N人を抽出する。同じ走りの着順が「前日着」。
 */

const DATA_BASE = 'https://storage.googleapis.com/asilogkeirin/race_info/race_info_';

/** 何日前まで自動でさかのぼるか */
const MAX_BACKTRACK_DAYS = 7;

/** 日付ごとの取得結果キャッシュ */
const dayCache = new Map();

/** 現在描画中のデータ */
let currentData = null;

/** 前日のデータ。各選手が前日に走ったレースの顔ぶれを知るために使う */
let prevDayData = null;

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

/** 表示と同じ丸め（小数第1位）。0.3 と表示されるものは 0.3 として扱う */
function roundDiff(v) {
    return Math.round(v * 10) / 10;
}

/**
 * そのレースの1位が2位をどれだけ離しているか。
 * 2位がいない（全員同タイム / 有効なタイムが1人）場合は null。
 */
function leadOfRace(ranked) {
    if (ranked.length === 0) return null;
    const d = ranked[0].diff;
    return d === null || d === undefined ? null : roundDiff(d);
}

/** 1位のリードがしきい値以上か。しきい値0は絞り込みなし */
function meetsLead(ranked, minLead) {
    if (minLead <= 0) return ranked.length > 0;
    const lead = leadOfRace(ranked);
    return lead !== null && lead >= minLead;
}

/** 1位に並んでいる人数（同着なら2以上） */
function tieCountAtTop(ranked) {
    return ranked.filter((x) => x.rank === 1).length;
}

/**
 * 1位の同着人数が許容範囲か。
 * 同着が多いほど「抜けている」とは言えなくなるため、既定では3人以上を除く。
 * maxTie が 0 以下なら制限なし。
 */
function meetsTie(ranked, maxTie) {
    if (maxTie <= 0) return true;
    return tieCountAtTop(ranked) <= maxTie;
}

/** 上位N人（同順位は全員含む） */
function pickTop(ranked, topN) {
    return ranked.filter((x) => x.rank <= topN);
}

// ===== 前日レース内での相対評価 =====

/**
 * 選手の同一性キー。日をまたいで同じ選手を突き合わせるために使う。
 * 同姓同名を避けるため府県と期別も含める。
 */
function racerKey(r) {
    return [r['選手名'], r['府県'] || '', r['期別'] || ''].join('|');
}

/**
 * 前日レース内での上り順位を求める。
 *
 * バケットは「今日の出走表＋各選手の前日上り」しか持たないので、前日レースの
 * 顔ぶれは前日ファイルの出走表から取り、その全員の上りタイムを今日のファイルの
 * 「前日上り」から引いて復元する。前日に同じレースを走った選手は基本的に今日も
 * 同じ開催に出走しているため、この方法で揃う。
 *
 * 戻り値: Map<racerKey, {rank, size, best, t}>
 */
function buildPrevRaceRanks(todayData, prevData) {
    const ranks = new Map();
    if (!prevData) return ranks;

    // 今日のファイルから「各選手の前日上り」を集める
    const agari = new Map();
    for (const meet of todayData) {
        for (const race of meet.races || []) {
            for (const r of race.racers || []) {
                const t = parseAgari(r['前日上り']);
                if (t !== null) agari.set(racerKey(r), t);
            }
        }
    }

    // 前日ファイルのレース単位で、メンバーのタイムを引いて順位づけ
    for (const meet of prevData) {
        for (const race of meet.races || []) {
            const members = (race.racers || []).map(racerKey);
            const times = members
                .map((k) => agari.get(k))
                .filter((t) => t !== undefined);
            // 復元できた人数が少なすぎると順位の意味がないので除く
            if (times.length < 4) continue;
            const sorted = times.slice().sort((a, b) => a - b);
            const best = sorted[0];
            for (const k of members) {
                const t = agari.get(k);
                if (t === undefined) continue;
                ranks.set(k, {
                    rank: sorted.indexOf(t) + 1,
                    size: sorted.length,
                    best,
                    t,
                });
            }
        }
    }
    return ranks;
}

/** 脚余し判定: 前日レースで上り最速だったのに着順が振るわなかった */
const LEG_CHAKU_MIN = 5;   // 何着以下を「振るわなかった」とみなすか

function isLegLeftover(racer, ranks) {
    const info = ranks.get(racerKey(racer));
    if (!info || info.rank !== 1) return false;
    const z = String(racer['前日着'] ?? '').trim();
    if (!/^\d+$/.test(z)) return false;
    return Number(z) >= LEG_CHAKU_MIN;
}

/** その開催に前日の上りデータがあるか */
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

/** カード見出しに出す「1位が2位を離した差」 */
function leadChip(ranked) {
    const lead = leadOfRace(ranked);
    if (lead === null) return '';
    return `<span class="lead-chip" title="1位が2位を離した差">リード <span class="time">${lead.toFixed(1)}</span></span>`;
}

/**
 * 着順バッジ。上りタイムと同じ1走の着順を表す。
 * 数値以外に 落（落車）/ 故（故障）が入るため、そのまま「◯着」と繋げない。
 */
const CHAKU_LABELS = { '落': '落車', '故': '故障' };

function chakuBadge(raw, withLabel) {
    const s = String(raw === null || raw === undefined ? '' : raw).trim();
    const t = 'この上りタイムを出した走り（前日）の着順';
    const lb = withLabel ? '<span class="chaku-label">前日着</span>' : '';
    if (!s) return `<span class="chaku chaku-none" title="${t}">${lb}—</span>`;
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        const cls = n <= 3 ? `chaku-${n}` : 'chaku-other';
        return `<span class="chaku ${cls}" title="${t}">${lb}${escapeHtml(s)}着</span>`;
    }
    return `<span class="chaku chaku-x" title="${t}">${lb}${escapeHtml(CHAKU_LABELS[s] || s)}</span>`;
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

function renderPickup(data, topN, minLead, maxTie) {
    const container = document.getElementById('pickupContainer');
    const parts = [];

    for (const meet of data) {
        const head = meetHeader(meet);

        if (!meetHasData(meet)) {
            parts.push(`<div class="meet">
                ${head}
                <div class="meet-body">
                    <div class="no-data">
                        <strong>前日の上りデータなし</strong>
                        ${Number(meet.race_day) === 1
                            ? '初日（1日目）のため前日の成績がありません。'
                            : '前日の上りが記録されている選手がいません。'}
                    </div>
                </div>
            </div>`);
            continue;
        }

        const cards = [];
        for (const race of sortedRaces(meet)) {
            const ranked = rankRacers(race.racers || []);
            if (ranked.length === 0) continue;
            if (!meetsLead(ranked, minLead)) continue;
            if (!meetsTie(ranked, maxTie)) continue;
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
                                ${chakuBadge(r['前日着'], true)}
                            </span>
                        </span>
                    </div>`;
                })
                .join('');

            const tied = tieCountAtTop(ranked);
            cards.push(`<div class="pickup-card">
                <div class="pickup-card-head">
                    <span class="pickup-race-num">${escapeHtml(race.race_num)}R</span>
                    <span class="pickup-place">${escapeHtml(meet.place)}</span>
                    <span class="pickup-race-name">${escapeHtml(race.race_name || '')}</span>
                    ${leadChip(ranked)}
                    ${tied > 1 ? `<span class="tie-note" title="1位が同着のため単独で抜けた選手はいません">同着${tied}人</span>` : ''}
                </div>
                ${rows}
            </div>`);
        }

        parts.push(`<div class="meet">
            ${head}
            <div class="meet-body">
                ${cards.length
                    ? `<div class="pickup-grid">${cards.join('')}</div>`
                    : `<div class="no-data"><strong>該当レースなし</strong>条件（1位のリード <span class="time">${minLead.toFixed(1)}</span> 秒以上${maxTie > 0 ? `／1位の同着 ${maxTie} 人まで` : ''}）に合うレースはありません。</div>`}
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
                : `<div class="no-data">このレースには前日の上り記録がありません。</div>`;

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
                                        <th>前日上り</th>
                                        <th>前日着</th>
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

        // 開催が複数あるときは畳んでおく。1開催だけなら開いた状態で出す
        const openAttr = data.length <= 1 ? ' open' : '';
        parts.push(`<div class="meet">
            <details class="meet-fold"${openAttr}>
            <summary>${meetHeader(meet)}<span class="fold-hint">${(meet.races || []).length}レース</span></summary>
            <div class="meet-body">
                ${hasData ? '' : `<div class="no-data"><strong>前日の上りデータなし</strong>${
                    Number(meet.race_day) === 1
                        ? '初日（1日目）のため前日の成績がありません。出走表のみ表示します。'
                        : '前日の上りが記録されている選手がいません。'
                }</div>`}
                ${blocks.join('')}
            </div>
            </details>
        </div>`);
    }

    container.innerHTML = parts.join('');
    layoutTimelines(container);
}

/**
 * 脚余しセクション。前日レースで上り最速だったのに着順が振るわなかった選手を、
 * 今日どのレースに乗るかとあわせて並べる。
 */
function renderLegLeftover(data, ranks) {
    const container = document.getElementById('legContainer');
    const note = document.getElementById('legNote');

    if (!prevDayData) {
        note.textContent = '前日のデータが取得できないため、この抽出は行えません。';
        container.innerHTML = '';
        return;
    }

    const rows = [];
    for (const meet of data) {
        for (const race of sortedRaces(meet)) {
            for (const r of race.racers || []) {
                if (!isLegLeftover(r, ranks)) continue;
                const info = ranks.get(racerKey(r));
                rows.push({ meet, race, racer: r, info });
            }
        }
    }

    note.textContent = rows.length
        ? `${rows.length} 人。前日レースで上り最速ながら ${LEG_CHAKU_MIN} 着以下だった選手です。`
        : `該当なし。前日レースで上り最速ながら ${LEG_CHAKU_MIN} 着以下だった選手はいません。`;

    if (rows.length === 0) {
        container.innerHTML = '';
        return;
    }

    const cards = rows
        .map(({ meet, race, racer, info }) => `<div class="leg-card">
            <div class="leg-head">
                <span class="pickup-race-num">${escapeHtml(race.race_num)}R</span>
                <span class="pickup-place">${escapeHtml(meet.place)}</span>
                <span class="pickup-race-name">${escapeHtml(race.race_name || '')}</span>
            </div>
            <div class="pickup-row">
                ${carBadge(racer['車番'])}
                <span class="pickup-name">
                    <span class="nm">${escapeHtml(racer['選手名'])}</span>
                    <span class="meta">${escapeHtml(racer['級班'] || '')} ${escapeHtml(racer['脚質'] || '')}${
                        racer['競走得点'] ? ' ' + escapeHtml(racer['競走得点']) : ''
                    }</span>
                </span>
                <span class="pickup-time">
                    <span class="t-row">
                        <span class="t time">${fmtTime(info.t)}</span>
                        ${chakuBadge(racer['前日着'], true)}
                    </span>
                    <span class="diff-chip lead" title="前日に走ったレースの中での上り順位">前日レース上り1位</span>
                </span>
            </div>
        </div>`)
        .join('');

    container.innerHTML = `<div class="pickup-grid">${cards}</div>`;
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
    document.getElementById('legContainer').innerHTML = '';
    document.getElementById('legNote').textContent = '';
    document.getElementById('racesContainer').innerHTML = '';
}

// ===== メイン =====

/** 開催フィルタを適用した表示対象 */
function filteredData() {
    if (!currentData) return [];
    const sel = document.getElementById('meetSelect').value;
    if (!sel) return currentData;
    const hit = currentData.filter((m) => m.place === sel);
    return hit.length ? hit : currentData;
}

/** 開催セレクタの中身を今のデータで作り直す。選択中の開催が残っていれば維持する */
function rebuildMeetOptions() {
    const sel = document.getElementById('meetSelect');
    const keep = sel.value;
    const places = currentData ? currentData.map((m) => m.place) : [];
    sel.innerHTML = '<option value="">すべての開催</option>' +
        places.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    sel.value = places.includes(keep) ? keep : '';
}

/** タブ切り替え。数直線は表示中でないと幅が0になるので、開いた時に組み直す */
function switchTab(name) {
    document.querySelectorAll('#tabs .tab').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
        p.hidden = p.dataset.panel !== name;
    });
    if (name === 'races') {
        layoutTimelines(document.getElementById('racesContainer'));
    }
}

function activeTab() {
    const b = document.querySelector('#tabs .tab.is-active');
    return b ? b.dataset.tab : 'pickup';
}

function updateTabCounts() {
    const n = (sel) => document.querySelectorAll(sel).length;
    document.getElementById('countPickup').textContent = n('#pickupContainer .pickup-card');
    document.getElementById('countLeg').textContent = n('#legContainer .leg-card');
    document.getElementById('countRaces').textContent = n('#racesContainer .race-block');
}

function currentMinLead() {
    return Number(document.getElementById('minLeadSelect').value);
}

function currentMaxTie() {
    return Number(document.getElementById('maxTieSelect').value);
}

function render() {
    if (!currentData) return;
    const topN = Number(document.getElementById('topNSelect').value);
    const minLead = currentMinLead();
    const maxTie = currentMaxTie();
    const view = filteredData();
    const ranks = buildPrevRaceRanks(currentData, prevDayData);
    renderPickup(view, topN, minLead, maxTie);
    renderLegLeftover(view, ranks);
    renderAllRaces(view, topN);
    updatePickupSummary(view, minLead, maxTie);
    updateTabCounts();
    // 非表示のまま描画された数直線は幅0で組まれるため、表示中のタブだけ組み直す
    if (activeTab() === 'races') {
        layoutTimelines(document.getElementById('racesContainer'));
    }
}

/** ピックアップ見出しの横に、絞り込み結果の件数を出す */
function updatePickupSummary(data, minLead, maxTie) {
    const el = document.getElementById('pickupSummary');
    if (!el || !data) return;
    let total = 0;
    let hit = 0;
    for (const meet of data) {
        if (!meetHasData(meet)) continue;
        for (const race of meet.races || []) {
            const ranked = rankRacers(race.racers || []);
            if (ranked.length === 0) continue;
            total++;
            if (meetsLead(ranked, minLead) && meetsTie(ranked, maxTie)) hit++;
        }
    }
    const conds = [];
    if (minLead > 0) conds.push(`1位のリード ${minLead.toFixed(1)} 秒以上`);
    if (maxTie > 0) conds.push(maxTie === 1 ? '単独1位のみ' : `1位の同着 ${maxTie} 人まで`);
    el.textContent = conds.length
        ? `${total} レース中 ${hit} レースが該当（${conds.join('／')}）`
        : `${total} レース（絞り込みなし）`;
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

        // 脚余しの判定に使う前日データ。取れなくても本体の表示は続ける
        prevDayData = null;
        try {
            prevDayData = await fetchDay(addDays(iso, -1));
        } catch (e) {
            prevDayData = null;
        }
        if (seq !== loadSeq) return;
        rebuildMeetOptions();
        dateInput.value = iso;

        const withData = data.filter(meetHasData).length;
        let msg = `<strong>${formatJP(iso)}</strong> の開催 ${data.length} 場（前日上りあり ${withData} 場）`;
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
    document.getElementById('minLeadSelect').addEventListener('change', render);
    document.getElementById('maxTieSelect').addEventListener('change', render);
    document.getElementById('meetSelect').addEventListener('change', render);
    document.getElementById('tabs').addEventListener('click', (e) => {
        const b = e.target.closest('.tab');
        if (b) switchTab(b.dataset.tab);
    });
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
