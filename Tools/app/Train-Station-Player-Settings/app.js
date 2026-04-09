// Blocklyワークスペースの初期化
let workspace;
let audioParts = [];
let currentTab = 'audio';

document.addEventListener('DOMContentLoaded', function () {
    setupTabs();
    initAudioEditor();
    initBlockly();
    setupEventListeners();

    // 初期状態で非アクティブなタブを確実に非表示にする
    document.querySelectorAll('.tab-content').forEach(content => {
        if (!content.classList.contains('active')) {
            content.style.display = 'none';
        }
    });

    // パーツ情報リストを初期化
    updatePartsInfoList();
});

// タブシステムの設定
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;

    // テンプレートタブに切り替える前にパーツの登録をチェック
    if (tabName === 'template' && audioParts.length === 0) {
        const proceed = confirm(
            '⚠️ まだ音声パーツが登録されていません。\n\n' +
            '先に「音声パーツ管理」タブでパーツを登録することをお勧めします。\n' +
            'それでも続けますか？'
        );
        if (!proceed) {
            return; // タブ切り替えをキャンセル
        }
    }

    // すべてのタブボタンとコンテンツを非アクティブ化
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });

    // 選択されたタブをアクティブ化
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    const activeTab = document.getElementById(`${tabName}-tab`);
    activeTab.classList.add('active');
    activeTab.style.display = 'flex';

    // Blocklyのリサイズと更新
    if (tabName === 'template' && workspace) {
        updateBlocklyWorkspace();
        setTimeout(() => {
            onResize();
        }, 100);
    }
}

// Audio Editor の初期化
function initAudioEditor() {
    // サンプルデータをロード（実際にはaudio.jsonから読み込む）
    loadSampleAudioData();
    renderPartsList();
}

function loadSampleAudioData() {
    // 初期状態は空
    audioParts = [];
}

function renderPartsList() {
    const partsList = document.getElementById('parts-list');
    partsList.innerHTML = '';

    if (audioParts.length === 0) {
        partsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎵</div>
                <p>まだパーツが登録されていません。</p>
                <p style="font-size: 13px; margin-top: 10px;">上のフォームから新しいパーツを追加してください。</p>
            </div>
        `;
        return;
    }

    audioParts.forEach((part, index) => {
        const partItem = createPartItem(part, index);
        partsList.appendChild(partItem);
    });
}

function createPartItem(part, index) {
    const div = document.createElement('div');
    div.className = 'part-item';
    div.innerHTML = `
        <div class="part-item-header">
            <h4>🎵 パーツ #${index + 1}</h4>
            <div class="part-item-controls">
                <button class="btn-delete" onclick="deletePart(${index})">🗑️ 削除</button>
            </div>
        </div>
        <div class="part-item-content">
            <div class="part-item-field">
                <label>ID</label>
                <div class="value">${escapeHtml(part.id)}</div>
            </div>
            <div class="part-item-field">
                <label>表示テキスト</label>
                <div class="value">${escapeHtml(part.text)}</div>
            </div>
            <div class="part-item-field">
                <label>音声ファイル</label>
                <div class="value">${escapeHtml(part.audio)}</div>
            </div>
        </div>
    `;
    return div;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function deletePart(index) {
    if (confirm('このパーツを削除しますか？')) {
        audioParts.splice(index, 1);
        renderPartsList();
        updateBlocklyWorkspace();
        showNotification('🗑️ パーツを削除しました');
    }
}

function addPartFromForm(event) {
    event.preventDefault();

    const id = document.getElementById('partId').value.trim();
    const text = document.getElementById('partText').value.trim();
    const audio = document.getElementById('partAudio').value.trim();

    if (!id || !text || !audio) {
        alert('すべての項目を入力してください。');
        return;
    }

    // IDの重複チェック
    if (audioParts.some(part => part.id === id)) {
        alert('このIDは既に使用されています。別のIDを入力してください。');
        return;
    }

    audioParts.push({ id, text, audio });
    renderPartsList();
    updateBlocklyWorkspace();

    // フォームをクリア
    document.getElementById('addPartForm').reset();
    document.getElementById('partId').focus();

    // 追加成功のフィードバック
    showNotification('✅ パーツを追加しました');
}

function clearForm() {
    document.getElementById('addPartForm').reset();
    document.getElementById('partId').focus();
}

function showNotification(message) {
    // 簡易的な通知表示
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function saveAudioJson() {
    const audioData = {
        parts: audioParts
    };

    const json = JSON.stringify(audioData, null, 4);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audio.json';
    a.click();
    URL.revokeObjectURL(url);

    alert('audio.jsonを保存しました。');
}

function loadAudioJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);
                    audioParts = data.parts || [];
                    renderPartsList();
                    updateBlocklyWorkspace();
                    alert('audio.jsonを読み込みました。');
                } catch (error) {
                    alert('読み込みに失敗しました: ' + error.message);
                }
            };
            reader.readAsText(file);
        }
    };

    input.click();
}

// Blocklyワークスペースを更新（音声パーツが変更された時）
function updateBlocklyWorkspace() {
    if (!workspace) return;

    // 既存のブロックを保持したまま、ツールボックスのみ更新
    const toolbox = createToolbox();
    workspace.updateToolbox(toolbox);

    // パーツ情報リストも更新
    updatePartsInfoList();
}

// テンプレートタブのパーツ情報リストを更新
function updatePartsInfoList() {
    const partsInfoList = document.getElementById('parts-info-list');
    if (!partsInfoList) return;

    if (audioParts.length === 0) {
        partsInfoList.innerHTML = `
            <div class="parts-info-empty">
                <p>パーツが登録されていません</p>
                <small>「音声パーツ管理」タブで先にパーツを登録してください</small>
            </div>
        `;
        return;
    }

    partsInfoList.innerHTML = `
        <div class="parts-info-items">
            ${audioParts.map(part => `
                <div class="parts-info-item">
                    <span class="parts-info-id">${escapeHtml(part.id)}</span>
                    <span class="parts-info-text">${escapeHtml(part.text)}</span>
                </div>
            `).join('')}
        </div>
        <div class="parts-info-count">合計: ${audioParts.length}個のパーツ</div>
    `;
}

// Blocklyの初期化
function initBlockly() {
    const blocklyDiv = document.getElementById('blocklyDiv');

    // カスタムブロックの定義
    defineCustomBlocks();

    // ツールボックスの作成
    const toolbox = createToolbox();

    workspace = Blockly.inject(blocklyDiv, {
        toolbox: toolbox,
        grid: {
            spacing: 20,
            length: 3,
            colour: '#ccc',
            snap: true
        },
        zoom: {
            controls: true,
            wheel: true,
            startScale: 1.0,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2
        },
        trashcan: true,
        scrollbars: true,
        sounds: true,
        oneBasedIndex: false
    });

    // ワークスペースの変更を監視
    workspace.addChangeListener(onWorkspaceChange);

    // ウィンドウのリサイズに対応
    window.addEventListener('resize', onResize);
    onResize();
}

// 音声パーツのドロップダウンオプションを生成
function getAudioPartOptions() {
    if (audioParts.length === 0) {
        return [['パーツを追加してください', '']];
    }
    return audioParts.map(part => [
        `${part.text} (${part.id})`,
        part.id
    ]);
}

// カスタムブロックの定義
function defineCustomBlocks() {
    // シーケンスブロック（トップレベルコンテナ）
    Blockly.Blocks['sequence'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("📋 シーケンス ID:")
                .appendField(new Blockly.FieldTextInput("main"), "ID");
            this.appendStatementInput("CONTENT")
                .setCheck("SequenceItem")
                .appendField("内容");
            this.setColour(290);
            this.setTooltip("一連の要素をグループ化。IDを指定してください。");
            this.setHelpUrl("");
        }
    };

    // 音声パーツアイテムブロック
    Blockly.Blocks['audio_part'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("🎵 音声パーツ:")
                .appendField(new Blockly.FieldDropdown(function () {
                    return getAudioPartOptions();
                }), "PART_ID");
            this.setPreviousStatement(true, "SequenceItem");
            this.setNextStatement(true, "SequenceItem");
            this.setColour(160);
            this.setTooltip("audio.jsonで定義された音声パーツから選択");
        }
    };

    // 変数プレースホルダーブロック
    Blockly.Blocks['variable_placeholder'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("💭 変数:")
                .appendField(new Blockly.FieldTextInput("dest"), "VAR_NAME");
            this.setPreviousStatement(true, "SequenceItem");
            this.setNextStatement(true, "SequenceItem");
            this.setColour(300);
            this.setTooltip("変数のプレースホルダー {dest}など");
        }
    };

    // テキストブロック（固定文字列や複合表記用）
    Blockly.Blocks['text_literal'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("📝 テキスト:")
                .appendField(new Blockly.FieldTextInput("platform{platform}"), "TEXT");
            this.setPreviousStatement(true, "SequenceItem");
            this.setNextStatement(true, "SequenceItem");
            this.setColour(180);
            this.setTooltip("固定テキストや複合表記（例: platform{platform}）");
        }
    };

    // コンポーネント参照ブロック
    Blockly.Blocks['component'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("📦 コンポーネント参照:")
                .appendField(new Blockly.FieldTextInput("id名"), "ID");
            this.setPreviousStatement(true, "SequenceItem");
            this.setNextStatement(true, "SequenceItem");
            this.setColour(230);
            this.setTooltip("他のシーケンスを参照");
        }
    };

    // スイッチブロック
    Blockly.Blocks['switch_case'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("🔀 スイッチ 変数:")
                .appendField(new Blockly.FieldTextInput("type"), "VARIABLE");
            this.appendStatementInput("CASES")
                .setCheck("CaseItem")
                .appendField("ケース定義");
            this.setPreviousStatement(true, "SequenceItem");
            this.setNextStatement(true, "SequenceItem");
            this.setColour(45);
            this.setTooltip("条件分岐");
        }
    };

    // ケースブロック
    Blockly.Blocks['case_item'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("📌 ケース 値:")
                .appendField(new Blockly.FieldTextInput("value"), "VALUE");
            this.appendStatementInput("CONTENT")
                .setCheck("SequenceItem")
                .appendField("内容");
            this.setPreviousStatement(true, "CaseItem");
            this.setNextStatement(true, "CaseItem");
            this.setColour(65);
            this.setTooltip("スイッチのケース定義");
        }
    };

    // ループブロック
    Blockly.Blocks['loop'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("🔁 ループ リスト変数:")
                .appendField(new Blockly.FieldTextInput("stations"), "LIST_VAR");
            this.appendStatementInput("TEMPLATE")
                .setCheck("SequenceItem")
                .appendField("繰り返す内容");
            this.setPreviousStatement(true, "SequenceItem");
            this.setNextStatement(true, "SequenceItem");
            this.setColour(120);
            this.setTooltip("リストをループ処理");
        }
    };
}

// ツールボックスの作成
function createToolbox() {
    return {
        'kind': 'categoryToolbox',
        'contents': [
            {
                'kind': 'category',
                'name': '📋 シーケンス',
                'colour': 290,
                'contents': [
                    {
                        'kind': 'block',
                        'type': 'sequence',
                        'fields': {
                            'ID': 'main'
                        }
                    }
                ]
            },
            {
                'kind': 'category',
                'name': '🎵 音声・変数',
                'colour': 160,
                'contents': [
                    {
                        'kind': 'block',
                        'type': 'audio_part'
                    },
                    {
                        'kind': 'block',
                        'type': 'text_literal'
                    },
                    {
                        'kind': 'block',
                        'type': 'variable_placeholder'
                    },
                    {
                        'kind': 'block',
                        'type': 'component'
                    }
                ]
            },
            {
                'kind': 'category',
                'name': '🔀 制御構造',
                'colour': 45,
                'contents': [
                    {
                        'kind': 'block',
                        'type': 'switch_case'
                    },
                    {
                        'kind': 'block',
                        'type': 'case_item'
                    },
                    {
                        'kind': 'block',
                        'type': 'loop'
                    }
                ]
            }
        ]
    };
}

// イベントリスナーの設定
function setupEventListeners() {
    // Audio Editor
    document.getElementById('addPartForm').addEventListener('submit', addPartFromForm);
    document.getElementById('clearForm').addEventListener('click', clearForm);
    document.getElementById('saveAudio').addEventListener('click', saveAudioJson);
    document.getElementById('loadAudio').addEventListener('click', loadAudioJson);

    // Template Editor
    document.getElementById('generateTemplate').addEventListener('click', generateTemplate);
    document.getElementById('saveTemplate').addEventListener('click', saveTemplate);
    document.getElementById('loadTemplate').addEventListener('click', loadTemplate);
}

// ワークスペースの変更時
function onWorkspaceChange(event) {
    // 自動でJSON生成はしない（生成ボタンで実行）
}

// テンプレートJSON生成
function generateTemplate() {
    try {
        const allBlocks = workspace.getAllBlocks(false);
        const sequences = {};

        allBlocks.forEach(block => {
            if (block.type === 'sequence') {
                const id = block.getFieldValue('ID');
                const content = processBlockList(block.getInputTargetBlock('CONTENT'));
                sequences[id] = content;
            }
        });

        const json = JSON.stringify(sequences, null, 4);
        document.getElementById('generatedCode').textContent = json;
    } catch (error) {
        document.getElementById('generatedCode').textContent = 'エラー: ' + error.message;
        console.error(error);
    }
}

function processBlockList(block) {
    const result = [];
    let currentBlock = block;

    while (currentBlock) {
        const processed = processBlock(currentBlock);
        if (processed !== null) {
            result.push(processed);
        }
        currentBlock = currentBlock.getNextBlock();
    }

    return result;
}

function processBlock(block) {
    if (!block) return null;

    switch (block.type) {
        case 'audio_part':
            return block.getFieldValue('PART_ID');

        case 'variable_placeholder':
            const varName = block.getFieldValue('VAR_NAME');
            return `{${varName}}`;

        case 'text_literal':
            return block.getFieldValue('TEXT');

        case 'component':
            return {
                function: 'component',
                params: {
                    id: block.getFieldValue('ID')
                }
            };

        case 'switch_case':
            const variable = block.getFieldValue('VARIABLE');
            const casesBlock = block.getInputTargetBlock('CASES');
            const cases = {};

            let caseBlock = casesBlock;
            while (caseBlock) {
                if (caseBlock.type === 'case_item') {
                    const caseValue = caseBlock.getFieldValue('VALUE');
                    const caseContent = processBlockList(caseBlock.getInputTargetBlock('CONTENT'));
                    cases[caseValue] = caseContent;
                }
                caseBlock = caseBlock.getNextBlock();
            }

            return {
                function: 'switch',
                params: {
                    variable: variable,
                    cases: cases
                }
            };

        case 'loop':
            const listVar = block.getFieldValue('LIST_VAR');
            const template = processBlockList(block.getInputTargetBlock('TEMPLATE'));

            return {
                function: 'loop',
                params: {
                    list_var: listVar,
                    item_template: template
                }
            };

        default:
            return null;
    }
}

// テンプレートの保存
function saveTemplate() {
    generateTemplate();
    const json = document.getElementById('generatedCode').textContent;

    if (json && !json.startsWith('エラー')) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template.json';
        a.click();
        URL.revokeObjectURL(url);

        alert('template.jsonを保存しました。');
    } else {
        alert('有効なJSONが生成されていません。');
    }
}

// テンプレートの読み込み
function loadTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);

                    // 既存のワークスペースをクリア
                    if (confirm('ワークスペースをクリアして、JSONファイルからブロックを読み込みますか？')) {
                        workspace.clear();
                        jsonToBlocks(data);
                        document.getElementById('generatedCode').textContent = JSON.stringify(data, null, 4);

                        // ワークスペースをリサイズして表示を更新
                        setTimeout(() => {
                            workspace.getAllBlocks(false).forEach(block => {
                                block.initSvg();
                                block.render();
                            });
                            onResize();
                        }, 100);

                        showNotification('✅ template.jsonを読み込みました');
                    }
                } catch (error) {
                    alert('読み込みに失敗しました: ' + error.message);
                    console.error(error);
                }
            };
            reader.readAsText(file);
        }
    };

    input.click();
}

// JSONからBlocklyブロックを生成
function jsonToBlocks(data) {
    const sequences = Object.keys(data);
    let yPosition = 20;

    sequences.forEach((seqId, index) => {
        const content = data[seqId];

        // シーケンスブロックを作成
        const sequenceBlock = workspace.newBlock('sequence');
        sequenceBlock.setFieldValue(seqId, 'ID');
        sequenceBlock.moveBy(20, yPosition);

        // シーケンスの内容を生成
        if (Array.isArray(content) && content.length > 0) {
            const firstContentBlock = createBlocksFromArray(content);
            if (firstContentBlock) {
                sequenceBlock.getInput('CONTENT').connection.connect(
                    firstContentBlock.previousConnection
                );
            }
        }

        sequenceBlock.initSvg();
        sequenceBlock.render();

        // 次のシーケンスの位置を調整
        yPosition += sequenceBlock.getHeightWidth().height + 40;
    });
}

// 配列からブロックのチェーンを作成
function createBlocksFromArray(items) {
    if (!items || items.length === 0) return null;

    let firstBlock = null;
    let previousBlock = null;

    items.forEach(item => {
        const block = createBlockFromItem(item);
        if (block) {
            if (!firstBlock) {
                firstBlock = block;
            }

            if (previousBlock && block.previousConnection) {
                previousBlock.nextConnection.connect(block.previousConnection);
            }

            previousBlock = block;
        }
    });

    return firstBlock;
}

// 個別のアイテムからブロックを作成
function createBlockFromItem(item) {
    if (typeof item === 'string') {
        // 文字列の場合
        if (item.startsWith('{') && item.endsWith('}')) {
            // 変数プレースホルダー
            const varName = item.slice(1, -1);
            const block = workspace.newBlock('variable_placeholder');
            block.setFieldValue(varName, 'VAR_NAME');
            block.initSvg();
            block.render();
            return block;
        } else {
            // 音声パーツまたはテキストリテラル
            // まずaudioPartsで検索
            const audioPart = audioParts.find(p => p.id === item);
            if (audioPart) {
                const block = workspace.newBlock('audio_part');
                block.setFieldValue(item, 'PART_ID');
                block.initSvg();
                block.render();
                return block;
            } else {
                // テキストリテラルとして扱う
                const block = workspace.newBlock('text_literal');
                block.setFieldValue(item, 'TEXT');
                block.initSvg();
                block.render();
                return block;
            }
        }
    } else if (typeof item === 'object' && item.function) {
        // 関数オブジェクトの場合
        return createFunctionBlock(item);
    }

    return null;
}

// 関数ブロックを作成
function createFunctionBlock(funcObj) {
    const { function: funcType, params } = funcObj;

    switch (funcType) {
        case 'component':
            const compBlock = workspace.newBlock('component');
            compBlock.setFieldValue(params.id, 'ID');
            compBlock.initSvg();
            compBlock.render();
            return compBlock;

        case 'switch':
            const switchBlock = workspace.newBlock('switch_case');
            switchBlock.setFieldValue(params.variable, 'VARIABLE');

            // ケースブロックを作成
            if (params.cases) {
                const caseKeys = Object.keys(params.cases);
                let firstCaseBlock = null;
                let prevCaseBlock = null;

                caseKeys.forEach(caseKey => {
                    const caseContent = params.cases[caseKey];
                    const caseBlock = workspace.newBlock('case_item');
                    caseBlock.setFieldValue(caseKey, 'VALUE');

                    // ケースの内容を生成
                    if (Array.isArray(caseContent) && caseContent.length > 0) {
                        const firstContentBlock = createBlocksFromArray(caseContent);
                        if (firstContentBlock) {
                            caseBlock.getInput('CONTENT').connection.connect(
                                firstContentBlock.previousConnection
                            );
                        }
                    }

                    caseBlock.initSvg();
                    caseBlock.render();

                    if (!firstCaseBlock) {
                        firstCaseBlock = caseBlock;
                    }

                    if (prevCaseBlock) {
                        prevCaseBlock.nextConnection.connect(caseBlock.previousConnection);
                    }

                    prevCaseBlock = caseBlock;
                });

                // 最初のケースをスイッチに接続
                if (firstCaseBlock) {
                    switchBlock.getInput('CASES').connection.connect(
                        firstCaseBlock.previousConnection
                    );
                }
            }

            switchBlock.initSvg();
            switchBlock.render();
            return switchBlock;

        case 'loop':
            const loopBlock = workspace.newBlock('loop');
            loopBlock.setFieldValue(params.list_var, 'LIST_VAR');

            // ループのテンプレートを生成
            if (Array.isArray(params.item_template) && params.item_template.length > 0) {
                const firstTemplateBlock = createBlocksFromArray(params.item_template);
                if (firstTemplateBlock) {
                    loopBlock.getInput('TEMPLATE').connection.connect(
                        firstTemplateBlock.previousConnection
                    );
                }
            }

            loopBlock.initSvg();
            loopBlock.render();
            return loopBlock;
    }

    return null;
}

// ウィンドウリサイズ時の処理
function onResize() {
    if (currentTab === 'template' && workspace) {
        const blocklyArea = document.getElementById('blockly-area');
        const blocklyDiv = document.getElementById('blocklyDiv');

        if (blocklyArea && blocklyDiv) {
            blocklyDiv.style.width = blocklyArea.offsetWidth + 'px';
            blocklyDiv.style.height = blocklyArea.offsetHeight + 'px';

            Blockly.svgResize(workspace);
        }
    }
}
