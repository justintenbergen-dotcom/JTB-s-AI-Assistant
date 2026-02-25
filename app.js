// ============================================================
// app.js — Main Orchestrator, Keyboard Shortcuts, Toast System
// ============================================================

// ---- Application State ----
const AppState = {
    isSidebarOpen: false,
    isSettingsOpen: false,
    isCheckingConnection: false,

    // Feature Toggles state
    features: {
        research: false,
        web: false,
        multiModel: false
    }
};

// ---- Toast Notification System ----
const Toast = (() => {
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️',
    };

    function show(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
      <div class="toast-body">
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
      </div>
      <div class="toast-progress" style="animation-duration:${duration}ms"></div>
    `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    return { show };
})();


// ---- App Module ----
const App = (() => {

    // ---- Initialize everything ----
    function init() {
        Settings.init();

        // Ensure at least one conversation exists
        if (Conversations.loadAll().length === 0) {
            Conversations.create();
        }

        // Render sidebar
        renderSidebar();

        // Load active conversation
        const activeId = Conversations.getActiveId();
        if (activeId) {
            Chat.renderMessages(activeId);
            const conv = Conversations.get(activeId);
            if (conv) {
                document.getElementById('chat-title').textContent = conv.title;
            }
        }

        // Wire up event listeners
        wireEvents();

        // Auto-check connection
        autoCheckConnection();

        Toast.show('Welcome to AI Chat! Configure your LLM in Settings.', 'info');
    }

    // ---- Wire Events ----
    function wireEvents() {
        // Send button
        document.getElementById('btn-send').addEventListener('click', () => Chat.send());

        // Stop button
        document.getElementById('btn-stop').addEventListener('click', () => Chat.stop());

        // Input field
        const input = document.getElementById('message-input');

        input.addEventListener('input', () => {
            Chat.autoResize(input);
            Chat.updateTokenCount(input.value);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                Chat.send();
            }
            // Regular Enter inserts newline (default behavior)
        });

        // New Chat
        document.getElementById('btn-new-chat').addEventListener('click', () => {
            Conversations.create();
            Chat.renderMessages(Conversations.getActiveId());
            input.focus();
            if (window.innerWidth <= 640) toggleSidebar(false);
        });

        // Feature Toggles (Toolbar)
        const toolbarButtons = [
            { id: 'btn-toggle-research', key: 'research' },
            { id: 'btn-toggle-web', key: 'web' },
            { id: 'btn-toggle-multi', key: 'multiModel' }
        ];

        toolbarButtons.forEach(feature => {
            const btn = document.getElementById(feature.id);
            if (btn) {
                btn.addEventListener('click', () => {
                    AppState.features[feature.key] = !AppState.features[feature.key];
                    btn.classList.toggle('active', AppState.features[feature.key]);

                    if (feature.key === 'multiModel') {
                        const inlineSelect = document.getElementById('multi-model-select-inline');
                        if (inlineSelect) {
                            inlineSelect.style.display = AppState.features[feature.key] ? 'block' : 'none';
                        }
                    }
                });
            }
        });

        // Export current conversation
        document.getElementById('btn-export').addEventListener('click', () => {
            const activeId = Conversations.getActiveId();
            if (activeId) {
                Conversations.exportOne(activeId);
                Toast.show('Conversation exported', 'success');
            }
        });

        // Import
        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('file-import').click();
        });

        // Attach (Local RAG)
        document.getElementById('btn-attach')?.addEventListener('click', () => {
            document.getElementById('file-attach').click();
        });

        document.getElementById('file-attach')?.addEventListener('change', async (e) => {
            for (const file of e.target.files) {
                try {
                    const text = await file.text();
                    Chat.addAttachment(file, text);
                } catch (err) {
                    Toast.show(`Could not read ${file.name}`, 'error');
                }
            }
            e.target.value = '';
        });

        // Voice Input (Speech Recognition)
        const btnMic = document.getElementById('btn-mic');
        if (btnMic) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = false;
                recognition.interimResults = false;
                
                recognition.onstart = () => {
                    btnMic.classList.add('mic-recording');
                    Toast.show('Listening...', 'info', 2000);
                };
                
                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    const input = document.getElementById('message-input');
                    input.value += (input.value ? ' ' : '') + transcript;
                    Chat.autoResize(input);
                    btnMic.classList.remove('mic-recording');
                };
                
                recognition.onerror = () => btnMic.classList.remove('mic-recording');
                recognition.onend = () => btnMic.classList.remove('mic-recording');

                btnMic.addEventListener('click', () => {
                    if (btnMic.classList.contains('mic-recording')) {
                        recognition.stop();
                    } else {
                        recognition.start();
                    }
                });
            } else {
                btnMic.addEventListener('click', () => Toast.show('Voice input not supported in this browser.', 'error'));
            }
        }

        // Prompt Studio
        document.getElementById('btn-prompt-studio')?.addEventListener('click', openPromptStudio);
        document.getElementById('btn-close-prompt')?.addEventListener('click', () => {
            document.getElementById('prompt-modal').classList.remove('active');
            document.getElementById('prompt-overlay').classList.remove('active');
        });
        document.getElementById('prompt-overlay')?.addEventListener('click', () => {
            document.getElementById('prompt-modal').classList.remove('active');
            document.getElementById('prompt-overlay').classList.remove('active');
        });

        // Code Artifacts
        document.getElementById('btn-close-artifact')?.addEventListener('click', () => {
            document.getElementById('artifact-modal').classList.remove('active');
            document.getElementById('artifact-overlay').classList.remove('active');
        });
        document.getElementById('artifact-overlay')?.addEventListener('click', () => {
            document.getElementById('artifact-modal').classList.remove('active');
            document.getElementById('artifact-overlay').classList.remove('active');
        });
        document.getElementById('btn-artifact-open')?.addEventListener('click', () => {
            const iframe = document.getElementById('artifact-frame');
            if (!iframe.srcdoc) return;
            const win = window.open();
            win.document.write(iframe.srcdoc);
            win.document.close();
        });

        document.getElementById('file-import').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const ok = Conversations.importFromJSON(reader.result);
                if (ok) {
                    Toast.show('Conversations imported successfully', 'success');
                    renderSidebar();
                    const all = Conversations.loadAll();
                    if (all.length > 0) {
                        switchConversation(all[0].id);
                    }
                } else {
                    Toast.show('Invalid import file format', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        // Export all (from settings)
        document.getElementById('btn-export-all').addEventListener('click', () => {
            Conversations.exportAll();
            Toast.show('All conversations exported', 'success');
        });

        // Export Knowledge & Codebase (ZIP)
        document.getElementById('btn-export-zip')?.addEventListener('click', () => {
            exportProjectZip();
        });

        // Export Knowledge & Codebase (RAW/TXT)
        document.getElementById('btn-export-raw')?.addEventListener('click', () => {
            exportProjectRaw();
        });

        // Import from settings
        document.getElementById('btn-import-file').addEventListener('click', () => {
            document.getElementById('file-import').click();
        });

        // Clear all data
        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm('Are you sure? This will delete ALL conversations and settings.')) {
                Conversations.clearAll();
                localStorage.removeItem('chatapp_settings');
                const conv = Conversations.create();
                switchConversation(conv.id);
                renderSidebar();
                Settings.init();
                Toast.show('All data cleared', 'warning');
            }
        });

        // Mobile menu
        document.getElementById('btn-menu').addEventListener('click', toggleSidebar);
        document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

        // Keyboard shortcuts
        document.addEventListener('keydown', handleShortcuts);
    }

    // ---- Keyboard Shortcuts ----
    function handleShortcuts(e) {
        // Ctrl+N — New Chat
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            const conv = Conversations.create();
            switchConversation(conv.id);
            Toast.show('New chat created', 'success');
        }

        // Ctrl+Shift+S — Settings
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            if (Settings.isOpen()) {
                Settings.close();
            } else {
                Settings.open();
            }
        }

        // Escape — Close panels
        if (e.key === 'Escape') {
            if (Settings.isOpen()) {
                Settings.close();
            }
            closeSidebar();
        }
    }

    // ---- Switch Conversation ----
    function switchConversation(id) {
        Conversations.setActiveId(id);
        Chat.renderMessages(id);
        renderSidebar();
        closeSidebar();

        const conv = Conversations.get(id);
        if (conv) {
            document.getElementById('chat-title').textContent = conv.title;
        }
    }

    // ---- Delete Conversation Handler ----
    function onDeleteConversation(deletedId) {
        const all = Conversations.loadAll();
        if (all.length > 0) {
            switchConversation(all[0].id);
        } else {
            const conv = Conversations.create();
            switchConversation(conv.id);
        }
        renderSidebar();
    }

    // ---- Render Sidebar ----
    function renderSidebar() {
        Conversations.renderList(
            (id) => switchConversation(id),
            (id) => onDeleteConversation(id)
        );
    }

    // ---- Mobile Sidebar ----
    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('active');
    }

    function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
    }

    // ---- Auto Check Connection ----
    async function autoCheckConnection() {
        const settings = Settings.load();
        if (!settings.apiEndpoint) return;

        try {
            const result = await API.checkConnection();
            if (result.connected) {
                Settings.updateConnectionStatus(true, result.models.length);

                // Populate model dropdown if models found
                const select = document.getElementById('model-select');
                if (select && result.models.length > 0) {
                    select.innerHTML = '<option value="">Select a model…</option>';
                    result.models.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        opt.textContent = m.name;
                        select.appendChild(opt);
                    });
                    if (settings.model) {
                        select.value = settings.model;
                    }
                }
            } else {
                Settings.updateConnectionStatus(false);
            }
        } catch (err) {
            console.error('Auto-check connection failed:', err);
            Settings.updateConnectionStatus(false);
        }
    }

    // ---- Export Project ZIP ----
    async function exportProjectZip() {
        try {
            const zip = new JSZip();
            Toast.show('Generating ZIP package...', 'info');

            // Files to include
            const files = ['index.html', 'index.css', 'app.js', 'chat.js', 'api.js', 'conversations.js', 'settings.js'];
            
            for (const filename of files) {
                try {
                    const response = await fetch(filename);
                    if (response.ok) {
                        const content = await response.text();
                        zip.file(filename, content);
                    }
                } catch (err) {
                    console.error(`Could not fetch ${filename}:`, err);
                }
            }

            // Include conversations data
            const convs = Conversations.loadAll();
            zip.file('conversations_backup.json', JSON.stringify(convs, null, 2));

            // Generate and download
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-chatbot-knowledge-base-${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            Toast.show('Knowledge & Codebase (.zip) exported!', 'success');
        } catch (err) {
            console.error('ZIP Error:', err);
            Toast.show('Failed to generate ZIP', 'error');
        }
    }

    async function exportProjectRaw() {
        try {
            Toast.show('Generating RAW code export...', 'info');
            let rawContent = "AI CHATBOT — FULL CODEBASE EXPORT (RAW)\n";
            rawContent += "Generated on: " + new Date().toLocaleString() + "\n";
            rawContent += "Description: This file contains all source code and chat history for the AI Chatbot project.\n";
            rawContent += "=".repeat(80) + "\n\n";

            const files = ['index.html', 'index.css', 'app.js', 'chat.js', 'api.js', 'conversations.js', 'settings.js'];
            
            for (const filename of files) {
                try {
                    const response = await fetch(filename);
                    if (response.ok) {
                        const content = await response.text();
                        rawContent += "TITLE: " + filename + "\n";
                        rawContent += "CODE:\n" + "-".repeat(40) + "\n";
                        rawContent += content + "\n";
                        rawContent += "-".repeat(40) + "\n";
                        rawContent += "\n" + "=".repeat(80) + "\n\n";
                    }
                } catch (err) {
                    console.error(`Could not fetch ${filename}:`, err);
                }
            }

            // Include conversations data
            const convs = Conversations.loadAll();
            rawContent += "TITLE: conversations_backup.json\n";
            rawContent += "DATA:\n" + "-".repeat(40) + "\n";
            rawContent += JSON.stringify(convs, null, 2) + "\n";
            rawContent += "-".repeat(40) + "\n";
            rawContent += "\n" + "=".repeat(80) + "\n";

            const blob = new Blob([rawContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-chatbot-raw-export-${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);

            Toast.show('RAW Codebase (.txt) exported!', 'success');
        } catch (err) {
            console.error('Raw Export Error:', err);
            Toast.show('Failed to generate RAW export', 'error');
        }
    }

    // ---- Prompt Studio ----
    function openPromptStudio() {
        const prompts = [
            { title: "Expert Coder", desc: "You are a senior software engineer. Write clean, modular, and well-documented code.", prompt: "You are a senior software engineer. Write clean, modular, and well-documented code. Explain your logic briefly before providing the code." },
            { title: "Creative Writer", desc: "You are an imaginative storyteller. Use vivid imagery and compelling narrative.", prompt: "You are an imaginative storyteller. Use vivid imagery and compelling narrative. Focus on character development and world-building." },
            { title: "ELI5 (Explain Like I'm 5)", desc: "Explain complex concepts using simple words and analogies.", prompt: "Explain complex concepts using simple words and analogies. Do not use jargon. Pretend I am a 5 year old." },
            { title: "Data Analyst", desc: "You are a data expert. Analyze the provided data and find patterns.", prompt: "You are a data expert. Analyze the provided data and find patterns. Format your results in clear tables or bullet points." },
            { title: "Code Reviewer", desc: "Review the code for security, performance, and best practices.", prompt: "Review the provided code. Point out vulnerabilities, performance bottlenecks, and deviations from best practices. Suggest refactored versions." },
        ];

        const list = document.getElementById('prompt-list');
        list.innerHTML = prompts.map((p, i) => `
            <div class="prompt-card" onclick="App.applyPrompt(${i})">
                <div class="prompt-title">${p.title}</div>
                <div class="prompt-desc">${p.desc}</div>
            </div>
        `).join('');

        window._cachedPrompts = prompts;

        document.getElementById('prompt-modal').classList.add('active');
        document.getElementById('prompt-overlay').classList.add('active');
    }

    function applyPrompt(index) {
        if (!window._cachedPrompts) return;
        const p = window._cachedPrompts[index];
        const activeId = Conversations.getActiveId();
        if (activeId) {
            const conv = Conversations.get(activeId);
            conv.systemPrompt = p.prompt;
            Conversations.update(activeId, { systemPrompt: p.prompt });
            Toast.show(`System prompt updated to: ${p.title}`, 'success');
        }
        document.getElementById('prompt-modal').classList.remove('active');
        document.getElementById('prompt-overlay').classList.remove('active');
        // Also update settings panel if it's open
        const systemPromptInput = document.getElementById('system-prompt');
        if (systemPromptInput) systemPromptInput.value = p.prompt;
    }

    // ---- Code Artifact Preview ----
    function previewCode(btn) {
        const pre = btn.closest('.code-block-header').nextElementSibling;
        const code = pre?.textContent || '';
        
        const iframe = document.getElementById('artifact-frame');
        
        let htmlDoc = code;
        // Basic check if it's not a full HTML document
        if (!code.toLowerCase().includes('<!doctype html>') && !code.toLowerCase().includes('<html>')) {
            htmlDoc = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>body { font-family: system-ui, sans-serif; padding: 20px; }</style>
                </head>
                <body>
                    ${code}
                </body>
                </html>
            `;
        }

        iframe.srcdoc = htmlDoc;
        
        document.getElementById('artifact-modal').classList.add('active');
        document.getElementById('artifact-overlay').classList.add('active');
    }

    return {
        init,
        switchConversation,
        onDeleteConversation,
        renderSidebar,
        exportProjectZip,
        exportProjectRaw,
        applyPrompt,
        previewCode
    };
})();


// ---- Boot ----
document.addEventListener('DOMContentLoaded', App.init);
