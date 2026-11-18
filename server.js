const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TEMP_DIR = path.join(__dirname, 'temp');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Load or initialize config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Erro ao ler config.json:', err.message);
  }
  return {
    botToken: '8972120301:AAEzDggS8VGeqmq5_zB1Xa6-HwRS_n_ggp4',
    chatId: '-5574691115',
    folderUrl: 'https://drive.google.com/drive/folders/1y1VfI8OhAn_Uh44ogwDdYEBkCzCHnp07?usp=sharing',
    folderId: '1y1VfI8OhAn_Uh44ogwDdYEBkCzCHnp07',
    googleApiKey: '',
    performer: 'Narrador do pica-pau',
    bookTitle: 'Filosofias da Afirmação e da Negação',
    sendMode: 'audio',
    captionTemplate: '🎧 <b>{title}</b>\n📖 <i>{book}</i>\n🎙️ <i>{performer}</i>',
    delaySeconds: 3,
    maxRetries: 3,
    onErrorAction: 'pause',
    cleanTitles: true,
    titleFormat: 'number_dash_name'
  };
}

function saveConfig(newConfig) {
  const current = loadConfig();
  const merged = { ...current, ...newConfig };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// Global SSE clients list
const sseClients = new Set();

function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

function broadcastLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  broadcastEvent('log', { timestamp, message, type });
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
}

// Batch Queue Manager
const batchQueue = {
  isRunning: false,
  isPaused: false,
  items: [],
  currentIndex: -1,
  shouldCancel: false,
  pauseResolve: null,
  failedItems: [],
  currentStatus: null
};

// Utility: extract Google Drive Folder ID
function extractFolderId(input) {
  if (!input) return null;
  input = input.trim();
  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  return null;
}

// Utility: Check if filename or mime is audio
function isAudioFile(name = '', mime = '') {
  const audioExtensions = ['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.flac', '.opus', '.wma'];
  const ext = path.extname(name).toLowerCase();
  if (audioExtensions.includes(ext)) return true;
  if (mime && mime.toLowerCase().startsWith('audio/')) return true;
  return false;
}

function guessMimeType(fileName = '') {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.m4a': return 'audio/mp4';
    case '.ogg': return 'audio/ogg';
    case '.wav': return 'audio/wav';
    case '.flac': return 'audio/flac';
    case '.aac': return 'audio/aac';
    case '.opus': return 'audio/opus';
    case '.json': return 'application/json';
    case '.txt': return 'text/plain';
    case '.pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// Utility: Intelligent Audio Title & Metadata Parser
function parseAudioMetadata(rawName = '', folderTitle = '') {
  const noExt = rawName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  const parts = noExt.split(/\s+-\s+/);

  let book = '';
  let chapter = '';
  let narrator = '';

  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    narrator = lastPart.replace(/^[\d.]+\s*/, '').trim();
    chapter = parts[parts.length - 2].trim();
    book = parts.slice(0, parts.length - 2).join(' - ').replace(/^[\d_]+/, '').replace(/_/g, ' ').trim();
  } else if (parts.length === 2) {
    if (/narrador|jack|voz/i.test(parts[1]) || /^[\d.]+\s*[A-Za-z]/.test(parts[1])) {
      chapter = parts[0].replace(/^[\d_]+/, '').replace(/_/g, ' ').trim();
      narrator = parts[1].replace(/^[\d.]+\s*/, '').trim();
    } else {
      book = parts[0].replace(/^[\d_]+/, '').replace(/_/g, ' ').trim();
      chapter = parts[1].trim();
    }
  } else {
    chapter = noExt;
  }

  // Use clean folder title if available and book not extracted
  if (folderTitle && (!book || book.length < 3)) {
    const cleanFolder = folderTitle.replace(/^[\d_]+/, '').replace(/_/g, ' ').trim();
    if (cleanFolder) book = cleanFolder;
  }

  // Clean underscore artifacts in chapter (e.g. "O Judeu_ Caráter" -> "O Judeu: Caráter", "ficção_" -> "ficção?")
  chapter = chapter
    .replace(/_(\s+)/g, ':$1')
    .replace(/_$/g, '?')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Format styles
  const numberDashName = chapter.replace(/^(\d+)\s+([A-Za-zÀ-ÿ])/, '$1 - $2');
  const withCapitulo = numberDashName.replace(/^(\d+)\s*-\s*/, 'Capítulo $1 - ');
  const nameOnly = chapter.replace(/^\d+[\s.-]+/, '').trim();
  const bookAndChapter = book ? `${book} - ${numberDashName}` : numberDashName;
  const nameAndBook = book ? `${nameOnly} - ${book}` : nameOnly;

  return {
    raw: rawName,
    book: book || folderTitle || 'Audiolivro',
    chapter: numberDashName,
    numberDashName,
    withCapitulo,
    nameOnly,
    bookAndChapter,
    nameAndBook,
    narrator: narrator || 'Narrador',
    cleanTitle: numberDashName
  };
}

// Scan Google Drive Folder
async function scanGoogleDrive(folderInput, apiKey = '') {
  const folderId = extractFolderId(folderInput);
  if (!folderId) {
    throw new Error('ID ou URL da pasta do Google Drive inválido.');
  }

  broadcastLog(`Escaneando pasta do Google Drive: ${folderId}...`, 'info');

  // Strategy A: If Google API Key provided
  if (apiKey) {
    try {
      broadcastLog('Tentando consultar arquivos via Google Drive API v3...', 'info');
      const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,webContentLink)&pageSize=1000&key=${apiKey}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          const files = data.files.map(f => {
            const isAudio = isAudioFile(f.name, f.mimeType);
            const meta = isAudio ? parseAudioMetadata(f.name) : null;
            return {
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size ? parseInt(f.size, 10) : null,
              isAudio,
              cleanTitle: meta ? meta.cleanTitle : f.name,
              metadata: meta
            };
          });
          files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          broadcastLog(`Google Drive API retornou ${files.length} arquivos.`, 'success');
          return { success: true, folderId, files, source: 'api' };
        }
      }
    } catch (e) {
      broadcastLog(`Google Drive API falhou (${e.message}), tentando modo público incorporado...`, 'warn');
    }
  }

  // Strategy B: Embedded HTML folderview
  const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    throw new Error(`Google Drive retornou status HTTP ${res.status}. Certifique-se de que a pasta está configurada como 'Qualquer pessoa com o link pode visualizar'.`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const folderTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';

  const entryRegex = /<div class=\"flip-entry\" id=\"entry-([a-zA-Z0-9_-]+)\"[\s\S]*?<div class=\"flip-entry-title\">([^<]+)<\/div>/g;
  let match;
  const foundMap = new Map();

  while ((match = entryRegex.exec(html)) !== null) {
    const fileId = match[1];
    const fileName = decodeHtmlEntities(match[2].trim());
    if (!foundMap.has(fileId)) {
      foundMap.set(fileId, {
        id: fileId,
        name: fileName,
        mimeType: guessMimeType(fileName),
        size: null,
        isAudio: isAudioFile(fileName)
      });
    }
  }

  // Fallback: search for direct /file/d/ links
  if (foundMap.size === 0) {
    const fallbackRegex = /\/file\/d\/([a-zA-Z0-9_-]+)[^>]*>([^<]+)<\/a>/g;
    while ((match = fallbackRegex.exec(html)) !== null) {
      const fileId = match[1];
      const fileName = decodeHtmlEntities(match[2].trim());
      if (!foundMap.has(fileId)) {
        foundMap.set(fileId, {
          id: fileId,
          name: fileName,
          mimeType: guessMimeType(fileName),
          size: null,
          isAudio: isAudioFile(fileName)
        });
      }
    }
  }

  const files = Array.from(foundMap.values()).map(file => {
    if (file.isAudio) {
      const meta = parseAudioMetadata(file.name, folderTitle);
      return {
        ...file,
        cleanTitle: meta.cleanTitle,
        metadata: meta
      };
    }
    return file;
  });
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const audioCount = files.filter(f => f.isAudio).length;
  broadcastLog(`Varredura concluída! ${files.length} arquivos encontrados (${audioCount} áudios) na pasta "${folderTitle || folderId}".`, 'success');

  return {
    success: true,
    folderId,
    folderTitle,
    files,
    source: 'embedded'
  };
}

// Download file from Google Drive with progress
async function downloadDriveFile(fileId, destPath, onProgress) {
  const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  };

  let res = await fetch(downloadUrl, { headers, redirect: 'follow' });

  // Handle HTML warning or redirect fallback
  let contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('text/html')) {
    const ucUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    res = await fetch(ucUrl, { headers, redirect: 'follow' });
    contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const htmlText = await res.text();
      const tokenMatch = htmlText.match(/confirm=([0-9a-zA-Z_]+)/) || htmlText.match(/name="confirm"\s+value="([^"]+)"/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        res = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}&confirm=${token}`, { headers, redirect: 'follow' });
      }
    }
  }

  if (!res.ok) {
    throw new Error(`Google Drive retornou HTTP ${res.status} ao baixar o arquivo.`);
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  const fileStream = fs.createWriteStream(destPath);
  let downloadedBytes = 0;

  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloadedBytes += value.length;
      if (onProgress && contentLength > 0) {
        onProgress({
          downloaded: downloadedBytes,
          total: contentLength,
          percent: Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
        });
      }
    }
    await new Promise(resolve => fileStream.end(resolve));
  } else {
    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    fs.writeFileSync(destPath, buf);
    downloadedBytes = buf.length;
    if (onProgress) {
      onProgress({ downloaded: downloadedBytes, total: downloadedBytes, percent: 100 });
    }
  }

  return {
    path: destPath,
    size: downloadedBytes
  };
}

// Send Audio to Telegram
async function sendToTelegram({ botToken, chatId, filePath, fileName, title, performer, caption, mode = 'audio' }) {
  if (!botToken || !chatId) {
    throw new Error('Bot Token ou Chat ID do Telegram não configurados.');
  }

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  const MAX_BOT_API_SIZE = 50 * 1024 * 1024; // 50MB
  if (fileSize > MAX_BOT_API_SIZE) {
    throw new Error(`Arquivo tem ${sizeMB} MB. O limite máximo da API do Telegram Bot é 50 MB.`);
  }

  const endpoint = mode === 'document' ? 'sendDocument' : 'sendAudio';
  const telegramUrl = `https://api.telegram.org/bot${botToken}/${endpoint}`;

  const fileBuffer = fs.readFileSync(filePath);
  const mimeType = guessMimeType(fileName);
  const blob = new Blob([fileBuffer], { type: mimeType });

  const formData = new FormData();
  formData.append('chat_id', chatId);

  if (mode === 'document') {
    formData.append('document', blob, fileName);
  } else {
    formData.append('audio', blob, fileName);
    if (title) formData.append('title', title);
    if (performer) formData.append('performer', performer);
  }

  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
  }

  const res = await fetch(telegramUrl, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.description || 'Erro na API do Telegram');
    err.errorCode = data.error_code;
    if (data.parameters && data.parameters.retry_after) {
      err.retryAfter = data.parameters.retry_after;
      err.isRateLimit = true;
    }
    throw err;
  }

  return data.result;
}

// Process single file end-to-end
async function processAndSendFile({ fileId, fileName, customTitle, config, onProgress }) {
  const tempPath = path.join(TEMP_DIR, `${fileId}_${path.basename(fileName)}`);

  try {
    // 1. Download
    if (onProgress) onProgress({ stage: 'downloading', percent: 0, text: 'Iniciando download do Google Drive...' });
    broadcastLog(`[${fileName}] Baixando do Google Drive...`, 'info');

    const downloadResult = await downloadDriveFile(fileId, tempPath, (p) => {
      if (onProgress) {
        onProgress({
          stage: 'downloading',
          percent: p.percent,
          downloaded: p.downloaded,
          total: p.total,
          text: `Baixando do Drive: ${p.percent}% (${(p.downloaded / (1024 * 1024)).toFixed(1)} MB)`
        });
      }
    });

    const sizeMB = (downloadResult.size / (1024 * 1024)).toFixed(1);
    broadcastLog(`[${fileName}] Download concluído (${sizeMB} MB). Preparando envio ao Telegram...`, 'info');

    // 2. Prepare title, performer & caption
    const meta = parseAudioMetadata(fileName, config.bookTitle || '');
    const cleanTitle = customTitle || meta.cleanTitle || path.basename(fileName, path.extname(fileName));
    const performer = config.performer || meta.narrator || 'Audiolivro';
    const book = config.bookTitle || meta.book || 'Audiolivro';

    let caption = config.captionTemplate || '🎧 <b>{title}</b>\n📖 <i>{book}</i>\n🎙️ <i>{performer}</i>';
    caption = caption
      .replace(/{title}/g, cleanTitle)
      .replace(/{book}/g, book)
      .replace(/{performer}/g, performer)
      .replace(/{narrator}/g, performer)
      .replace(/{filename}/g, fileName);

    // 3. Send
    if (onProgress) onProgress({ stage: 'uploading', percent: 100, text: 'Enviando ao Telegram...' });
    broadcastLog(`[${cleanTitle}] Enviando para o Telegram com performer "${performer}"...`, 'info');

    const telegramResult = await sendToTelegram({
      botToken: config.botToken,
      chatId: config.chatId,
      filePath: tempPath,
      fileName,
      title: cleanTitle,
      performer: performer,
      caption,
      mode: config.sendMode || 'audio'
    });

    broadcastLog(`[${fileName}] ✅ Enviado com sucesso ao Telegram! (Mensagem ID: ${telegramResult.message_id})`, 'success');
    if (onProgress) onProgress({ stage: 'completed', percent: 100, text: 'Enviado com sucesso!' });

    return { success: true, messageId: telegramResult.message_id, size: downloadResult.size };
  } finally {
    // Clean up temporary file
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (e) {
      console.error('Falha ao remover arquivo temporário:', e.message);
    }
  }
}

// Execute batch queue with retries & pause on failure
async function runBatchQueue() {
  if (batchQueue.isRunning) return;
  batchQueue.isRunning = true;
  batchQueue.isPaused = false;
  batchQueue.shouldCancel = false;
  batchQueue.failedItems = [];

  const config = loadConfig();
  const delayMs = Math.max(1000, (config.delaySeconds || 3) * 1000);
  const maxRetries = Math.max(1, parseInt(config.maxRetries || 3, 10));
  const onErrorAction = config.onErrorAction || 'pause'; // 'pause' | 'stop' | 'continue'

  broadcastLog(`Iniciando envio em lote de ${batchQueue.items.length} itens (Tentativas por item: ${maxRetries}, Ação em falha: ${onErrorAction})...`, 'info');
  broadcastEvent('batch_started', { total: batchQueue.items.length, maxRetries, onErrorAction });

  for (let i = 0; i < batchQueue.items.length; i++) {
    if (batchQueue.shouldCancel) {
      broadcastLog('Envio em lote cancelado pelo usuário.', 'warn');
      broadcastEvent('batch_cancelled', { index: i, total: batchQueue.items.length });
      break;
    }

    batchQueue.currentIndex = i;
    const item = batchQueue.items[i];
    let success = false;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (batchQueue.shouldCancel) break;

      broadcastEvent('item_start', {
        index: i,
        fileId: item.id,
        fileName: item.name,
        attempt,
        maxRetries
      });

      try {
        await processAndSendFile({
          fileId: item.id,
          fileName: item.name,
          customTitle: item.customTitle,
          config,
          onProgress: (p) => {
            broadcastEvent('item_progress', { index: i, fileId: item.id, ...p, attempt, maxRetries });
          }
        });

        broadcastEvent('item_success', { index: i, fileId: item.id, fileName: item.name });
        success = true;
        break; // Successfully sent!
      } catch (err) {
        lastError = err;

        // Special handling for Telegram 429 Rate Limit
        if (err.isRateLimit || err.retryAfter) {
          const waitSec = (err.retryAfter || 5) + 1;
          broadcastLog(`[${item.name}] ⏳ Rate limit do Telegram detectado! Aguardando ${waitSec}s para tentar novamente...`, 'warn');
          broadcastEvent('item_rate_limit', { index: i, fileId: item.id, waitSeconds: waitSec });
          await new Promise(r => setTimeout(r, waitSec * 1000));
          // Don't consume a retry attempt for rate limits
          attempt--;
          continue;
        }

        broadcastLog(`[${item.name}] ⚠️ Tentativa ${attempt}/${maxRetries} falhou: ${err.message}`, 'warn');

        if (attempt < maxRetries && !batchQueue.shouldCancel) {
          const backoffSec = attempt * 3;
          broadcastLog(`Aguardando ${backoffSec}s antes da tentativa ${attempt + 1}...`, 'info');
          await new Promise(r => setTimeout(r, backoffSec * 1000));
        }
      }
    }

    if (!success && !batchQueue.shouldCancel) {
      batchQueue.failedItems.push(item);
      broadcastLog(`[${item.name}] ❌ Todas as ${maxRetries} tentativas falharam: ${lastError?.message}`, 'error');
      broadcastEvent('item_error', { index: i, fileId: item.id, fileName: item.name, error: lastError?.message });

      if (onErrorAction === 'pause') {
        batchQueue.isPaused = true;
        broadcastLog(`[FILA PAUSADA] O arquivo "${item.name}" falhou após ${maxRetries} tentativas. A fila foi pausada. Escolha no painel: Tentar Novamente, Pular ou Cancelar.`, 'warn');
        broadcastEvent('batch_paused', {
          index: i,
          fileId: item.id,
          fileName: item.name,
          error: lastError?.message
        });

        // Wait for user action from API
        const userChoice = await new Promise(resolve => {
          batchQueue.pauseResolve = resolve;
        });

        batchQueue.isPaused = false;
        batchQueue.pauseResolve = null;

        if (userChoice && userChoice.action === 'retry') {
          broadcastLog(`[${item.name}] 🔄 Retentando envio deste arquivo por solicitação do usuário...`, 'info');
          // Remove from failedItems since we are retrying
          batchQueue.failedItems.pop();
          i--; // Decrement index so the for loop repeats this exact item!
          continue;
        } else if (userChoice && userChoice.action === 'skip') {
          broadcastLog(`[${item.name}] ⏭️ Arquivo pulado por solicitação do usuário. Continuando fila...`, 'info');
        } else if ((userChoice && userChoice.action === 'cancel') || batchQueue.shouldCancel) {
          broadcastLog('Envio em lote cancelado pelo usuário.', 'warn');
          broadcastEvent('batch_cancelled', { index: i, total: batchQueue.items.length });
          break;
        }
      } else if (onErrorAction === 'stop') {
        broadcastLog(`[FILA PARADA] Envio em lote interrompido devido a erro em "${item.name}".`, 'error');
        broadcastEvent('batch_stopped_on_error', { index: i, fileId: item.id, error: lastError?.message });
        break;
      }
      // If onErrorAction === 'continue', proceeds to next
    }

    // Wait delay between uploads to avoid Telegram rate limits
    if (i < batchQueue.items.length - 1 && !batchQueue.shouldCancel) {
      broadcastLog(`Aguardando ${config.delaySeconds || 3}s antes do próximo envio para respeitar a API do Telegram...`, 'info');
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  batchQueue.isRunning = false;
  batchQueue.isPaused = false;
  batchQueue.currentIndex = -1;
  broadcastLog(`Envio em lote finalizado. Total de falhas: ${batchQueue.failedItems.length}`, batchQueue.failedItems.length > 0 ? 'warn' : 'success');
  broadcastEvent('batch_finished', { failedCount: batchQueue.failedItems.length, failedItems: batchQueue.failedItems });
}

// Request Body Parser Helper
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

// Serve Static Files
function serveStaticFile(req, res, filePath, contentType) {
  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'public, max-age=3600'
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      }
    }
  });
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE Stream
  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // API: Get Config
  if (pathname === '/api/config' && method === 'GET') {
    const config = loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(config));
    return;
  }

  // API: Save Config
  if (pathname === '/api/config' && method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const saved = saveConfig(data);
      broadcastLog('Configurações salvas com sucesso.', 'info');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, config: saved }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // API: Test Telegram Bot & Chat
  if (pathname === '/api/telegram/test' && method === 'POST') {
    try {
      const { botToken, chatId } = await parseJsonBody(req);
      if (!botToken) {
        throw new Error('Informe o Bot Token do Telegram para testar.');
      }

      broadcastLog('Testando conexão com o Telegram Bot...', 'info');
      // 1. Check Bot validity
      const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const getMeData = await getMeRes.json();
      if (!getMeData.ok) {
        throw new Error(`Token inválido: ${getMeData.description}`);
      }
      const botUser = getMeData.result;

      let chatInfo = null;
      let messageSent = false;

      // 2. If chatId provided, test sending message
      if (chatId) {
        const msgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ <b>Drive2Telegram Áudio Conectado!</b>\n\nBot: @${botUser.username}\nStatus: Pronto para enviar audiolivros e arquivos.`,
            parse_mode: 'HTML'
          })
        });
        const msgData = await msgRes.json();
        if (!msgData.ok) {
          throw new Error(`Bot válido (@${botUser.username}), mas falhou ao enviar mensagem para ${chatId}: ${msgData.description}`);
        }
        messageSent = true;
      }

      broadcastLog(`Bot @${botUser.username} validado com sucesso! ${messageSent ? 'Mensagem de teste enviada.' : ''}`, 'success');

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        bot: botUser,
        messageSent,
        message: `Bot @${botUser.username} conectado com sucesso!`
      }));
    } catch (err) {
      broadcastLog(`Erro no teste do Telegram: ${err.message}`, 'error');
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // API: Scan Google Drive Folder
  if (pathname === '/api/drive/scan' && method === 'POST') {
    try {
      const { folderUrl, apiKey } = await parseJsonBody(req);
      const targetFolder = folderUrl || loadConfig().folderUrl;
      const result = await scanGoogleDrive(targetFolder, apiKey);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    } catch (err) {
      broadcastLog(`Erro ao escanear Drive: ${err.message}`, 'error');
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // API: Audio Stream for In-Browser Preview
  if (pathname === '/api/audio/stream' && (method === 'GET' || method === 'HEAD')) {
    const fileId = parsedUrl.query.id;
    if (!fileId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('File ID ausente');
      return;
    }

    try {
      const driveUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const streamRes = await fetch(driveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!streamRes.ok) {
        res.writeHead(streamRes.status, { 'Content-Type': 'text/plain' });
        res.end('Erro ao carregar stream de áudio do Drive');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });

      if (method === 'HEAD') {
        res.end();
        return;
      }

      if (streamRes.body && streamRes.body.getReader) {
        const reader = streamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } else {
        const buffer = Buffer.from(await streamRes.arrayBuffer());
        res.end(buffer);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Erro no stream: ${err.message}`);
    }
    return;
  }

  // API: Send Single File
  if (pathname === '/api/telegram/send-single' && method === 'POST') {
    try {
      const { fileId, fileName, customTitle } = await parseJsonBody(req);
      const config = loadConfig();

      if (!config.botToken || !config.chatId) {
        throw new Error('Configure o Bot Token e o Chat ID nas Configurações antes de enviar.');
      }

      const result = await processAndSendFile({
        fileId,
        fileName,
        customTitle,
        config,
        onProgress: (p) => {
          broadcastEvent('single_progress', { fileId, fileName, ...p });
        }
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (err) {
      broadcastLog(`Erro ao enviar arquivo: ${err.message}`, 'error');
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // API: Batch Send Start
  if (pathname === '/api/telegram/send-batch' && method === 'POST') {
    try {
      if (batchQueue.isRunning) {
        throw new Error('Já existe um lote em andamento. Aguarde ou cancele.');
      }

      const { items } = await parseJsonBody(req);
      if (!items || !items.length) {
        throw new Error('Nenhum item selecionado para envio.');
      }

      const config = loadConfig();
      if (!config.botToken || !config.chatId) {
        throw new Error('Configure o Bot Token e o Chat ID antes de iniciar o envio.');
      }

      batchQueue.items = items;
      batchQueue.currentIndex = 0;
      batchQueue.shouldCancel = false;

      // Run queue asynchronously in background
      runBatchQueue().catch(err => {
        broadcastLog(`Erro fatal no envio em lote: ${err.message}`, 'error');
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, count: items.length, message: 'Envio em lote iniciado.' }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // API: Batch Send Cancel
  if (pathname === '/api/telegram/cancel-batch' && method === 'POST') {
    if (batchQueue.isRunning) {
      batchQueue.shouldCancel = true;
      if (batchQueue.pauseResolve) {
        batchQueue.pauseResolve({ action: 'cancel' });
      }
      broadcastLog('Cancelamento do lote solicitado...', 'warn');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: 'Lote cancelado.' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, message: 'Nenhum lote em execução.' }));
    }
    return;
  }

  // API: Queue Action (when paused on error: 'retry' | 'skip' | 'cancel')
  if (pathname === '/api/queue/action' && method === 'POST') {
    try {
      const { action } = await parseJsonBody(req);
      if (batchQueue.pauseResolve) {
        batchQueue.pauseResolve({ action });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, action }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'A fila não está pausada aguardando ação.' }));
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // API: Queue Status
  if (pathname === '/api/queue/status' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isRunning: batchQueue.isRunning,
      isPaused: batchQueue.isPaused,
      currentIndex: batchQueue.currentIndex,
      total: batchQueue.items.length,
      failedCount: (batchQueue.failedItems || []).length,
      failedItems: batchQueue.failedItems || []
    }));
    return;
  }

  // Static Assets
  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile(req, res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    return;
  }
  if (pathname === '/style.css') {
    serveStaticFile(req, res, path.join(PUBLIC_DIR, 'style.css'), 'text/css; charset=utf-8');
    return;
  }
  if (pathname === '/app.js') {
    serveStaticFile(req, res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página não encontrada');
});

// Start listening
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Drive2Telegram Áudio Server rodando com sucesso!`);
  console.log(`📡 URL Local: http://localhost:${PORT}`);
  console.log(`📁 Pasta do Drive configurada: 1y1VfI8OhAn_Uh44ogwDdYEBkCzCHnp07`);
  console.log(`======================================================\n`);
});
