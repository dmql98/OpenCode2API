/* opencode2api WebUI — vanilla JS, no build step. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    key: localStorage.getItem('o2a.key') || '',
    status: null,
    configFields: [],
    chatHistory: [],
    streaming: false
  };

  const GROUP_LABELS = {
    network: '网络与后端',
    runtime: '运行时',
    cleanup: '会话清理',
    expose: '对外暴露'
  };

  /* ---------------------------------------------------------------- utils */

  function toast(message, kind) {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast ${kind || ''}`;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (d) return `${d}天 ${h}小时`;
    if (h) return `${h}小时 ${m}分`;
    if (m) return `${m}分 ${sec}秒`;
    return `${sec}秒`;
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
  }

  function fmtClock(epochMs) {
    if (!epochMs) return '—';
    return new Date(epochMs).toLocaleTimeString('zh-CN', { hour12: false });
  }

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function api(path, options = {}) {
    const headers = Object.assign({}, options.headers);
    if (state.key) headers.Authorization = `Bearer ${state.key}`;
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(path, Object.assign({}, options, { headers }));
    } catch (error) {
      throw new ApiError(0, `无法连接网关：${error.message}`);
    }

    if (res.status === 401) {
      showAuth('密钥无效或已过期');
      throw new ApiError(401, 'Unauthorized');
    }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const message = (data && data.error && (data.error.message || data.error)) || res.statusText || '请求失败';
      throw new ApiError(res.status, typeof message === 'string' ? message : JSON.stringify(message));
    }
    return data;
  }

  /* ----------------------------------------------------------------- auth */

  function showAuth(message) {
    $('#auth-overlay').hidden = false;
    $('#auth-msg').textContent = message || '';
    setTimeout(() => $('#auth-input').focus(), 30);
  }

  function hideAuth() {
    $('#auth-overlay').hidden = true;
    $('#auth-msg').textContent = '';
  }

  $('#auth-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.key = $('#auth-input').value.trim();
    if (state.key) localStorage.setItem('o2a.key', state.key);
    else localStorage.removeItem('o2a.key');
    $('#auth-input').value = '';
    hideAuth();
    boot(true);
  });

  $('#auth-skip').addEventListener('click', () => {
    state.key = '';
    localStorage.removeItem('o2a.key');
    hideAuth();
    boot(true);
  });

  $('#auth-btn').addEventListener('click', () => showAuth(''));

  /* ------------------------------------------------------------------ tabs */

  $('#tabs').addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn');
    if (!btn) return;
    $$('.tab-btn').forEach((el) => el.classList.toggle('active', el === btn));
    $$('.panel').forEach((el) => el.classList.toggle('active', el.id === `panel-${btn.dataset.tab}`));
    if (btn.dataset.tab === 'chat') loadModels();
    if (btn.dataset.tab === 'config') loadConfig();
    if (btn.dataset.tab === 'keys') loadKeys();
    if (btn.dataset.tab === 'dashboard') loadStatus().catch(() => {});
  });

  /* ------------------------------------------------------------- dashboard */

  async function loadStatus() {
    let status;
    try {
      status = await api('/api/status');
    } catch (error) {
      if (error.status === 401) throw error;
      $('#st-status').textContent = '离线';
      $('#st-status').style.color = 'var(--danger)';
      $('#st-uptime').textContent = '无法连接网关进程';
      return;
    }
    state.status = status;
    $('#app-version').textContent = `v${status.version}`;
    document.title = `opencode2api · ${status.listen.host}:${status.listen.port}`;

    const dot = $('#backend-dot');
    const reachable = Boolean(status.backend.reachable);
    dot.className = `dot ${reachable ? 'ok' : 'bad'}`;
    $('#backend-label').textContent = reachable ? '后端已连接' : '后端不可达';
    $('#backend-managed').textContent = status.backend.managed ? '由网关自动拉起' : '外部进程';

    $('#st-status').textContent = '运行中';
    $('#st-status').style.color = 'var(--ok)';
    $('#st-uptime').textContent = `已运行 ${fmtDuration(status.uptimeMs)}`;

    const s = status.stats || {};
    $('#st-requests').textContent = String(s.requests ?? 0);
    const c = s.completions || {};
    $('#st-completions').textContent = `chat ${c.chatStream || 0} 流式 / ${c.chatNonStream || 0} 非流式 · responses ${c.responses || 0}`;
    $('#st-errorrate').textContent = `${((s.errorRate || 0) * 100).toFixed(1)}%`;
    $('#st-errors').textContent = `${s.errors || 0} 次错误 · ${s.unauthorized || 0} 次鉴权失败`;
    $('#st-avg').textContent = `${(s.latency && s.latency.avgMs) || 0} ms`;
    $('#st-max').textContent = `峰值 ${(s.latency && s.latency.maxMs) || 0} ms · ${(s.latency && s.latency.samples) || 0} 样本`;

    const endpoints = (status.listen.endpoints || []).map((ep) => `
      <li>
        <span class="label">${escapeHtml(ep.label)}</span>
        <span class="url">${escapeHtml(ep.url)}</span>
        <button class="btn ghost sm" data-copy="${escapeHtml(ep.url)}">复制</button>
      </li>`).join('');
    $('#endpoints').innerHTML = endpoints || '<li><span class="url">—</span></li>';
    $('#listen-info').textContent =
      `监听 ${status.listen.host}:${status.listen.port} · ${status.auth.configured ? `${status.auth.activeKeys} 个有效密钥` : '开放模式（未配置密钥）'}`;

    $('#backend-kv').innerHTML = [
      ['地址', status.backend.url],
      ['连通', status.backend.reachable ? `是 · ${status.backend.latencyMs} ms` : `否${status.backend.error ? ' · ' + status.backend.error : ''}`],
      ['进程管理', status.backend.managed ? 'MANAGE_BACKEND' : '外部托管'],
      ['Node', status.node],
      ['平台', status.platform],
      ['调试日志', status.debug ? '开启' : '关闭'],
      ['配置文件', `${status.configPath}${status.configExists ? '' : '（不存在）'}`],
      ['密钥文件', `${status.secretsPath}${status.secretsExists ? '' : '（不存在）'}`]
    ].map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');

    return status;
  }

  $('#endpoints').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-copy]');
    if (!btn) return;
    copyText(btn.dataset.copy);
  });

  function copyText(text) {
    const done = () => toast('已复制', 'ok');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('复制失败，请手动选择', 'err'); }
    document.body.removeChild(ta);
  }

  $('#btn-models').addEventListener('click', async () => {
    try {
      const data = await api('/v1/models');
      $('#models-count').textContent = `${(data.data || []).length} 个模型可用`;
      toast(`模型数：${(data.data || []).length}`, 'ok');
    } catch (error) {
      toast(error.message, 'err');
    }
  });

  /* ------------------------------------------------------------------ logs */

  async function loadLogs() {
    const file = $('#log-file').value || 'proxy.log';
    const lines = $('#log-lines').value || '200';
    try {
      const data = await api(`/api/logs?file=${encodeURIComponent(file)}&lines=${encodeURIComponent(lines)}`);
      const files = $('#log-file');
      const current = files.value;
      files.innerHTML = (data.files && data.files.length ? data.files : [data.file])
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      if (data.files && data.files.includes(current)) files.value = current;
      $('#log-view').textContent = (data.lines && data.lines.length)
        ? data.lines.join('\n')
        : '（暂无日志）';
      const view = $('#log-view');
      view.scrollTop = view.scrollHeight;
    } catch (error) {
      $('#log-view').textContent = `加载失败：${error.message}`;
    }
  }

  $('#btn-log-refresh').addEventListener('click', loadLogs);
  $('#log-lines').addEventListener('change', loadLogs);
  $('#log-file').addEventListener('change', loadLogs);

  /* ------------------------------------------------------------------ chat */

  async function loadModels() {
    const select = $('#chat-model');
    if (select.dataset.loaded === '1') return;
    try {
      const data = await api('/v1/models');
      const models = (data.data || []).map((m) => m.id);
      select.innerHTML = models.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('')
        || '<option value="">（无可用模型）</option>';
      select.dataset.loaded = '1';
      renderPreview();
    } catch (error) {
      select.innerHTML = `<option value="">（加载失败：${escapeHtml(error.message)}）</option>`;
    }
  }

  function renderPreview() {
    const body = {
      model: $('#chat-model').value || 'opencode/…',
      messages: state.chatHistory.concat([{ role: 'user', content: $('#chat-text').value || '…' }]),
      temperature: Number($('#chat-temp').value) || 0.7,
      stream: $('#chat-stream').checked
    };
    $('#chat-preview').textContent = JSON.stringify(body, null, 2);
  }

  ['change', 'input'].forEach((evt) => {
    $('#chat-model').addEventListener(evt, renderPreview);
    $('#chat-temp').addEventListener(evt, renderPreview);
    $('#chat-text').addEventListener(evt, renderPreview);
  });
  $('#chat-stream').addEventListener('change', renderPreview);

  function pushMessage(role, content) {
    const empty = $('.chat-empty');
    if (empty) empty.remove();
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = content;
    $('#chat-messages').appendChild(el);
    $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
    return el;
  }

  $('#chat-clear').addEventListener('click', () => {
    state.chatHistory = [];
    $('#chat-messages').innerHTML =
      '<div class="chat-empty">选择模型并发送消息，直接验证 <code>/v1/chat/completions</code>。</div>';
    $('#chat-raw').textContent = '—';
    renderPreview();
  });

  $('#chat-text').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('#chat-form').requestSubmit();
    }
  });

  $('#chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.streaming) return;

    const text = $('#chat-text').value.trim();
    if (!text) return;

    const model = $('#chat-model').value;
    if (!model) { toast('请先选择模型', 'err'); return; }

    const stream = $('#chat-stream').checked;
    state.chatHistory.push({ role: 'user', content: text });
    pushMessage('user', text);
    $('#chat-text').value = '';
    renderPreview();

    const body = {
      model,
      messages: state.chatHistory.slice(),
      temperature: Number($('#chat-temp').value) || 0.7,
      stream
    };

    const sendBtn = $('#chat-send');
    state.streaming = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '生成中…';

    const raw = $('#chat-raw');
    raw.textContent = '';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.key) headers.Authorization = `Bearer ${state.key}`;

      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (res.status === 401) { showAuth('密钥无效或已过期'); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error((err && err.error && err.error.message) || `HTTP ${res.status}`);
      }

      if (stream) {
        await handleStream(res, raw);
      } else {
        const data = await res.json();
        raw.textContent = JSON.stringify(data, null, 2);
        const message = data.choices && data.choices[0] && data.choices[0].message;
        finalizeAssistant(message || {}, null);
      }
    } catch (error) {
      pushMessage('error', `请求失败：${error.message}`);
      raw.textContent = error.message;
    } finally {
      state.streaming = false;
      sendBtn.disabled = false;
      sendBtn.textContent = '发送';
      renderPreview();
    }
  });

  async function handleStream(res, raw) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistant = '';
    let meta = '';
    const byIndex = new Map();
    const bubble = pushMessage('assistant', '');
    const metaEl = pushMessage('meta', '流式接收中…');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        let json;
        try { json = JSON.parse(payload); } catch { continue; }
        raw.textContent = JSON.stringify(json, null, 2);

        const choice = json.choices && json.choices[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (delta.content) {
          assistant += delta.content;
          bubble.textContent = assistant;
          $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
        }
        if (delta.reasoning_content) meta += delta.reasoning_content;
        if (delta.tool_calls) {
          for (const part of delta.tool_calls) {
            const index = Number.isInteger(part.index) ? part.index : 0;
            const acc = byIndex.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (part.id) acc.id = part.id;
            if (part.type) acc.type = part.type;
            if (part.function) {
              if (part.function.name) acc.function.name += part.function.name;
              if (part.function.arguments) acc.function.arguments += part.function.arguments;
            }
            byIndex.set(index, acc);
          }
          metaEl.textContent = `正在接收工具调用…${meta ? ' · ' + meta : ''}`;
        }
        if (choice.finish_reason) meta += `${meta ? ' · ' : ''}finish=${choice.finish_reason}`;
      }
    }

    const toolCalls = Array.from(byIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => call)
      .filter((call) => call.function.name);

    metaEl.textContent = meta || '完成';
    finalizeAssistant({ content: assistant, tool_calls: toolCalls }, meta, true);
  }

  // `rendered` marks messages whose bubble is already on screen (streaming), so the
  // assistant entry is updated in place instead of appended twice.
  function finalizeAssistant(message, meta, rendered) {
    const content = message.content || '';
    const toolCalls = message.tool_calls || [];
    let text = content;
    if (toolCalls.length) {
      text += `${text ? '\n\n' : ''}tool_calls:\n` +
        toolCalls.map((t) => `  ${t.function.name}(${t.function.arguments})`).join('\n');
      const metaEl = $$('.msg.meta').pop();
      if (metaEl) metaEl.textContent = `返回 ${toolCalls.length} 个工具调用`;
    }

    state.chatHistory.push({ role: 'assistant', content: text || '(空回复)' });

    if (rendered) {
      const bubbles = $$('.msg.assistant');
      if (bubbles.length) bubbles[bubbles.length - 1].textContent = text || '(空回复)';
      return;
    }
    if (content || toolCalls.length) pushMessage('assistant', text);
  }

  /* ---------------------------------------------------------------- config */

  async function loadConfig() {
    let data;
    try {
      data = await api('/api/config');
    } catch (error) {
      if (error.status === 401) return;
      $('#config-msg').textContent = error.message;
      return;
    }
    state.configFields = data.fields || [];

    const groups = {};
    for (const field of state.configFields) {
      (groups[field.group] = groups[field.group] || []).push(field);
    }

    $('#config-groups').innerHTML = Object.entries(groups).map(([group, fields]) => `
      <div class="config-group">
        <h3>${escapeHtml(GROUP_LABELS[group] || group)}</h3>
        <div class="config-rows">
          ${fields.map((field) => configRow(field, data.values[field.key])).join('')}
        </div>
      </div>`).join('');

    $('#config-msg').textContent = '';
  }

  function configRow(field, value) {
    const badge = field.hot
      ? '<span class="tag hot">热更新</span>'
      : '<span class="tag cold">重启生效</span>';

    let control;
    if (field.type === 'boolean') {
      control = `<label class="switch">
        <input type="checkbox" data-key="${escapeHtml(field.key)}" ${value ? 'checked' : ''}>
        <span class="slider"></span>
      </label>`;
    } else if (field.type === 'select') {
      control = `<select class="select" data-key="${escapeHtml(field.key)}">
        ${(field.options || []).map((opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
      </select>`;
    } else if (field.type === 'number') {
      control = `<input class="input" type="number" data-key="${escapeHtml(field.key)}"
        value="${escapeHtml(value == null ? '' : value)}"
        ${field.min !== undefined ? `min="${field.min}"` : ''}
        ${field.max !== undefined ? `max="${field.max}"` : ''}>`;
    } else {
      control = `<input class="input" type="${field.type === 'password' ? 'password' : 'text'}"
        data-key="${escapeHtml(field.key)}" value="${escapeHtml(value == null ? '' : value)}"
        autocomplete="off">`;
    }

    return `<div class="config-row">
      <div class="config-row-head">
        <span class="config-row-label">${escapeHtml(field.label)}<code class="config-row-key">${escapeHtml(field.key)}</code></span>
        ${badge}
      </div>
      ${control}
      ${field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : ''}
    </div>`;
  }

  $('#config-reload').addEventListener('click', loadConfig);

  $('#config-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {};
    for (const el of $$('#config-groups [data-key]')) {
      values[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value;
    }
    try {
      const result = await api('/api/config', { method: 'POST', body: JSON.stringify({ values }) });
      const msg = $('#config-msg');
      if (result.restartRequired && result.restartRequired.length) {
        msg.innerHTML = `已保存。以下字段需重启生效：${escapeHtml(result.restartRequired.join(', '))}`;
        msg.style.color = 'var(--warn)';
      } else {
        msg.textContent = '已保存并生效。';
        msg.style.color = 'var(--ok)';
      }
      toast('配置已保存', 'ok');
      loadStatus();
    } catch (error) {
      toast(error.message, 'err');
      $('#config-msg').textContent = error.message;
      $('#config-msg').style.color = 'var(--danger)';
    }
  });

  /* ----------------------------------------------------------------- keys */

  async function loadKeys() {
    let data;
    try {
      data = await api('/api/keys');
    } catch (error) {
      if (error.status === 401) return;
      toast(error.message, 'err');
      return;
    }

    const rows = (data.keys || []).map((entry) => `
      <tr>
        <td>${escapeHtml(entry.name)}</td>
        <td class="mono">${escapeHtml(entry.masked)}</td>
        <td><span class="badge">${escapeHtml(entry.source)}</span></td>
        <td>${escapeHtml(fmtTime(entry.createdAt))}</td>
        <td>${entry.lastUsedAt ? escapeHtml(fmtClock(entry.lastUsedAt)) : '—'}</td>
        <td>${entry.revoked
          ? '<span class="badge revoked">已撤销</span>'
          : '<span class="badge active">有效</span>'}</td>
        <td style="text-align:right; white-space:nowrap">
          ${entry.readOnly ? '' : `
            ${entry.revoked ? '' : `<button class="btn ghost sm" data-revoke="${entry.id}">撤销</button>`}
            <button class="btn ghost sm danger" data-delete="${entry.id}">删除</button>`}
        </td>
      </tr>`).join('');

    $('tbody', $('#keys-table')).innerHTML = rows ||
      '<tr><td colspan="7" class="empty">还没有密钥</td></tr>';

    const hasConfigEntry = (data.keys || []).some((k) => k.id === 'config-api-key' && !k.revoked);
    $('#btn-migrate').hidden = !hasConfigEntry;
  }

  $('#btn-keys-refresh').addEventListener('click', loadKeys);

  $('#key-create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await api('/api/keys', {
        method: 'POST',
        body: JSON.stringify({ name: $('#key-name').value })
      });
      $('#key-name').value = '';
      $('#key-created').classList.remove('hidden');
      $('#key-created-value').textContent = result.key.plain;
      $('#key-created').dataset.value = result.key.plain;
      loadKeys();
      toast('密钥已生成', 'ok');
    } catch (error) {
      toast(error.message, 'err');
    }
  });

  $('#key-copy').addEventListener('click', () => {
    copyText($('#key-created').dataset.value || '');
  });

  $('#keys-table').addEventListener('click', async (event) => {
    const revokeBtn = event.target.closest('[data-revoke]');
    const deleteBtn = event.target.closest('[data-delete]');
    if (revokeBtn) {
      if (!confirm('撤销后该密钥立即失效，确定吗？')) return;
      try {
        await api(`/api/keys/${revokeBtn.dataset.revoke}/revoke`, { method: 'POST' });
        toast('已撤销', 'ok');
        loadKeys();
      } catch (error) { toast(error.message, 'err'); }
    } else if (deleteBtn) {
      if (!confirm('从 secrets.json 中彻底删除该条目？')) return;
      try {
        await api(`/api/keys/${deleteBtn.dataset.delete}`, { method: 'DELETE' });
        toast('已删除', 'ok');
        loadKeys();
      } catch (error) { toast(error.message, 'err'); }
    }
  });

  $('#btn-migrate').addEventListener('click', async () => {
    if (!confirm('把 config.json 中的 API_KEY 移入 secrets.json？迁移后 config.json 不再保存密钥。')) return;
    try {
      await api('/api/keys/migrate', { method: 'POST' });
      toast('迁移完成', 'ok');
      loadKeys();
      loadStatus();
    } catch (error) { toast(error.message, 'err'); }
  });

  /* ----------------------------------------------------------------- boot */

  async function boot(force) {
    try {
      await loadStatus();
      hideAuth();
      loadLogs();
      loadModels();
      renderPreview();
    } catch (error) {
      if (error.status === 401) return;
      if (force) toast(error.message, 'err');
    }
  }

  setInterval(() => {
    if (!document.hidden && $('#panel-dashboard').classList.contains('active')) loadStatus().catch(() => {});
  }, 10000);

  setInterval(() => {
    if (!document.hidden && $('#panel-dashboard').classList.contains('active')) loadLogs();
  }, 15000);

  boot(false);
})();
