// POST /api/telegram/send-single
// Downloads file from Drive and sends directly to Telegram (streaming via ArrayBuffer)
import { parseAudioMetadata, guessMimeType, jsonResponse, corsHeaders } from '../../_shared.js';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB Telegram Bot API limit

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { fileId, fileName, customTitle, config } = await request.json();

    if (!fileId || !fileName) {
      return jsonResponse({ success: false, error: 'fileId e fileName são obrigatórios.' }, 400);
    }
    if (!config || !config.botToken || !config.chatId) {
      return jsonResponse({ success: false, error: 'Configure o Bot Token e o Chat ID.' }, 400);
    }

    // 1. Download file from Google Drive
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    let driveRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    // Fallback if HTML warning page
    const ct = driveRes.headers.get('content-type') || '';
    if (!driveRes.ok || ct.includes('text/html')) {
      driveRes = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
    }

    if (!driveRes.ok) {
      throw new Error(`Google Drive retornou HTTP ${driveRes.status} ao baixar.`);
    }

    const fileBuffer = await driveRes.arrayBuffer();
    const fileSize = fileBuffer.byteLength;

    if (fileSize > MAX_SIZE) {
      throw new Error(`Arquivo tem ${(fileSize / 1024 / 1024).toFixed(1)} MB. Limite é 50 MB.`);
    }

    // 2. Build title/caption
    const meta = parseAudioMetadata(fileName, config.bookTitle || '');
    const cleanTitle = customTitle || meta.cleanTitle;
    const performer = config.performer || meta.narrator || 'Narrador';
    const book = config.bookTitle || meta.book || 'Audiolivro';

    let caption = config.captionTemplate || '🎧 <b>{title}</b>\n📖 <i>{book}</i>\n🎙️ <i>{performer}</i>';
    caption = caption
      .replace(/{title}/g, cleanTitle).replace(/{book}/g, book)
      .replace(/{performer}/g, performer).replace(/{narrator}/g, performer)
      .replace(/{filename}/g, fileName);

    // 3. Send to Telegram
    const mimeType = guessMimeType(fileName);
    const blob = new Blob([fileBuffer], { type: mimeType });
    const mode = config.sendMode || 'audio';
    const endpoint = mode === 'document' ? 'sendDocument' : 'sendAudio';

    const formData = new FormData();
    formData.append('chat_id', config.chatId);
    if (mode === 'document') {
      formData.append('document', blob, fileName);
    } else {
      formData.append('audio', blob, fileName);
      if (cleanTitle) formData.append('title', cleanTitle);
      if (performer) formData.append('performer', performer);
    }
    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${config.botToken}/${endpoint}`, {
      method: 'POST',
      body: formData
    });
    const tgData = await tgRes.json();

    if (!tgData.ok) {
      const err = new Error(tgData.description || 'Erro na API do Telegram');
      if (tgData.parameters?.retry_after) {
        return jsonResponse({
          success: false,
          error: err.message,
          isRateLimit: true,
          retryAfter: tgData.parameters.retry_after
        }, 429);
      }
      throw err;
    }

    return jsonResponse({
      success: true,
      messageId: tgData.result.message_id,
      size: fileSize
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 400);
  }
}
