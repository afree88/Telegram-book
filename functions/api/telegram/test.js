// POST /api/telegram/test
import { jsonResponse, corsHeaders } from '../../_shared.js';

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { botToken, chatId } = await request.json();
    if (!botToken) {
      return jsonResponse({ success: false, error: 'Informe o Bot Token.' }, 400);
    }

    // Validate bot
    const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const getMeData = await getMeRes.json();
    if (!getMeData.ok) {
      throw new Error(`Token inválido: ${getMeData.description}`);
    }
    const botUser = getMeData.result;

    let messageSent = false;
    if (chatId) {
      const msgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ <b>Drive2Telegram Áudio Conectado!</b>\n\nBot: @${botUser.username}\nStatus: Pronto para enviar audiolivros!`,
          parse_mode: 'HTML'
        })
      });
      const msgData = await msgRes.json();
      if (!msgData.ok) {
        throw new Error(`Bot válido (@${botUser.username}), mas falhou ao enviar para ${chatId}: ${msgData.description}`);
      }
      messageSent = true;
    }

    return jsonResponse({ success: true, bot: botUser, messageSent });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 400);
  }
}
