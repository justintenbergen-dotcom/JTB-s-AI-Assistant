// ============================================================
// conversations.js — Multi-Conversation Management (localStorage)
// ============================================================

const Conversations = (() => {
    const STORAGE_KEY = 'chatapp_conversations';
    const ACTIVE_KEY = 'chatapp_active_conversation';

    // ---- Helpers ----
    function generateId() {
        return 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function loadAll() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveAll(conversations) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    }

    function getActiveId() {
        return localStorage.getItem(ACTIVE_KEY) || null;
    }

    function setActiveId(id) {
        localStorage.setItem(ACTIVE_KEY, id);
    }

    // ---- CRUD ----
    function create(title) {
        const conversations = loadAll();
        const settings = Settings.load();
        const conv = {
            id: generateId(),
            title: title || 'New Chat',
            messages: [],
            systemPrompt: settings.systemPrompt || 'You are a helpful AI assistant.',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        conversations.unshift(conv);
        saveAll(conversations);
        setActiveId(conv.id);
        return conv;
    }

    function get(id) {
        return loadAll().find(c => c.id === id) || null;
    }

    function getActive() {
        const id = getActiveId();
        if (!id) return null;
        return get(id);
    }

    function update(id, updates) {
        const conversations = loadAll();
        const idx = conversations.findIndex(c => c.id === id);
        if (idx === -1) return null;
        conversations[idx] = {
            ...conversations[idx],
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        saveAll(conversations);
        return conversations[idx];
    }

    function remove(id) {
        let conversations = loadAll();
        conversations = conversations.filter(c => c.id !== id);
        saveAll(conversations);
        // If we deleted the active one, switch to first available
        if (getActiveId() === id) {
            if (conversations.length > 0) {
                setActiveId(conversations[0].id);
            } else {
                localStorage.removeItem(ACTIVE_KEY);
            }
        }
        return conversations;
    }

    function rename(id, newTitle) {
        return update(id, { title: newTitle });
    }

    function addMessage(id, role, content) {
        const conv = get(id);
        if (!conv) return null;
        if (!conv.messages) conv.messages = [];
        conv.messages.push({
            role,
            content,
            timestamp: new Date().toISOString(),
        });
        // Auto-title from first user message
        if (role === 'user' && conv.messages.filter(m => m.role === 'user').length === 1 && conv.title === 'New Chat') {
            conv.title = content.slice(0, 40) + (content.length > 40 ? '…' : '');
        }
        return update(id, { messages: conv.messages, title: conv.title });
    }

    function updateLastAssistantMessage(id, content) {
        const conv = get(id);
        if (!conv) return null;
        for (let i = conv.messages.length - 1; i >= 0; i--) {
            if (conv.messages[i].role === 'assistant') {
                conv.messages[i].content = content;
                break;
            }
        }
        return update(id, { messages: conv.messages });
    }

    function clearAll() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_KEY);
    }

    // ---- Export / Import ----
    function exportAll() {
        const conversations = loadAll();
        const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-chat-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportOne(id) {
        const conv = get(id);
        if (!conv) return;
        const blob = new Blob([JSON.stringify(conv, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-${conv.title.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            const conversations = loadAll();

            if (Array.isArray(data)) {
                // Multiple conversations
                data.forEach(conv => {
                    if (conv.id && conv.messages) {
                        conv.id = generateId(); // Avoid conflicts
                        conversations.unshift(conv);
                    }
                });
            } else if (data.id && data.messages) {
                // Single conversation
                data.id = generateId();
                conversations.unshift(data);
            } else {
                throw new Error('Invalid format');
            }

            saveAll(conversations);
            return true;
        } catch (err) {
            console.error('Import error:', err);
            return false;
        }
    }

    // ---- Render Sidebar ----
    function renderList(onSwitch, onDelete) {
        const listEl = document.getElementById('conversation-list');
        const conversations = loadAll();
        const activeId = getActiveId();

        listEl.innerHTML = '';

        if (conversations.length === 0) {
            listEl.innerHTML = `
        <div style="padding:24px 16px;text-align:center;color:var(--color-text-muted);font-size:var(--text-sm);">
          No conversations yet.<br>Click <strong>+ New</strong> to start.
        </div>`;
            return;
        }

        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversation-item' + (conv.id === activeId ? ' active' : '');
            item.dataset.id = conv.id;

            item.innerHTML = `
        <span class="conv-title" title="${conv.title}">${conv.title}</span>
        <div class="conv-actions">
          <button class="conv-rename" title="Rename">✎</button>
          <button class="conv-delete" title="Delete">✕</button>
        </div>
      `;

            // Click to switch
            item.addEventListener('click', (e) => {
                if (e.target.closest('.conv-actions')) return;
                setActiveId(conv.id);
                if (onSwitch) onSwitch(conv.id);
            });

            // Rename
            item.querySelector('.conv-rename').addEventListener('click', (e) => {
                e.stopPropagation();
                const newTitle = prompt('Rename conversation:', conv.title);
                if (newTitle && newTitle.trim()) {
                    rename(conv.id, newTitle.trim());
                    renderList(onSwitch, onDelete);
                    if (conv.id === activeId) {
                        document.getElementById('chat-title').textContent = newTitle.trim();
                    }
                }
            });

            // Delete
            item.querySelector('.conv-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this conversation?')) {
                    remove(conv.id);
                    if (onDelete) onDelete(conv.id);
                    renderList(onSwitch, onDelete);
                }
            });

            listEl.appendChild(item);
        });
    }

    return {
        create,
        get,
        getActive,
        getActiveId,
        setActiveId,
        update,
        remove,
        rename,
        addMessage,
        updateLastAssistantMessage,
        clearAll,
        loadAll,
        exportAll,
        exportOne,
        importFromJSON,
        renderList,
    };
})();
