// ============================================================
// chat.js — Chat UI Rendering, Streaming, Markdown, Typing
// ============================================================

const Chat = (() => {
    let currentAbort = null;
    let isGenerating = false;
    let streamedContent = '';

    // ---- DOM ----
    function getEls() {
        return {
            container: document.getElementById('messages-container'),
            welcome: document.getElementById('welcome-state'),
            input: document.getElementById('message-input'),
            btnSend: document.getElementById('btn-send'),
            btnStop: document.getElementById('btn-stop'),
            tokenCount: document.getElementById('token-count'),
            chatTitle: document.getElementById('chat-title'),
        };
    }

    // ---- Markdown Parser (lightweight) ----
    function parseMarkdown(text, isInternal = false) {
        if (!text) return '';

        let html = text;

        // Escape HTML first (but preserve think tags for extraction)
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Restore think tags from escaped versions
        html = html.replace(/&lt;think&gt;/g, '<think>').replace(/&lt;\/think&gt;/g, '</think>');

        // Extract reasoning (think blocks)
        html = html.replace(/<think>([\s\S]*?)<\/think>/g, (_, thinking) => {
            const parsedThinking = parseMarkdown(thinking.trim(), true);
            return `<details class="thinking-panel">
                <summary>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                    Reasoning Process
                </summary>
                <div class="thinking-content">${parsedThinking}</div>
            </details>`;
        });
        
        // Handle unclosed think tags (during streaming)
        html = html.replace(/<think>([\s\S]*)$/g, (_, thinking) => {
            const parsedThinking = parseMarkdown(thinking.trim(), true);
            return `<details class="thinking-panel" open>
                <summary>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    Thinking...
                </summary>
                <div class="thinking-content">${parsedThinking}</div>
            </details>`;
        });

        // Code blocks (```lang\n...\n```)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            const langLabel = lang || 'code';
            const isWeb = ['html', 'css', 'js', 'javascript'].includes(lang.toLowerCase());
            const previewBtn = isWeb ? `<button onclick="App.previewCode(this)" class="btn-copy-code" style="margin-right:8px; background:var(--color-accent); border-color:var(--color-accent); color:#fff;">Preview Artifact</button>` : '';
            const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
            return `<div class="code-block-header"><span>${langLabel}</span><div style="display:flex;">${previewBtn}<button onclick="Chat.copyCode(this)" class="btn-copy-code">Copy</button></div></div><pre><code>${escapedCode}</code></pre>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Headings
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Unordered lists
        html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

        // Ordered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Line breaks → paragraphs
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        // Wrap in paragraph if not already wrapped (skip for internal parsing to prevent duplicate p tags inside details)
        if (!isInternal && !html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<div') && !html.startsWith('<pre') && !html.startsWith('<details')) {
            html = '<p>' + html + '</p>';
        }

        return html;
    }

    // ---- Copy Code ----
    function copyCode(btn) {
        const pre = btn.closest('.code-block-header').nextElementSibling;
        const text = pre?.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
    }

    // ---- Render Messages ----
    function renderMessages(conversationId) {
        const els = getEls();
        const conv = Conversations.get(conversationId);

        if (!conv || conv.messages.length === 0) {
            els.welcome.classList.remove('hidden');
            els.container.innerHTML = '';
            els.container.appendChild(els.welcome);
            els.chatTitle.textContent = conv?.title || 'New Chat';
            return;
        }

        els.welcome.classList.add('hidden');
        els.chatTitle.textContent = conv.title;

        // Build messages HTML
        let html = '';
        conv.messages.forEach((msg, idx) => {
            const isUser = msg.role === 'user';
            const avatarLetter = isUser ? 'U' : 'AI';
            const roleLabel = isUser ? 'You' : 'Assistant';
            const bodyHtml = isUser ? escapeHtml(msg.content) : parseMarkdown(msg.content);
            const readAloudBtn = !isUser && window.speechSynthesis ? `<button onclick="Chat.readAloud(this, ${idx})">🔊 Read</button>` : '';

            html += `
        <div class="message ${msg.role}" data-index="${idx}">
          <div class="message-avatar">${avatarLetter}</div>
          <div class="message-content">
            <div class="message-role">${roleLabel}</div>
            <div class="message-body">${bodyHtml}</div>
            <div class="message-actions">
              <button onclick="Chat.copyMessage(${idx})">📋 Copy</button>
              ${readAloudBtn}
              ${!isUser ? `<button onclick="Chat.regenerate()">🔄 Regenerate</button>` : ''}
            </div>
          </div>
        </div>
      `;
        });

        els.container.innerHTML = html;
        scrollToBottom();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    // ---- Copy Message ----
    function copyMessage(idx) {
        const conv = Conversations.getActive();
        if (!conv || !conv.messages[idx]) return;
        navigator.clipboard.writeText(conv.messages[idx].content).then(() => {
            Toast.show('Message copied!', 'success');
        });
    }

    // ---- Read Aloud TTS ----
    function readAloud(btn, idx) {
        if (!window.speechSynthesis) return;
        
        window.speechSynthesis.cancel(); // Stop any current speech
        
        if (btn.textContent.includes('Stop')) {
            btn.innerHTML = '🔊 Read';
            btn.classList.remove('mic-recording');
            return;
        }

        const conv = Conversations.getActive();
        if (!conv || !conv.messages[idx]) return;
        
        // Strip markdown, thinking blocks, and code for speech
        let text = conv.messages[idx].content
            .replace(/<think>[\s\S]*?<\/think>/g, '') // remove think blocks
            .replace(/```[\s\S]*?```/g, 'Code block omitted.'); // replace code blocks
            
        // Strip other basic markdown
        text = text.replace(/[*_~`#]/g, '');

        const utterance = new SpeechSynthesisUtterance(text);
        
        utterance.onstart = () => { 
            btn.innerHTML = '⏹ Stop'; 
            btn.classList.add('mic-recording'); 
        };
        utterance.onend = () => { 
            btn.innerHTML = '🔊 Read'; 
            btn.classList.remove('mic-recording'); 
        };
        utterance.onerror = () => { 
            btn.innerHTML = '🔊 Read'; 
            btn.classList.remove('mic-recording'); 
        };

        window.speechSynthesis.speak(utterance);
    }

    // ---- Scroll ----
    function scrollToBottom() {
        const container = document.getElementById('messages-container');
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    // ---- Typing Indicator ----
    function showTyping() {
        const els = getEls();
        const existing = document.getElementById('typing-indicator');
        if (existing) return;

        const div = document.createElement('div');
        div.id = 'typing-indicator';
        div.className = 'message assistant';
        div.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-content">
        <div class="message-role">Assistant</div>
        <div class="typing-indicator">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    `;
        els.container.appendChild(div);
        scrollToBottom();
    }

    function hideTyping() {
        const el = document.getElementById('typing-indicator');
        if (el) el.remove();
    }

    // ---- Streaming Message ----
    function showStreamingMessage() {
        const els = getEls();
        hideTyping();

        const div = document.createElement('div');
        div.id = 'streaming-message';
        div.className = 'message assistant';
        div.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-content">
        <div class="message-role">Assistant</div>
        <div class="message-body" id="streaming-body"></div>
      </div>
    `;
        els.container.appendChild(div);
        scrollToBottom();
    }

    function appendStreamToken(token) {
        streamedContent += token;
        const body = document.getElementById('streaming-body');
        if (body) {
            body.innerHTML = parseMarkdown(streamedContent);
            scrollToBottom();
        }
    }

    function finalizeStream() {
        const el = document.getElementById('streaming-message');
        if (el) el.remove();
    }

    // ---- File Attachments (Local RAG) ----
    let currentAttachments = [];

    function addAttachment(file, content) {
        currentAttachments.push({ name: file.name, content: content });
        renderAttachments();
    }

    function removeAttachment(index) {
        currentAttachments.splice(index, 1);
        renderAttachments();
    }

    function renderAttachments() {
        const container = document.getElementById('attachment-preview');
        if (!container) return;
        container.innerHTML = currentAttachments.map((att, i) => `
            <div class="attachment-item">
                <span>📎 ${att.name}</span>
                <span class="remove" onclick="Chat.removeAttachment(${i})">✕</span>
            </div>
        `).join('');
    }

    function clearAttachments() {
        currentAttachments = [];
        renderAttachments();
    }

    // ---- Send Message ----
    async function send() {
        const els = getEls();
        let text = els.input.value.trim();
        if ((!text && currentAttachments.length === 0) || isGenerating) return;

        // Inject attachments into user text
        if (currentAttachments.length > 0) {
            let attContext = "\\n\\n[Attached Files Context:]\\n";
            currentAttachments.forEach(att => {
                attContext += `--- File: ${att.name} ---\\n${att.content}\\n`;
            });
            text += attContext;
            clearAttachments();
        }

        const activeId = Conversations.getActiveId();
        if (!activeId) {
            // Create new conversation if none exists
            const conv = Conversations.create();
            App.switchConversation(conv.id);
        }

        const convId = Conversations.getActiveId();

        // Add user message
        Conversations.addMessage(convId, 'user', text);
        els.input.value = '';
        els.input.style.height = 'auto';
        updateTokenCount('');
        document.getElementById('tps-count').textContent = '';

        // Re-render
        renderMessages(convId);
        
        // Build messages array for API
        const conv = Conversations.get(convId);
        const apiMessages = [];

        // System prompt
        if (conv.systemPrompt) {
            apiMessages.push({ role: 'system', content: conv.systemPrompt });
        }

        // Conversation history
        conv.messages.forEach(m => {
            apiMessages.push({ role: m.role, content: m.content });
        });

        // Advanced Feature Instructions
        const isResearch = document.getElementById('btn-toggle-research')?.classList.contains('active');
        const isWeb = document.getElementById('btn-toggle-web')?.classList.contains('active');
        const isMulti = document.getElementById('btn-toggle-multi')?.classList.contains('active');

        if (isResearch || isWeb || isMulti) {
            let extra = "\n\n[System Note: The user has enabled the following advanced features for this request:\n";
            
            if (isResearch) {
                const settings = Settings.load();
                const speed = settings.researchSpeed !== undefined ? settings.researchSpeed : 50;
                const depth = settings.crawlDepth !== undefined ? settings.crawlDepth : 5;
                const modeDesc = speed < 30 ? "Extremely Slow, Methodical, and Deep" : (speed > 70 ? "Fast, Summary-focused, and Quick" : "Balanced");
                extra += `- Advanced Research: Conduct a deep dive analysis. Mode: ${modeDesc}. Scrutinize up to ${depth} conceptual angles or sources.\n`;
            }
            
            if (isWeb) {
                try {
                    const originalText = text.replace(/\[Attached Files Context:\][\s\S]*$/g, '').trim();
                    const query = encodeURIComponent(originalText.substring(0, 100)); // limit search text
                    if (query) {
                        Toast.show('Fetching live data...', 'info', 2000);
                        const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&utf8=&format=json&origin=*`);
                        const data = await res.json();
                        if (data.query && data.query.search.length > 0) {
                            const snippets = data.query.search.slice(0, 3).map(s => s.snippet.replace(/<!--.*?-->/g, "").replace(/<\/?[^>]+(>|$)/g, "")).join(" | ");
                            extra += `- Real-Time Web Search Findings: ${snippets}\n`;
                        } else {
                            extra += "- Real-Time Web Search: No immediate results found for the query.\n";
                        }
                    } else {
                        extra += "- Web Search enabled.\n";
                    }
                } catch(e) {
                     extra += "- Web Search Error: Could not fetch real-time data.\n";
                }
            }

            if (isMulti) {
                const settings = Settings.load();
                const modelToCombine = settings.multiModelPrimary || "an expert model";
                extra += `- Multi-Model Synthesis: Synthesize insights as if combining knowledge from several specialized expert models, heavily weighting the perspective of ${modelToCombine}.\n`;
            }
            extra += "Please adjust your response accordingly.]";
            
            // Append to the last user message in the API call only (don't save to history)
            if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === 'user') {
                apiMessages[apiMessages.length - 1].content += extra;
            }
        }

        // Start streaming
        setGenerating(true);
        showTyping();
        streamedContent = '';
        document.getElementById('tps-count').textContent = '';

        // Add placeholder assistant message
        Conversations.addMessage(convId, 'assistant', '');

        let startTime = Date.now();
        let tokenCount = 0;

        currentAbort = await API.sendMessageStream(
            apiMessages,
            {},
            // onToken
            (token) => {
                if (!document.getElementById('streaming-body')) {
                    showStreamingMessage();
                    startTime = Date.now(); // reset start time when first token arrives
                }
                appendStreamToken(token);

                // TPS Calculation
                tokenCount++;
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed > 0) {
                    const tps = (tokenCount / elapsed).toFixed(1);
                    document.getElementById('tps-count').textContent = `⚡ ${tps} tps`;
                }

                // Save incrementally
                Conversations.updateLastAssistantMessage(convId, streamedContent);
            },
            // onDone
            () => {
                finalizeStream();
                hideTyping();
                setGenerating(false);
                Conversations.updateLastAssistantMessage(convId, streamedContent);
                renderMessages(convId);
                Conversations.renderList(
                    (id) => App.switchConversation(id),
                    (id) => App.onDeleteConversation(id)
                );
            },
            // onError
            (err) => {
                finalizeStream();
                hideTyping();
                setGenerating(false);

                // Remove empty assistant message
                const c = Conversations.get(convId);
                if (c && c.messages.length > 0 && c.messages[c.messages.length - 1].role === 'assistant' && !c.messages[c.messages.length - 1].content) {
                    c.messages.pop();
                    Conversations.update(convId, { messages: c.messages });
                }

                renderMessages(convId);
                Toast.show(`Error: ${err.message}`, 'error');
            }
        );
    }

    // ---- Regenerate ----
    async function regenerate() {
        const convId = Conversations.getActiveId();
        const conv = Conversations.get(convId);
        if (!conv || conv.messages.length < 2) return;

        // Remove last assistant message
        if (conv.messages[conv.messages.length - 1].role === 'assistant') {
            conv.messages.pop();
            Conversations.update(convId, { messages: conv.messages });
        }

        // Render without last message
        renderMessages(convId);

        // Re-build API messages
        const apiMessages = [];
        if (conv.systemPrompt) {
            apiMessages.push({ role: 'system', content: conv.systemPrompt });
        }
        conv.messages.forEach(m => {
            apiMessages.push({ role: m.role, content: m.content });
        });

        // Send again
        setGenerating(true);
        showTyping();
        streamedContent = '';
        Conversations.addMessage(convId, 'assistant', '');

        currentAbort = await API.sendMessageStream(
            apiMessages,
            {},
            (token) => {
                if (!document.getElementById('streaming-body')) {
                    showStreamingMessage();
                }
                appendStreamToken(token);
                Conversations.updateLastAssistantMessage(convId, streamedContent);
            },
            () => {
                finalizeStream();
                hideTyping();
                setGenerating(false);
                Conversations.updateLastAssistantMessage(convId, streamedContent);
                renderMessages(convId);
            },
            (err) => {
                finalizeStream();
                hideTyping();
                setGenerating(false);
                Toast.show(`Error: ${err.message}`, 'error');
            }
        );
    }

    // ---- Stop Generation ----
    function stop() {
        if (currentAbort) {
            currentAbort.abort();
            currentAbort = null;
        }
        finalizeStream();
        hideTyping();
        setGenerating(false);

        const convId = Conversations.getActiveId();
        if (streamedContent) {
            Conversations.updateLastAssistantMessage(convId, streamedContent);
        }
        renderMessages(convId);
        Toast.show('Generation stopped', 'info');
    }

    // ---- UI State ----
    function setGenerating(generating) {
        isGenerating = generating;
        const els = getEls();
        if (generating) {
            els.btnSend.classList.add('hidden');
            els.btnStop.style.display = 'flex';
            els.input.disabled = true;
        } else {
            els.btnSend.classList.remove('hidden');
            els.btnStop.style.display = 'none';
            els.input.disabled = false;
            els.input.focus();
        }
    }

    // ---- Token Counter (approximate) ----
    function updateTokenCount(text) {
        const count = Math.ceil((text || '').length / 4);
        const el = document.getElementById('token-count');
        if (el) el.textContent = `~${count} tokens`;
    }

    // ---- Auto-resize Input ----
    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    }

    return {
        renderMessages,
        send,
        stop,
        regenerate,
        copyMessage,
        copyCode,
        readAloud,
        updateTokenCount,
        autoResize,
        scrollToBottom,
        addAttachment,
        removeAttachment,
        isGenerating: () => isGenerating,
    };
})();
