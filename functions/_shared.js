// ============================================================
// Shared utilities for Cloudflare Pages Functions
// ============================================================

export function extractFolderId(input) {
  if (!input) return null;
  input = input.trim();
  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  return null;
}

export function isAudioFile(name = '') {
  const audioExtensions = ['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.flac', '.opus', '.wma'];
  const ext = '.' + name.split('.').pop().toLowerCase();
  return audioExtensions.includes(ext);
}

export function guessMimeType(fileName = '') {
  const ext = '.' + fileName.split('.').pop().toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
    '.wav': 'audio/wav', '.flac': 'audio/flac', '.aac': 'audio/aac',
    '.opus': 'audio/opus'
  };
  return map[ext] || 'application/octet-stream';
}

export function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&#([0-9]+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));
}

export function parseAudioMetadata(rawName = '', folderTitle = '') {
  const noExt = rawName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  const parts = noExt.split(/\s+-\s+/);

  let book = '', chapter = '', narrator = '';

  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    narrator = lastPart.replace(/^[\d.]+\s*/, '').trim();
    chapter = parts[parts.length - 2].trim();
    book = parts.slice(0, parts.length - 2).join(' - ')
      .replace(/^[\d_]+/, '').replace(/_/g, ' ').trim();
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

  if (folderTitle && (!book || book.length < 3)) {
    const cleanFolder = folderTitle.replace(/^[\d_]+/, '').replace(/_/g, ' ').trim();
    if (cleanFolder) book = cleanFolder;
  }

  chapter = chapter
    .replace(/_(\s+)/g, ':$1').replace(/_$/g, '?')
    .replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  const numberDashName = chapter.replace(/^(\d+)\s+([A-Za-zÀ-ÿ])/, '$1 - $2');
  const withCapitulo = numberDashName.replace(/^(\d+)\s*-\s*/, 'Capítulo $1 - ');
  const nameOnly = chapter.replace(/^\d+[\s.-]+/, '').trim();
  const bookAndChapter = book ? `${book} - ${numberDashName}` : numberDashName;
  const nameAndBook = book ? `${nameOnly} - ${book}` : nameOnly;

  return {
    raw: rawName,
    book: book || folderTitle || 'Audiolivro',
    chapter: numberDashName,
    numberDashName, withCapitulo, nameOnly, bookAndChapter, nameAndBook,
    narrator: narrator || 'Narrador',
    cleanTitle: numberDashName
  };
}

export async function scanGoogleDrive(folderInput) {
  const folderId = extractFolderId(folderInput);
  if (!folderId) throw new Error('ID ou URL da pasta do Google Drive inválido.');

  const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    throw new Error(`Google Drive retornou HTTP ${res.status}. Certifique-se de que a pasta está pública.`);
  }

  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const folderTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';

  const entryRegex = /class="flip-entry" id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?class="flip-entry-title">([^<]+)<\/div>/g;
  let match;
  const foundMap = new Map();

  while ((match = entryRegex.exec(html)) !== null) {
    const fileId = match[1];
    const fileName = decodeHtmlEntities(match[2].trim());
    if (!foundMap.has(fileId)) {
      foundMap.set(fileId, {
        id: fileId, name: fileName,
        mimeType: guessMimeType(fileName),
        size: null,
        isAudio: isAudioFile(fileName)
      });
    }
  }

  // Fallback
  if (foundMap.size === 0) {
    const fallback = /\/file\/d\/([a-zA-Z0-9_-]+)[^>]*>([^<]+)<\/a>/g;
    while ((match = fallback.exec(html)) !== null) {
      const fileId = match[1];
      const fileName = decodeHtmlEntities(match[2].trim());
      if (!foundMap.has(fileId)) {
        foundMap.set(fileId, {
          id: fileId, name: fileName,
          mimeType: guessMimeType(fileName),
          size: null, isAudio: isAudioFile(fileName)
        });
      }
    }
  }

  const files = Array.from(foundMap.values()).map(file => {
    if (file.isAudio) {
      const meta = parseAudioMetadata(file.name, folderTitle);
      return { ...file, cleanTitle: meta.cleanTitle, metadata: meta };
    }
    return file;
  });

  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return { success: true, folderId, folderTitle, files, source: 'embedded' };
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
