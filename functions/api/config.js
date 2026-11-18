// GET /api/config  — retorna config padrão (sem persistência no Cloudflare Pages)
// POST /api/config — salva config no KV (se disponível) ou retorna merged
import { jsonResponse, corsHeaders } from '../_shared.js';

const DEFAULT_CONFIG = {
  botToken: '',
  chatId: '',
  folderUrl: '',
  performer: 'Narrador',
  bookTitle: '',
  sendMode: 'audio',
  captionTemplate: '🎧 <b>{title}</b>\n📖 <i>{book}</i>\n🎙️ <i>{performer}</i>',
  delaySeconds: 3,
  maxRetries: 3,
  onErrorAction: 'pause',
  titleFormat: 'number_dash_name'
};

export async function onRequest(ctx) {
  const { request, env } = ctx;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET — load config from KV or return defaults
  if (request.method === 'GET') {
    let config = { ...DEFAULT_CONFIG };
    if (env.CONFIG_KV) {
      try {
        const stored = await env.CONFIG_KV.get('app_config', 'json');
        if (stored) config = { ...DEFAULT_CONFIG, ...stored };
      } catch (_) {}
    }
    return jsonResponse(config);
  }

  // POST — save config to KV
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      let current = { ...DEFAULT_CONFIG };
      if (env.CONFIG_KV) {
        try {
          const stored = await env.CONFIG_KV.get('app_config', 'json');
          if (stored) current = { ...DEFAULT_CONFIG, ...stored };
        } catch (_) {}
      }
      const merged = { ...current, ...body };
      if (env.CONFIG_KV) {
        await env.CONFIG_KV.put('app_config', JSON.stringify(merged));
      }
      return jsonResponse({ success: true, config: merged });
    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 400);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}
