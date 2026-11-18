// POST /api/drive/scan
import { scanGoogleDrive, jsonResponse, corsHeaders } from '../../_shared.js';

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const { folderUrl } = await request.json();
    if (!folderUrl) {
      return jsonResponse({ success: false, error: 'URL da pasta não informada.' }, 400);
    }
    const result = await scanGoogleDrive(folderUrl);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 400);
  }
}
