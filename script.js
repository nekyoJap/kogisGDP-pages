// kogisGDP - 競輪予想ボード JavaScript

// サンプル選手データ
const defaultPlayers = [
    { number: 1, name: '選手A', prefecture: '東京', rank: 'S1' },
    { number: 2, name: '選手B', prefecture: '神奈川', rank: 'S1' },
    { number: 3, name: '選手C', prefecture: '埼玉', rank: 'S2' },
    { number: 4, name: '選手D', prefecture: '千葉', rank: 'S2' },
    { number: 5, name: '選手E', prefecture: '茨城', rank: 'A1' },
    { number: 6, name: '選手F', prefecture: '栃木', rank: 'A1' },
    { number: 7, name: '選手G', prefecture: '群馬', rank: 'A2' },
    { number: 8, name: '選手H', prefecture: '福島', rank: 'A2' },
    { number: 9, name: '選手I', prefecture: '宮城', rank: 'A3' }
];

// ドラッグ中の要素
let draggedElement = null;
let draggedFromZone = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initializePlayers();
    initializeDragAndDrop();
    initializeDate();
    loadFromLocalStorage();
});

// 日付を今日に設定
function initializeDate() {
    const dateInput = document.getElementById('raceDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
}

// 選手カードを生成
function initializePlayers() {
    const container = document.getElementById('playersContainer');
    container.innerHTML = '';
    
    defaultPlayers.forEach(player => {
        const card = createPlayerCard(player);
        container.appendChild(card);
    });
}

// 選手カード要素を作成
function createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.setAttribute('data-number', player.number);
    card.setAttribute('data-name', player.name);
    card.setAttribute('draggable', 'true');
    
    card.innerHTML = `
        <div class="player-number">${player.number}</div>
        <div class="player-details">
            <div class="player-name">${player.name}</div>
            <div class="player-info">${player.prefecture} / ${player.rank}</div>
        </div>
    `;
    
    return card;
}

// ドラッグ&ドロップの初期化
function initializeDragAndDrop() {
    // 選手コンテナにドロップ可能にする
    const playersContainer = document.getElementById('playersContainer');
    playersContainer.addEventListener('dragover', handleDragOver);
    playersContainer.addEventListener('dragleave', handleDragLeave);
    playersContainer.addEventListener('drop', handleDropToPlayers);
    
    // すべてのドロップゾーンにイベントを設定
    const dropZones = document.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', handleDrop);
    });
    
    // 動的に追加されるカードにもイベント委譲
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd);
}

// ドラッグ開始
function handleDragStart(e) {
    if (!e.target.classList.contains('player-card')) return;
    
    draggedElement = e.target;
    draggedFromZone = e.target.parentElement;
    
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.getAttribute('data-number'));
    
    // ドラッグ開始時にゴースト画像を設定
    const rect = e.target.getBoundingClientRect();
    e.dataTransfer.setDragImage(e.target, rect.width / 2, rect.height / 2);
}

// ドラッグ終了
function handleDragEnd(e) {
    if (!e.target.classList.contains('player-card')) return;
    e.target.classList.remove('dragging');
    draggedElement = null;
    draggedFromZone = null;
    
    // すべてのハイライトを削除
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
}

// ドラッグオーバー
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.target.closest('.drop-zone') || e.target.closest('.players-container');
    if (target) {
        target.classList.add('drag-over');
    }
}

// ドラッグリーブ
function handleDragLeave(e) {
    const target = e.target.closest('.drop-zone') || e.target.closest('.players-container');
    if (target) {
        target.classList.remove('drag-over');
    }
}

// ドロップゾーンにドロップ
function handleDrop(e) {
    e.preventDefault();
    const dropZone = e.target.closest('.drop-zone');
    if (!dropZone || !draggedElement) return;
    
    dropZone.classList.remove('drag-over');
    
    // 既存のカードがあれば元の場所に戻す
    const existingCard = dropZone.querySelector('.player-card');
    if (existingCard) {
        // 元のゾーンがドロップゾーンならそこに移動、なければ選手一覧に戻す
        if (draggedFromZone && draggedFromZone.classList.contains('drop-zone')) {
            draggedFromZone.appendChild(existingCard);
        } else {
            document.getElementById('playersContainer').appendChild(existingCard);
        }
    }
    
    // カードをドロップゾーンに移動
    dropZone.appendChild(draggedElement);
    
    // 自動保存
    saveToLocalStorage();
    
    showToast('配置を更新しました');
}

// 選手一覧にドロップ
function handleDropToPlayers(e) {
    e.preventDefault();
    const container = document.getElementById('playersContainer');
    container.classList.remove('drag-over');
    
    if (!draggedElement) return;
    
    // カードを選手一覧に戻す
    container.appendChild(draggedElement);
    
    // 自動保存
    saveToLocalStorage();
    
    showToast('選手を戻しました');
}

// 予想を保存
function savePrediction() {
    const prediction = collectPredictionData();
    
    // ローカルストレージに保存
    saveToLocalStorage();
    
    // 結果を表示
    displayPrediction(prediction);
    
    showToast('予想を保存しました！');
}

// 予想データを収集
function collectPredictionData() {
    const raceName = document.getElementById('raceName').value || '未入力';
    const raceDate = document.getElementById('raceDate').value || '未入力';
    const comment = document.getElementById('predictionComment').value || '';
    
    const laps = ['start', 'lap1', 'lap2', 'final', 'goal'];
    const lapNames = {
        start: 'スタート',
        lap1: '1周目',
        lap2: '2周目',
        final: '最終周',
        goal: 'ゴール'
    };
    
    const predictions = {};
    
    laps.forEach(lap => {
        predictions[lap] = [];
        for (let pos = 1; pos <= 9; pos++) {
            const zone = document.querySelector(`.drop-zone[data-lap="${lap}"][data-position="${pos}"]`);
            const card = zone ? zone.querySelector('.player-card') : null;
            if (card) {
                predictions[lap].push({
                    position: pos,
                    number: card.getAttribute('data-number'),
                    name: card.getAttribute('data-name')
                });
            }
        }
    });
    
    return {
        raceName,
        raceDate,
        comment,
        predictions,
        lapNames,
        timestamp: new Date().toISOString()
    };
}

// 予想を表示
function displayPrediction(data) {
    const resultSection = document.getElementById('resultSection');
    const resultDiv = document.getElementById('predictionResult');
    
    let html = `📋 レース: ${data.raceName}\n`;
    html += `📅 日付: ${data.raceDate}\n`;
    html += `⏰ 保存時刻: ${new Date(data.timestamp).toLocaleString('ja-JP')}\n\n`;
    
    html += '═══════════════════════════════════════\n';
    html += '【展開予想】\n';
    html += '═══════════════════════════════════════\n\n';
    
    const laps = ['start', 'lap1', 'lap2', 'final', 'goal'];
    laps.forEach(lap => {
        const lapData = data.predictions[lap];
        if (lapData.length > 0) {
            html += `▶ ${data.lapNames[lap]}\n`;
            lapData.forEach(p => {
                html += `  ${p.position}位: ${p.number}番 ${p.name}\n`;
            });
            html += '\n';
        }
    });
    
    // ゴール予想から3連単を計算
    const goalData = data.predictions.goal;
    if (goalData.length >= 3) {
        const sorted = goalData.sort((a, b) => a.position - b.position);
        const top3 = sorted.slice(0, 3);
        html += '═══════════════════════════════════════\n';
        html += '【予想買い目】\n';
        html += '═══════════════════════════════════════\n';
        html += `  3連単: ${top3[0].number}-${top3[1].number}-${top3[2].number}\n`;
        html += `  3連複: ${top3.map(p => p.number).sort().join('-')}\n`;
        html += `  2車単: ${top3[0].number}-${top3[1].number}\n`;
        html += `  2車複: ${[top3[0].number, top3[1].number].sort().join('-')}\n`;
    }
    
    if (data.comment) {
        html += '\n═══════════════════════════════════════\n';
        html += '【コメント】\n';
        html += '═══════════════════════════════════════\n';
        html += data.comment + '\n';
    }
    
    resultDiv.textContent = html;
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

// ボードをクリア
function clearBoard() {
    if (!confirm('予想ボードをクリアしますか？')) return;
    
    const dropZones = document.querySelectorAll('.drop-zone');
    const playersContainer = document.getElementById('playersContainer');
    
    dropZones.forEach(zone => {
        const card = zone.querySelector('.player-card');
        if (card) {
            playersContainer.appendChild(card);
        }
    });
    
    // フォームもクリア
    document.getElementById('raceName').value = '';
    document.getElementById('predictionComment').value = '';
    document.getElementById('resultSection').style.display = 'none';
    
    // ローカルストレージもクリア
    localStorage.removeItem('kogisGDP_prediction');
    
    showToast('ボードをクリアしました');
}

// エクスポート
function exportPrediction() {
    const prediction = collectPredictionData();
    
    // テキストファイルとしてダウンロード
    let text = `kogisGDP 競輪予想\n`;
    text += `==================\n\n`;
    text += `レース: ${prediction.raceName}\n`;
    text += `日付: ${prediction.raceDate}\n`;
    text += `作成: ${new Date().toLocaleString('ja-JP')}\n\n`;
    
    const laps = ['start', 'lap1', 'lap2', 'final', 'goal'];
    laps.forEach(lap => {
        const lapData = prediction.predictions[lap];
        if (lapData.length > 0) {
            text += `【${prediction.lapNames[lap]}】\n`;
            lapData.forEach(p => {
                text += `${p.position}位: ${p.number}番 ${p.name}\n`;
            });
            text += '\n';
        }
    });
    
    if (prediction.comment) {
        text += `【コメント】\n${prediction.comment}\n`;
    }
    
    // Blobを作成してダウンロード
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prediction_${prediction.raceDate}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('予想をエクスポートしました');
}

// ローカルストレージに保存
function saveToLocalStorage() {
    const prediction = collectPredictionData();
    
    // ドロップゾーンの配置情報を保存
    const placements = {};
    document.querySelectorAll('.drop-zone').forEach(zone => {
        const lap = zone.getAttribute('data-lap');
        const position = zone.getAttribute('data-position');
        const card = zone.querySelector('.player-card');
        if (card) {
            const key = `${lap}_${position}`;
            placements[key] = {
                number: card.getAttribute('data-number'),
                name: card.getAttribute('data-name')
            };
        }
    });
    
    const data = {
        raceName: document.getElementById('raceName').value,
        raceDate: document.getElementById('raceDate').value,
        comment: document.getElementById('predictionComment').value,
        placements
    };
    
    localStorage.setItem('kogisGDP_prediction', JSON.stringify(data));
}

// ローカルストレージから読み込み
function loadFromLocalStorage() {
    const saved = localStorage.getItem('kogisGDP_prediction');
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        
        // フォームを復元
        if (data.raceName) {
            document.getElementById('raceName').value = data.raceName;
        }
        if (data.raceDate) {
            document.getElementById('raceDate').value = data.raceDate;
        }
        if (data.comment) {
            document.getElementById('predictionComment').value = data.comment;
        }
        
        // 配置を復元
        if (data.placements) {
            Object.entries(data.placements).forEach(([key, value]) => {
                const [lap, position] = key.split('_');
                const zone = document.querySelector(`.drop-zone[data-lap="${lap}"][data-position="${position}"]`);
                const card = document.querySelector(`.player-card[data-number="${value.number}"]`);
                
                if (zone && card) {
                    zone.appendChild(card);
                }
            });
        }
        
        console.log('前回の予想を復元しました');
    } catch (e) {
        console.error('データの復元に失敗しました:', e);
    }
}

// トースト通知
function showToast(message) {
    // 既存のトーストを削除
    const existing = document.querySelector('.toast');
    if (existing) {
        existing.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// タッチデバイス対応
if ('ontouchstart' in window) {
    // タッチデバイスの場合はタップで選択→タップで配置の方式に
    let selectedCard = null;
    
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.player-card');
        const zone = e.target.closest('.drop-zone');
        
        if (card && !zone) {
            // カードを選択
            document.querySelectorAll('.player-card').forEach(c => c.style.outline = '');
            card.style.outline = '3px solid #2563eb';
            selectedCard = card;
        } else if (zone && selectedCard) {
            // ゾーンに配置
            const existingCard = zone.querySelector('.player-card');
            if (existingCard) {
                document.getElementById('playersContainer').appendChild(existingCard);
            }
            zone.appendChild(selectedCard);
            selectedCard.style.outline = '';
            selectedCard = null;
            saveToLocalStorage();
            showToast('配置を更新しました');
        }
    });
}
