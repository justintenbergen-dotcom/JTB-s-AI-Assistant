// ============================================================
// settings.js — Settings Panel Logic & localStorage Persistence
// ============================================================

const Settings = (() => {
    const STORAGE_KEY = 'chatapp_settings';

    const defaults = {
        apiEndpoint: 'http://localhost:1234/v1',
        apiKey: '',
        model: '',
        systemPrompt: 'You are a helpful, expert AI assistant. Provide extremely high quality responses.',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 4096,
        provider: 'lmstudio',
        darkMode: false,
        researchSpeed: 50,
        crawlDepth: 5,
        multiModelPrimary: ''
    };

    const providerPresets = {
        lmstudio: { apiEndpoint: 'http://localhost:1234/v1', apiKey: '' },
        anythingllm: { apiEndpoint: 'http://localhost:3001/api/v1', apiKey: '' },
        openai: { apiEndpoint: '', apiKey: '' },
        gemini: { apiEndpoint: '', apiKey: '' },
        groq: { apiEndpoint: '', apiKey: '' },
        anthropic: { apiEndpoint: '', apiKey: '' },
        custom: { apiEndpoint: '', apiKey: '' },
    };

    // ---- Load / Save ----
    function load() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return { ...defaults, ...stored };
        } catch {
            return { ...defaults };
        }
    }

    function save(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save settings:', e);
            Toast.show('Storage error: Settings not saved.', 'error');
        }
    }

    // ---- DOM References ----
    let els = {};

    function cacheElements() {
        els = {
            panel: document.getElementById('settings-panel'),
            overlay: document.getElementById('settings-overlay'),
            btnClose: document.getElementById('btn-close-settings'),
            btnOpen: document.getElementById('btn-settings'),
            endpoint: document.getElementById('api-endpoint'),
            apiKey: document.getElementById('api-key'),
            modelSelect: document.getElementById('model-select'),
            btnRefresh: document.getElementById('btn-refresh-models'),
            systemPrompt: document.getElementById('system-prompt'),
            temperature: document.getElementById('param-temperature'),
            topP: document.getElementById('param-top-p'),
            maxTokens: document.getElementById('param-max-tokens'),
            valTemperature: document.getElementById('val-temperature'),
            valTopP: document.getElementById('val-top-p'),
            valMaxTokens: document.getElementById('val-max-tokens'),
            themeToggle: document.getElementById('theme-toggle'),
            presetLMStudio: document.getElementById('preset-lmstudio'),
            presetAnythingLLM: document.getElementById('preset-anythingllm'),
            presetCustom: document.getElementById('preset-custom'),
            btnExport: document.getElementById('btn-export-all'),
            btnClear: document.getElementById('btn-clear-all'),
            btnImport: document.getElementById('btn-import-file'),
            btnExportProject: document.getElementById('btn-export-project-main'),

            // New feature toggles
            researchSpeed: document.getElementById('research-speed'),
            valResearchSpeed: document.getElementById('research-speed-val'),
            crawlDepth: document.getElementById('crawl-depth'),
            valCrawlDepth: document.getElementById('crawl-depth-val'),
            multiModelSelect: document.getElementById('multi-model-select'),
        };
    }

    // ---- Open / Close ----
    function open() {
        els.panel.classList.add('active');
        els.overlay.classList.add('active');
    }

    function close() {
        els.panel.classList.remove('active');
        els.overlay.classList.remove('active');
    }

    function isOpen() {
        return els.panel.classList.contains('active');
    }

    // ---- Populate UI from Settings ----
    function populateUI() {
        const s = load();
        els.endpoint.value = s.apiEndpoint;
        els.apiKey.value = s.apiKey;
        els.systemPrompt.value = s.systemPrompt;
        els.temperature.value = s.temperature;
        if (els.topP && s.topP !== undefined) els.topP.value = s.topP;
        if (els.valTopP && s.topP !== undefined) els.valTopP.textContent = Number(s.topP).toFixed(2);
        if (els.maxTokens && s.maxTokens !== undefined) els.maxTokens.value = s.maxTokens;
        if (els.valMaxTokens && s.maxTokens !== undefined) els.valMaxTokens.textContent = s.maxTokens;
        
        // New values
        if (els.researchSpeed && s.researchSpeed !== undefined) {
             els.researchSpeed.value = s.researchSpeed;
             els.valResearchSpeed.textContent = s.researchSpeed + '%';
        }
        if (els.crawlDepth && s.crawlDepth !== undefined) {
             els.crawlDepth.value = s.crawlDepth;
             els.valCrawlDepth.textContent = s.crawlDepth;
             if (s.crawlDepth == 1) els.valCrawlDepth.textContent += ' source';
             else els.valCrawlDepth.textContent += ' sources';
        }
        if (els.multiModelSelect && s.multiModelPrimary !== undefined) {
            els.multiModelSelect.value = s.multiModelPrimary;
            const inlineSelect = document.getElementById('multi-model-select-inline');
            if(inlineSelect) inlineSelect.value = s.multiModelPrimary;
        }

        if (els.themeToggle && s.darkMode !== undefined) els.themeToggle.checked = s.darkMode;

        // Set active preset
        document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
        const activePreset = document.querySelector(`.btn-preset[data-provider="${s.provider}"]`);
        if (activePreset) activePreset.classList.add('active');
    }

    // ---- Read UI → Settings Object ----
    function readFromUI() {
        return {
            apiEndpoint: els.endpoint.value.trim(),
            apiKey: els.apiKey.value.trim(),
            model: els.modelSelect ? els.modelSelect.value : '',
            systemPrompt: els.systemPrompt ? els.systemPrompt.value : '',
            temperature: els.temperature ? parseFloat(els.temperature.value) : 0.7,
            topP: els.topP ? parseFloat(els.topP.value) : 0.9,
            maxTokens: els.maxTokens ? parseInt(els.maxTokens.value, 10) : 4096,
            provider: document.querySelector('.btn-preset.active')?.dataset.provider || 'custom',
            darkMode: els.themeToggle ? els.themeToggle.checked : false,
            researchSpeed: els.researchSpeed ? parseInt(els.researchSpeed.value, 10) : 50,
            crawlDepth: els.crawlDepth ? parseInt(els.crawlDepth.value, 10) : 5,
            multiModelPrimary: els.multiModelSelect ? els.multiModelSelect.value : ''
        };
    }

    // ---- Auto-save on Change ----
    function autoSave() {
        const s = readFromUI();
        // Preserve model if it was already set and select hasn't changed to empty
        const prev = load();
        if (!s.model && prev.model) {
            s.model = prev.model;
        }
        save(s);
    }

    // ---- Refresh Models ----
    async function refreshModels() {
        els.modelSelect.innerHTML = '<option value="">Loading models…</option>';
        try {
            const models = await API.fetchModels();
            populateModelDropdowns(models);

            // Restore previously selected model
            const s = load();
            if (s.model) {
                els.modelSelect.value = s.model;
            }
            if (els.multiModelSelect && s.multiModelPrimary) {
                els.multiModelSelect.value = s.multiModelPrimary;
                const inlineSelect = document.getElementById('multi-model-select-inline');
                if (inlineSelect) inlineSelect.value = s.multiModelPrimary;
            }

            Toast.show('Models loaded successfully', 'success');
            updateConnectionStatus(true, models.length);
        } catch (err) {
            els.modelSelect.innerHTML = '<option value="">Failed to load</option>';
            Toast.show(`Failed to load models: ${err.message}`, 'error');
            updateConnectionStatus(false);
        }
    }

    function populateModelDropdowns(models) {
        if (!models || models.length === 0) return;

        const selectors = [
            els.modelSelect,
            els.multiModelSelect,
            document.getElementById('multi-model-select-inline')
        ];

        selectors.forEach(select => {
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">Select a model…</option>';
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                select.appendChild(opt);
            });
            if (currentVal) select.value = currentVal;
        });
    }

    // ---- Connection Status ----
    function updateConnectionStatus(connected, modelCount) {
        const dot = document.getElementById('status-dot');
        const name = document.getElementById('model-name');
        if (connected) {
            dot.classList.remove('disconnected');
            const s = load();
            name.textContent = s.model || `${modelCount} model${modelCount !== 1 ? 's' : ''} available`;
        } else {
            dot.classList.add('disconnected');
            name.textContent = 'Not connected';
        }
    }

    // ---- Apply Theme ----
    function applyTheme(dark) {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }

    // ---- Initialize ----
    function init() {
        cacheElements();
        populateUI();

        const s = load();
        applyTheme(s.darkMode);

        // Open / Close
        els.btnOpen.addEventListener('click', open);
        els.btnClose.addEventListener('click', close);
        els.overlay.addEventListener('click', close);

        // Provider presets
        document.querySelectorAll('.btn-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const provider = btn.dataset.provider;
                const preset = providerPresets[provider];
                if (preset) {
                    els.endpoint.value = preset.apiEndpoint;
                    els.apiKey.value = preset.apiKey;
                }
                // Hide endpoint for cloud providers if desired, or just show it but empty
                autoSave();
            });
        });

        // Range sliders
        els.temperature.addEventListener('input', () => {
            els.valTemperature.textContent = Number(els.temperature.value).toFixed(2);
            autoSave();
        });
        els.topP.addEventListener('input', () => {
            els.valTopP.textContent = Number(els.topP.value).toFixed(2);
            autoSave();
        });
        els.maxTokens.addEventListener('input', () => {
            els.valMaxTokens.textContent = els.maxTokens.value;
            autoSave();
        });

        if (els.researchSpeed) {
            els.researchSpeed.addEventListener('input', () => {
                els.valResearchSpeed.textContent = els.researchSpeed.value + '%';
                autoSave();
            });
        }
        if (els.crawlDepth) {
             els.crawlDepth.addEventListener('input', () => {
                const val = els.crawlDepth.value;
                els.valCrawlDepth.textContent = val + (val == 1 ? ' source' : ' sources');
                autoSave();
            });
        }
        if (els.multiModelSelect) {
            els.multiModelSelect.addEventListener('change', () => {
                const inlineSelect = document.getElementById('multi-model-select-inline');
                if(inlineSelect) inlineSelect.value = els.multiModelSelect.value;
                autoSave();
            });
            const inlineSelect = document.getElementById('multi-model-select-inline');
            if(inlineSelect) {
                inlineSelect.addEventListener('change', () => {
                    els.multiModelSelect.value = inlineSelect.value;
                    autoSave();
                });
            }
        }

        // Other inputs auto-save on change/blur
        ['endpoint', 'apiKey', 'systemPrompt'].forEach(key => {
            els[key].addEventListener('change', autoSave);
            els[key].addEventListener('blur', autoSave);
        });

        // Model select
        els.modelSelect.addEventListener('change', () => {
            const s = readFromUI();
            s.model = els.modelSelect.value;
            save(s);
            updateConnectionStatus(true);
            const name = document.getElementById('model-name');
            name.textContent = s.model || 'Not connected';
        });

        // Refresh models
        els.btnRefresh.addEventListener('click', refreshModels);

        // Theme toggle
        els.themeToggle.addEventListener('change', () => {
            const dark = els.themeToggle.checked;
            applyTheme(dark);
            autoSave();
        });
    }

    return {
        init,
        open,
        close,
        isOpen,
        load,
        save,
        refreshModels,
        updateConnectionStatus,
        applyTheme,
        populateModelDropdowns
    };
})();
