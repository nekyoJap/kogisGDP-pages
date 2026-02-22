/**
 * 出走表 × 選手評価 マージビュー
 * kogisGDP - 競輪AI予想システム
 */

// グローバルデータ
let raceData = null;
let evalData = null;

// モックデータ（出走表）
const mockRaceData = {
    raceInfo: {
        date: "2025-12-30",
        venue: "平塚",
        raceNumber: 11,
        raceName: "KEIRINグランプリ2025",
        grade: "GP",
        startTime: "16:30",
        prize1st: 140000000
    },
    entries: [
        { frameNumber: 1, carNumber: 1, name: "郡司 浩平", prefecture: "神奈川", age: 35, term: 99, rank: "SS", style: "両", gear: 3.92, score: 115.23, winRate: 40.9, top2Rate: 59.0, top3Rate: 63.6, prediction: "△" },
        { frameNumber: 2, carNumber: 2, name: "寺崎 浩平", prefecture: "福井", age: 31, term: 117, rank: "SS", style: "逃", gear: 3.92, score: 117.58, winRate: 11.7, top2Rate: 47.0, top3Rate: 64.7, prediction: "" },
        { frameNumber: 3, carNumber: 3, name: "眞杉 匠", prefecture: "栃木", age: 26, term: 113, rank: "SS", style: "逃", gear: 3.92, score: 116.37, winRate: 29.4, top2Rate: 47.0, top3Rate: 52.9, prediction: "注" },
        { frameNumber: 4, carNumber: 4, name: "南 修二", prefecture: "大阪", age: 44, term: 88, rank: "SS", style: "追", gear: 3.92, score: 117.40, winRate: 40.0, top2Rate: 55.0, top3Rate: 70.0, prediction: "" },
        { frameNumber: 4, carNumber: 5, name: "吉田 拓矢", prefecture: "茨城", age: 30, term: 107, rank: "SS", style: "両", gear: 3.92, score: 118.61, winRate: 28.5, top2Rate: 35.7, top3Rate: 64.2, prediction: "×" },
        { frameNumber: 5, carNumber: 6, name: "阿部 拓真", prefecture: "宮城", age: 35, term: 107, rank: "SS", style: "両", gear: 3.92, score: 109.00, winRate: 21.7, top2Rate: 34.7, top3Rate: 52.1, prediction: "" },
        { frameNumber: 5, carNumber: 7, name: "脇本 雄太", prefecture: "福井", age: 36, term: 94, rank: "SS", style: "逃", gear: 3.92, score: 116.20, winRate: 60.0, top2Rate: 70.0, top3Rate: 70.0, prediction: "◎" },
        { frameNumber: 6, carNumber: 8, name: "嘉永 泰斗", prefecture: "熊本", age: 27, term: 113, rank: "SS", style: "逃", gear: 3.92, score: 117.14, winRate: 28.5, top2Rate: 42.8, top3Rate: 57.1, prediction: "▲" },
        { frameNumber: 6, carNumber: 9, name: "古性 優作", prefecture: "大阪", age: 34, term: 100, rank: "SS", style: "両", gear: 3.92, score: 118.70, winRate: 28.5, top2Rate: 42.8, top3Rate: 61.9, prediction: "○" }
    ],
    lineUp: {
        comment: "近畿の並びは脇本が番手。寺崎の引き出しで３年ぶりＶ奪還。眞杉に託す吉田や、混戦を捲る郡司が逆転候補。"
    }
};

// モックデータ（選手評価）- CSVから抽出した9選手分
const mockEvalData = [
    { name: "郡司 浩平", age: 35, rank: "S級S班", prefecture: "神奈川", home: "川崎", term: "99期", type1: "自在", type2: "", leadWill: "◯", banteExp: "◯", keepLead: "◯", flyAttach: "✕", parallel: "✕", sideResponse: "◯", speed: "◯", attack: "◎", stamina: "◯", startEval: "◯", soloMove: "◯", keirinIQ: "◯", runaway: "◯", goodBank: "", badBank: "", badSeason: "", comment: "" },
    { name: "寺崎 浩平", age: 31, rank: "S級S班", prefecture: "福井", home: "福井", term: "117期", type1: "先行", type2: "捲", leadWill: "◯", banteExp: "◯", keepLead: "◯", flyAttach: "✕", parallel: "✕", sideResponse: "△", speed: "◎", attack: "◎", stamina: "◯", startEval: "◯", soloMove: "✕", keirinIQ: "◯", runaway: "✕", goodBank: "福井", badBank: "", badSeason: "", comment: "SS班を代表する先行選手。実力は皆御存知の通り。脇本などがつく時は逃げるが力が劣る場合は捲りに構えるときも。" },
    { name: "眞杉 匠", age: 26, rank: "S級S班", prefecture: "栃木", home: "宇都宮", term: "113期", type1: "自在", type2: "", leadWill: "◯", banteExp: "◯", keepLead: "◯", flyAttach: "◯", parallel: "◯", sideResponse: "◯", speed: "◯", attack: "◎", stamina: "◯", startEval: "◯", soloMove: "◯", keirinIQ: "◯", runaway: "◯", goodBank: "", badBank: "", badSeason: "", comment: "" },
    { name: "南 修二", age: 44, rank: "S級S班", prefecture: "大阪", home: "岸和田", term: "88期", type1: "追い込み", type2: "", leadWill: "✕", banteExp: "◯", keepLead: "◯", flyAttach: "✕", parallel: "✕", sideResponse: "◯", speed: "◯", attack: "◯", stamina: "◯", startEval: "◯", soloMove: "◯", keirinIQ: "◯", runaway: "◯", goodBank: "", badBank: "", badSeason: "", comment: "" },
    { name: "吉田 拓矢", age: 30, rank: "S級S班", prefecture: "茨城", home: "取手", term: "107期", type1: "自在", type2: "", leadWill: "△", banteExp: "◯", keepLead: "◯", flyAttach: "✕", parallel: "✕", sideResponse: "△", speed: "◯", attack: "◯", stamina: "◯", startEval: "◯", soloMove: "✕", keirinIQ: "◯", runaway: "✕", goodBank: "", badBank: "", badSeason: "", comment: "" },
    { name: "阿部 拓真", age: 34, rank: "S級S班", prefecture: "宮城", home: "", term: "107期", type1: "自在", type2: "", leadWill: "◯", banteExp: "◯", keepLead: "◯", flyAttach: "◯", parallel: "✕", sideResponse: "◯", speed: "△", attack: "△", stamina: "△", startEval: "◯", soloMove: "◯", keirinIQ: "◯", runaway: "◯", goodBank: "", badBank: "", badSeason: "", comment: "" },
    { name: "脇本 雄太", age: 36, rank: "S級S班", prefecture: "福井", home: "福井", term: "94期", type1: "捲", type2: "先行", leadWill: "◯", banteExp: "◯", keepLead: "✕", flyAttach: "✕", parallel: "✕", sideResponse: "✕", speed: "◎", attack: "◯", stamina: "◯", startEval: "✕", soloMove: "✕", keirinIQ: "◯", runaway: "✕", goodBank: "", badBank: "", badSeason: "", comment: "" },
    { name: "嘉永 泰斗", age: 27, rank: "S級S班", prefecture: "熊本", home: "熊本", term: "113期", type1: "自在", type2: "", leadWill: "◯", banteExp: "◯", keepLead: "◯", flyAttach: "✕", parallel: "✕", sideResponse: "△", speed: "◯", attack: "◯", stamina: "△", startEval: "✕", soloMove: "✕", keirinIQ: "◯", runaway: "✕", goodBank: "函館", badBank: "", badSeason: "", comment: "" },
    { name: "古性 優作", age: 34, rank: "S級S班", prefecture: "大阪", home: "", term: "100期", type1: "自在", type2: "", leadWill: "△", banteExp: "◯", keepLead: "◯", flyAttach: "✕", parallel: "◯", sideResponse: "◯", speed: "◯", attack: "◯", stamina: "◯", startEval: "◯", soloMove: "◯", keirinIQ: "◯", runaway: "◯", goodBank: "", badBank: "", badSeason: "", comment: "自力は厳しくなっている。と本人コメントあり" }
];

// CSVパーサー
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // ヘッダー行を取得（BOM除去）
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    const headers = headerLine.split(',').map(h => h.trim());

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;

        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        data.push(row);
    }
    return data;
}

// CSVの1行をパース（カンマ区切り、クォート対応）
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// 選手名を正規化（スペース除去）
function normalizeName(name) {
    return name.replace(/\s+/g, '').trim();
}

// 選手評価データから選手を検索
function findEvaluation(playerName, evalDataList) {
    const normalizedName = normalizeName(playerName);
    return evalDataList.find(e => normalizeName(e['選手名'] || e.name || '') === normalizedName);
}

// レース情報を更新
function updateRaceInfo(data) {
    if (!data || !data.raceInfo) return;

    const info = data.raceInfo;
    document.getElementById('raceGrade').textContent = info.grade || 'GP';
    document.getElementById('raceName').textContent = info.raceName || '';
    document.getElementById('raceDate').textContent = formatDate(info.date);
    document.getElementById('raceVenue').textContent = info.venue + '競輪';
    document.getElementById('raceNumber').textContent = info.raceNumber + 'R';
    document.getElementById('raceTime').textContent = '発走 ' + info.startTime;

    if (data.lineUp && data.lineUp.comment) {
        document.getElementById('lineComment').textContent = data.lineUp.comment;
    }
}

// 日付フォーマット
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// テーブルを描画
function renderTable() {
    const tbody = document.getElementById('mergeTableBody');
    tbody.innerHTML = '';

    if (!raceData || !raceData.entries) {
        tbody.innerHTML = '<tr><td colspan="17" class="no-data">出走表データを読み込んでください</td></tr>';
        return;
    }

    raceData.entries.forEach(entry => {
        const row = document.createElement('tr');
        row.className = `frame-${entry.frameNumber}`;
        row.dataset.carNumber = entry.carNumber;

        // 評価データを検索
        let evalInfo = null;
        if (evalData && evalData.length > 0) {
            evalInfo = findEvaluation(entry.name, evalData);
        }

        // 出走表データ
        row.innerHTML = `
            <td class="td-prediction">${entry.prediction || ''}</td>
            <td class="td-frame frame-${entry.frameNumber}">${entry.frameNumber}</td>
            <td class="td-car car-${entry.carNumber}">${entry.carNumber}</td>
            <td class="td-name">${entry.name}</td>
            <td>${entry.prefecture}</td>
            <td class="td-rank">${entry.rank}</td>
            <td class="td-style">${entry.style}</td>
            <td class="td-score">${entry.score.toFixed(2)}</td>
            <td class="td-rate">${entry.winRate.toFixed(1)}%</td>
            ${renderEvalCells(evalInfo)}
        `;

        row.addEventListener('click', () => showPlayerModal(entry, evalInfo));
        tbody.appendChild(row);
    });
}

// 評価データのセルを描画
function renderEvalCells(evalInfo) {
    if (!evalInfo) {
        return `
            <td class="td-eval no-eval">-</td>
            <td class="td-eval no-eval">-</td>
            <td class="td-eval no-eval">-</td>
            <td class="td-eval no-eval">-</td>
            <td class="td-eval no-eval">-</td>
            <td class="td-eval no-eval">-</td>
            <td class="td-eval no-eval">-</td>
            <td class="td-eval td-comment no-eval">-</td>
        `;
    }

    // CSVのキー名またはオブジェクトのキー名に対応
    const type = evalInfo['タイプ1'] || evalInfo.type1 || '';
    const leadWill = evalInfo['先行意欲'] || evalInfo.leadWill || '';
    const banteExp = evalInfo['番手経験'] || evalInfo.banteExp || '';
    const speed = evalInfo['スピード（縦脚含む）'] || evalInfo.speed || '';
    const attack = evalInfo['仕掛け'] || evalInfo.attack || '';
    const keirinIQ = evalInfo['競輪IQ（ラインの意識）'] || evalInfo.keirinIQ || '';
    const stamina = evalInfo['スタミナ'] || evalInfo.stamina || '';
    const comment = evalInfo['コメント'] || evalInfo.comment || '';

    return `
        <td class="td-eval">${type}</td>
        <td class="td-eval ${getEvalClass(leadWill)}">${leadWill}</td>
        <td class="td-eval ${getEvalClass(banteExp)}">${banteExp}</td>
        <td class="td-eval ${getEvalClass(speed)}">${speed}</td>
        <td class="td-eval ${getEvalClass(attack)}">${attack}</td>
        <td class="td-eval ${getEvalClass(keirinIQ)}">${keirinIQ}</td>
        <td class="td-eval ${getEvalClass(stamina)}">${stamina}</td>
        <td class="td-eval td-comment">${truncateText(comment, 20)}</td>
    `;
}

// 評価記号によるクラス
function getEvalClass(val) {
    if (val === '◎') return 'eval-excellent';
    if (val === '◯') return 'eval-good';
    if (val === '△') return 'eval-average';
    if (val === '✕') return 'eval-poor';
    return '';
}

// テキストを切り詰め
function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// 選手詳細モーダル表示
function showPlayerModal(entry, evalInfo) {
    const modal = document.getElementById('playerModal');
    const modalCarNumber = document.getElementById('modalCarNumber');
    const modalPlayerName = document.getElementById('modalPlayerName');
    const modalBody = document.getElementById('modalBody');

    modalCarNumber.textContent = entry.carNumber;
    modalCarNumber.className = `modal-car-number car-${entry.carNumber}`;
    modalPlayerName.textContent = entry.name;

    let bodyHTML = `
        <div class="modal-section">
            <h3>出走表情報</h3>
            <table class="modal-table">
                <tr><th>府県</th><td>${entry.prefecture}</td><th>年齢</th><td>${entry.age}歳</td></tr>
                <tr><th>期別</th><td>${entry.term}期</td><th>級班</th><td>${entry.rank}</td></tr>
                <tr><th>脚質</th><td>${entry.style}</td><th>ギヤ</th><td>${entry.gear}</td></tr>
                <tr><th>競走得点</th><td>${entry.score.toFixed(2)}</td><th>勝率</th><td>${entry.winRate.toFixed(1)}%</td></tr>
                <tr><th>2連対率</th><td>${entry.top2Rate.toFixed(1)}%</td><th>3連対率</th><td>${entry.top3Rate.toFixed(1)}%</td></tr>
            </table>
        </div>
    `;

    if (evalInfo) {
        const type1 = evalInfo['タイプ1'] || evalInfo.type1 || '';
        const type2 = evalInfo['タイプ2'] || evalInfo.type2 || '';
        const home = evalInfo['ホーム'] || evalInfo.home || '';
        const leadWill = evalInfo['先行意欲'] || evalInfo.leadWill || '';
        const banteExp = evalInfo['番手経験'] || evalInfo.banteExp || '';
        const keepLead = evalInfo['先頭を残す動きは？'] || evalInfo.keepLead || '';
        const flyAttach = evalInfo['飛び付き可能性'] || evalInfo.flyAttach || '';
        const parallel = evalInfo['並走可能性'] || evalInfo.parallel || '';
        const sideResponse = evalInfo['横の動きへの対応'] || evalInfo.sideResponse || '';
        const speed = evalInfo['スピード（縦脚含む）'] || evalInfo.speed || '';
        const attack = evalInfo['仕掛け'] || evalInfo.attack || '';
        const stamina = evalInfo['スタミナ'] || evalInfo.stamina || '';
        const startEval = evalInfo['スタート・位置取り評価'] || evalInfo.startEval || '';
        const soloMove = evalInfo['単騎での動き'] || evalInfo.soloMove || '';
        const keirinIQ = evalInfo['競輪IQ（ラインの意識）'] || evalInfo.keirinIQ || '';
        const runaway = evalInfo['暴走の有無（斜行や激しい横の動きなど）'] || evalInfo.runaway || '';
        const goodBank = evalInfo['相性◯バンク'] || evalInfo.goodBank || '';
        const badBank = evalInfo['相性✕バンク'] || evalInfo.badBank || '';
        const comment = evalInfo['コメント'] || evalInfo.comment || '';

        bodyHTML += `
            <div class="modal-section">
                <h3>選手評価</h3>
                <table class="modal-table">
                    <tr><th>タイプ</th><td>${type1}${type2 ? ' / ' + type2 : ''}</td><th>ホーム</th><td>${home || '-'}</td></tr>
                    <tr><th>先行意欲</th><td class="${getEvalClass(leadWill)}">${leadWill}</td><th>番手経験</th><td class="${getEvalClass(banteExp)}">${banteExp}</td></tr>
                    <tr><th>先頭残し</th><td class="${getEvalClass(keepLead)}">${keepLead}</td><th>飛び付き</th><td class="${getEvalClass(flyAttach)}">${flyAttach}</td></tr>
                    <tr><th>並走</th><td class="${getEvalClass(parallel)}">${parallel}</td><th>横対応</th><td class="${getEvalClass(sideResponse)}">${sideResponse}</td></tr>
                    <tr><th>スピード</th><td class="${getEvalClass(speed)}">${speed}</td><th>仕掛け</th><td class="${getEvalClass(attack)}">${attack}</td></tr>
                    <tr><th>スタミナ</th><td class="${getEvalClass(stamina)}">${stamina}</td><th>スタート</th><td class="${getEvalClass(startEval)}">${startEval}</td></tr>
                    <tr><th>単騎動き</th><td class="${getEvalClass(soloMove)}">${soloMove}</td><th>競輪IQ</th><td class="${getEvalClass(keirinIQ)}">${keirinIQ}</td></tr>
                    <tr><th>暴走</th><td class="${getEvalClass(runaway)}">${runaway}</td><th></th><td></td></tr>
                </table>
                ${goodBank || badBank ? `<p class="bank-info">相性◯: ${goodBank || '-'} / 相性✕: ${badBank || '-'}</p>` : ''}
                ${comment ? `<div class="comment-box"><strong>コメント:</strong> ${comment}</div>` : ''}
            </div>
        `;
    } else {
        bodyHTML += `
            <div class="modal-section no-eval-section">
                <h3>選手評価</h3>
                <p>評価データがありません</p>
            </div>
        `;
    }

    modalBody.innerHTML = bodyHTML;
    modal.classList.add('show');
}

// モーダルを閉じる
function closeModal() {
    document.getElementById('playerModal').classList.remove('show');
}

// ファイル読み込み処理
function handleRaceFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            raceData = JSON.parse(event.target.result);
            updateRaceInfo(raceData);
            renderTable();
            document.getElementById('raceStatus').textContent = '読み込み完了';
            document.getElementById('raceStatus').className = 'status success';
        } catch (err) {
            document.getElementById('raceStatus').textContent = 'JSONの解析に失敗しました';
            document.getElementById('raceStatus').className = 'status error';
        }
    };
    reader.readAsText(file);
}

function handleEvalFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            evalData = parseCSV(event.target.result);
            renderTable();
            document.getElementById('evalStatus').textContent = `${evalData.length}件 読み込み完了`;
            document.getElementById('evalStatus').className = 'status success';
        } catch (err) {
            document.getElementById('evalStatus').textContent = 'CSVの解析に失敗しました';
            document.getElementById('evalStatus').className = 'status error';
        }
    };
    reader.readAsText(file);
}

// モックデータ読み込み
function loadMockRaceData() {
    raceData = mockRaceData;
    updateRaceInfo(raceData);
    renderTable();
    document.getElementById('raceStatus').textContent = 'モックデータ読み込み完了';
    document.getElementById('raceStatus').className = 'status success';
}

function loadMockEvalData() {
    evalData = mockEvalData;
    renderTable();
    document.getElementById('evalStatus').textContent = `${evalData.length}件 モックデータ読み込み完了`;
    document.getElementById('evalStatus').className = 'status success';
}

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    // イベントリスナー設定
    document.getElementById('raceDataInput').addEventListener('change', handleRaceFileUpload);
    document.getElementById('evalDataInput').addEventListener('change', handleEvalFileUpload);
    document.getElementById('loadMockRace').addEventListener('click', loadMockRaceData);
    document.getElementById('loadMockEval').addEventListener('click', loadMockEvalData);
    document.getElementById('modalClose').addEventListener('click', closeModal);

    // モーダル外クリックで閉じる
    document.getElementById('playerModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });

    // 初期表示
    renderTable();
});
