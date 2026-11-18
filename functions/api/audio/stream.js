// GET /api/audio/stream?id=FILEID
// Proxies audio from Google Drive for in-browser preview
import { corsHeaders } from '../../_shared.js';

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const fileId = url.searchParams.get('id');

  if (!fileId) {
    return new Response('File ID ausente', { status: 400 });
  }

  try {
    const driveUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const driveRes = await fetch(driveUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!driveRes.ok) {
      return new Response('Erro ao carregar áudio do Drive', { status: driveRes.status });
    }

    const headers = new Headers({
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });

    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }

    return new Response(driveRes.body, { status: 200, headers });
  } catch (err) {
    return new Response(`Erro no stream: ${err.message}`, { status: 500 });
  }
}
