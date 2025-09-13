// グローバルエラーハンドラー
window.addEventListener('error', function (event) {
    console.error('グローバルエラー:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });

    // ユーザーに分かりやすいメッセージを表示
    const errorMessage = `エラーが発生しました: ${event.message}`;

    // メッセージ表示エリアを探す
    const messageAreas = ['parts-messages', 'sentences-messages', 'tools-messages'];
    for (const areaId of messageAreas) {
        const area = document.getElementById(areaId);
        if (area && area.style.display !== 'none') {
            showMessage(areaId, 'error', errorMessage);
            break;
        }
    }
});

window.addEventListener('unhandledrejection', function (event) {
    console.error('未処理のPromise拒否:', event.reason);

    // ユーザーに分かりやすいメッセージを表示
    const errorMessage = `非同期処理でエラーが発生しました: ${event.reason}`;

    // メッセージ表示エリアを探す
    const messageAreas = ['parts-messages', 'sentences-messages', 'tools-messages'];
    for (const areaId of messageAreas) {
        const area = document.getElementById(areaId);
        if (area && area.style.display !== 'none') {
            showMessage(areaId, 'error', errorMessage);
            break;
        }
    }
});

// アプリケーション状態管理
const AppState = {
    // データ管理
    data: {
        parts: [],
        sentences: [],
        audioFiles: new Map(), // ID -> File object のマッピング
        bulkRegistration: [], // 一括登録用の一時データ
        import: [] // Zipインポート用の一時データ
    },

    // 形態素解析器の状態
    morphology: {
        tokenizer: null,
        isLoading: false
    },

    // UI状態管理
    ui: {
        selectedPartInGrid: null,
        draggedPart: null,
        editingPartIndex: -1,
        debugMode: false,
        autoAddMode: false, // ワンクリック追加モード
        mouseOperationMode: true, // マウス操作優先モード
        theme: 'light' // テーマ設定（light/dark）
    },

    // デバイス設定管理
    device: {
        colorScheme: 'light', // システムのカラースキーム
        reducedMotion: false, // アニメーション減少設定
        highContrast: false, // ハイコントラスト設定
        forcedColors: false, // 強制色設定
        touchDevice: false, // タッチデバイス
        screenSize: 'desktop', // desktop/tablet/mobile
        pixelRatio: 1, // デバイスピクセル比
        connection: 'unknown', // ネットワーク接続
        language: 'ja', // 言語設定
        timezone: 'Asia/Tokyo', // タイムゾーン
        autoApply: true // 自動適用設定
    },

    // データアクセサ（後方互換性のため）
    get partsData() { return this.data.parts; },
    set partsData(value) { this.data.parts = value; },

    get sentencesData() { return this.data.sentences; },
    set sentencesData(value) { this.data.sentences = value; },

    get audioFiles() { return this.data.audioFiles; },

    get morphologyTokenizer() { return this.morphology.tokenizer; },
    set morphologyTokenizer(value) { this.morphology.tokenizer = value; },

    get isTokenizerLoading() { return this.morphology.isLoading; },
    set isTokenizerLoading(value) { this.morphology.isLoading = value; }
};

// 従来の変数名を保持（互換性のため）
let partsData = AppState.data.parts;
let sentencesData = AppState.data.sentences;
let audioFiles = AppState.data.audioFiles;
let bulkRegistrationData = AppState.data.bulkRegistration;
let importData = AppState.data.import;
let morphologyTokenizer = AppState.morphology.tokenizer;
let isTokenizerLoading = AppState.morphology.isLoading;

// よく使われる鉄道用語のリスト
const commonRailwayTerms = {
    '列車種別': ['特急', '急行', '快速', '準急', '普通', '各駅停車', '快速急行', '通勤急行', '区間急行'],
    '方向・行先': ['上り', '下り', '行き', '方面', '経由', '直通'],
    '時間': ['まもなく', '次の', '最終', '始発', '到着', '発車', '通過'],
    '場所': ['のりば', '番線', 'ホーム', '改札', '階段', 'エレベーター', 'エスカレーター'],
    '編成': ['両編成', '号車', '自由席', '指定席', 'グリーン車'],
    '助詞・接続詞': ['は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'から', 'まで', 'です', 'ます'],
    '動作': ['まいります', '到着します', '発車します', '通過します', '停車します', '連絡します']
};

// 鉄道用語の品詞判定とローマ字変換マップ
const railwayTermsMapping = {
    // 地名・駅名
    '名古屋': { type: '地名', romaji: 'nagoya', short: 'nagoya' },
    '大阪': { type: '地名', romaji: 'osaka', short: 'osaka' },
    '東京': { type: '地名', romaji: 'tokyo', short: 'tokyo' },
    '京都': { type: '地名', romaji: 'kyoto', short: 'kyoto' },
    '横浜': { type: '地名', romaji: 'yokohama', short: 'yokohama' },
    '新大阪': { type: '地名', romaji: 'shin-osaka', short: 'shinosaka' },
    '品川': { type: '地名', romaji: 'shinagawa', short: 'shinagawa' },
    '博多': { type: '地名', romaji: 'hakata', short: 'hakata' },

    // 列車種別
    '特急': { type: '列車種別', romaji: 'tokkyuu', short: 'ltdexp' },
    '急行': { type: '列車種別', romaji: 'kyuukou', short: 'exp' },
    '快速': { type: '列車種別', romaji: 'kaisoku', short: 'rapid' },
    '準急': { type: '列車種別', romaji: 'junkyuu', short: 'semiexp' },
    '普通': { type: '列車種別', romaji: 'futsuu', short: 'local' },
    '各駅停車': { type: '列車種別', romaji: 'kakueki-teisha', short: 'local' },

    // 副詞・動作
    'まもなく': { type: '副詞', romaji: 'mamonaku', short: 'soon' },
    '次の': { type: '連体詞', romaji: 'tsugi-no', short: 'next' },
    '最終': { type: '名詞', romaji: 'saishuu', short: 'last' },
    '始発': { type: '名詞', romaji: 'shihatsu', short: 'first' },

    // 方向・場所
    '上り': { type: '名詞', romaji: 'nobori', short: 'up' },
    '下り': { type: '名詞', romaji: 'kudari', short: 'down' },
    '行き': { type: '接尾辞', romaji: 'iki', short: 'bound' },
    '方面': { type: '名詞', romaji: 'houmen', short: 'direction' },
    'のりば': { type: '名詞', romaji: 'noriba', short: 'platform' },
    'ホーム': { type: '名詞', romaji: 'hoomu', short: 'platform' }
};

// Kuromoji形態素解析の初期化（ライブラリ待機版）
async function initializeMorphologyAnalyzer() {
    if (morphologyTokenizer || isTokenizerLoading) {
        return;
    }

    isTokenizerLoading = true;

    try {
        console.log('形態素解析器を初期化中...');

        // Kuromojiライブラリが読み込まれるまで待機
        await waitForKuromoji();

        // 辞書パスの設定（GitHub Pages対応）
        const dictPaths = [
            'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict',
            'https://unpkg.com/kuromoji@0.1.2/dict'
        ];

        let tokenizer = null;
        for (const dictPath of dictPaths) {
            try {
                console.log(`🤖 形態素解析辞書を読み込み中: ${dictPath}`);
                tokenizer = await new Promise((resolve, reject) => {
                    kuromoji.builder({ dicPath: dictPath }).build((err, result) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(result);
                        }
                    });
                });
                console.log(`✅ 辞書読み込み成功: ${dictPath}`);
                break;
            } catch (dictError) {
                console.warn(`⚠️ 辞書読み込み失敗: ${dictPath}`, dictError);
                continue;
            }
        }

        if (!tokenizer) {
            throw new Error('すべての辞書パスで読み込みに失敗しました');
        }

        morphologyTokenizer = tokenizer;
        console.log('形態素解析器の初期化が完了しました');
    } catch (error) {
        console.error('形態素解析器の初期化に失敗しました:', error);
        // フォールバック: 独自解析を使用
        morphologyTokenizer = null;
    }

    isTokenizerLoading = false;
}

// Kuromojiライブラリの読み込み待機関数（改良版）
async function waitForKuromoji(maxWait = 15000) {
    const startTime = Date.now();

    // まずライブラリ読み込み完了イベントを待つ
    return new Promise((resolve, reject) => {
        // すでにKuromojiが利用可能な場合
        if (typeof kuromoji !== 'undefined') {
            console.log('✅ Kuromojiライブラリは既に利用可能です');
            resolve();
            return;
        }

        // ライブラリ読み込み完了イベントを監視
        const handleLibrariesLoaded = (event) => {
            if (event.detail.kuromoji || typeof kuromoji !== 'undefined') {
                console.log('✅ Kuromojiライブラリの読み込み確認（イベント経由）');
                window.removeEventListener('librariesLoaded', handleLibrariesLoaded);
                resolve();
            }
        };

        window.addEventListener('librariesLoaded', handleLibrariesLoaded);

        // タイムアウト監視も並行して実行
        const timeoutCheck = setInterval(() => {
            if (typeof kuromoji !== 'undefined') {
                console.log('✅ Kuromojiライブラリの読み込み確認（ポーリング）');
                clearInterval(timeoutCheck);
                window.removeEventListener('librariesLoaded', handleLibrariesLoaded);
                resolve();
                return;
            }

            if (Date.now() - startTime > maxWait) {
                clearInterval(timeoutCheck);
                window.removeEventListener('librariesLoaded', handleLibrariesLoaded);
                console.warn('⚠️ Kuromojiライブラリの読み込みがタイムアウトしました');
                reject(new Error('Kuromojiライブラリの読み込みがタイムアウトしました'));
            }
        }, 100);
    });
}

// パフォーマンス最適化ユーティリティ
const PerformanceUtils = {
    // デバウンス機能 - 連続実行を制限
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // スロットル機能 - 実行頻度を制限
    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // 仮想スクロール用の可視範囲計算
    getVisibleRange(containerHeight, itemHeight, scrollTop, totalItems, buffer = 5) {
        const visibleItems = Math.ceil(containerHeight / itemHeight);
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
        const endIndex = Math.min(totalItems - 1, startIndex + visibleItems + buffer * 2);
        return { startIndex, endIndex, visibleItems };
    },

    // DOM更新のバッチ処理
    batchDOMUpdates(callback) {
        if (typeof callback === 'function') {
            requestAnimationFrame(callback);
        }
    },

    // メモリ使用量監視（開発用）
    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
        }
        return null;
    },

    // 実行時間測定
    measureTime(name, callback) {
        const start = performance.now();
        const result = callback();
        const end = performance.now();
        console.log(`⏱️ ${name}: ${(end - start).toFixed(2)}ms`);
        return result;
    }
};

// DOM操作の最適化ヘルパー
const DOMUtils = {
    // 要素の一括作成
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key.startsWith('data-')) {
                element.setAttribute(key, value);
            } else {
                element[key] = value;
            }
        });

        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });

        return element;
    },

    // DocumentFragmentを使用した効率的な要素追加
    appendMultiple(container, elements) {
        const fragment = document.createDocumentFragment();
        elements.forEach(element => fragment.appendChild(element));
        container.appendChild(fragment);
    },

    // 安全な要素取得
    safeQuerySelector(selector, parent = document) {
        try {
            return parent.querySelector(selector);
        } catch (error) {
            console.warn(`Invalid selector: ${selector}`, error);
            return null;
        }
    },

    // 要素の可視性チェック
    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
};

// デバッグ用テスト関数
function runInputFieldTests() {
    console.log('=== 入力項目テスト開始 ===');

    // 1. 基本的なDOM要素の存在確認
    const requiredElements = [
        'part-id', 'part-text', 'part-audio',
        'voicevox-text-input', 'parts-search-input'
    ];

    requiredElements.forEach(id => {
        const element = document.getElementById(id);
        if (!element) {
            console.error(`❌ 要素が見つかりません: ${id}`);
        } else {
            console.log(`✅ 要素確認: ${id}`);
        }
    });

    // 2. 関数の存在確認
    const requiredFunctions = [
        'addPart', 'editPart', 'savePartEdits',
        'addPartToSentence', 'generateVoicevoxTextList',
        'exportPartsCSV'
    ];

    requiredFunctions.forEach(funcName => {
        if (typeof window[funcName] === 'function') {
            console.log(`✅ 関数確認: ${funcName}`);
        } else {
            console.error(`❌ 関数が見つかりません: ${funcName}`);
        }
    });

    // 3. データ構造の確認
    console.log('パーツデータ数:', AppState.data.parts.length);
    console.log('音声ファイル数:', AppState.data.audioFiles.size);
    console.log('形態素解析器:', AppState.morphology.tokenizer ? '準備完了' : '未初期化');

    // 4. パフォーマンス情報の表示
    const memoryInfo = PerformanceUtils.getMemoryUsage();
    if (memoryInfo) {
        console.log('💾 メモリ使用量:', memoryInfo);
    }

    // 5. DOM要素数の確認
    const elementCount = document.querySelectorAll('*').length;
    console.log('🏗️ DOM要素数:', elementCount);

    // 6. イベントリスナー最適化の確認
    console.log('🎧 最適化されたイベントリスナー:', {
        検索デバウンス: typeof debouncedFilterParts !== 'undefined',
        テキスト入力デバウンス: 'テキスト入力にデバウンス処理適用済み',
        スクロール最適化: 'スクロールにスロットル処理適用済み'
    });

    console.log('=== 入力項目テスト完了 ===');
}

// パフォーマンスレポート生成
function generatePerformanceReport() {
    const report = {
        timestamp: new Date().toISOString(),
        appState: {
            partsCount: AppState.data.parts.length,
            audioFilesCount: AppState.data.audioFiles.size,
            sentencesCount: AppState.data.sentences.length
        },
        domInfo: {
            elementCount: document.querySelectorAll('*').length,
            visibleElements: document.querySelectorAll(':not([style*="display: none"])').length
        },
        performance: {
            memory: PerformanceUtils.getMemoryUsage(),
            navigation: performance.getEntriesByType('navigation')[0],
            resources: performance.getEntriesByType('resource').length
        }
    };

    console.table(report.appState);
    console.table(report.domInfo);
    if (report.performance.memory) {
        console.table(report.performance.memory);
    }

    return report;
}

// デバッグモード切り替え
function toggleDebugMode() {
    AppState.ui.debugMode = !AppState.ui.debugMode;
    console.log('デバッグモード:', AppState.ui.debugMode ? 'ON' : 'OFF');

    if (AppState.ui.debugMode) {
        runInputFieldTests();

        // メモリ使用量を表示
        const memoryInfo = PerformanceUtils.getMemoryUsage();
        if (memoryInfo) {
            console.log('💾 メモリ使用量:', memoryInfo);
        }

        // パフォーマンス監視を開始
        startPerformanceMonitoring();
    } else {
        stopPerformanceMonitoring();
    }
}

// パフォーマンス監視
let performanceMonitorInterval;

function startPerformanceMonitoring() {
    if (performanceMonitorInterval) {
        clearInterval(performanceMonitorInterval);
    }

    performanceMonitorInterval = setInterval(() => {
        const memoryInfo = PerformanceUtils.getMemoryUsage();
        if (memoryInfo) {
            console.log(`📊 メモリ使用量: ${memoryInfo.used}MB / ${memoryInfo.total}MB (制限: ${memoryInfo.limit}MB)`);

            // メモリ使用量が80%を超えたら警告
            const usagePercent = (memoryInfo.used / memoryInfo.limit) * 100;
            if (usagePercent > 80) {
                console.warn('⚠️ メモリ使用量が高くなっています:', usagePercent.toFixed(1) + '%');
            }
        }

        // DOM要素数の監視
        const elementCount = document.querySelectorAll('*').length;
        console.log(`🏗️ DOM要素数: ${elementCount}`);

    }, 5000); // 5秒間隔
}

function stopPerformanceMonitoring() {
    if (performanceMonitorInterval) {
        clearInterval(performanceMonitorInterval);
        performanceMonitorInterval = null;
        console.log('📊 パフォーマンス監視を停止しました');
    }
}

// 初期化（ライブラリ読み込み待機版）
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 アプリケーション初期化開始');

    // 基本的な初期化（Kuromojiを使わないもの）
    initializeCustomDict();
    updatePartsDisplay();
    updateSentencesDisplay();
    updateAvailableParts();
    updateConfigPreview();
    updateExportButtons();
    updateConfigStats();

    // イベントリスナーの最適化設定
    initializeOptimizedEventListeners();

    // ドラッグ&ドロップ機能を初期化
    initializeDragDropArea();

    // ファイルドロップゾーンを初期化
    initializeFileDropZone();

    // 編集用ファイルドロップゾーンを初期化
    // DOM構築完了後に遅延実行
    setTimeout(initializeEditFileDropZone, 100);

    // テキスト入力にフォーカス
    setTimeout(() => {
        const textInput = document.getElementById('part-text');
        if (textInput) {
            textInput.focus();
        }
    }, 100);

    // 形態素解析器を非同期で初期化（バックグラウンドで実行）
    // Kuromojiライブラリの読み込み完了を待ってから実行
    initializeMorphologyAnalyzer().then(() => {
        console.log('✅ 形態素解析機能が利用可能になりました');

        // 形態素解析が利用可能になったことをユーザーに通知（オプション）
        if (morphologyTokenizer) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed; top: 20px; right: 20px; 
                background: var(--success-color); color: var(--text-inverse); 
                padding: 10px 15px; border-radius: 5px; 
                font-size: 14px; z-index: 10000;
                animation: fadeIn 0.3s ease;
            `;
            notification.textContent = '🤖 高精度な形態素解析が利用可能です';
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
        }
    }).catch(error => {
        console.warn('⚠️ 形態素解析の初期化に失敗しましたが、基本機能は利用できます');
        console.warn(error);
    });

    console.log('✅ 基本初期化完了');

    // デバイス設定の検出と適用
    detectDeviceSettings();
    if (AppState.device.autoApply) {
        applyDeviceSettings();
    }
    updateDeviceInfoDisplay();

    // マウス操作のためのUI初期化
    initializeMouseOperationUI();

    // ライブラリ読み込みエラーの監視
    window.addEventListener('libraryLoadError', (event) => {
        console.error('📚 ライブラリ読み込みエラー:', event.detail.error);

        // ユーザーに通知
        const errorNotification = document.createElement('div');
        errorNotification.style.cssText = `
            position: fixed; top: 20px; right: 20px; 
            background: var(--danger-color); color: var(--text-inverse); 
            padding: 15px 20px; border-radius: 5px; 
            font-size: 14px; z-index: 10000;
            max-width: 300px; line-height: 1.4;
            box-shadow: var(--shadow-lg);
        `;
        errorNotification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">⚠️ ライブラリ読み込みエラー</div>
            <div>一部機能が制限される可能性があります</div>
        `;
        document.body.appendChild(errorNotification);

        setTimeout(() => {
            if (errorNotification.parentNode) {
                errorNotification.remove();
            }
        }, 8000);
    });
});

// 最適化されたイベントリスナーの設定
function initializeOptimizedEventListeners() {
    // 検索入力のデバウンス処理
    const searchInput = document.getElementById('parts-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debouncedFilterParts);
        searchInput.addEventListener('keydown', handlePartsSearchKeydown);

        // フォーカス時にオートコンプリートを表示
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) {
                updateAutocomplete(searchInput.value.toLowerCase());
            }
        });

        console.log('パーツ検索イベントリスナーを設定しました（オートコンプリート対応）');
    }

    // テキスト入力のID生成デバウンス
    const textInput = document.getElementById('part-text');
    if (textInput) {
        const debouncedIdGeneration = PerformanceUtils.debounce(enhancedSuggestIdFromText, 300);
        textInput.addEventListener('input', debouncedIdGeneration);
        textInput.addEventListener('input', updatePreview);
    }

    // ID入力のプレビュー更新デバウンス
    const idInput = document.getElementById('part-id');
    if (idInput) {
        const debouncedPreviewUpdate = PerformanceUtils.debounce(updatePreview, 200);
        idInput.addEventListener('input', debouncedPreviewUpdate);
    }

    // ファイル入力の変更
    const audioInput = document.getElementById('part-audio');
    if (audioInput) {
        audioInput.addEventListener('change', handleFileSelect);
    }

    // スクロール最適化（大量データ用）
    const partsList = document.getElementById('parts-list');
    if (partsList) {
        const throttledScroll = PerformanceUtils.throttle(() => {
            if (AppState.data.parts.length > 100) {
                updatePartsDisplay();
            }
        }, 100);
        partsList.addEventListener('scroll', throttledScroll);
    }

    // ウィンドウリサイズの最適化
    const throttledResize = PerformanceUtils.throttle(() => {
        // レスポンシブ対応の調整など
        if (AppState.ui.debugMode) {
            console.log('ウィンドウリサイズ:', window.innerWidth, 'x', window.innerHeight);
        }
    }, 250);
    window.addEventListener('resize', throttledResize);

    // オートコンプリートの外部クリック処理
    document.addEventListener('click', (event) => {
        const searchContainer = document.querySelector('.parts-search-container');
        if (searchContainer && !searchContainer.contains(event.target)) {
            hideAutocomplete();
        }
    });
}

// マウス操作のためのUI初期化
function initializeMouseOperationUI() {
    // ワンクリック追加ボタンの初期設定
    const autoAddBtn = document.getElementById('auto-add-btn');
    if (autoAddBtn) {
        autoAddBtn.title = 'ワンクリック追加モードに切り替え（クリックで即座に追加）';
        console.log('マウス操作UI初期化完了');
    }

    // 検索入力欄にクリアボタンの機能を確実に設定
    const searchClearBtn = document.querySelector('.search-clear-btn');
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', clearPartsSearch);
    }

    // パーツリストが存在する場合の初期設定
    updateAvailableParts();

    console.log('マウス操作UIの初期化が完了しました');
}

// タブ切り替え
function showTab(tabName) {
    // すべてのタブを非表示
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    // すべてのボタンを非アクティブ
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // 選択されたタブを表示
    document.getElementById(tabName + '-tab').classList.add('active');

    // 対応するボタンをアクティブ
    event.target.classList.add('active');

    // タブに応じた処理
    if (tabName === 'export') {
        updateConfigPreview();
    } else if (tabName === 'tools') {
        // ツールタブが開かれた時にVOICEVOXリストを自動生成
        setTimeout(() => {
            if (partsData.length > 0) {
                generateVoicevoxList();
            }
        }, 100);
    }
}

// 音声パーツ追加
function addPart() {
    try {
        console.log('パーツ追加開始');

        const id = document.getElementById('part-id').value?.trim() || '';
        const text = document.getElementById('part-text').value?.trim() || '';
        const audioInput = document.getElementById('part-audio');
        const audioFile = audioInput?.files[0];

        console.log('入力値確認:', { id, text, audioFile: !!audioFile });

        // バリデーション
        const validation = validatePartInput(id, text, audioFile);
        if (!validation.isValid) {
            showMessage('parts-messages', 'error', validation.message);
            return;
        }

        if (partsData.some(part => part.id === id)) {
            showMessage('parts-messages', 'error', 'このIDは既に使用されています。');
            return;
        }

        // 音声ファイル名の生成（テキスト + 拡張子）
        const fileExtension = audioFile.name.split('.').pop();
        const audioFileName = text + '.' + fileExtension;

        const newPart = {
            id: id,
            text: text,
            audio: audioFileName
        };

        partsData.push(newPart);
        audioFiles.set(id, audioFile);

        // フォームをクリア
        clearForm();

        updatePartsDisplay();
        updateAvailableParts();
        updateConfigPreview();
        updateExportButtons();

        showMessage('parts-messages', 'success', `✨ パーツ「${text}」が追加されました！`);
        hideMessagesAfterDelay('parts-messages');

        console.log('パーツ追加完了:', newPart);

        // 次の入力にフォーカス
        setTimeout(() => {
            const textInput = document.getElementById('part-text');
            if (textInput) {
                textInput.focus();
            }
        }, 100);
    } catch (error) {
        console.error('パーツ追加エラー:', error);
        showMessage('parts-messages', 'error', 'パーツの追加でエラーが発生しました: ' + error.message);
    }
}

// 追加して続ける機能
function addPartAndContinue() {
    addPart();
    // フォームクリア後、テキスト入力にフォーカスを移動
}

// フォームクリア
function clearForm() {
    document.getElementById('part-id').value = '';
    document.getElementById('part-text').value = '';
    document.getElementById('part-audio').value = '';
    document.getElementById('reading-hint').textContent = '';
    document.getElementById('file-info').style.display = 'none';
    document.getElementById('part-preview').style.display = 'none';
}

// キーボードショートカット処理
function handleFormKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (event.ctrlKey) {
            addPartAndContinue();
        } else {
            addPart();
        }
    } else if (event.key === 'Escape') {
        clearForm();
    }
}

// ファイル選択処理
function handleFileSelect(event) {
    const file = event.target.files[0];
    const fileInfo = document.getElementById('file-info');

    if (file) {
        const fileSize = (file.size / 1024 / 1024).toFixed(2); // MB
        fileInfo.textContent = `📁 ${file.name} (${fileSize} MB)`;
        fileInfo.style.display = 'block';
        updatePreview();
    } else {
        fileInfo.style.display = 'none';
    }
}

// プレビュー更新
function updatePreview() {
    const id = document.getElementById('part-id').value.trim();
    const text = document.getElementById('part-text').value.trim();
    const audioFile = document.getElementById('part-audio').files[0];

    const preview = document.getElementById('part-preview');

    if (id || text || audioFile) {
        document.getElementById('preview-id').textContent = id || '(未入力)';
        document.getElementById('preview-text').textContent = text || '(未入力)';
        document.getElementById('preview-audio').textContent = audioFile ? audioFile.name : '(未選択)';
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

// ファイルドロップゾーンの初期化
function initializeFileDropZone() {
    const dropZone = document.getElementById('file-drop-zone');

    // ドラッグオーバー時の処理
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.add('drag-over');
    });

    // ドラッグリーブ時の処理
    dropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');
    });

    // ドロップ時の処理
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('audio/') || file.name.toLowerCase().match(/\.(wav|mp3)$/)) {
                const audioInput = document.getElementById('part-audio');
                audioInput.files = files;
                handleFileSelect({ target: audioInput });
            } else {
                alert('音声ファイル（.wav, .mp3）のみ対応しています。');
            }
        }
    });
}

// 編集用ファイルドロップゾーンの初期化
function initializeEditFileDropZone() {
    const dropZone = document.getElementById('edit-file-drop-zone');

    if (!dropZone) return; // モーダルがまだ存在しない場合

    // ドラッグオーバー時の処理
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.add('drag-over');
    });

    // ドラッグリーブ時の処理
    dropZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');
    });

    // ドロップ時の処理
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('audio/') || file.name.toLowerCase().match(/\.(wav|mp3)$/)) {
                const audioInput = document.getElementById('edit-part-audio');
                audioInput.files = files;
                handleEditFileSelect({ target: audioInput });
            } else {
                alert('音声ファイル（.wav, .mp3）のみ対応しています。');
            }
        }
    });
}

// テキスト入力時のリアルタイム更新
function enhancedSuggestIdFromText() {
    suggestIdFromText(); // 既存の機能
    updatePreview(); // プレビュー更新
}

// パーツ表示更新（最適化版）
function updatePartsDisplay() {
    const container = document.getElementById('parts-list');
    if (!container) return;

    // 性能測定（デバッグモード時）
    if (AppState.ui.debugMode) {
        return PerformanceUtils.measureTime('パーツ表示更新', () => performPartsDisplay(container));
    } else {
        return performPartsDisplay(container);
    }
}

function performPartsDisplay(container) {
    const partsCount = AppState.data.parts.length;

    if (partsCount === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">パーツが登録されていません。</p>';
        return;
    }

    // 大量データの場合は仮想化を検討
    if (partsCount > 100) {
        return renderVirtualizedParts(container);
    } else {
        return renderAllParts(container);
    }
}

function renderAllParts(container) {
    const fragment = document.createDocumentFragment();

    AppState.data.parts.forEach((part, index) => {
        const partElement = createPartElement(part, index);
        fragment.appendChild(partElement);
    });

    // 一度にDOMに追加（リフローを最小化）
    container.innerHTML = '';
    container.appendChild(fragment);
}

function renderVirtualizedParts(container) {
    // 仮想スクロールの実装（大量データ用）
    const containerHeight = container.clientHeight || 400;
    const itemHeight = 120; // パーツアイテムの推定高さ
    const scrollTop = container.scrollTop || 0;

    const { startIndex, endIndex } = PerformanceUtils.getVisibleRange(
        containerHeight, itemHeight, scrollTop, AppState.data.parts.length
    );

    const fragment = document.createDocumentFragment();

    // 上部のスペーサー
    if (startIndex > 0) {
        const topSpacer = DOMUtils.createElement('div', {
            style: `height: ${startIndex * itemHeight}px;`
        });
        fragment.appendChild(topSpacer);
    }

    // 可視範囲のパーツを描画
    for (let i = startIndex; i <= endIndex && i < AppState.data.parts.length; i++) {
        const partElement = createPartElement(AppState.data.parts[i], i);
        fragment.appendChild(partElement);
    }

    // 下部のスペーサー
    const remainingItems = AppState.data.parts.length - endIndex - 1;
    if (remainingItems > 0) {
        const bottomSpacer = DOMUtils.createElement('div', {
            style: `height: ${remainingItems * itemHeight}px;`
        });
        fragment.appendChild(bottomSpacer);
    }

    container.innerHTML = '';
    container.appendChild(fragment);
}

function createPartElement(part, index) {
    // 解析バッジの生成
    let analysisInfo = '';
    if (part.analysisUsed === 'kuromoji') {
        analysisInfo = ' <span class="analysis-badge kuromoji">🤖</span>';
    } else if (part.analysisUsed === 'dictionary') {
        analysisInfo = ' <span class="analysis-badge dictionary">📚</span>';
    }

    return DOMUtils.createElement('div', {
        className: 'part-item',
        innerHTML: `
            <h4>パーツ ${index + 1}${analysisInfo}</h4>
            <div class="part-id">ID: ${escapeHtml(part.id)}</div>
            <div class="part-text">テキスト: ${escapeHtml(part.text)}</div>
            <div class="part-audio">音声: ${escapeHtml(part.audio)}</div>
            <div class="part-actions">
                <button onclick="editPart(${index})" class="btn btn-primary btn-small" title="パーツを編集">
                    <span class="btn-icon">✏️</span>編集
                </button>
                <button onclick="duplicatePart(${index})" class="btn btn-success btn-small" title="パーツを複製">
                    <span class="btn-icon">📋</span>複製
                </button>
                <button onclick="removePart(${index})" class="btn btn-danger btn-small" title="パーツを削除">
                    <span class="btn-icon">🗑️</span>削除
                </button>
            </div>
        `
    });
}

// HTMLエスケープ関数（XSS対策）
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// パーツ削除
function removePart(index) {
    if (confirm('このパーツを削除しますか？')) {
        const part = partsData[index];
        audioFiles.delete(part.id);
        partsData.splice(index, 1);
        updatePartsDisplay();
        updateAvailableParts();
        updateConfigPreview();
    }
}

// パーツの内容を編集できるボタンを追加してください
let editingPartIndex = -1;

function editPart(index) {
    try {
        console.log('編集開始:', index, partsData[index]);
        editingPartIndex = index;
        const part = partsData[index];

        // モーダルの入力フィールドに現在の値をセット
        document.getElementById('edit-part-id').value = part.id;
        document.getElementById('edit-part-text').value = part.text;
        document.getElementById('current-audio-name').textContent = part.audio;
        document.getElementById('edit-part-audio').value = '';
        document.getElementById('edit-file-info').style.display = 'none';

        // プレビュー更新
        updateEditPreview();

        // 編集用ファイルドロップゾーンを再初期化（モーダルが表示される前に）
        setTimeout(initializeEditFileDropZone, 50);

        // モーダルを表示
        document.getElementById('edit-part-modal').style.display = 'flex';

        console.log('編集モーダル表示完了');
    } catch (error) {
        console.error('編集開始エラー:', error);
        alert('編集の開始でエラーが発生しました: ' + error.message);
    }
}

function closeEditPartModal() {
    document.getElementById('edit-part-modal').style.display = 'none';
    editingPartIndex = -1;
    // メッセージをクリア
    document.getElementById('edit-part-messages').style.display = 'none';
}

// パーツ複製
function duplicatePart(index) {
    const originalPart = partsData[index];
    const audioFile = audioFiles.get(originalPart.id);

    // 新しいIDを生成（元のID + _copy）
    let newId = originalPart.id + '_copy';
    let counter = 1;

    while (partsData.some(part => part.id === newId)) {
        newId = originalPart.id + '_copy' + counter;
        counter++;
    }

    const newPart = {
        id: newId,
        text: originalPart.text + ' (コピー)',
        audio: originalPart.text + ' (コピー)' + '.' + originalPart.audio.split('.').pop()
    };

    partsData.push(newPart);

    // 音声ファイルも複製
    if (audioFile) {
        audioFiles.set(newId, audioFile);
    }

    updatePartsDisplay();
    updateAvailableParts();
    updateConfigPreview();
    updateExportButtons();

    showMessage('parts-messages', 'success', `✨ パーツ「${originalPart.text}」を複製しました`);
    hideMessagesAfterDelay('parts-messages');
}

function updateEditPreview() {
    const id = document.getElementById('edit-part-id').value.trim();
    const text = document.getElementById('edit-part-text').value.trim();
    const audioFile = document.getElementById('edit-part-audio').files[0];
    const currentAudio = document.getElementById('current-audio-name').textContent;

    document.getElementById('edit-preview-id').textContent = id || '(未入力)';
    document.getElementById('edit-preview-text').textContent = text || '(未入力)';
    document.getElementById('edit-preview-audio').textContent = audioFile ? audioFile.name : currentAudio;
}

function handleEditFileSelect(event) {
    const file = event.target.files[0];
    const fileInfo = document.getElementById('edit-file-info');

    if (file) {
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        fileInfo.textContent = `📁 ${file.name} (${fileSize} MB)`;
        fileInfo.style.display = 'block';
    } else {
        fileInfo.style.display = 'none';
    }

    updateEditPreview();
}

function generateEditIdFromText() {
    const text = document.getElementById('edit-part-text').value.trim();
    if (text) {
        // 既存の generateIdFromText 機能を使用
        const tempTextInput = document.getElementById('part-text');
        const tempOriginalValue = tempTextInput.value;
        tempTextInput.value = text;

        generateIdFromText();

        // 生成されたIDを編集フィールドにコピー
        setTimeout(() => {
            const generatedId = document.getElementById('part-id').value;
            document.getElementById('edit-part-id').value = generatedId;
            tempTextInput.value = tempOriginalValue;
            updateEditPreview();
        }, 500);
    } else {
        alert('まず表示テキストを入力してください。');
    }
}

function savePartEdits() {
    try {
        console.log('パーツ保存開始:', editingPartIndex);

        const id = document.getElementById('edit-part-id').value.trim();
        const text = document.getElementById('edit-part-text').value.trim();
        const audioInput = document.getElementById('edit-part-audio');
        const audioFile = audioInput.files[0];

        console.log('入力値確認:', { id, text, audioFile: !!audioFile });

        // バリデーション
        if (!id || !text) {
            showMessage('edit-part-messages', 'error', 'IDとテキストは必須です。');
            return;
        }

        // ID重複チェック（編集中のパーツ以外で）
        const existingPart = partsData.find((part, index) => part.id === id && index !== editingPartIndex);
        if (existingPart) {
            showMessage('edit-part-messages', 'error', 'このIDは既に他のパーツで使用されています。');
            return;
        }

        // 既存パーツを更新
        const oldPart = partsData[editingPartIndex];
        const oldId = oldPart.id;

        // 音声ファイル名の生成
        let audioFileName;
        if (audioFile) {
            const fileExtension = audioFile.name.split('.').pop();
            audioFileName = text + '.' + fileExtension;
            // 新しい音声ファイルを保存
            audioFiles.set(id, audioFile);
            console.log('新しい音声ファイル設定:', audioFileName);
        } else {
            audioFileName = oldPart.audio;
        }

        // パーツデータを更新
        partsData[editingPartIndex] = {
            id: id,
            text: text,
            audio: audioFileName
        };

        // IDが変更された場合、古いIDの音声ファイルを削除して新しいIDで保存
        if (oldId !== id) {
            const audioFileData = audioFiles.get(oldId);
            if (audioFileData) {
                audioFiles.delete(oldId);
                audioFiles.set(id, audioFileData);
            }
        }

        updatePartsDisplay();
        updateAvailableParts();
        updateConfigPreview();
        updateExportButtons();

        showMessage('parts-messages', 'success', `✨ パーツ「${text}」を更新しました`);
        hideMessagesAfterDelay('parts-messages');

        console.log('パーツ保存完了:', partsData[editingPartIndex]);
        closeEditPartModal();
    } catch (error) {
        console.error('パーツ保存エラー:', error);
        showMessage('edit-part-messages', 'error', 'パーツの保存でエラーが発生しました: ' + error.message);
    }
}

// パーツ検索
function filterParts() {
    const searchTerm = document.getElementById('parts-search').value.toLowerCase();
    const partItems = document.querySelectorAll('.part-item');

    partItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// 利用可能パーツ更新（リストモードのみ）
function updateAvailableParts() {
    const grid = document.getElementById('available-parts-grid');

    // グリッド更新
    if (grid) {
        grid.innerHTML = '';
    }

    partsData.forEach((part, index) => {
        // グリッド用オプション
        if (grid) {
            const partOption = document.createElement('div');
            partOption.className = 'part-option';
            partOption.dataset.partId = part.id;

            // マウス操作用のイベントハンドラー
            partOption.addEventListener('click', (event) => handlePartClick(part.id, event));
            partOption.addEventListener('dblclick', (event) => handlePartDoubleClick(part.id, event));
            partOption.addEventListener('contextmenu', (event) => handlePartRightClick(part.id, event));

            // ツールチップを設定
            const tooltipText = AppState.ui.autoAddMode ?
                'クリックで即座に追加' :
                'クリックで選択、ダブルクリックで追加';
            partOption.title = tooltipText;

            // ワンクリック追加モードの場合はクラスを追加
            if (AppState.ui.autoAddMode) {
                partOption.classList.add('auto-add-mode');
            }

            partOption.innerHTML = `
                <div class="part-option-info">
                    <div class="part-option-id">${part.id}</div>
                    <div class="part-option-text">${part.text}</div>
                    <div class="part-option-audio">${part.audio}</div>
                </div>
            `;
            grid.appendChild(partOption);
        }
    });

    // 検索結果カウント更新
    updateSearchResultsCount();

    // 追加ボタンの状態をリセット
    const addButton = document.getElementById('add-part-btn');
    if (addButton) {
        addButton.disabled = true;
        console.log('利用可能パーツ更新: 追加ボタンを無効化');
    }
}

// パーツ検索機能（最適化版）
let selectedPartInGrid = null;
let autocompleteIndex = -1;
let autocompleteItems = [];
let isAutocompleteVisible = false;

// デバウンス処理で検索性能を向上
const debouncedFilterParts = PerformanceUtils.debounce(filterAvailableParts, 150);

function filterAvailableParts() {
    const searchTerm = document.getElementById('parts-search-input')?.value.toLowerCase() || '';

    // オートコンプリートを更新
    updateAutocomplete(searchTerm);

    // 性能測定（デバッグモード時）
    if (AppState.ui.debugMode) {
        return PerformanceUtils.measureTime('パーツ検索', () => performFilter(searchTerm));
    } else {
        return performFilter(searchTerm);
    }
}

function performFilter(searchTerm) {
    const partOptions = document.querySelectorAll('.part-option');
    let visibleCount = 0;
    const visibleElements = [];

    // DOM更新をバッチ処理
    PerformanceUtils.batchDOMUpdates(() => {
        // グリッド表示をフィルタリング
        partOptions.forEach(option => {
            const id = option.querySelector('.part-option-id')?.textContent.toLowerCase() || '';
            const text = option.querySelector('.part-option-text')?.textContent.toLowerCase() || '';
            const audio = option.querySelector('.part-option-audio')?.textContent.toLowerCase() || '';

            const matches = !searchTerm ||
                id.includes(searchTerm) ||
                text.includes(searchTerm) ||
                audio.includes(searchTerm);

            if (matches) {
                option.classList.remove('hidden');
                visibleCount++;
                visibleElements.push(option);
            } else {
                option.classList.add('hidden');
            }
        });

        updateSearchResultsCount(visibleCount);

        // 検索結果が1つの場合は自動選択
        if (visibleCount === 1 && visibleElements.length === 1) {
            const visibleOption = visibleElements[0];
            if (visibleOption?.dataset.partId) {
                selectPartInGrid(visibleOption.dataset.partId);
            }
        }
    });

    return { visibleCount, searchTerm };
}

function updateSearchResultsCount(count = null) {
    const counter = document.getElementById('search-results-count');
    if (!counter) return;

    if (count === null) {
        count = document.querySelectorAll('.part-option:not(.hidden)').length;
    }
    counter.textContent = `${count}件表示中`;
}

function selectPartInGrid(partId) {
    // 前の選択を解除
    document.querySelectorAll('.part-option.selected').forEach(option => {
        option.classList.remove('selected');
    });

    // 新しい選択
    const option = document.querySelector(`[data-part-id="${partId}"]`);
    if (option) {
        option.classList.add('selected');
        selectedPartInGrid = partId;
        AppState.ui.selectedPartInGrid = partId; // AppStateとの同期

        // 追加ボタンを有効化
        const addButton = document.getElementById('add-part-btn');
        if (addButton) {
            addButton.disabled = false;
            console.log('追加ボタンを有効化しました:', partId);
        }
    }
}

function handlePartsSearchKeydown(event) {
    if (isAutocompleteVisible) {
        handleAutocompleteKeydown(event);
        return;
    }

    const visibleOptions = document.querySelectorAll('.part-option:not(.hidden)');
    let currentIndex = -1;

    // 現在選択されているオプションのインデックスを取得
    if (selectedPartInGrid) {
        visibleOptions.forEach((option, index) => {
            if (option.dataset.partId === selectedPartInGrid) {
                currentIndex = index;
            }
        });
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % visibleOptions.length;
        if (visibleOptions[nextIndex]) {
            selectPartInGrid(visibleOptions[nextIndex].dataset.partId);
        }
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prevIndex = currentIndex <= 0 ? visibleOptions.length - 1 : currentIndex - 1;
        if (visibleOptions[prevIndex]) {
            selectPartInGrid(visibleOptions[prevIndex].dataset.partId);
        }
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedPartInGrid) {
            addPartToSentence();
            clearPartsSearch(); // 追加後に検索をクリア
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        clearPartsSearch();
    }
}

function clearPartsSearch() {
    const searchInput = document.getElementById('parts-search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    hideAutocomplete();
    filterAvailableParts();
    selectedPartInGrid = null;
    AppState.ui.selectedPartInGrid = null; // AppStateとの同期

    document.querySelectorAll('.part-option.selected').forEach(option => {
        option.classList.remove('selected');
    });

    const addButton = document.getElementById('add-part-btn');
    if (addButton) {
        addButton.disabled = true;
        console.log('検索クリア: 追加ボタンを無効化しました');
    }
}

// ワンクリック追加モードの切り替え
function toggleAutoAdd() {
    AppState.ui.autoAddMode = !AppState.ui.autoAddMode;
}

// オートコンプリート機能
function updateAutocomplete(searchTerm) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (!dropdown) return;

    // 検索語が空の場合は非表示
    if (!searchTerm.trim()) {
        hideAutocomplete();
        return;
    }

    // マッチするパーツを検索
    autocompleteItems = partsData.filter(part => {
        const id = part.id.toLowerCase();
        const text = part.text.toLowerCase();
        return id.includes(searchTerm) || text.includes(searchTerm);
    }).slice(0, 10); // 最大10件

    if (autocompleteItems.length === 0) {
        hideAutocomplete();
        return;
    }

    // ドロップダウンの内容を生成
    dropdown.innerHTML = autocompleteItems.map((part, index) => `
        <div class="autocomplete-item" data-index="${index}" data-part-id="${part.id}">
            <span class="autocomplete-item-id">${part.id}</span>
            <span class="autocomplete-item-text">${part.text}</span>
            <span class="autocomplete-item-hint">Enter で追加</span>
        </div>
    `).join('');

    // イベントリスナーを設定
    dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
        item.addEventListener('click', () => selectAutocompleteItem(index));
        item.addEventListener('mouseenter', () => setAutocompleteIndex(index));
    });

    // 最初の項目を選択
    autocompleteIndex = 0;
    updateAutocompleteSelection();
    showAutocomplete();
}

function handleAutocompleteKeydown(event) {
    if (!isAutocompleteVisible || autocompleteItems.length === 0) return;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            autocompleteIndex = (autocompleteIndex + 1) % autocompleteItems.length;
            updateAutocompleteSelection();
            break;
        case 'ArrowUp':
            event.preventDefault();
            autocompleteIndex = autocompleteIndex <= 0
                ? autocompleteItems.length - 1
                : autocompleteIndex - 1;
            updateAutocompleteSelection();
            break;
        case 'Enter':
            event.preventDefault();
            if (autocompleteIndex >= 0 && autocompleteIndex < autocompleteItems.length) {
                selectAutocompleteItem(autocompleteIndex);
            }
            break;
        case 'Escape':
            event.preventDefault();
            hideAutocomplete();
            break;
    }
}

function selectAutocompleteItem(index) {
    if (index < 0 || index >= autocompleteItems.length) return;

    const selectedPart = autocompleteItems[index];

    // パーツを選択
    selectPartInGrid(selectedPart.id);

    // 文章に追加
    addPartToSentence();

    // 検索をクリア
    clearPartsSearch();

    showMessage('sentences-messages', 'success',
        `パーツ「${selectedPart.id}: ${selectedPart.text}」を追加しました`);
}

function setAutocompleteIndex(index) {
    autocompleteIndex = index;
    updateAutocompleteSelection();
}

function updateAutocompleteSelection() {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (!dropdown) return;

    dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
        if (index === autocompleteIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function showAutocomplete() {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (dropdown) {
        dropdown.style.display = 'block';
        isAutocompleteVisible = true;
    }
}

function hideAutocomplete() {
    const dropdown = document.getElementById('autocomplete-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
        isAutocompleteVisible = false;
        autocompleteIndex = -1;
        autocompleteItems = [];
    }
}

function toggleAutoAdd() {
    AppState.ui.autoAddMode = !AppState.ui.autoAddMode;
    const toggleBtn = document.getElementById('auto-add-btn');
    const partOptions = document.querySelectorAll('.part-option');

    if (AppState.ui.autoAddMode) {
        toggleBtn.innerHTML = '<span class="btn-icon">⚡</span>通常モード';
        toggleBtn.classList.remove('btn-info');
        toggleBtn.classList.add('btn-success');
        toggleBtn.title = '現在: ワンクリック追加モード（クリックで即座に追加）';

        // パーツオプションにクラスを追加
        partOptions.forEach(option => {
            option.classList.add('auto-add-mode');
            option.title = 'クリックで即座に追加';
        });

        showMessage('sentences-messages', 'info', '⚡ ワンクリック追加モードが有効になりました。パーツをクリックすると即座に追加されます。');
    } else {
        toggleBtn.innerHTML = '<span class="btn-icon">⚡</span>ワンクリック追加';
        toggleBtn.classList.remove('btn-success');
        toggleBtn.classList.add('btn-info');
        toggleBtn.title = 'ワンクリック追加モードに切り替え（クリックで即座に追加）';

        // パーツオプションからクラスを削除
        partOptions.forEach(option => {
            option.classList.remove('auto-add-mode');
            option.title = 'クリックで選択、ダブルクリックで追加';
        });

        showMessage('sentences-messages', 'info', '🔄 通常モードに戻りました。パーツを選択してから追加ボタンを押してください。');
    }

    hideMessagesAfterDelay('sentences-messages', 2000);
}

// マウス操作用のパーツクリックハンドラー
function handlePartClick(partId, event) {
    event.preventDefault();

    if (AppState.ui.autoAddMode) {
        // ワンクリック追加モードの場合は即座に追加
        selectPartInGrid(partId);
        setTimeout(() => {
            addPartToSentence();
        }, 50); // 少し遅延させて選択状態を確実にする
    } else {
        // 通常モードの場合は選択のみ
        selectPartInGrid(partId);
    }
}

// ダブルクリックハンドラー
function handlePartDoubleClick(partId, event) {
    event.preventDefault();
    event.stopPropagation();

    if (!AppState.ui.autoAddMode) {
        // 通常モードでダブルクリックの場合は直接追加
        selectPartInGrid(partId);
        setTimeout(() => {
            addPartToSentence();
        }, 50);
    }
}

// 右クリックハンドラー（コンテキストメニュー）
function handlePartRightClick(partId, event) {
    event.preventDefault();

    const part = partsData.find(p => p.id === partId);
    if (!part) return;

    // 簡易コンテキストメニューを作成
    const menu = createContextMenu([
        {
            label: '📌 選択',
            action: () => selectPartInGrid(partId)
        },
        {
            label: '➕ 追加',
            action: () => {
                selectPartInGrid(partId);
                setTimeout(() => addPartToSentence(), 50);
            }
        },
        {
            label: '🔍 詳細表示',
            action: () => showPartDetails(part)
        }
    ], event.pageX, event.pageY);

    document.body.appendChild(menu);
}

// 簡易コンテキストメニューの作成
function createContextMenu(items, x, y) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'absolute';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.background = 'var(--background-card)';
    menu.style.border = '1px solid var(--border-color)';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = 'var(--shadow-md)';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '120px';

    items.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.textContent = item.label;
        menuItem.style.padding = '8px 12px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.borderBottom = '1px solid var(--border-light)';

        menuItem.addEventListener('click', () => {
            item.action();
            document.body.removeChild(menu);
        });

        menuItem.addEventListener('mouseenter', () => {
            menuItem.style.backgroundColor = 'var(--primary-light)';
        });

        menuItem.addEventListener('mouseleave', () => {
            menuItem.style.backgroundColor = 'var(--background-card)';
        });

        menu.appendChild(menuItem);
    });

    // メニュー外クリックで閉じる
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(event) {
            if (!menu.contains(event.target)) {
                document.removeEventListener('click', closeMenu);
                if (menu.parentNode) {
                    document.body.removeChild(menu);
                }
            }
        });
    }, 0);

    return menu;
}

// パーツ詳細表示
function showPartDetails(part) {
    const message = `
        <strong>パーツ詳細</strong><br>
        <strong>ID:</strong> ${part.id}<br>
        <strong>テキスト:</strong> ${part.text}<br>
        <strong>音声ファイル:</strong> ${part.audio}
    `;
    showMessage('sentences-messages', 'info', message);
    hideMessagesAfterDelay('sentences-messages', 4000);
}

// 文章にパーツ追加
function addPartToSentence() {
    try {
        console.log('文章パーツ追加開始');

        // 選択されたIDを取得
        let selectedId = selectedPartInGrid || AppState.ui.selectedPartInGrid;

        console.log('選択されたパーツID:', selectedId);

        if (!selectedId) {
            showMessage('sentences-messages', 'error', 'パーツを選択してください。');
            return;
        }

        const selectedPart = partsData.find(part => part.id === selectedId);
        if (!selectedPart) {
            showMessage('sentences-messages', 'error', `選択されたパーツ「${selectedId}」が見つかりません。`);
            return;
        }

        const container = document.getElementById('selected-parts');
        if (!container) {
            showMessage('sentences-messages', 'error', '選択パーツ表示エリアが見つかりません。');
            return;
        }

        // 初回追加時に「まだパーツが選択されていません」のメッセージを削除
        const noPartsMessage = container.querySelector('.no-parts-selected');
        if (noPartsMessage) {
            noPartsMessage.remove();
        }

        const partSpan = document.createElement('span');
        partSpan.className = 'selected-part';
        partSpan.dataset.partId = selectedId;
        partSpan.draggable = true;

        // ドラッグ&ドロップイベントハンドラーを追加
        partSpan.addEventListener('dragstart', handleDragStart);
        partSpan.addEventListener('dragend', handleDragEnd);

        partSpan.innerHTML = `
            <span class="part-text">${selectedPart.text}</span>
            <div class="move-controls">
                <button class="move-btn" onclick="movePartUp(this)" title="上に移動">↑</button>
                <button class="move-btn" onclick="movePartDown(this)" title="下に移動">↓</button>
            </div>
            <span class="remove" onclick="removePartFromSentence(this)" title="削除">×</span>
        `;

        container.appendChild(partSpan);

        // 選択をクリア（修正版）
        selectedPartInGrid = null;
        AppState.ui.selectedPartInGrid = null;
        document.querySelectorAll('.part-option.selected').forEach(option => {
            option.classList.remove('selected');
        });
        const addButton = document.getElementById('add-part-btn');
        if (addButton) {
            addButton.disabled = true;
        }

        // 移動ボタンの状態を更新
        updateMoveButtonStates();

        // 成功メッセージ
        showMessage('sentences-messages', 'success', `✨ パーツ「${selectedPart.text}」を追加しました`);
        hideMessagesAfterDelay('sentences-messages');

        console.log('文章パーツ追加完了:', selectedPart);

        // 検索入力にフォーカスを戻す
        setTimeout(() => {
            const searchInput = document.getElementById('parts-search-input');
            if (searchInput) {
                searchInput.focus();
            }
        }, 100);
    } catch (error) {
        console.error('文章パーツ追加エラー:', error);
        showMessage('sentences-messages', 'error', 'パーツの追加でエラーが発生しました: ' + error.message);
    }
}

// 文章からパーツ削除
function removePartFromSentence(element) {
    const container = element.parentElement.parentElement;
    element.parentElement.remove();

    // パーツがすべて削除された場合、メッセージを表示
    const parts = container.querySelectorAll('.selected-part');
    if (parts.length === 0) {
        container.innerHTML = '<div class="no-parts-selected">まだパーツが選択されていません</div>';
    } else {
        updateMoveButtonStates();
    }
}

// パーツを上に移動
function movePartUp(button) {
    const part = button.closest('.selected-part');
    const prevPart = part.previousElementSibling;
    if (prevPart && prevPart.classList.contains('selected-part')) {
        part.parentNode.insertBefore(part, prevPart);
        updateMoveButtonStates();
    }
}

// パーツを下に移動
function movePartDown(button) {
    const part = button.closest('.selected-part');
    const nextPart = part.nextElementSibling;
    if (nextPart && nextPart.classList.contains('selected-part')) {
        part.parentNode.insertBefore(nextPart, part);
        updateMoveButtonStates();
    }
}

// 移動ボタンの有効/無効状態を更新
function updateMoveButtonStates() {
    const parts = document.querySelectorAll('#selected-parts .selected-part');
    parts.forEach((part, index) => {
        const upBtn = part.querySelector('.move-btn[onclick*="movePartUp"]');
        const downBtn = part.querySelector('.move-btn[onclick*="movePartDown"]');

        if (upBtn) upBtn.disabled = index === 0;
        if (downBtn) downBtn.disabled = index === parts.length - 1;
    });
}

// ドラッグ&ドロップ処理
let draggedPart = null;

function handleDragStart(e) {
    draggedPart = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedPart = null;
}

// 文章パターン追加時にドラッグ&ドロップ領域を初期化
function initializeDragDropArea() {
    const container = document.getElementById('selected-parts');

    container.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
    });

    container.addEventListener('dragleave', function (e) {
        this.classList.remove('drag-over');
    });

    container.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        if (draggedPart) {
            // ドロップ位置を計算
            const afterElement = getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggedPart);
            } else {
                container.insertBefore(draggedPart, afterElement);
            }
            updateMoveButtonStates();
        }
    });
}

// ドロップ位置を計算する補助関数
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.selected-part:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// 文章パターン追加
function addSentence() {
    const text = document.getElementById('sentence-text').value.trim();
    const selectedParts = document.querySelectorAll('#selected-parts .selected-part');

    // バリデーション
    if (!text) {
        showMessage('sentences-messages', 'error', '文章説明を入力してください。');
        return;
    }

    if (selectedParts.length === 0) {
        showMessage('sentences-messages', 'error', '少なくとも1つのパーツを選択してください。');
        return;
    }

    // 重複チェック
    if (sentencesData.some(sentence => sentence.text === text)) {
        showMessage('sentences-messages', 'warning', '同じ文章説明が既に存在します。');
    }

    const partIds = Array.from(selectedParts).map(part => part.dataset.partId);

    // 存在しないパーツIDのチェック
    const missingParts = partIds.filter(partId =>
        !partsData.find(part => part.id === partId)
    );

    if (missingParts.length > 0) {
        showMessage('sentences-messages', 'error', `使用されているパーツID「${missingParts.join(', ')}」が見つかりません。`);
        return;
    }

    const newSentence = {
        text: text,
        partIds: partIds
    };

    sentencesData.push(newSentence);

    // フォームをクリア
    document.getElementById('sentence-text').value = '';
    const selectedPartsContainer = document.getElementById('selected-parts');
    selectedPartsContainer.innerHTML = '<div class="no-parts-selected">まだパーツが選択されていません</div>';

    updateSentencesDisplay();
    updateConfigPreview();
    updateExportButtons();

    showMessage('sentences-messages', 'success', '文章パターンが正常に追加されました！');
    hideMessagesAfterDelay('sentences-messages');
}

// 文章パターン表示更新
function updateSentencesDisplay() {
    const container = document.getElementById('sentences-list');
    container.innerHTML = '';

    sentencesData.forEach((sentence, index) => {
        const sentenceDiv = document.createElement('div');
        sentenceDiv.className = 'sentence-item';

        const partsPreview = sentence.partIds.map(id => {
            const part = partsData.find(p => p.id === id);
            return part ? part.text : `[${id}]`;
        }).join(' → ');

        sentenceDiv.innerHTML = `
            <h4>${sentence.text}</h4>
            <div class="sentence-parts-preview">${partsPreview}</div>
            <div style="color: var(--text-secondary); font-size: 0.9em;">パーツID: ${sentence.partIds.join(', ')}</div>
            <button onclick="removeSentence(${index})" class="btn btn-danger btn-small" style="margin-top: 10px;">削除</button>
        `;
        container.appendChild(sentenceDiv);
    });

    if (sentencesData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">文章パターンが登録されていません。</p>';
    }
}

// 文章パターン削除
function removeSentence(index) {
    if (confirm('この文章パターンを削除しますか？')) {
        sentencesData.splice(index, 1);
        updateSentencesDisplay();
        updateConfigPreview();
    }
}

// 設定ファイルプレビュー更新
function updateConfigPreview() {
    const config = {
        parts: partsData,
        sentences: sentencesData
    };

    const preview = document.getElementById('config-preview');
    preview.value = JSON.stringify(config, null, 4);
}

// config.jsonダウンロード
function downloadConfig() {
    const config = {
        parts: partsData,
        sentences: sentencesData
    };

    const blob = new Blob([JSON.stringify(config, null, 4)], {
        type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Zipファイルダウンロード
async function downloadZip() {
    if (partsData.length === 0) {
        alert('パーツが登録されていません。');
        return;
    }

    // JSZipライブラリの使用（CDNから読み込み）
    if (typeof JSZip === 'undefined') {
        alert('JSZipライブラリが読み込まれていません。インターネット接続を確認してください。');
        return;
    }

    const zip = new JSZip();

    // config.jsonを追加
    const config = {
        parts: partsData,
        sentences: sentencesData
    };
    zip.file('config.json', JSON.stringify(config, null, 4));

    // 音声ファイルを追加
    for (const [id, file] of audioFiles) {
        const part = partsData.find(p => p.id === id);
        if (part) {
            zip.file(part.audio, file);
        }
    }

    try {
        const content = await zip.generateAsync({ type: 'blob' });

        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'train-speak-config.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('Zipファイルのダウンロードが完了しました！');
    } catch (error) {
        alert('Zipファイルの生成中にエラーが発生しました: ' + error.message);
    }
}

// サンプルデータ読み込み（開発用）
function loadSampleData() {
    // サンプルパーツデータ
    const sampleParts = [
        { id: 'mamonaku', text: 'まもなく', audio: 'まもなく.wav' },
        { id: 'platform1', text: '1番のりば', audio: '1番のりば.wav' },
        { id: 'ni', text: 'に', audio: 'に.wav' },
        { id: 'nagoya', text: '名古屋', audio: '名古屋.wav' },
        { id: 'boundfor', text: 'ゆき', audio: 'ゆき.wav' },
        { id: 'local', text: '普通', audio: '普通.wav' },
        { id: 'ga', text: 'が', audio: 'が.wav' },
        { id: 'mairimasu', text: 'まいります', audio: 'まいります.wav' }
    ];

    const sampleSentences = [
        {
            text: '名古屋行普通電車案内',
            partIds: ['mamonaku', 'platform1', 'ni', 'nagoya', 'boundfor', 'local', 'ga', 'mairimasu']
        }
    ];

    partsData = sampleParts;
    sentencesData = sampleSentences;

    updatePartsDisplay();
    updateSentencesDisplay();
    updateAvailableParts();
    updateConfigPreview();
}

// VOICEVOX関連の関数

// 日本語テキストをひらがなに変換する簡易関数（主要な駅名・鉄道用語）
function toHiragana(text) {
    const kanjiToHiragana = {
        // 駅名
        '名古屋': 'なごや',
        '富吉': 'とみよし',
        '蟹江': 'かにえ',
        '弥富': 'やとみ',
        '桑名': 'くわな',
        '四日市': 'よっかいち',
        '塩浜': 'しおはま',
        '伊勢若松': 'いせわかまつ',
        '白子': 'しろこ',
        '江戸橋': 'えどばし',
        '津': 'つ',
        '津新町': 'つしんまち',
        '南が丘': 'みなみがおか',
        '久居': 'ひさい',
        '桃園': 'ももぞの',
        '伊勢中川': 'いせなかがわ',
        '松阪': 'まつさか',
        '伊勢市': 'いせし',
        '宇治山田': 'うじやまだ',
        '五十鈴川': 'いすずがわ',
        '鳥羽': 'とば',
        '大阪上本町': 'おおさかうえほんまち',
        '大阪難波': 'おおさかなんば',
        '京都': 'きょうと',
        '賢島': 'かしこじま',
        // 列車種別
        '特急': 'とっきゅう',
        '快速急行': 'かいそくきゅうこう',
        '急行': 'きゅうこう',
        '準急': 'じゅんきゅう',
        '普通': 'ふつう',
        '電車': 'でんしゃ',
        '最終': 'さいしゅう',
        // その他
        'まもなく': 'まもなく',
        '停車駅': 'ていしゃえき',
        'のりば': 'のりば',
        '番線': 'ばんせん',
        '両編成': 'りょうへんせい',
        '各駅': 'かくえき',
        'まいります': 'まいります',
        '連絡します': 'れんらくします',
        '到着します': 'とうちゃくします',
        '変わります': 'かわります',
        '通過します': 'つうかします',
        '危険': 'きけん',
        '黄色': 'きいろ',
        '点字': 'てんじ',
        'ブロック': 'ぶろっく',
        '乗車券': 'じょうしゃけん',
        '特急券': 'とっきゅうけん',
        '必要': 'ひつよう'
    };

    return kanjiToHiragana[text] || text;
}

// 新しいVOICEVOXテキストリスト生成
function generateVoicevoxTextList() {
    try {
        console.log('VOICEVOXリスト生成開始');

        const textInput = document.getElementById('voicevox-text-input');
        if (!textInput) {
            throw new Error('テキスト入力欄が見つかりません');
        }

        const content = textInput.value?.trim() || '';

        if (!content) {
            showMessage('tools-messages', 'warning', 'テキストを入力してください。');
            return;
        }

        // 行ごとに分割してフィルタリング
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log('処理対象行数:', lines.length);

        if (lines.length === 0) {
            showMessage('tools-messages', 'warning', '有効なテキスト行がありません。');
            return;
        }

        // VOICEVOXリスト形式で出力
        const output = lines.join('\n');

        const previewElement = document.getElementById('voicevox-preview');
        const countElement = document.getElementById('voicevox-count');
        const outputSection = document.getElementById('voicevox-output-section');

        if (!previewElement || !countElement || !outputSection) {
            throw new Error('出力要素が見つかりません');
        }

        previewElement.value = output;
        countElement.textContent = lines.length;
        outputSection.style.display = 'block';

        console.log('VOICEVOXリスト生成完了:', lines.length, '件');
        showMessage('tools-messages', 'success', `✨ ${lines.length}件のテキストでVOICEVOXリストを生成しました`);
        hideMessagesAfterDelay('tools-messages');
    } catch (error) {
        console.error('VOICEVOXリスト生成エラー:', error);
        showMessage('tools-messages', 'error', 'VOICEVOXリスト生成でエラーが発生しました: ' + error.message);
    }
}

// VOICEVOXリストをダウンロード
function downloadVoicevoxList() {
    const content = document.getElementById('voicevox-preview').value;

    if (!content.trim()) {
        showMessage('tools-messages', 'error', 'VOICEVOXリストを先に生成してください。');
        return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voicevox-text-list.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('tools-messages', 'success', 'VOICEVOXリストのダウンロードが完了しました！');
    hideMessagesAfterDelay('tools-messages');
}

// VOICEVOX入力をクリア
function clearVoicevoxInput() {
    document.getElementById('voicevox-text-input').value = '';
    document.getElementById('voicevox-preview').value = '';
    document.getElementById('voicevox-output-section').style.display = 'none';
    document.getElementById('voicevox-count').textContent = '0';
}

// パーツ数をリアルタイム更新
function updateCurrentPartsCount() {
    const countElement = document.getElementById('current-parts-count');
    if (countElement) {
        countElement.textContent = partsData.length;
    }
}

// 登録済みパーツのCSVエクスポート
function exportPartsCSV() {
    try {
        console.log('CSVエクスポート開始:', partsData.length, '件');

        if (partsData.length === 0) {
            showMessage('tools-messages', 'warning', 'エクスポートするパーツがありません。');
            return;
        }

        // CSV形式でデータを生成（BOM付きUTF-8）
        const csvData = generatePartsCSV();
        if (!csvData) {
            throw new Error('CSVデータの生成に失敗しました');
        }

        // BOM付きでダウンロード
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvData], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `parts-list-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('CSVエクスポート完了');
        showMessage('tools-messages', 'success', `✨ ${partsData.length}件のパーツをCSVファイルとしてエクスポートしました`);
        hideMessagesAfterDelay('tools-messages');
    } catch (error) {
        console.error('CSVエクスポートエラー:', error);
        showMessage('tools-messages', 'error', 'CSVエクスポートでエラーが発生しました: ' + error.message);
    }
}

// CSVプレビュー表示
function previewPartsCSV() {
    if (partsData.length === 0) {
        showMessage('tools-messages', 'warning', 'プレビューするパーツがありません。');
        return;
    }

    const csvData = generatePartsCSV();
    document.getElementById('csv-preview').value = csvData;
    document.getElementById('csv-preview-section').style.display = 'block';
}

// CSV形式データ生成
function generatePartsCSV() {
    // ヘッダー行
    const headers = ['ID', 'テキスト', '音声ファイル'];
    let csvContent = headers.join(',') + '\n';

    // データ行
    partsData.forEach(part => {
        const row = [
            escapeCSVField(part.id),
            escapeCSVField(part.text),
            escapeCSVField(part.audio)
        ];
        csvContent += row.join(',') + '\n';
    });

    return csvContent;
}

// CSVフィールドのエスケープ処理
function escapeCSVField(field) {
    // カンマ、ダブルクォート、改行が含まれる場合はダブルクォートで囲む
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
        // ダブルクォートはダブルクォート2個でエスケープ
        return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
}

// 旧VOICEVOX機能（互換性のため残す）
function generateVoicevoxList() {
    // 新機能へのリダイレクト
    generateVoicevoxTextList();
}

// 日本語辞書データ（MeCab風の形態素解析機能）
// 動的に拡張可能な辞書システム

// デフォルト辞書の保存用（リセット時に使用）
const defaultJapaneseDict = {
    // 駅名
    '名古屋': { reading: 'なごや', romaji: 'nagoya', type: '地名' },
    '大阪': { reading: 'おおさか', romaji: 'osaka', type: '地名' },
    '東京': { reading: 'とうきょう', romaji: 'tokyo', type: '地名' },
    '京都': { reading: 'きょうと', romaji: 'kyoto', type: '地名' },
    '横浜': { reading: 'よこはま', romaji: 'yokohama', type: '地名' },
    '神戸': { reading: 'こうべ', romaji: 'kobe', type: '地名' },
    '新大阪': { reading: 'しんおおさか', romaji: 'shin-osaka', type: '地名' },
    '品川': { reading: 'しながわ', romaji: 'shinagawa', type: '地名' },
    '新横浜': { reading: 'しんよこはま', romaji: 'shin-yokohama', type: '地名' },
    '博多': { reading: 'はかた', romaji: 'hakata', type: '地名' },
    '仙台': { reading: 'せんだい', romaji: 'sendai', type: '地名' },
    '広島': { reading: 'ひろしま', romaji: 'hiroshima', type: '地名' },

    // 列車種別
    '特急': { reading: 'とっきゅう', romaji: 'tokkyuu', type: '列車種別', short: 'ltdexp' },
    '急行': { reading: 'きゅうこう', romaji: 'kyuukou', type: '列車種別', short: 'exp' },
    '快速': { reading: 'かいそく', romaji: 'kaisoku', type: '列車種別', short: 'rapid' },
    '準急': { reading: 'じゅんきゅう', romaji: 'junkyuu', type: '列車種別', short: 'semiexp' },
    '普通': { reading: 'ふつう', romaji: 'futsuu', type: '列車種別', short: 'local' },
    '各駅停車': { reading: 'かくえきていしゃ', romaji: 'kakueki-teisha', type: '列車種別', short: 'local' },
    '通勤急行': { reading: 'つうきんきゅうこう', romaji: 'tsuukin-kyuukou', type: '列車種別', short: 'comexp' },
    '快速急行': { reading: 'かいそくきゅうこう', romaji: 'kaisoku-kyuukou', type: '列車種別', short: 'rapidexp' },
    '区間急行': { reading: 'くかんきゅうこう', romaji: 'kukan-kyuukou', type: '列車種別', short: 'sectexp' },

    // 時間・動作
    'まもなく': { reading: 'まもなく', romaji: 'mamonaku', type: '副詞', short: 'soon' },
    '次の': { reading: 'つぎの', romaji: 'tsugi-no', type: '連体詞', short: 'next' },
    '最終': { reading: 'さいしゅう', romaji: 'saishuu', type: '名詞', short: 'last' },
    '始発': { reading: 'しはつ', romaji: 'shihatsu', type: '名詞', short: 'first' },
    '到着': { reading: 'とうちゃく', romaji: 'touchaku', type: '名詞', short: 'arrive' },
    '発車': { reading: 'はっしゃ', romaji: 'hassha', type: '名詞', short: 'depart' },
    '通過': { reading: 'つうか', romaji: 'tsuuka', type: '名詞', short: 'pass' },
    '停車': { reading: 'ていしゃ', romaji: 'teisha', type: '名詞', short: 'stop' },

    // 方向・場所
    '上り': { reading: 'のぼり', romaji: 'nobori', type: '名詞', short: 'up' },
    '下り': { reading: 'くだり', romaji: 'kudari', type: '名詞', short: 'down' },
    '行き': { reading: 'いき', romaji: 'iki', type: '接尾辞', short: 'bound' },
    '方面': { reading: 'ほうめん', romaji: 'houmen', type: '名詞', short: 'direction' },
    '経由': { reading: 'けいゆ', romaji: 'keiyu', type: '名詞', short: 'via' },
    '直通': { reading: 'ちょくつう', romaji: 'chokutsuu', type: '名詞', short: 'direct' },
    'のりば': { reading: 'のりば', romaji: 'noriba', type: '名詞', short: 'platform' },
    '番線': { reading: 'ばんせん', romaji: 'bansen', type: '名詞', short: 'track' },
    'ホーム': { reading: 'ほーむ', romaji: 'hoomu', type: '名詞', short: 'platform' },
    '改札': { reading: 'かいさつ', romaji: 'kaisatsu', type: '名詞', short: 'gate' },

    // 編成・車両
    '両編成': { reading: 'りょうへんせい', romaji: 'ryou-hensei', type: '名詞', short: 'cars' },
    '号車': { reading: 'ごうしゃ', romaji: 'gousha', type: '名詞', short: 'car' },
    '自由席': { reading: 'じゆうせき', romaji: 'jiyuuseki', type: '名詞', short: 'nonreserved' },
    '指定席': { reading: 'していせき', romaji: 'shiteiseki', type: '名詞', short: 'reserved' },
    'グリーン車': { reading: 'ぐりーんしゃ', romaji: 'guriin-sha', type: '名詞', short: 'green' },

    // 数字
    '一': { reading: 'いち', romaji: 'ichi', type: '数詞', short: '1' },
    '二': { reading: 'に', romaji: 'ni', type: '数詞', short: '2' },
    '三': { reading: 'さん', romaji: 'san', type: '数詞', short: '3' },
    '四': { reading: 'よん', romaji: 'yon', type: '数詞', short: '4' },
    '五': { reading: 'ご', romaji: 'go', type: '数詞', short: '5' },
    '六': { reading: 'ろく', romaji: 'roku', type: '数詞', short: '6' },
    '七': { reading: 'なな', romaji: 'nana', type: '数詞', short: '7' },
    '八': { reading: 'はち', romaji: 'hachi', type: '数詞', short: '8' },
    '九': { reading: 'きゅう', romaji: 'kyuu', type: '数詞', short: '9' },
    '十': { reading: 'じゅう', romaji: 'juu', type: '数詞', short: '10' },

    // 助詞・語尾
    'は': { reading: 'は', romaji: 'wa', type: '助詞', short: 'wa' },
    'が': { reading: 'が', romaji: 'ga', type: '助詞', short: 'ga' },
    'を': { reading: 'を', romaji: 'wo', type: '助詞', short: 'wo' },
    'に': { reading: 'に', romaji: 'ni', type: '助詞', short: 'ni' },
    'で': { reading: 'で', romaji: 'de', type: '助詞', short: 'de' },
    'と': { reading: 'と', romaji: 'to', type: '助詞', short: 'to' },
    'の': { reading: 'の', romaji: 'no', type: '助詞', short: 'no' },
    'へ': { reading: 'へ', romaji: 'e', type: '助詞', short: 'e' },
    'から': { reading: 'から', romaji: 'kara', type: '助詞', short: 'from' },
    'まで': { reading: 'まで', romaji: 'made', type: '助詞', short: 'to' },
    'です': { reading: 'です', romaji: 'desu', type: '語尾', short: '' },
    'ます': { reading: 'ます', romaji: 'masu', type: '語尾', short: '' },
    'まいります': { reading: 'まいります', romaji: 'mairimasu', type: '動詞', short: 'go' },
    'います': { reading: 'います', romaji: 'imasu', type: '動詞', short: 'be' },
    'します': { reading: 'します', romaji: 'shimasu', type: '動詞', short: 'do' }
};

// カスタム辞書データ（ユーザーが追加した単語）
let customDict = {};

// 実際に使用する辞書（デフォルト + カスタム）
let japaneseDict = { ...defaultJapaneseDict };

// カスタム辞書の初期化（ローカルストレージから読み込み）
function initializeCustomDict() {
    try {
        const saved = localStorage.getItem('customJapaneseDict');
        if (saved) {
            customDict = JSON.parse(saved);
            // japaneseDict にカスタム辞書をマージ
            japaneseDict = { ...defaultJapaneseDict, ...customDict };
            console.log('カスタム辞書を読み込みました:', Object.keys(customDict).length + '語');
        }
    } catch (error) {
        console.error('カスタム辞書の読み込みに失敗:', error);
        customDict = {};
    }
}

// カスタム辞書を保存
function saveCustomDict() {
    try {
        localStorage.setItem('customJapaneseDict', JSON.stringify(customDict));
    } catch (error) {
        console.error('カスタム辞書の保存に失敗:', error);
    }
}

// 高度な形態素解析（Kuromoji使用）
async function advancedMorphologyAnalysis(text) {
    // Kuromojiが利用可能でない場合はフォールバック
    if (!morphologyTokenizer) {
        console.log('Kuromojiが利用できません。従来の解析を使用します。');
        return analyzeJapaneseText(text);
    }

    try {
        const tokens = morphologyTokenizer.tokenize(text);
        const results = [];

        for (const token of tokens) {
            // 鉄道用語マッピングをチェック
            const railwayMapping = railwayTermsMapping[token.surface_form];

            let wordInfo = {
                surface: token.surface_form,
                reading: token.reading || token.surface_form,
                pronunciation: token.pronunciation || token.reading || token.surface_form,
                pos: token.part_of_speech,
                basic_form: token.basic_form || token.surface_form
            };

            if (railwayMapping) {
                // 鉄道用語として処理
                wordInfo.type = railwayMapping.type;
                wordInfo.romaji = railwayMapping.romaji;
                wordInfo.short = railwayMapping.short;
                wordInfo.isRailwayTerm = true;
            } else {
                // 一般的な単語として処理
                wordInfo.type = classifyPartOfSpeech(token.part_of_speech);
                wordInfo.romaji = kanaToRomaji(token.reading || token.surface_form);
                wordInfo.short = generateShortId(wordInfo.romaji, wordInfo.type);
                wordInfo.isRailwayTerm = false;
            }

            // ASCII文字以外を含む不正なromajiをフィルタリング
            if (wordInfo.romaji) {
                wordInfo.romaji = wordInfo.romaji.replace(/[^a-zA-Z0-9_-]/g, '');
            }
            if (wordInfo.short) {
                wordInfo.short = wordInfo.short.replace(/[^a-zA-Z0-9_-]/g, '');
            }

            results.push(wordInfo);
        }

        return results;
    } catch (error) {
        console.error('Kuromoji解析エラー:', error);
        // エラー時はフォールバック
        return analyzeJapaneseText(text);
    }
}

// 品詞分類の標準化
function classifyPartOfSpeech(posString) {
    if (!posString) return '未知語';

    const pos = posString.split(',')[0]; // 主要品詞を取得

    const posMapping = {
        '名詞': '名詞',
        '動詞': '動詞',
        '形容詞': '形容詞',
        '副詞': '副詞',
        '助詞': '助詞',
        '助動詞': '助動詞',
        '連体詞': '連体詞',
        '接続詞': '接続詞',
        '感動詞': '感動詞',
        '記号': '記号',
        '補助記号': '記号',
        '数': '数詞'
    };

    return posMapping[pos] || '未知語';
}

// かな文字をローマ字に変換（ヘボン式準拠）
function kanaToRomaji(kana) {
    if (!kana) return '';

    // ヘボン式ローマ字変換マップ
    const hepburnMap = {
        // 基本母音
        'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',

        // か行
        'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',

        // さ行（ヘボン式: し=shi, ふ=fu）
        'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',

        // た行（ヘボン式: ち=chi, つ=tsu）
        'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',

        // な行
        'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',

        // は行（ヘボン式: ふ=fu）
        'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',

        // ま行
        'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',

        // や行
        'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',

        // ら行
        'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',

        // わ行（ヘボン式: を=o）
        'ワ': 'wa', 'ヲ': 'o', 'ん': 'n', 'ン': 'n',
        'わ': 'wa', 'を': 'o',

        // 拗音（ヘボン式）
        'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
        'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
        'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
        'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
        'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
        'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
        'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
        'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
        'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
        'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
        'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
        'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
        'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
        'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
        'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
        'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
        'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
        'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
        'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
        'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
        'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',
        'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',

        // 長音・促音（ヘボン式では表記されない場合が多い）
        'ー': '', 'っ': '', 'ッ': ''
    };

    // 拗音を先に処理（2文字の組み合わせを優先）
    let result = kana;

    // 拗音の処理（きゃ、しゃ、ちゃなど）
    const youonPatterns = [
        /[きギ]ゃ/g, /[きギ]ゅ/g, /[きギ]ょ/g,
        /[しジ]ゃ/g, /[しジ]ゅ/g, /[しジ]ょ/g,
        /[ちヂ]ゃ/g, /[ちヂ]ゅ/g, /[ちヂ]ょ/g,
        /[にニ]ゃ/g, /[にニ]ゅ/g, /[にニ]ょ/g,
        /[ひビピ]ゃ/g, /[ひビピ]ゅ/g, /[ひビピ]ょ/g,
        /[みミ]ゃ/g, /[みミ]ゅ/g, /[みミ]ょ/g,
        /[りリ]ゃ/g, /[りリ]ゅ/g, /[りリ]ょ/g,
        /[ぎギ]ゃ/g, /[ぎギ]ゅ/g, /[ぎギ]ょ/g,
        /[じジ]ゃ/g, /[じジ]ゅ/g, /[じジ]ょ/g,
        /[びビ]ゃ/g, /[びビ]ゅ/g, /[びビ]ょ/g,
        /[ぴピ]ゃ/g, /[ぴピ]ゅ/g, /[ぴピ]ょ/g
    ];

    // 1文字ずつ変換
    return result.split('').map(char => {
        // ASCII文字の場合はそのまま返す
        if (/^[\x00-\x7F]+$/.test(char)) {
            return char;
        }
        // ヘボン式マップで変換、マッピングにない場合は除去
        return hepburnMap[char] || '';
    }).join('')
        .replace(/uu/g, 'u')     // 長音の修正（ヘボン式）
        .replace(/ou/g, 'o')     // 長音の修正（ヘボン式）  
        .replace(/ee/g, 'e')     // エイ音の修正（ヘボン式）
        .replace(/ii/g, 'i')     // イイ音の修正（ヘボン式）
        .replace(/nn([bpm])/g, 'm$1') // ンはb,p,mの前でmになる（ヘボン式）
        .replace(/-/g, '')       // ハイフンの除去
        .replace(/[^a-zA-Z0-9_]/g, ''); // ASCII英数字とアンダースコア以外を除去
}

// 短縮IDの生成
function generateShortId(romaji, type) {
    if (!romaji) return '';

    // まず非ASCII文字を除去
    romaji = romaji.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!romaji) return '';

    // 品詞別の短縮ルール
    const shorteningRules = {
        '地名': (r) => r.length > 6 ? r.substring(0, 6) : r,
        '列車種別': (r) => r.replace(/kyuu/g, 'kyu').replace(/soku/g, 'sok'),
        '副詞': (r) => r.length > 4 ? r.substring(0, 4) : r,
        '名詞': (r) => r.length > 5 ? r.substring(0, 5) : r,
        '動詞': (r) => r.replace(/masu/g, '').replace(/desu/g, ''),
        '数詞': (r) => r.replace(/ichi/g, '1').replace(/ni/g, '2').replace(/san/g, '3')
    };

    const rule = shorteningRules[type];
    const result = rule ? rule(romaji) : romaji;

    // 最終的にASCII文字のみを確保
    return result.replace(/[^a-zA-Z0-9_]/g, '');
}

// 改良されたID生成関数（Kuromoji対応）
async function generateIdFromText() {
    const text = document.getElementById('part-text').value.trim();
    if (!text) {
        showMessage('parts-messages', 'warning', '表示テキストを入力してください。');
        return;
    }

    // Kuromojiの初期化状態をチェック
    if (isTokenizerLoading) {
        showMessage('parts-messages', 'info', '形態素解析器を初期化中です。少々お待ちください...');
        // 初期化完了まで待機
        while (isTokenizerLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // 高度な形態素解析を実行
    const words = await advancedMorphologyAnalysis(text);
    console.log('形態素解析結果:', words);

    // IDパーツを生成
    let idParts = [];

    for (const word of words) {
        // 語尾や助詞、記号はスキップ
        if (word.type === '語尾' || word.type === '助詞' || word.type === '記号') {
            continue;
        }

        // 鉄道用語は優先的に短縮IDを使用
        if (word.isRailwayTerm && word.short && word.short !== '') {
            // ASCII文字のみを抽出
            const cleanShort = word.short.replace(/[^a-zA-Z0-9_]/g, '');
            if (cleanShort) {
                idParts.push(cleanShort);
            }
        } else if (word.short && word.short !== '') {
            // ASCII文字のみを抽出
            const cleanShort = word.short.replace(/[^a-zA-Z0-9_]/g, '');
            if (cleanShort) {
                idParts.push(cleanShort);
            }
        } else if (word.romaji && word.type !== '未知語') {
            // ローマ字を英語ID風に変換
            let romaji = word.romaji
                .replace(/uu/g, 'u')  // 長音を短縮
                .replace(/ou/g, 'o')  // 長音を短縮
                .replace(/-/g, '')    // ハイフンを除去
                .replace(/[^a-zA-Z0-9]/g, ''); // 非ASCII文字を除去
            if (romaji) {
                idParts.push(romaji);
            }
        }
    }

    let generatedId = idParts.join('_');

    // IDが空または短すぎる場合の処理
    if (!generatedId || generatedId.length < 2) {
        // テキストの読み仮名からローマ字変換
        const readings = words.map(w => w.reading || w.surface).join('');
        generatedId = kanaToRomaji(readings);

        if (!generatedId || generatedId.length < 2) {
            // それでも失敗した場合はランダムID
            generatedId = 'part_' + Math.random().toString(36).substr(2, 6);
        }
    }

    // 既存IDとの重複チェック
    let finalId = generatedId;
    let counter = 1;
    while (partsData.some(part => part.id === finalId)) {
        finalId = generatedId + '_' + counter;
        counter++;
    }

    document.getElementById('part-id').value = finalId;

    // 生成プロセスの説明を表示
    const analysisInfo = words.map(w => {
        let typeInfo = w.isRailwayTerm ? `${w.type}★` : w.type;
        return `${w.surface}(${typeInfo}: ${w.reading || w.surface})`;
    }).join(' + ');

    let message = `ID生成完了: "${finalId}"<br>`;
    message += `<small>解析: ${analysisInfo}</small>`;

    if (morphologyTokenizer) {
        message += '<br><small>🤖 高精度形態素解析を使用</small>';
    } else {
        message += '<br><small>📚 辞書ベース解析を使用</small>';
    }

    showMessage('parts-messages', 'info', message);
    hideMessagesAfterDelay('parts-messages', 6000);
}

// テキスト入力時のID候補表示（Kuromoji対応）
async function suggestIdFromText() {
    const text = document.getElementById('part-text').value.trim();
    const hintElement = document.getElementById('reading-hint');

    if (text) {
        try {
            // 高度な形態素解析を実行
            const words = await advancedMorphologyAnalysis(text);

            // 読み方情報を生成
            const readings = words.map(w => w.reading || w.surface).join('');
            const romaji = words.map(w => w.romaji || w.surface).join(' ');

            // 推奨IDを生成
            const idParts = [];
            for (const word of words) {
                if (word.type !== '語尾' && word.type !== '助詞' && word.type !== '記号') {
                    if (word.isRailwayTerm && word.short && word.short !== '') {
                        const cleanShort = word.short.replace(/[^a-zA-Z0-9_]/g, '');
                        if (cleanShort) {
                            idParts.push(cleanShort + '★'); // 鉄道用語にマーク
                        }
                    } else if (word.short && word.short !== '') {
                        const cleanShort = word.short.replace(/[^a-zA-Z0-9_]/g, '');
                        if (cleanShort) {
                            idParts.push(cleanShort);
                        }
                    } else if (word.romaji && word.type !== '未知語') {
                        let cleanRomaji = word.romaji
                            .replace(/uu/g, 'u')  // 長音を短縮
                            .replace(/ou/g, 'o')  // 長音を短縮
                            .replace(/-/g, '')
                            .replace(/[^a-zA-Z0-9]/g, ''); // 非ASCII文字を除去
                        if (cleanRomaji) {
                            idParts.push(cleanRomaji);
                        }
                    }
                }
            }

            const suggestedId = idParts.join('_').replace(/★/g, ''); // マークを除去

            if (readings !== text || suggestedId) {
                let hint = '';
                if (readings !== text) {
                    hint += `読み: ${readings}`;
                }
                if (suggestedId) {
                    hint += (hint ? ' → ' : '') + `推奨ID: ${suggestedId}`;
                }

                // 解析エンジンの表示
                const engineInfo = morphologyTokenizer ? ' 🤖' : ' 📚';
                hintElement.innerHTML = `<small style="color: var(--text-secondary);">${hint}${engineInfo}</small>`;
            } else {
                hintElement.textContent = '';
            }
        } catch (error) {
            console.error('ID候補生成エラー:', error);
            hintElement.innerHTML = `<small style="color: var(--text-muted);">解析中...</small>`;
        }
    } else {
        hintElement.textContent = '';
    }
}

// フォールバック用の従来の解析関数（Kuromojiが利用できない場合）
function analyzeJapaneseText(text) {
    const words = [];
    let i = 0;

    while (i < text.length) {
        let found = false;

        // 最長一致で辞書検索（長い単語から優先）
        for (let len = Math.min(text.length - i, 10); len >= 1; len--) {
            const substring = text.substr(i, len);
            if (japaneseDict[substring]) {
                words.push({
                    surface: substring,
                    reading: japaneseDict[substring].reading,
                    romaji: japaneseDict[substring].romaji,
                    type: japaneseDict[substring].type,
                    short: japaneseDict[substring].short,
                    isRailwayTerm: true
                });
                i += len;
                found = true;
                break;
            }
        }

        if (!found) {
            // 辞書にない文字は1文字ずつ処理
            const char = text[i];
            words.push({
                surface: char,
                reading: char,
                romaji: char,
                type: '未知語',
                isRailwayTerm: false
            });
            i++;
        }
    }

    return words;
}

// 一括VOICEVOX用リスト生成
function generateBulkVoicevoxList() {
    // 音声作成ツールタブのテキストエリアを使用
    const textInput = document.getElementById('tools-bulk-text-input');

    if (!textInput) {
        alert('テキスト入力エリアが見つかりません。');
        return;
    }

    const textValue = textInput.value.trim();
    if (!textValue) {
        alert('テキストを入力してください。');
        return;
    }

    const lines = textValue.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
        alert('有効なテキストが見つかりません。');
        return;
    }

    // シンプルにテキストのみのリストを生成
    let output = '';
    lines.forEach((text) => {
        const cleanText = text.trim();
        output += cleanText + '\n';
    });

    // 音声作成ツールタブの出力エリアを使用
    const previewElement = document.getElementById('tools-bulk-voicevox-preview');
    const outputElement = document.getElementById('tools-bulk-voicevox-output'); if (!previewElement || !previewElement.offsetParent) {
        // パーツ管理タブのプレビューが見えない場合、ツールタブを使用
        previewElement = document.getElementById('tools-bulk-voicevox-preview');
        outputElement = document.getElementById('tools-bulk-voicevox-output');
    }

    if (previewElement && outputElement) {
        previewElement.value = output;
        outputElement.style.display = 'block';
    } else {
        alert('出力エリアが見つかりません。');
    }
}

// 一括VOICEVOXリストのダウンロード
function downloadBulkVoicevoxList() {
    // 音声作成ツールタブのプレビュー要素を使用
    const previewElement = document.getElementById('tools-bulk-voicevox-preview');

    if (!previewElement) {
        alert('プレビューエリアが見つかりません。');
        return;
    }

    const content = previewElement.value;
    if (!content.trim()) {
        alert('リストを先に生成してください。');
        return;
    } const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voicevox-bulk-list.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// よく使う鉄道用語を表示
function showCommonTerms() {
    const currentText = document.getElementById('bulk-text-input').value;
    let termsHtml = '<div class="common-terms"><h4>よく使う鉄道用語</h4>';
    termsHtml += '<p>クリックして一括入力欄に追加できます。</p>';

    Object.keys(commonRailwayTerms).forEach(category => {
        termsHtml += `<h5>${category}</h5><div class="terms-grid">`;
        commonRailwayTerms[category].forEach(term => {
            termsHtml += `<div class="term-item" onclick="addTermToBulkInput('${term}')">${term}</div>`;
        });
        termsHtml += '</div>';
    });

    termsHtml += '<button onclick="closeCommonTerms()" class="btn btn-small" style="margin-top: 15px;">閉じる</button></div>';

    // 既存の用語表示を削除
    const existingTerms = document.querySelector('.common-terms');
    if (existingTerms) {
        existingTerms.remove();
    }

    // 新しい用語表示を追加
    const outputDiv = document.getElementById('bulk-voicevox-output');
    outputDiv.insertAdjacentHTML('afterend', termsHtml);
}

// 用語を一括入力欄に追加
function addTermToBulkInput(term) {
    // 音声作成ツールタブのテキストエリアを使用
    const textArea = document.getElementById('tools-bulk-text-input');

    if (!textArea) {
        alert('テキスト入力エリアが見つかりません。');
        return;
    }

    const currentValue = textArea.value;
    const newValue = currentValue ? currentValue + '\n' + term : term;
    textArea.value = newValue;

    // 用語項目をハイライト
    const termItems = document.querySelectorAll('.term-item');
    termItems.forEach(item => {
        if (item.textContent === term) {
            item.classList.add('selected');
            setTimeout(() => item.classList.remove('selected'), 500);
        }
    });
}

// 用語表示を閉じる
function closeCommonTerms() {
    const termsDiv = document.querySelector('.common-terms');
    if (termsDiv) {
        termsDiv.remove();
    }
}

// 一括音声ファイル処理
async function processBulkAudioFiles() {
    const fileInput = document.getElementById('bulk-audio-files');
    const files = fileInput.files;

    if (files.length === 0) {
        alert('音声ファイルを選択してください。');
        return;
    }

    const autoGenerateId = document.getElementById('auto-generate-id').checked;
    bulkRegistrationData = [];

    // 形態素解析の準備
    if (isTokenizerLoading) {
        showMessage('parts-messages', 'info', '🤖 形態素解析器を初期化中です。少々お待ちください...');
        while (isTokenizerLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    const promises = Array.from(files).map(async (file, index) => {
        const filename = file.name;
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, ""); // 拡張子を除去

        let id, reading = '';

        if (autoGenerateId) {
            // 高度な形態素解析を使用してIDを生成
            id = await generateIdFromFileNameAdvanced(nameWithoutExt);

            // 重複チェックと修正
            let finalId = id;
            let counter = 1;
            while (partsData.some(part => part.id === finalId) ||
                bulkRegistrationData.some(item => item.id === finalId)) {
                finalId = id + '_' + counter;
                counter++;
            }
            id = finalId;

            // 読み方も生成
            reading = await generateReadingAdvanced(nameWithoutExt);
        } else {
            id = `part_${index}`;
        }

        const partData = {
            id: id,
            text: text,
            audio: audioFileName,
            file: file,
            reading: reading,
            analysisUsed: autoGenerateId && morphologyTokenizer ? 'kuromoji' : autoGenerateId ? 'dictionary' : 'none'
        };

        return partData;
    });

    try {
        bulkRegistrationData = await Promise.all(promises);
        displayBulkRegistrationPreview();

        if (autoGenerateId) {
            const analysisType = morphologyTokenizer ? '🤖 高精度形態素解析' : '📚 辞書ベース解析';
            showMessage('parts-messages', 'info',
                `${analysisType}を使用してIDと読み方を生成しました。プレビューで内容を確認してください。`);
        }
    } catch (error) {
        console.error('一括処理エラー:', error);
        showMessage('parts-messages', 'error', '一括処理中にエラーが発生しました。');
    }
}

// 一括登録プレビュー表示（改良版）
function displayBulkRegistrationPreview() {
    const previewDiv = document.getElementById('bulk-registration-preview');
    const listDiv = document.getElementById('bulk-registration-list');

    let listHtml = '';
    bulkRegistrationData.forEach((part, index) => {
        // 解析方法の表示
        let analysisInfo = '';
        if (part.analysisUsed === 'kuromoji') {
            analysisInfo = ' <span class="analysis-badge kuromoji">🤖</span>';
        } else if (part.analysisUsed === 'dictionary') {
            analysisInfo = ' <span class="analysis-badge dictionary">📚</span>';
        }

        listHtml += `
            <div class="bulk-registration-item">
                <div class="bulk-item-info">
                    <div class="bulk-item-text">${part.text}${analysisInfo}</div>
                    <div class="bulk-item-details">
                        <span class="bulk-item-id">ID: ${part.id}</span>
                        ${part.reading ? ` | <span class="bulk-item-reading">読み: ${part.reading}</span>` : ''}
                    </div>
                    <div class="bulk-item-filename">📁 ${part.audio}</div>
                </div>
                <div class="bulk-item-actions">
                    <button onclick="editBulkItem(${index})" class="btn btn-small">編集</button>
                    <button onclick="removeBulkItem(${index})" class="btn btn-danger btn-small">削除</button>
                </div>
            </div>
        `;
    });

    listDiv.innerHTML = listHtml;
    previewDiv.style.display = 'block';
}

// 一括アイテムの編集
function editBulkItem(index) {
    const item = bulkRegistrationData[index];
    const newText = prompt('表示テキストを入力:', item.text);
    const newId = prompt('IDを入力:', item.id);

    if (newText !== null && newId !== null) {
        item.text = newText.trim();
        item.id = newId.trim();
        displayBulkRegistrationPreview();
    }
}

// 一括アイテムの削除
function removeBulkItem(index) {
    if (confirm('このアイテムを削除しますか？')) {
        bulkRegistrationData.splice(index, 1);
        displayBulkRegistrationPreview();
    }
}

// 一括登録の実行
function confirmBulkRegistration() {
    if (bulkRegistrationData.length === 0) {
        alert('登録するアイテムがありません。');
        return;
    }

    bulkRegistrationData.forEach(item => {
        // IDの重複チェック
        if (!partsData.some(part => part.id === item.id)) {
            const newPart = {
                id: item.id,
                text: item.text,
                audio: item.audio
            };

            partsData.push(newPart);
            audioFiles.set(item.id, item.file);
        }
    });

    // 表示を更新
    updatePartsDisplay();
    updateAvailableParts();
    updateConfigPreview();

    // フォームをリセット
    cancelBulkRegistration();

    alert(`${bulkRegistrationData.length}個のパーツが登録されました！`);
}

// 一括登録のキャンセル
function cancelBulkRegistration() {
    bulkRegistrationData = [];
    document.getElementById('bulk-registration-preview').style.display = 'none';
    document.getElementById('bulk-audio-files').value = '';
}

// Zipファイルインポート機能

// Zipファイルを解析してインポート
async function importZipFile() {
    const fileInput = document.getElementById('import-zip');
    const file = fileInput.files[0];

    if (!file) {
        alert('Zipファイルを選択してください。');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
        alert('Zipファイルを選択してください。');
        return;
    }

    try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        const autoGenerateIds = document.getElementById('auto-generate-ids').checked;
        const skipExisting = document.getElementById('skip-existing').checked;
        const generateReadings = document.getElementById('generate-readings').checked;

        importData = [];
        let configData = null;

        // まず設定ファイルを探す
        for (const [relativePath, zipEntry] of Object.entries(zipContent.files)) {
            if (!zipEntry.dir && relativePath.toLowerCase().includes('config.json')) {
                try {
                    const configText = await zipEntry.async('text');
                    configData = JSON.parse(configText);
                    console.log('設定ファイルを発見しました:', configData);
                    showMessage('tools-messages', 'info', '📄 設定ファイル（config.json）を発見し、読み込みました。');

                    // 設定ファイルから文章パターンを先に抽出
                    if (configData.sentences && configData.sentences.length > 0) {
                        showMessage('tools-messages', 'info',
                            `📋 ${configData.sentences.length}個の文章パターンも発見されました。`);
                    }
                    break;
                } catch (error) {
                    console.warn('設定ファイルの読み込みに失敗:', error);
                    showMessage('tools-messages', 'warning', '⚠️ 設定ファイルが見つかりましたが、読み込みに失敗しました。');
                }
            }
        }

        // Zipファイル内の音声ファイルを解析
        const promises = [];
        zipContent.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && isAudioFile(relativePath)) {
                promises.push(processZipEntry(zipEntry, relativePath, autoGenerateIds, skipExisting, generateReadings, configData));
            }
        });

        await Promise.all(promises);

        // 設定ファイルのデータを各インポートアイテムに添付
        if (configData) {
            importData.forEach(item => {
                item.fullConfigData = configData;
            });
        }

        if (importData.length === 0) {
            alert('インポート可能な音声ファイルが見つかりませんでした。');
            return;
        }

        displayImportPreview(configData);

    } catch (error) {
        alert('Zipファイルの読み込みに失敗しました: ' + error.message);
        console.error('Zip import error:', error);
    }
}

// 音声ファイルかどうかを判定
function isAudioFile(filename) {
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.flac'];
    const lowerFilename = filename.toLowerCase();
    return audioExtensions.some(ext => lowerFilename.endsWith(ext));
}

// Zipエントリを処理（形態素解析対応）
async function processZipEntry(zipEntry, relativePath, autoGenerateIds, skipExisting, generateReadings, configData) {
    const filename = relativePath.split('/').pop(); // パスからファイル名を取得
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    let id, text, configInfo = null;

    // 設定ファイルから該当する情報を検索
    if (configData && configData.parts) {
        const configPart = configData.parts.find(part =>
            part.audio === filename ||
            part.audio === relativePath ||
            part.text === nameWithoutExt ||
            part.id === nameWithoutExt
        );
        if (configPart) {
            configInfo = configPart;
            console.log(`設定ファイルから情報を取得: ${filename}`, configPart);
        }
    }

    // IDとテキストの決定
    if (configInfo) {
        // 設定ファイルの情報を優先
        id = configInfo.id;
        text = configInfo.text;
    } else if (autoGenerateIds) {
        // 高度な形態素解析を使用してIDを生成
        text = nameWithoutExt;
        id = await generateIdFromFileNameAdvanced(nameWithoutExt);
    } else {
        // ランダムIDを生成
        text = nameWithoutExt;
        id = `import_${Math.random().toString(36).substr(2, 6)}`;
    }

    // 既存チェック
    let status = 'new';
    if (partsData.some(part => part.id === id)) {
        status = skipExisting ? 'skip' : 'existing';
    }

    // 読み方の生成（形態素解析を使用）
    let reading = '';
    if (generateReadings) {
        if (configInfo && configInfo.reading) {
            reading = configInfo.reading;
        } else {
            reading = await generateReadingAdvanced(text);
        }
    }

    // ファイルデータを取得
    const fileData = await zipEntry.async('blob');
    const file = new File([fileData], filename, { type: 'audio/wav' });

    const importItem = {
        id: id,
        text: text,
        audio: filename,
        file: file,
        reading: reading,
        status: status,
        originalPath: relativePath,
        fromConfig: !!configInfo,
        configInfo: configInfo
    };

    importData.push(importItem);
}

// 高度な形態素解析を使用したファイル名からのID生成
async function generateIdFromFileNameAdvanced(filename) {
    try {
        // 形態素解析を実行
        const words = await advancedMorphologyAnalysis(filename);

        // IDパーツを生成
        let idParts = [];
        for (const word of words) {
            // 語尾や助詞、記号はスキップ
            if (word.type === '語尾' || word.type === '助詞' || word.type === '記号') {
                continue;
            }

            // 鉄道用語は優先的に短縮IDを使用
            if (word.isRailwayTerm && word.short && word.short !== '') {
                const cleanShort = word.short.replace(/[^a-zA-Z0-9_]/g, '');
                if (cleanShort) {
                    idParts.push(cleanShort);
                }
            } else if (word.short && word.short !== '') {
                const cleanShort = word.short.replace(/[^a-zA-Z0-9_]/g, '');
                if (cleanShort) {
                    idParts.push(cleanShort);
                }
            } else if (word.romaji && word.type !== '未知語') {
                // ローマ字を英語ID風に変換
                let cleanRomaji = word.romaji
                    .replace(/uu/g, 'u')  // 長音を短縮
                    .replace(/ou/g, 'o')  // 長音を短縮
                    .replace(/-/g, '')
                    .replace(/[^a-zA-Z0-9]/g, ''); // 非ASCII文字を除去
                if (cleanRomaji) {
                    idParts.push(cleanRomaji);
                }
            }
        }

        let generatedId = idParts.join('_').replace(/[^a-zA-Z0-9_]/g, ''); // 最終クリーンアップ

        // IDが空または短すぎる場合の処理
        if (!generatedId || generatedId.length < 2) {
            // テキストの読み仮名からローマ字変換
            const readings = words.map(w => w.reading || w.surface).join('');
            generatedId = kanaToRomaji(readings);

            if (!generatedId || generatedId.length < 2) {
                // フォールバック: 従来の方法
                generatedId = 'part_' + Math.random().toString(36).substr(2, 6);
            }
        }

        return generatedId;
    } catch (error) {
        console.error('高度ID生成エラー:', error);
        // フォールバック: 従来の方法
        return generateIdFromFileName(filename);
    }
}

// 高度な形態素解析を使用した読み方生成
async function generateReadingAdvanced(text) {
    try {
        const words = await advancedMorphologyAnalysis(text);
        return words.map(w => w.reading || w.surface).join('');
    } catch (error) {
        console.error('読み方生成エラー:', error);
        return toHiragana(text); // フォールバック
    }
}

// ファイル名からIDを生成
function generateIdFromFileName(filename) {
    // 日本語テキストの場合は既存の変換ルールを使用
    const textToId = {
        '名古屋': 'nagoya',
        '大阪': 'osaka',
        '東京': 'tokyo',
        '京都': 'kyoto',
        '横浜': 'yokohama',
        '特急': 'ltdexp',
        '急行': 'exp',
        '快速': 'rapid',
        '準急': 'semiexp',
        '普通': 'local',
        'まもなく': 'soon',
        '到着': 'arrive',
        '発車': 'depart',
        '通過': 'pass',
        '停車': 'stop'
    };

    if (textToId[filename]) {
        return textToId[filename];
    }

    // 英数字のみの場合はそのまま使用（小文字化）
    if (/^[a-zA-Z0-9_-]+$/.test(filename)) {
        return filename.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // 日本語が含まれる場合は除去してIDを生成
    let id = filename
        .replace(/[あ-ん]/g, '') // ひらがなを除去
        .replace(/[ァ-ヶ]/g, '') // カタカナを除去
        .replace(/[一-龯]/g, '') // 漢字を除去
        .replace(/[^a-zA-Z0-9]/g, '') // 英数字以外を除去
        .toLowerCase();

    if (!id) {
        // IDが空の場合はランダム生成
        id = 'part_' + Math.random().toString(36).substr(2, 6);
    }

    return id;
}

// インポートプレビューを表示（改良版）
function displayImportPreview(configData) {
    const previewDiv = document.getElementById('import-preview');
    const summaryDiv = document.getElementById('import-summary');
    const listDiv = document.getElementById('import-files-list');

    // サマリーを生成
    const newCount = importData.filter(item => item.status === 'new').length;
    const existingCount = importData.filter(item => item.status === 'existing').length;
    const skipCount = importData.filter(item => item.status === 'skip').length;
    const configCount = importData.filter(item => item.fromConfig).length;

    let summaryHtml = `
        <h5>📊 インポート概要</h5>
        <p>総ファイル数: <strong>${importData.length}</strong></p>
    `;

    if (configData) {
        summaryHtml += `<p>📄 設定ファイル: <span class="config-found">発見・読み込み完了</span></p>`;
        summaryHtml += `<p>📋 設定から取得: <span class="import-status config">${configCount}件</span></p>`;
    }

    summaryHtml += `
        <p>新規追加: <span class="import-status new">${newCount}件</span></p>
        <p>既存のため上書き: <span class="import-status existing">${existingCount}件</span></p>
        <p>既存のためスキップ: <span class="import-status skip">${skipCount}件</span></p>
    `;

    summaryDiv.innerHTML = summaryHtml;

    // ファイルリストを生成
    let listHtml = '';
    importData.forEach((item, index) => {
        const statusClass = item.status;
        const statusText = {
            'new': '新規',
            'existing': '上書き',
            'skip': 'スキップ'
        }[item.status];

        // 情報源の表示
        let sourceInfo = '';
        if (item.fromConfig) {
            sourceInfo = ' <span class="source-badge config">📄 設定</span>';
        } else {
            const analysisType = morphologyTokenizer ? '🤖' : '📚';
            sourceInfo = ` <span class="source-badge analysis">${analysisType} 解析</span>`;
        }

        listHtml += `
            <div class="import-file-item">
                <div class="import-file-info">
                    <div class="import-file-name">${item.text}${sourceInfo}</div>
                    <div class="import-file-details">
                        <span class="import-file-id">ID: ${item.id}</span>
                        ${item.reading ? ` | <span class="import-file-reading">読み: ${item.reading}</span>` : ''}
                        | 📁 ${item.audio}
                    </div>
                </div>
                <span class="import-status ${statusClass}">${statusText}</span>
            </div>
        `;
    });

    listDiv.innerHTML = listHtml;
    previewDiv.style.display = 'block';
}

// インポートを実行（設定ファイル対応）
function confirmImport() {
    if (importData.length === 0) {
        alert('インポートするデータがありません。');
        return;
    }

    let importedPartsCount = 0;
    let importedSentencesCount = 0;

    // 設定ファイルの情報があるかチェック
    const hasConfigData = importData.some(item => item.configInfo);
    let fullConfigData = null;

    if (hasConfigData) {
        // インポートデータから設定情報を取得
        const configItem = importData.find(item => item.configInfo);
        // 元の完全な設定データが利用可能な場合は使用
        if (configItem && configItem.fullConfigData) {
            fullConfigData = configItem.fullConfigData;
        }
    }

    // パーツのインポート
    importData.forEach(item => {
        if (item.status === 'skip') {
            return; // スキップ
        }

        // 既存のパーツを更新または新規追加
        const existingIndex = partsData.findIndex(part => part.id === item.id);

        const newPart = {
            id: item.id,
            text: item.text,
            audio: item.audio
        };

        if (existingIndex >= 0) {
            // 既存パーツを更新
            partsData[existingIndex] = newPart;
        } else {
            // 新規パーツを追加
            partsData.push(newPart);
        }

        // 音声ファイルを保存
        audioFiles.set(item.id, item.file);
        importedPartsCount++;
    });

    // 設定ファイルから文章パターンをインポート
    if (fullConfigData && fullConfigData.sentences && fullConfigData.sentences.length > 0) {
        fullConfigData.sentences.forEach(sentence => {
            // 同じテキストの文章パターンが既に存在するかチェック
            const existingSentenceIndex = sentencesData.findIndex(s => s.text === sentence.text);

            if (existingSentenceIndex >= 0) {
                // 既存の文章パターンを更新
                sentencesData[existingSentenceIndex] = sentence;
            } else {
                // 新規の文章パターンを追加
                sentencesData.push(sentence);
            }
            importedSentencesCount++;
        });
    }

    // 表示を更新
    updatePartsDisplay();
    updateAvailableParts();
    updateSentencesDisplay();
    updateConfigPreview();
    updateExportButtons();

    // インポート完了メッセージ
    let message = `${importedPartsCount}個のパーツがインポートされました！`;
    if (importedSentencesCount > 0) {
        message += `\n${importedSentencesCount}個の文章パターンもインポートされました！`;
    }
    if (hasConfigData) {
        message += '\n📄 設定ファイルの情報を使用しました。';
    }

    // インポート完了
    cancelImport();
    alert(message);
}

// インポートをキャンセル
function cancelImport() {
    importData = [];
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-zip').value = '';
}

// 使用方法タブの切り替え
function showUsageTab(tabName) {
    // すべての使用方法タブを非表示
    const tabs = document.querySelectorAll('.usage-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    // すべてのボタンを非アクティブ
    const buttons = document.querySelectorAll('.usage-tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    // 選択されたタブを表示
    document.getElementById(tabName + '-usage').classList.add('active');

    // 対応するボタンをアクティブ
    event.target.classList.add('active');
}

// 仕様書対応の新しい機能

// 入力値のバリデーション
function validatePartInput(id, text, audioFile) {
    if (!id) {
        return { isValid: false, message: 'IDを入力してください。' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(id)) {
        return { isValid: false, message: 'IDは英数字とアンダースコアのみ使用できます。' };
    }

    if (!text) {
        return { isValid: false, message: '表示テキストを入力してください。' };
    }

    if (!audioFile) {
        return { isValid: false, message: '音声ファイルを選択してください。' };
    }

    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3'];
    if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(wav|mp3)$/i)) {
        return { isValid: false, message: '対応している音声ファイル形式は .wav と .mp3 のみです。' };
    }

    return { isValid: true };
}

// メッセージ表示機能
function showMessage(containerId, type, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
        <span>${getMessageIcon(type)}</span>
        <span>${message}</span>
    `;

    // 既存のメッセージをクリア
    container.innerHTML = '';
    container.appendChild(messageDiv);
    container.style.display = 'block';
}

function getMessageIcon(type) {
    const icons = {
        error: '❌',
        warning: '⚠️',
        success: '✅',
        info: 'ℹ️'
    };
    return icons[type] || '';
}

function hideMessage(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

function hideMessagesAfterDelay(containerId, delay = 3000) {
    setTimeout(() => hideMessage(containerId), delay);
}

// エクスポートボタンの状態更新
function updateExportButtons() {
    const hasData = partsData.length > 0 || sentencesData.length > 0;
    const configBtn = document.getElementById('download-config-btn');
    const zipBtn = document.getElementById('download-zip-btn');

    if (configBtn) configBtn.disabled = !hasData;
    if (zipBtn) zipBtn.disabled = !hasData;

    // 統計情報の更新
    updateConfigStats();
}

// 統計情報の更新
function updateConfigStats() {
    const partsCount = document.getElementById('parts-count');
    const sentencesCount = document.getElementById('sentences-count');
    const audioFilesCount = document.getElementById('audio-files-count');

    if (partsCount) partsCount.textContent = partsData.length;
    if (sentencesCount) sentencesCount.textContent = sentencesData.length;
    if (audioFilesCount) audioFilesCount.textContent = audioFiles.size;

    // パーツ数も更新
    updateCurrentPartsCount();
}

// 設定ファイルの検証
function validateConfig() {
    const errors = [];
    const warnings = [];

    // 基本チェック
    if (partsData.length === 0) {
        errors.push('パーツが1つも登録されていません。');
    }

    if (sentencesData.length === 0) {
        warnings.push('文章パターンが1つも登録されていません。');
    }

    // パーツの整合性チェック
    partsData.forEach((part, index) => {
        if (!audioFiles.has(part.id)) {
            errors.push(`パーツ「${part.text}」(ID: ${part.id})に対応する音声ファイルがありません。`);
        }
    });

    // 文章の整合性チェック
    sentencesData.forEach((sentence, index) => {
        const missingParts = sentence.partIds.filter(partId =>
            !partsData.find(part => part.id === partId)
        );

        if (missingParts.length > 0) {
            errors.push(`文章「${sentence.text}」で使用されているパーツID「${missingParts.join(', ')}」が見つかりません。`);
        }
    });

    // 結果表示
    const resultDiv = document.getElementById('config-validation');
    if (errors.length === 0 && warnings.length === 0) {
        resultDiv.className = 'validation-result valid';
        resultDiv.innerHTML = '<strong>✅ 設定ファイルは正常です</strong><br>問題は見つかりませんでした。';
        resultDiv.style.display = 'block';
    } else {
        resultDiv.className = 'validation-result invalid';
        let html = '';

        if (errors.length > 0) {
            html += '<strong>❌ エラー:</strong><ul>';
            errors.forEach(error => html += `<li>${error}</li>`);
            html += '</ul>';
        }

        if (warnings.length > 0) {
            html += '<strong>⚠️ 警告:</strong><ul>';
            warnings.forEach(warning => html += `<li>${warning}</li>`);
            html += '</ul>';
        }

        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';
    }
}

// クリップボードにコピー
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.select();
        document.execCommand('copy');

        // 一時的にボタンのテキストを変更
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(btn => {
            if (btn.textContent.includes('コピー')) {
                const originalText = btn.textContent;
                btn.textContent = 'コピーしました！';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }
        });
    }
}

// 辞書表示機能
function showDictionary() {
    const modal = document.getElementById('dictionary-modal');
    modal.style.display = 'flex';

    // 辞書データを表示
    populateDictionary();
}

function closeDictionary() {
    const modal = document.getElementById('dictionary-modal');
    modal.style.display = 'none';
}

// 辞書データをカテゴリ別に表示
function populateDictionary() {
    const categories = {
        'dict-places': ['地名'],
        'dict-train-types': ['列車種別'],
        'dict-actions': ['副詞', '名詞', '動詞'],
        'dict-directions': ['連体詞', '接尾辞'],
        'dict-cars': ['名詞']
    };

    // カテゴリごとにアイテムを表示
    Object.keys(categories).forEach(categoryId => {
        const container = document.getElementById(categoryId);
        if (container) {
            const types = categories[categoryId];
            const items = [];

            Object.entries(japaneseDict).forEach(([word, data]) => {
                if (types.includes(data.type)) {
                    items.push({ word, ...data });
                }
            });

            // アイテムをソート
            items.sort((a, b) => a.word.localeCompare(b.word));

            // HTML生成
            container.innerHTML = items.map(item => {
                const id = item.short || item.romaji;
                return `
                    <div class="dict-item" onclick="selectDictionaryWord('${item.word}', '${id}')">
                        <div>
                            <div class="dict-item-word">${item.word}</div>
                            <div class="dict-item-reading">${item.reading}</div>
                        </div>
                        <div class="dict-item-id">${id}</div>
                    </div>
                `;
            }).join('');
        }
    });
}

// 辞書から単語を選択
function selectDictionaryWord(word, id) {
    document.getElementById('part-text').value = word;
    document.getElementById('part-id').value = id;

    // 読み方ヒントを更新
    suggestIdFromText();

    closeDictionary();

    showMessage('parts-messages', 'success', `辞書から「${word}」を選択しました (ID: ${id})`);
    hideMessagesAfterDelay('parts-messages', 3000);
}

// 辞書検索機能
function filterDictionary() {
    const searchTerm = document.getElementById('dict-search').value.toLowerCase();
    const dictItems = document.querySelectorAll('.dict-item');

    dictItems.forEach(item => {
        const word = item.querySelector('.dict-item-word').textContent;
        const reading = item.querySelector('.dict-item-reading').textContent;
        const id = item.querySelector('.dict-item-id').textContent;

        const isMatch = word.toLowerCase().includes(searchTerm) ||
            reading.toLowerCase().includes(searchTerm) ||
            id.toLowerCase().includes(searchTerm);

        item.style.display = isMatch ? 'flex' : 'none';
    });

    // カテゴリの表示/非表示を制御
    const categories = document.querySelectorAll('.dict-category');
    categories.forEach(category => {
        const visibleItems = category.querySelectorAll('.dict-item[style*="flex"]');
        category.style.display = visibleItems.length > 0 ? 'block' : 'none';
    });
}

// モーダル外クリックで閉じる
document.addEventListener('click', function (event) {
    const modal = document.getElementById('dictionary-modal');
    if (event.target === modal) {
        closeDictionary();
    }
});

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        closeDictionary();
        closeCustomDictManager();
    }
});

// カスタム辞書管理機能

// カスタム辞書エントリを追加
function addCustomDictEntry() {
    const word = document.getElementById('custom-word').value.trim();
    const reading = document.getElementById('custom-reading').value.trim();
    const romaji = document.getElementById('custom-romaji').value.trim();
    const type = document.getElementById('custom-type').value;
    const short = document.getElementById('custom-short').value.trim();

    // バリデーション
    if (!word) {
        showMessage('parts-messages', 'error', '単語を入力してください。');
        return;
    }

    if (!reading) {
        showMessage('parts-messages', 'error', '読み方を入力してください。');
        return;
    }

    if (!romaji) {
        showMessage('parts-messages', 'error', 'ローマ字を入力してください。');
        return;
    }

    // 既存チェック
    if (japaneseDict[word]) {
        if (!confirm(`「${word}」は既に辞書に登録されています。上書きしますか？`)) {
            return;
        }
    }

    // 新しいエントリを作成
    const entry = {
        reading: reading,
        romaji: romaji,
        type: type
    };

    if (short) {
        entry.short = short;
    }

    // カスタム辞書に追加
    customDict[word] = entry;
    japaneseDict[word] = entry;

    // 保存
    saveCustomDict();

    // フォームをクリア
    document.getElementById('custom-word').value = '';
    document.getElementById('custom-reading').value = '';
    document.getElementById('custom-romaji').value = '';
    document.getElementById('custom-short').value = '';

    showMessage('parts-messages', 'success', `「${word}」を辞書に追加しました！`);
    hideMessagesAfterDelay('parts-messages');

    console.log('辞書に追加:', word, entry);
}

// カスタム辞書管理画面を表示
function showCustomDictManager() {
    const modal = document.getElementById('custom-dict-modal');
    modal.style.display = 'flex';

    updateDictStats();
    populateCustomDictManager();
}

// カスタム辞書管理画面を閉じる
function closeCustomDictManager() {
    const modal = document.getElementById('custom-dict-modal');
    modal.style.display = 'none';
}

// 辞書統計を更新
function updateDictStats() {
    const defaultCount = Object.keys(defaultJapaneseDict).length;
    const customCount = Object.keys(customDict).length;
    const totalCount = Object.keys(japaneseDict).length;

    document.getElementById('default-dict-count').textContent = defaultCount;
    document.getElementById('custom-dict-count').textContent = customCount;
    document.getElementById('total-dict-count').textContent = totalCount;
}

// 辞書管理リストを表示
function populateCustomDictManager() {
    const container = document.getElementById('custom-dict-items');
    container.innerHTML = '';

    // すべての辞書エントリを表示
    const allEntries = Object.entries(japaneseDict).map(([word, data]) => ({
        word,
        ...data,
        isCustom: customDict.hasOwnProperty(word)
    }));

    // ソート
    allEntries.sort((a, b) => a.word.localeCompare(b.word));

    allEntries.forEach(entry => {
        const div = document.createElement('div');
        div.className = `dict-manager-item ${entry.isCustom ? 'custom' : ''}`;

        const id = entry.short || entry.romaji;

        div.innerHTML = `
            <span class="dict-manager-word">${entry.word}</span>
            <span>${entry.reading}</span>
            <span>${entry.romaji}</span>
            <span class="dict-manager-type">${entry.type}</span>
            <span class="dict-manager-id">${id}</span>
            <span>
                ${entry.isCustom ?
                `<button class="dict-item-delete" onclick="removeCustomDictEntry('${entry.word}')">削除</button>` :
                '<span style="color: var(--text-muted); font-size: 0.8em;">デフォルト</span>'
            }
            </span>
        `;

        container.appendChild(div);
    });
}

// カスタム辞書エントリを削除
function removeCustomDictEntry(word) {
    if (!confirm(`「${word}」を辞書から削除しますか？`)) {
        return;
    }

    // カスタム辞書から削除
    delete customDict[word];

    // japaneseDict を再構築
    japaneseDict = { ...defaultJapaneseDict, ...customDict };

    // 保存
    saveCustomDict();

    // 表示を更新
    updateDictStats();
    populateCustomDictManager();

    showMessage('parts-messages', 'info', `「${word}」を辞書から削除しました。`);
    hideMessagesAfterDelay('parts-messages');
}

// 辞書の検索・フィルター
function filterCustomDict() {
    const searchTerm = document.getElementById('dict-manager-search').value.toLowerCase();
    const filterType = document.getElementById('dict-manager-filter').value;
    const items = document.querySelectorAll('.dict-manager-item');

    items.forEach(item => {
        const word = item.querySelector('.dict-manager-word').textContent.toLowerCase();
        const type = item.querySelector('.dict-manager-type').textContent;

        const matchesSearch = word.includes(searchTerm) ||
            item.textContent.toLowerCase().includes(searchTerm);
        const matchesFilter = !filterType || type === filterType;

        item.style.display = matchesSearch && matchesFilter ? 'grid' : 'none';
    });
}

// カスタム辞書をクリア
function clearCustomDict() {
    if (!confirm('カスタム辞書をすべて削除しますか？この操作は取り消せません。')) {
        return;
    }

    customDict = {};
    japaneseDict = { ...defaultJapaneseDict };

    localStorage.removeItem('customJapaneseDict');

    updateDictStats();
    populateCustomDictManager();

    showMessage('parts-messages', 'warning', 'カスタム辞書をクリアしました。');
    hideMessagesAfterDelay('parts-messages');
}

// デフォルトに戻す
function resetToDefaults() {
    if (!confirm('辞書をデフォルトの状態に戻しますか？カスタム辞書はすべて削除されます。')) {
        return;
    }

    customDict = {};
    japaneseDict = { ...defaultJapaneseDict };

    localStorage.removeItem('customJapaneseDict');

    updateDictStats();
    populateCustomDictManager();

    showMessage('parts-messages', 'info', '辞書をデフォルトの状態に戻しました。');
    hideMessagesAfterDelay('parts-messages');
}

// 辞書ファイルのインポート
function importDictFile() {
    document.getElementById('dict-file-input').click();
}

function handleDictFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedDict = JSON.parse(e.target.result);

            // バリデーション
            if (!validateDictFormat(importedDict)) {
                showMessage('parts-messages', 'error', '無効な辞書ファイル形式です。');
                return;
            }

            const count = Object.keys(importedDict).length;
            if (confirm(`${count}語を辞書に追加しますか？既存の単語は上書きされます。`)) {
                // カスタム辞書にマージ
                Object.assign(customDict, importedDict);
                japaneseDict = { ...defaultJapaneseDict, ...customDict };

                saveCustomDict();
                updateDictStats();
                if (document.getElementById('custom-dict-modal').style.display === 'flex') {
                    populateCustomDictManager();
                }

                showMessage('parts-messages', 'success', `${count}語を辞書に追加しました！`);
                hideMessagesAfterDelay('parts-messages');
            }
        } catch (error) {
            showMessage('parts-messages', 'error', 'ファイルの読み込みに失敗しました。');
            console.error('辞書インポートエラー:', error);
        }
    };
    reader.readAsText(file);

    // ファイル選択をクリア
    event.target.value = '';
}

// 辞書形式のバリデーション
function validateDictFormat(dict) {
    if (typeof dict !== 'object' || dict === null) return false;

    for (const [word, data] of Object.entries(dict)) {
        if (typeof word !== 'string' || !word.trim()) return false;
        if (typeof data !== 'object' || data === null) return false;
        if (!data.reading || !data.romaji || !data.type) return false;
    }

    return true;
}

// 辞書ファイルのエクスポート
function exportDictFile() {
    if (Object.keys(customDict).length === 0) {
        showMessage('parts-messages', 'warning', 'エクスポートするカスタム辞書がありません。');
        return;
    }

    const dataStr = JSON.stringify(customDict, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'custom-dictionary.json';
    link.click();

    showMessage('parts-messages', 'success', 'カスタム辞書をエクスポートしました！');
    hideMessagesAfterDelay('parts-messages');
}

// パターン生成機能
function generatePatterns() {
    const template = document.getElementById('pattern-template').value.trim();
    const count = parseInt(document.getElementById('pattern-count').value) || 5;

    if (!template) {
        showMessage('parts-messages', 'error', 'パターンテンプレートを入力してください。');
        return;
    }

    // テンプレートから品詞を抽出
    const patterns = template.match(/<([^>]+)>/g);
    if (!patterns) {
        showMessage('parts-messages', 'error', 'パターンテンプレートに品詞指定（<品詞>）が見つかりません。');
        return;
    }

    // 各品詞の単語を収集
    const wordsByType = {};
    patterns.forEach(pattern => {
        const type = pattern.slice(1, -1); // < > を除去
        wordsByType[type] = Object.entries(japaneseDict)
            .filter(([word, data]) => data.type === type)
            .map(([word, data]) => ({ word, ...data }));
    });

    // 生成結果
    const results = [];
    for (let i = 0; i < count; i++) {
        let text = template;
        let id = '';

        patterns.forEach(pattern => {
            const type = pattern.slice(1, -1);
            const words = wordsByType[type];

            if (words && words.length > 0) {
                const randomWord = words[Math.floor(Math.random() * words.length)];
                text = text.replace(pattern, randomWord.word);

                // IDを生成
                const wordId = randomWord.short || randomWord.romaji;
                id += (id ? '_' : '') + wordId;
            }
        });

        if (text !== template) {
            results.push({ text, id });
        }
    }

    // 結果を表示
    const resultsContainer = document.getElementById('pattern-results');
    const listContainer = document.getElementById('pattern-list');

    if (results.length > 0) {
        listContainer.innerHTML = results.map(result => `
            <div class="pattern-item">
                <span class="pattern-text">${result.text}</span>
                <span class="pattern-id">${result.id}</span>
                <button onclick="usePattern('${result.text}', '${result.id}')" class="btn btn-small">使用</button>
            </div>
        `).join('');

        resultsContainer.style.display = 'block';
    } else {
        showMessage('parts-messages', 'warning', 'パターンを生成できませんでした。品詞が正しく指定されているか確認してください。');
    }
}

// パターンを使用（パーツ作成フォームに設定）
function usePattern(text, id) {
    document.getElementById('part-text').value = text;
    document.getElementById('part-id').value = id;

    // 読み方ヒントを更新
    suggestIdFromText();

    showMessage('parts-messages', 'success', `パターン「${text}」を設定しました！`);
    hideMessagesAfterDelay('parts-messages');
}

// Service Worker 管理クラスを追加
class ServiceWorkerManager {
    constructor() {
        this.isAvailable = 'serviceWorker' in navigator;
        this.registrations = [];
    }

    async checkStatus() {
        if (!this.isAvailable) return 'not_supported';

        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            this.registrations = registrations;

            if (registrations.length === 0) {
                return 'not_registered';
            }

            const activeWorker = registrations.find(reg => reg.active);
            if (!activeWorker) {
                return 'not_active';
            }

            return 'active';
        } catch (error) {
            console.error('SW status check failed:', error);
            return 'error';
        }
    }

    async reset() {
        if (!this.isAvailable) return false;

        try {
            const registrations = await navigator.serviceWorker.getRegistrations();

            for (const registration of registrations) {
                await registration.unregister();
                console.log('🔄 Service Worker unregistered:', registration.scope);
            }

            // キャッシュもクリア
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                    console.log('🗑️ Cache deleted:', cacheName);
                }
            }

            return true;
        } catch (error) {
            console.error('SW reset failed:', error);
            return false;
        }
    }

    async forceReload() {
        await this.reset();

        // ハードリロードを実行
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SKIP_WAITING'
            });
        }

        // 強制リロード
        window.location.reload(true);
    }
}

// グローバルに利用可能にする
window.swManager = new ServiceWorkerManager();

// デバッグ用関数をグローバルに追加
window.resetServiceWorker = async () => {
    console.log('🔄 Service Worker をリセット中...');
    const result = await window.swManager.reset();
    if (result) {
        console.log('✅ Service Worker リセット完了');
        setTimeout(() => window.location.reload(), 1000);
    } else {
        console.error('❌ Service Worker リセット失敗');
    }
};

window.forceReload = async () => {
    console.log('🔄 強制リロード実行中...');
    await window.swManager.forceReload();
};

// 既存のVisualDebuggerクラスに追加
if (window.VisualDebugger) {
    window.VisualDebugger.prototype.addServiceWorkerControls = function () {
        const swControls = document.createElement('div');
        swControls.innerHTML = `
            <button onclick="resetServiceWorker()" style="
                background: #FF9800;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                margin-right: 5px;
            ">SW リセット</button>
            <button onclick="forceReload()" style="
                background: #F44336;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
            ">強制リロード</button>
        `;

        const header = this.panel.querySelector('#debug-header');
        if (header) {
            header.appendChild(swControls);
        }
    };
}

// デバイス設定検出機能
function detectDeviceSettings() {
    const device = AppState.device;

    // カラースキーム検出
    device.colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    // アニメーション減少設定
    device.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ハイコントラスト設定
    device.highContrast = window.matchMedia('(prefers-contrast: high)').matches;

    // 強制色設定
    device.forcedColors = window.matchMedia('(forced-colors: active)').matches;

    // タッチデバイス検出
    device.touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

    // 画面サイズ検出
    const width = window.innerWidth;
    if (width < 768) {
        device.screenSize = 'mobile';
    } else if (width < 1024) {
        device.screenSize = 'tablet';
    } else {
        device.screenSize = 'desktop';
    }

    // デバイスピクセル比
    device.pixelRatio = window.devicePixelRatio || 1;

    // ネットワーク接続（サポートされている場合）
    if ('connection' in navigator) {
        device.connection = navigator.connection.effectiveType || 'unknown';
    }

    // 言語設定
    device.language = navigator.language || 'ja';

    // タイムゾーン
    device.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

    console.log('デバイス設定を検出しました:', device);
}

// デバイス設定の適用
function applyDeviceSettings() {
    const device = AppState.device;

    // タッチデバイス用のCSS変数を設定
    document.documentElement.style.setProperty('--touch-device', device.touchDevice ? '1' : '0');

    // 画面サイズに応じたCSS変数
    document.documentElement.style.setProperty('--screen-size', device.screenSize);

    // デバイスピクセル比
    document.documentElement.style.setProperty('--pixel-ratio', device.pixelRatio);

    // カラースキーム
    if (device.colorScheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    console.log('デバイス設定を適用しました');
}

// デバイス情報表示の更新
function updateDeviceInfoDisplay() {
    const deviceInfo = document.getElementById('device-info');
    if (!deviceInfo) return;

    const device = AppState.device;

    deviceInfo.innerHTML = `
        <div class="device-detail">
            <strong>📱 タッチデバイス:</strong> ${device.touchDevice ? 'はい' : 'いいえ'}
        </div>
        <div class="device-detail">
            <strong>📏 画面サイズ:</strong> ${device.screenSize} (${window.innerWidth}×${window.innerHeight})
        </div>
        <div class="device-detail">
            <strong>🎨 カラースキーム:</strong> ${device.colorScheme}
        </div>
        <div class="device-detail">
            <strong>🌐 言語:</strong> ${device.language}
        </div>
        <div class="device-detail">
            <strong>🔗 接続:</strong> ${device.connection}
        </div>
    `;
}

// デバイス設定パネルの表示切り替え
function toggleDeviceSettingsPanel() {
    const panel = document.getElementById('device-settings-panel');
    if (!panel) return;

    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        detectDeviceSettings();
        updateDeviceInfoDisplay();
    } else {
        panel.style.display = 'none';
    }
}

// デバッグ表示機能
function showDebug() {
    const debugInfo = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        deviceSettings: AppState.device,
        appState: {
            partsCount: AppState.data.parts.length,
            sentencesCount: AppState.data.sentences.length,
            audioFilesCount: AppState.data.audioFiles.size
        },
        performance: {
            loadTime: performance.now(),
            memory: performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
            } : 'N/A'
        }
    };

    console.log('🔍 デバッグ情報:', debugInfo);

    // デバッグ情報をモーダルで表示
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10002;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 8px;
            padding: 20px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
            <h3 style="margin-top: 0; color: #2196F3;">🔍 デバッグ情報</h3>
            <pre style="
                background: #f5f5f5;
                padding: 15px;
                border-radius: 4px;
                overflow-x: auto;
                font-size: 12px;
                line-height: 1.4;
            ">${JSON.stringify(debugInfo, null, 2)}</pre>
            <div style="text-align: right; margin-top: 15px;">
                <button onclick="this.closest('div').parentElement.remove()" style="
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                ">閉じる</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

