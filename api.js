// ============================================================
// api.js — Unified API Adapter for LM Studio / AnythingLLM
// Talks to any OpenAI-compatible /v1/chat/completions endpoint
// ============================================================

const API = (() => {
  // --------------- Helpers ---------------
  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem('chatapp_settings')) || {};
    } catch {
      return {};
    }
  }

  function getEndpoint() {
    const s = getSettings();
    if (s.apiEndpoint) return s.apiEndpoint.replace(/\/+$/, '');
    
    // Auto-endpoints based on provider
    switch (s.provider) {
      case 'openai': return 'https://api.openai.com/v1';
      case 'anthropic': return 'https://api.anthropic.com/v1'; // Note: Anthropic uses a different schema, but we'll assume OpenAI shim or standard endpoint
      case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta/openai'; 
      case 'groq': return 'https://api.groq.com/openai/v1';
      case 'anythingllm': return 'http://localhost:3001/api/v1';
      case 'lmstudio': return 'http://localhost:1234/v1';
      default: return 'http://localhost:1234/v1';
    }
  }

  function getHeaders() {
    const s = getSettings();
    const headers = { 'Content-Type': 'application/json' };
    if (s.apiKey) {
      headers['Authorization'] = `Bearer ${s.apiKey}`;
    }
    return headers;
  }

  // --------------- Fetch Models ---------------
  async function fetchModels() {
    const endpoint = getEndpoint();
    const res = await fetch(`${endpoint}/models`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    // OpenAI-compatible: data.data is array of {id, ...}
    return (data.data || []).map(m => ({
      id: m.id,
      name: m.id,
      owned_by: m.owned_by || 'local',
    }));
  }

  // --------------- Send Message (Streaming) ---------------
  async function sendMessageStream(messages, options = {}, onToken, onDone, onError) {
    const settings = getSettings();
    const endpoint = getEndpoint();
    const model = options.model || settings.model || '';

    if (!model) {
      onError(new Error('No model selected. Please select a model in Settings.'));
      return null;
    }

    const body = {
      model: model,
      messages: messages,
      stream: true,
      temperature: options.temperature ?? settings.temperature ?? 0.7,
      top_p: options.topP ?? settings.topP ?? 0.9,
      max_tokens: options.maxTokens ?? settings.maxTokens ?? 4096,
    };

    const abortController = new AbortController();

    try {
      const res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${errText || res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              onDone();
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                onToken(delta.content);
              }
              // Check finish reason
              if (parsed.choices?.[0]?.finish_reason) {
                onDone();
                return;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
        onDone();
      };

      read().catch(err => {
        if (err.name !== 'AbortError') {
          onError(err);
        }
      });

      return abortController;
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError(err);
      }
      return null;
    }
  }

  // --------------- Send Message (Non-streaming) ---------------
  async function sendMessage(messages, options = {}) {
    const settings = getSettings();
    const endpoint = getEndpoint();
    const model = options.model || settings.model || '';

    if (!model) {
      throw new Error('No model selected.');
    }

    const body = {
      model: model,
      messages: messages,
      stream: false,
      temperature: options.temperature ?? settings.temperature ?? 0.7,
      top_p: options.topP ?? settings.topP ?? 0.9,
      max_tokens: options.maxTokens ?? settings.maxTokens ?? 4096,
    };

    const res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // --------------- Health Check ---------------
  async function checkConnection() {
    try {
      const models = await fetchModels();
      return { connected: true, models };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  // --------------- Public API ---------------
  return {
    fetchModels,
    sendMessageStream,
    sendMessage,
    checkConnection,
    getSettings,
  };
})();
