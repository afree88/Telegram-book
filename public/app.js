/* ============================================================
   Drive2Telegram Frontend Application Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // Global State
  const state = {
    config: {},
    files: [],
    selectedIds: new Set(),
    fileStatuses: new Map(),
    batch: {
      isRunning: false,
      total: 0,
      completed: 0,
      currentId: null,
      failedItems: []
    },
    playingFileId: null
  };

  // DOM Elements
  const el = {
    // Header & Pills
    botStatusPill: document.getElementById('bot-status-pill'),
    botStatusText: document.getElementById('bot-status-text'),
    toggleSettingsBtn: document.getElementById('toggle-settings-btn'),
    helpBtn: document.getElementById('help-btn'),
    helpModal: document.getElementById('help-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalOkBtn: document.getElementById('modal-ok-btn'),
    tokenHelpLink: document.getElementById('token-help-link'),
    chatHelpLink: document.getElementById('chat-help-link'),

    // Settings
    settingsCard: document.getElementById('settings-card'),
    settingsHeader: document.getElementById('settings-header'),
    settingsContent: document.getElementById('settings-content'),
    settingsChevron: document.getElementById('settings-chevron'),
    configForm: document.getElementById('config-form'),
    botTokenInput: document.getElementById('cfg-bot-token'),
    chatIdInput: document.getElementById('cfg-chat-id'),
    toggleTokenVisibility: document.getElementById('toggle-token-visibility'),
    eyeIcon: document.getElementById('eye-icon'),
    btnTestTelegram: document.getElementById('btn-test-telegram'),
    testBtnText: document.getElementById('test-btn-text'),
    testFeedback: document.getElementById('test-feedback'),
    folderUrlInput: document.getElementById('cfg-folder-url'),
    titleFormatSelect: document.getElementById('cfg-title-format'),
    bookTitleInput: document.getElementById('cfg-book-title'),
    performerInput: document.getElementById('cfg-performer'),
    sendModeSelect: document.getElementById('cfg-send-mode'),
    captionInput: document.getElementById('cfg-caption'),
    delayInput: document.getElementById('cfg-delay'),

    // Explorer
    quickFolderUrl: document.getElementById('quick-folder-url'),
    btnQuickLoadFolder: document.getElementById('btn-quick-load-folder'),
    presetPills: document.querySelectorAll('.preset-pill'),
    displayFolderTitle: document.getElementById('display-folder-title'),
    displayFolderStats: document.getElementById('display-folder-stats'),
    btnScanDrive: document.getElementById('btn-scan-drive'),
    btnSendSelected: document.getElementById('btn-send-selected'),
    btnSendSelectedText: document.getElementById('btn-send-selected-text'),
    fileSearchInput: document.getElementById('file-search-input'),
    filterAudioOnly: document.getElementById('filter-audio-only'),
    quickTitleFormat: document.getElementById('quick-title-format'),
    btnSelectAll: document.getElementById('btn-select-all'),
    btnDeselectAll: document.getElementById('btn-deselect-all'),
    filesList: document.getElementById('files-list'),
    filesLoading: document.getElementById('files-loading'),
    filesEmpty: document.getElementById('files-empty'),

    // Batch Card
    batchCard: document.getElementById('batch-progress-card'),
    batchTitle: document.getElementById('batch-title'),
    batchSubtitle: document.getElementById('batch-subtitle'),
    batchProgressCount: document.getElementById('batch-progress-count'),
    batchProgressPercent: document.getElementById('batch-progress-percent'),
    batchProgressFill: document.getElementById('batch-progress-fill'),
    batchCurrentText: document.getElementById('batch-current-text'),
    btnCancelBatch: document.getElementById('btn-cancel-batch'),

    // Batch Pause/Retry Alert
    batchPauseAlert: document.getElementById('batch-pause-alert'),
    pauseAlertMessage: document.getElementById('pause-alert-message'),
    btnQueueRetry: document.getElementById('btn-queue-retry'),
    btnQueueSkip: document.getElementById('btn-queue-skip'),
    btnQueueCancel: document.getElementById('btn-queue-cancel'),
    btnRetryFailed: document.getElementById('btn-retry-failed'),
    btnRetryFailedText: document.getElementById('btn-retry-failed-text'),

    // Retry/Error Settings
    maxRetriesInput: document.getElementById('cfg-max-retries'),
    onErrorSelect: document.getElementById('cfg-on-error'),

    // Audio Preview Player
    playerBar: document.getElementById('floating-audio-player'),
    playerTrackName: document.getElementById('player-track-name'),
    globalAudio: document.getElementById('global-audio-element'),
    closePlayerBtn: document.getElementById('close-player-btn'),

    // Logs Console
    logHeader: document.getElementById('log-header'),
    logBody: document.getElementById('log-body'),
    logChevron: document.getElementById('log-chevron'),
    logConsole: document.getElementById('log-console'),
    logCountBadge: document.getElementById('log-count-badge'),
    btnClearLogs: document.getElementById('btn-clear-logs'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };

  let logCount = 0;

  // -------------------------------------------------------------
  // Toast Notifications
  // -------------------------------------------------------------
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // -------------------------------------------------------------
  // Logger
  // -------------------------------------------------------------
  function addLog(message, type = 'info', timestamp = null) {
    const time = timestamp || new Date().toLocaleTimeString('pt-BR');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${time}] ${message}`;
    el.logConsole.appendChild(entry);
    el.logBody.scrollTop = el.logBody.scrollHeight;
    
    logCount++;
    el.logCountBadge.textContent = logCount;
  }

  // -------------------------------------------------------------
  // Settings Accordion & Modal Toggles
  // -------------------------------------------------------------
  let isSettingsOpen = true;
  function toggleSettings(force) {
    isSettingsOpen = force !== undefined ? force : !isSettingsOpen;
    if (isSettingsOpen) {
      el.settingsContent.classList.remove('hidden');
      el.settingsChevron.classList.add('open');
    } else {
      el.settingsContent.classList.add('hidden');
      el.settingsChevron.classList.remove('open');
    }
  }

  el.settingsHeader.addEventListener('click', () => toggleSettings());
  el.toggleSettingsBtn.addEventListener('click', () => {
    toggleSettings(true);
    el.settingsCard.scrollIntoView({ behavior: 'smooth' });
  });

  // Help Modal
  function openHelp() { el.helpModal.classList.remove('hidden'); }
  function closeHelp() { el.helpModal.classList.add('hidden'); }
  el.helpBtn.addEventListener('click', openHelp);
  el.tokenHelpLink.addEventListener('click', (e) => { e.preventDefault(); openHelp(); });
  el.chatHelpLink.addEventListener('click', (e) => { e.preventDefault(); openHelp(); });
  el.closeModalBtn.addEventListener('click', closeHelp);
  el.modalOkBtn.addEventListener('click', closeHelp);
  el.helpModal.addEventListener('click', (e) => {
    if (e.target === el.helpModal) closeHelp();
  });

  // Password Visibility Toggle
  el.toggleTokenVisibility.addEventListener('click', () => {
    const isPassword = el.botTokenInput.type === 'password';
    el.botTokenInput.type = isPassword ? 'text' : 'password';
    el.eyeIcon.innerHTML = isPassword
      ? '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>'
      : '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
  });

  // Clear Logs
  el.btnClearLogs.addEventListener('click', (e) => {
    e.stopPropagation();
    el.logConsole.innerHTML = '';
    logCount = 0;
    el.logCountBadge.textContent = '0';
  });

  // Log Panel Collapsible
  let isLogOpen = true;
  el.logHeader.addEventListener('click', () => {
    isLogOpen = !isLogOpen;
    el.logBody.classList.toggle('hidden', !isLogOpen);
    el.logChevron.classList.toggle('open', isLogOpen);
  });

  // -------------------------------------------------------------
  // Title Treatment & Formatting
  // -------------------------------------------------------------
  function getDisplayTitle(file, format = null) {
    const fmt = format || state.config.titleFormat || 'number_dash_name';
    if (!file.isAudio || !file.metadata) {
      return file.cleanTitle || file.name.replace(/\.[a-zA-Z0-9]+$/, '');
    }

    const meta = file.metadata;
    switch (fmt) {
      case 'number_dash_name':
        return meta.numberDashName || meta.cleanTitle || file.name;
      case 'with_capitulo':
        return meta.withCapitulo || meta.cleanTitle || file.name;
      case 'name_only':
        return meta.nameOnly || meta.cleanTitle || file.name;
      case 'book_and_chapter':
        return meta.bookAndChapter || meta.cleanTitle || file.name;
      case 'name_and_book':
        return meta.nameAndBook || meta.nameOnly || meta.cleanTitle || file.name;
      case 'original':
        return file.name;
      default:
        return meta.cleanTitle || file.name;
    }
  }

  function applyTitleFormat(format) {
    state.config.titleFormat = format;
    if (el.titleFormatSelect) el.titleFormatSelect.value = format;
    if (el.quickTitleFormat) el.quickTitleFormat.value = format;

    state.files.forEach(file => {
      const input = document.getElementById(`title-input-${file.id}`);
      if (input) {
        input.value = getDisplayTitle(file, format);
      }
    });
  }

  if (el.titleFormatSelect) {
    el.titleFormatSelect.addEventListener('change', (e) => applyTitleFormat(e.target.value));
  }
  if (el.quickTitleFormat) {
    el.quickTitleFormat.addEventListener('change', (e) => applyTitleFormat(e.target.value));
  }

  // -------------------------------------------------------------
  // API Calls: Load Config
  // -------------------------------------------------------------
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      state.config = data;

      el.botTokenInput.value = data.botToken || '';
      el.chatIdInput.value = data.chatId || '';
      el.folderUrlInput.value = data.folderUrl || '';
      if (el.quickFolderUrl) el.quickFolderUrl.value = data.folderUrl || '';
      if (el.titleFormatSelect) el.titleFormatSelect.value = data.titleFormat || 'number_dash_name';
      if (el.quickTitleFormat) el.quickTitleFormat.value = data.titleFormat || 'number_dash_name';
      if (el.bookTitleInput) el.bookTitleInput.value = data.bookTitle || 'Filosofias da Afirmação e da Negação';
      el.performerInput.value = data.performer || 'Narrador do pica-pau';
      el.sendModeSelect.value = data.sendMode || 'audio';
      el.captionInput.value = data.captionTemplate || '🎧 <b>{title}</b>\n📖 <i>{book}</i>\n🎙️ <i>{performer}</i>';
      el.delayInput.value = data.delaySeconds || 2;
      if (el.maxRetriesInput) el.maxRetriesInput.value = data.maxRetries !== undefined ? data.maxRetries : 3;
      if (el.onErrorSelect) el.onErrorSelect.value = data.onErrorAction || 'pause';

      if (data.botToken) {
        testTelegramConnection(false); // silent test to update badge
      }
    } catch (err) {
      addLog(`Erro ao carregar configurações: ${err.message}`, 'error');
    }
  }

  // Save Config
  el.configForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const updated = {
      botToken: el.botTokenInput.value.trim(),
      chatId: el.chatIdInput.value.trim(),
      folderUrl: el.folderUrlInput.value.trim(),
      titleFormat: el.titleFormatSelect ? el.titleFormatSelect.value : 'number_dash_name',
      bookTitle: el.bookTitleInput ? el.bookTitleInput.value.trim() : 'Filosofias da Afirmação e da Negação',
      performer: el.performerInput.value.trim(),
      sendMode: el.sendModeSelect.value,
      captionTemplate: el.captionInput.value.trim(),
      delaySeconds: parseInt(el.delayInput.value, 10) || 2,
      maxRetries: parseInt(el.maxRetriesInput ? el.maxRetriesInput.value : 3, 10),
      onErrorAction: el.onErrorSelect ? el.onErrorSelect.value : 'pause'
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      const data = await res.json();
      if (data.success) {
        state.config = data.config;
        showToast('Configurações salvas com sucesso!', 'success');
        applyTitleFormat(updated.titleFormat);
        if (updated.botToken) {
          testTelegramConnection(false);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast(`Falha ao salvar: ${err.message}`, 'error');
    }
  });

  // Test Telegram Connection
  async function testTelegramConnection(sendTestMessage = true) {
    const botToken = el.botTokenInput.value.trim();
    const chatId = el.chatIdInput.value.trim();

    if (!botToken) {
      if (sendTestMessage) showToast('Insira o Bot Token antes de testar.', 'error');
      return;
    }

    el.testFeedback.className = 'test-feedback';
    el.testFeedback.textContent = 'Testando conexão...';
    el.testFeedback.classList.remove('hidden');
    el.btnTestTelegram.disabled = true;

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken, chatId: sendTestMessage ? chatId : null })
      });
      const data = await res.json();

      if (data.success) {
        el.botStatusPill.className = 'status-pill status-pill-connected';
        el.botStatusText.textContent = `@${data.bot.username} (Conectado)`;
        el.testFeedback.className = 'test-feedback success';
        el.testFeedback.innerHTML = `✅ Conectado ao @${data.bot.username}! ${data.messageSent ? 'Mensagem enviada no chat.' : ''}`;
        if (sendTestMessage) showToast(`Bot @${data.bot.username} pronto para envio!`, 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      el.botStatusPill.className = 'status-pill status-pill-idle';
      el.botStatusText.textContent = 'Erro de Conexão';
      el.testFeedback.className = 'test-feedback error';
      el.testFeedback.textContent = `❌ ${err.message}`;
      if (sendTestMessage) showToast(err.message, 'error');
    } finally {
      el.btnTestTelegram.disabled = false;
    }
  }

  el.btnTestTelegram.addEventListener('click', () => testTelegramConnection(true));

  // -------------------------------------------------------------
  // Scan Google Drive Folder
  // -------------------------------------------------------------
  async function scanDriveFolder(overrideUrl = null, overrideBook = null) {
    let folderUrl = overrideUrl;
    if (!folderUrl) {
      folderUrl = (el.quickFolderUrl && el.quickFolderUrl.value.trim()) || el.folderUrlInput.value.trim();
    }
    if (!folderUrl) {
      showToast('Informe a URL ou ID da pasta do Drive.', 'error');
      return;
    }

    if (el.folderUrlInput) el.folderUrlInput.value = folderUrl;
    if (el.quickFolderUrl) el.quickFolderUrl.value = folderUrl;

    // Update active preset pill
    if (el.presetPills) {
      el.presetPills.forEach(pill => {
        const pillUrl = pill.dataset.url;
        if (pillUrl === folderUrl || (pillUrl && folderUrl.includes(pillUrl.split('folders/')[1]?.split('?')[0]))) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });
    }

    el.filesLoading.classList.remove('hidden');
    el.filesEmpty.classList.add('hidden');
    el.filesList.innerHTML = '';
    el.btnScanDrive.disabled = true;
    if (el.btnQuickLoadFolder) el.btnQuickLoadFolder.disabled = true;

    try {
      const res = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderUrl })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido ao escanear pasta');
      }

      state.files = data.files || [];
      const cleanFolderTitle = data.folderTitle ? data.folderTitle.replace(/^[\d_]+/, '').replace(/_/g, ' ').trim() : 'Arquivos da Pasta';
      el.displayFolderTitle.textContent = cleanFolderTitle;

      // Auto update Book Title and Performer from new folder if available
      const firstAudio = state.files.find(f => f.isAudio && f.metadata);
      if (firstAudio) {
        const detectedBook = overrideBook || firstAudio.metadata.book || cleanFolderTitle;
        if (el.bookTitleInput) {
          el.bookTitleInput.value = detectedBook;
        }
        if (el.performerInput && firstAudio.metadata.narrator) {
          el.performerInput.value = firstAudio.metadata.narrator;
        }
      }

      // Auto-save current folder to config
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderUrl,
          bookTitle: el.bookTitleInput ? el.bookTitleInput.value : cleanFolderTitle,
          performer: el.performerInput ? el.performerInput.value : 'Narrador'
        })
      }).catch(() => {});

      renderFilesList();
      const audioCount = state.files.filter(f => f.isAudio).length;
      showToast(`${state.files.length} arquivos carregados (${audioCount} capítulos de áudio)!`, 'success');
    } catch (err) {
      showToast(`Falha ao escanear pasta: ${err.message}`, 'error');
      el.filesEmpty.classList.remove('hidden');
    } finally {
      el.filesLoading.classList.add('hidden');
      el.btnScanDrive.disabled = false;
      if (el.btnQuickLoadFolder) el.btnQuickLoadFolder.disabled = false;
    }
  }

  el.btnScanDrive.addEventListener('click', () => scanDriveFolder());
  if (el.btnQuickLoadFolder) {
    el.btnQuickLoadFolder.addEventListener('click', () => scanDriveFolder());
  }
  if (el.quickFolderUrl) {
    el.quickFolderUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        scanDriveFolder();
      }
    });
  }

  // Presets click listeners
  if (el.presetPills) {
    el.presetPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const url = pill.dataset.url;
        const book = pill.dataset.book;
        scanDriveFolder(url, book);
      });
    });
  }

  // -------------------------------------------------------------
  // Render Files List & Filtering
  // -------------------------------------------------------------
  function getFilteredFiles() {
    const query = el.fileSearchInput.value.toLowerCase().trim();
    const audioOnly = el.filterAudioOnly.checked;

    return state.files.filter(f => {
      if (audioOnly && !f.isAudio) return false;
      if (query && !f.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function renderFilesList() {
    const filtered = getFilteredFiles();
    el.filesList.innerHTML = '';

    const totalAudios = state.files.filter(f => f.isAudio).length;
    el.displayFolderStats.textContent = `Total: ${state.files.length} arquivos • ${totalAudios} capítulos de áudio detectados`;

    if (filtered.length === 0) {
      el.filesEmpty.classList.remove('hidden');
      updateSelectionButtons();
      return;
    }
    el.filesEmpty.classList.add('hidden');

    filtered.forEach((file, index) => {
      const isChecked = state.selectedIds.has(file.id);
      const row = document.createElement('div');
      row.className = 'file-row';
      row.id = `file-row-${file.id}`;

      // Status info
      const statusObj = state.fileStatuses.get(file.id) || { status: 'idle', text: 'Não enviado' };

      let statusBadgeClass = 'idle';
      let statusText = statusObj.text;
      if (statusObj.status === 'downloading') {
        statusBadgeClass = 'downloading';
        statusText = statusObj.text || 'Baixando...';
      } else if (statusObj.status === 'uploading') {
        statusBadgeClass = 'uploading';
        statusText = 'Enviando ao Telegram...';
      } else if (statusObj.status === 'success') {
        statusBadgeClass = 'success';
        statusText = 'Enviado ✅';
      } else if (statusObj.status === 'error') {
        statusBadgeClass = 'error';
        statusText = statusObj.text || 'Erro';
      }

      // Format file extension badge
      const ext = file.name.split('.').pop().toUpperCase();
      const titleVal = getDisplayTitle(file);

      row.innerHTML = `
        <div class="file-left">
          <input type="checkbox" class="custom-checkbox file-checkbox" data-id="${file.id}" ${isChecked ? 'checked' : ''}>
          <span class="file-number">${String(index + 1).padStart(2, '0')}</span>
          <div class="file-icon ${file.isAudio ? '' : 'doc'}">
            ${file.isAudio 
              ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
              : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
            }
          </div>
          <div class="file-details">
            <input type="text" class="file-name-input" id="title-input-${file.id}" value="${titleVal}" title="Clique para editar o título antes de enviar">
            <div class="file-meta-row">
              <span class="file-tag">${ext}</span>
              ${file.size ? `<span class="text-xs text-muted">${(file.size / (1024 * 1024)).toFixed(1)} MB</span>` : ''}
              <span id="progress-text-${file.id}" class="text-xs text-muted"></span>
            </div>
          </div>
        </div>

        <div class="file-right">
          ${file.isAudio ? `
            <button class="btn-play-preview" data-id="${file.id}" data-name="${file.name}" title="Ouvir prévia no navegador">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          ` : ''}

          <div id="badge-${file.id}" class="status-badge ${statusBadgeClass}">
            ${statusText}
          </div>

          <button class="btn btn-secondary btn-sm btn-send-single" data-id="${file.id}" data-name="${file.name}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            <span>Enviar</span>
          </button>
        </div>
      `;

      el.filesList.appendChild(row);
    });

    attachFileEvents();
    updateSelectionButtons();
  }

  function attachFileEvents() {
    // Checkboxes
    document.querySelectorAll('.file-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          state.selectedIds.add(id);
        } else {
          state.selectedIds.delete(id);
        }
        updateSelectionButtons();
      });
    });

    // Play preview
    document.querySelectorAll('.btn-play-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileId = btn.dataset.id;
        const fileName = btn.dataset.name;
        playAudioPreview(fileId, fileName, btn);
      });
    });

    // Send single file
    document.querySelectorAll('.btn-send-single').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileId = btn.dataset.id;
        const fileName = btn.dataset.name;
        const customTitleInput = document.getElementById(`title-input-${fileId}`);
        const customTitle = customTitleInput ? customTitleInput.value : fileName;
        sendSingleFile(fileId, fileName, customTitle, btn);
      });
    });
  }

  // -------------------------------------------------------------
  // Audio Player Preview
  // -------------------------------------------------------------
  function playAudioPreview(fileId, fileName, btn) {
    if (state.playingFileId === fileId && !el.globalAudio.paused) {
      el.globalAudio.pause();
      btn.classList.remove('playing');
      state.playingFileId = null;
      return;
    }

    document.querySelectorAll('.btn-play-preview').forEach(b => b.classList.remove('playing'));
    btn.classList.add('playing');

    state.playingFileId = fileId;
    el.playerTrackName.textContent = fileName;
    el.playerBar.classList.remove('hidden');

    el.globalAudio.src = `/api/audio/stream?id=${fileId}`;
    el.globalAudio.play().catch(e => {
      showToast('Erro ao reproduzir áudio: ' + e.message, 'error');
    });

    el.globalAudio.onended = () => {
      btn.classList.remove('playing');
      state.playingFileId = null;
    };
  }

  el.closePlayerBtn.addEventListener('click', () => {
    el.globalAudio.pause();
    el.globalAudio.src = '';
    el.playerBar.classList.add('hidden');
    document.querySelectorAll('.btn-play-preview').forEach(b => b.classList.remove('playing'));
    state.playingFileId = null;
  });

  // -------------------------------------------------------------
  // Selection Logic
  // -------------------------------------------------------------
  function updateSelectionButtons() {
    const count = state.selectedIds.size;
    el.btnSendSelectedText.textContent = `Enviar Selecionados (${count})`;
    el.btnSendSelected.disabled = count === 0 || state.batch.isRunning;
  }

  el.btnSelectAll.addEventListener('click', () => {
    const filtered = getFilteredFiles();
    filtered.forEach(f => state.selectedIds.add(f.id));
    renderFilesList();
  });

  el.btnDeselectAll.addEventListener('click', () => {
    state.selectedIds.clear();
    renderFilesList();
  });

  el.filterAudioOnly.addEventListener('change', renderFilesList);
  el.fileSearchInput.addEventListener('input', renderFilesList);

  // -------------------------------------------------------------
  // Send Single File  (passes config inline — no server session)
  // -------------------------------------------------------------
  async function sendSingleFile(fileId, fileName, customTitle, btn) {
    if (!state.config.botToken || !state.config.chatId) {
      showToast('Configure o Bot Token e o Chat ID antes de enviar!', 'error');
      toggleSettings(true);
      return;
    }

    btn.disabled = true;
    updateFileStatus(fileId, 'downloading', 'Enviando...');

    try {
      const res = await fetch('/api/telegram/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, fileName, customTitle, config: state.config })
      });
      const data = await res.json();

      if (data.success) {
        updateFileStatus(fileId, 'success', 'Enviado ✅');
        showToast(`"${customTitle || fileName}" enviado com sucesso!`, 'success');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      updateFileStatus(fileId, 'error', 'Erro no envio');
      showToast(`Erro ao enviar: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // -------------------------------------------------------------
  // Batch Queue  (runs entirely in the browser — no server state)
  // -------------------------------------------------------------
  let batchCancelRequested = false;
  let batchPauseAction = null; // Promise resolver when paused

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function runBrowserBatch(items) {
    const config = state.config;
    const maxRetries = parseInt(config.maxRetries || 3, 10);
    const onErrorAction = config.onErrorAction || 'pause';
    const delayMs = Math.max(1000, (parseInt(config.delaySeconds || 3, 10)) * 1000);

    state.batch.isRunning = true;
    state.batch.total = items.length;
    state.batch.completed = 0;
    state.batch.failedItems = [];
    batchCancelRequested = false;

    el.batchCard.classList.remove('hidden');
    if (el.batchTitle) el.batchTitle.textContent = '⏳ Enviando em lote...';
    if (el.batchPauseAlert) el.batchPauseAlert.classList.add('hidden');
    el.batchCard.scrollIntoView({ behavior: 'smooth' });
    updateBatchUI(0, items.length, 'Iniciando...');
    updateSelectionButtons();
    addLog(`Iniciando lote de ${items.length} arquivo(s). Tentativas: ${maxRetries}, Ação em erro: ${onErrorAction}`, 'info');

    for (let i = 0; i < items.length; i++) {
      if (batchCancelRequested) {
        addLog('Envio em lote cancelado pelo usuário.', 'warn');
        showToast(`Lote cancelado após o item ${i}.`, 'info');
        break;
      }

      const item = items[i];
      let success = false;
      let lastError = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (batchCancelRequested) break;

        const attemptText = maxRetries > 1 ? ` (Tentativa ${attempt}/${maxRetries})` : '';
        updateFileStatus(item.id, 'downloading', `Enviando${attemptText}...`);
        updateBatchUI(state.batch.completed, items.length,
          `[${i + 1}/${items.length}] ${item.customTitle || item.name}${attemptText}`);
        addLog(`[${item.name}] Tentativa ${attempt}/${maxRetries}...`, 'info');

        try {
          const res = await fetch('/api/telegram/send-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId: item.id,
              fileName: item.name,
              customTitle: item.customTitle,
              config: state.config
            })
          });
          const data = await res.json();

          // Rate limit: wait and retry without consuming attempt
          if (res.status === 429 && data.retryAfter) {
            const waitSec = (data.retryAfter || 5) + 1;
            addLog(`Rate limit do Telegram! Aguardando ${waitSec}s...`, 'warn');
            updateBatchUI(state.batch.completed, items.length,
              `⏳ Rate limit! Aguardando ${waitSec}s...`);
            await sleep(waitSec * 1000);
            attempt--;
            continue;
          }

          if (!data.success) throw new Error(data.error);

          updateFileStatus(item.id, 'success', 'Enviado ✅');
          state.batch.completed++;
          updateBatchUI(state.batch.completed, items.length, `✅ Enviado: ${item.customTitle || item.name}`);
          addLog(`[${item.name}] ✅ Enviado com sucesso!`, 'success');
          success = true;
          break;

        } catch (err) {
          lastError = err;
          addLog(`[${item.name}] ⚠️ Tentativa ${attempt}/${maxRetries} falhou: ${err.message}`, 'warn');

          if (attempt < maxRetries && !batchCancelRequested) {
            const backoffSec = attempt * 3;
            addLog(`Aguardando ${backoffSec}s antes da próxima tentativa...`, 'info');
            updateBatchUI(state.batch.completed, items.length,
              `⏳ Aguardando ${backoffSec}s antes de nova tentativa...`);
            await sleep(backoffSec * 1000);
          }
        }
      }

      if (!success && !batchCancelRequested) {
        updateFileStatus(item.id, 'error', 'Falhou');
        state.batch.failedItems.push(item);
        addLog(`[${item.name}] ❌ Todas as ${maxRetries} tentativas falharam: ${lastError?.message}`, 'error');

        if (onErrorAction === 'pause') {
          // Show pause alert and wait for user action
          if (el.batchTitle) el.batchTitle.textContent = '⚠️ Fila Pausada — Aguardando Decisão';
          if (el.batchPauseAlert) el.batchPauseAlert.classList.remove('hidden');
          if (el.pauseAlertMessage) {
            el.pauseAlertMessage.textContent = `"${item.customTitle || item.name}" falhou: ${lastError?.message}. O que deseja fazer?`;
          }
          addLog(`Fila pausada. Aguardando decisão do usuário...`, 'warn');

          const userAction = await new Promise(resolve => {
            batchPauseAction = resolve;
          });
          batchPauseAction = null;
          if (el.batchPauseAlert) el.batchPauseAlert.classList.add('hidden');
          if (el.batchTitle) el.batchTitle.textContent = '⏳ Enviando em lote...';

          if (userAction === 'retry') {
            addLog(`Retentando "${item.name}" por solicitação do usuário...`, 'info');
            state.batch.failedItems.pop(); // remove from failed since we retry
            i--; // repeat this item
            continue;
          } else if (userAction === 'skip') {
            addLog(`"${item.name}" pulado pelo usuário.`, 'info');
            showToast('Arquivo pulado, continuando...', 'info');
          } else if (userAction === 'cancel') {
            addLog('Fila cancelada pelo usuário.', 'warn');
            showToast('Fila cancelada.', 'info');
            batchCancelRequested = true;
            break;
          }

        } else if (onErrorAction === 'stop') {
          addLog(`Fila interrompida por erro em "${item.name}".`, 'error');
          showToast(`Fila parada por erro: ${lastError?.message}`, 'error');
          break;
        }
        // 'continue': just goes to next
      }

      // Delay between files
      if (i < items.length - 1 && !batchCancelRequested) {
        await sleep(delayMs);
      }
    }

    // Finished
    state.batch.isRunning = false;
    batchCancelRequested = false;
    const failedCount = state.batch.failedItems.length;

    if (failedCount > 0) {
      updateBatchUI(state.batch.total - failedCount, state.batch.total, `Lote finalizado com ${failedCount} falha(s).`);
      if (el.btnRetryFailed) el.btnRetryFailed.classList.remove('hidden');
      if (el.btnRetryFailedText) el.btnRetryFailedText.textContent = `Reenviar Falhas (${failedCount})`;
      showToast(`Lote finalizado com ${failedCount} falha(s).`, 'warn', 7000);
      addLog(`Lote finalizado. Falhas: ${failedCount}`, 'warn');
    } else {
      updateBatchUI(state.batch.total, state.batch.total, '✅ Todos enviados com sucesso!');
      showToast('Envio em lote concluído com sucesso!', 'success');
      addLog('Lote finalizado sem falhas!', 'success');
      setTimeout(() => el.batchCard.classList.add('hidden'), 5000);
    }
    updateSelectionButtons();
  }

  el.btnSendSelected.addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;

    if (!state.config.botToken || !state.config.chatId) {
      showToast('Configure o Bot Token e o Chat ID antes de enviar!', 'error');
      toggleSettings(true);
      return;
    }

    const itemsToSend = [];
    state.selectedIds.forEach(id => {
      const file = state.files.find(f => f.id === id);
      if (file) {
        const titleInput = document.getElementById(`title-input-${file.id}`);
        itemsToSend.push({
          id: file.id,
          name: file.name,
          customTitle: titleInput ? titleInput.value : file.name
        });
      }
    });

    if (itemsToSend.length === 0) return;
    runBrowserBatch(itemsToSend);
  });

  // Cancel Batch
  el.btnCancelBatch.addEventListener('click', () => {
    batchCancelRequested = true;
    if (batchPauseAction) batchPauseAction('cancel');
    showToast('Cancelamento solicitado...', 'info');
  });

  function updateBatchUI(completed, total, currentText) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    el.batchProgressCount.textContent = `${completed} de ${total} concluídos`;
    el.batchProgressPercent.textContent = `${percent}%`;
    el.batchProgressFill.style.width = `${percent}%`;
    if (currentText) el.batchCurrentText.textContent = currentText;
  }

  function updateFileStatus(fileId, status, text, progressPercent = null) {
    state.fileStatuses.set(fileId, { status, text, progress: progressPercent });

    const badge = document.getElementById(`badge-${fileId}`);
    if (badge) {
      badge.className = `status-badge ${status}`;
      badge.textContent = text;
    }

    const progEl = document.getElementById(`progress-text-${fileId}`);
    if (progEl) {
      progEl.textContent = progressPercent !== null ? `(${progressPercent}%)` : '';
    }
  }

  // -------------------------------------------------------------
  // Pause Queue Action Buttons
  // -------------------------------------------------------------
  if (el.btnQueueRetry) {
    el.btnQueueRetry.addEventListener('click', () => {
      if (batchPauseAction) batchPauseAction('retry');
    });
  }
  if (el.btnQueueSkip) {
    el.btnQueueSkip.addEventListener('click', () => {
      if (batchPauseAction) batchPauseAction('skip');
    });
  }
  if (el.btnQueueCancel) {
    el.btnQueueCancel.addEventListener('click', () => {
      if (batchPauseAction) batchPauseAction('cancel');
    });
  }

  // "Reenviar Falhas" button
  if (el.btnRetryFailed) {
    el.btnRetryFailed.addEventListener('click', () => {
      if (!state.batch.failedItems || state.batch.failedItems.length === 0) return;
      el.btnRetryFailed.classList.add('hidden');
      const itemsToRetry = [...state.batch.failedItems];
      runBrowserBatch(itemsToRetry);
    });
  }

  // -------------------------------------------------------------
  // Initial Boot  (no SSE needed in serverless mode)
  // -------------------------------------------------------------
  async function init() {
    await loadConfig();
    await scanDriveFolder();
  }

  init();
});

