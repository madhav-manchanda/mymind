// ─── RICH LINK METADATA ───────────────────────────────────────────────────────
export async function fetchLinkMeta(url) {
  const u = url.startsWith('http') ? url : 'https://' + url;

  // Strategy 0: YouTube — use YouTube's own oEmbed (CORS-friendly)
  const isYouTube = /youtube\.com|youtu\.be/i.test(u);
  if (isYouTube) {
    try {
      // Normalize to full youtube.com URL for oembed
      let ytUrl = u;
      const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        ytUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
      }
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(ytUrl)}&format=json`,
        { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined }
      );
      if (res.ok) {
        const d = await res.json();
        if (d.title) {
          const thumb = ytMatch
            ? `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
            : (d.thumbnail_url || '');
          return {
            title:       d.title,
            description: '',
            image:       thumb,
            screenshot:  '',
            favicon:     'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
            siteName:    d.author_name || 'YouTube',
            type:        'video',
            url: u,
            author: d.author_name || '',
            date: '',
          };
        }
      }
    } catch (e) { console.warn('YouTube oEmbed failed:', e.message); }
  }

  // Strategy 0b: Vimeo oEmbed
  const isVimeo = /vimeo\.com/i.test(u);
  if (isVimeo) {
    try {
      const res = await fetch(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
        { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined }
      );
      if (res.ok) {
        const d = await res.json();
        if (d.title) {
          return {
            title:       d.title,
            description: d.description || '',
            image:       d.thumbnail_url || '',
            screenshot:  '',
            favicon:     'https://www.google.com/s2/favicons?domain=vimeo.com&sz=64',
            siteName:    d.author_name || 'Vimeo',
            type:        'video',
            url: u,
            author: d.author_name || '',
            date: '',
          };
        }
      }
    } catch {}
  }

  // Strategy 1: microlink with screenshot
  try {
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(u)}&screenshot=true&meta=true`,
      { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }
    );
    const data = await res.json();
    if (data.status === 'success') {
      const d = data.data;
      const hostname = new URL(u).hostname;
      return {
        title:       d.title       || '',
        description: d.description || '',
        image:       d.image?.url  || d.screenshot?.url || '',
        screenshot:  d.screenshot?.url || '',
        favicon:     d.logo?.url   || `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        siteName:    d.publisher   || hostname.replace('www.',''),
        type:        detectType(u, d),
        url: u,
        author: d.author || '',
        date:   d.date   || '',
      };
    }
  } catch {}

  // Strategy 2: allorigins + OG parse
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`);
    const data = await res.json();
    if (data.contents) {
      const doc = new DOMParser().parseFromString(data.contents, 'text/html');
      const og = (p) => doc.querySelector(`meta[property="${p}"]`)?.content || doc.querySelector(`meta[name="${p}"]`)?.content || '';
      const hostname = new URL(u).hostname;
      return {
        title:       og('og:title')       || doc.title || '',
        description: og('og:description') || og('description') || '',
        image:       og('og:image')       || '',
        screenshot:  '',
        favicon:     `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        siteName:    og('og:site_name')   || hostname.replace('www.',''),
        type:        detectType(u),
        url: u,
      };
    }
  } catch {}

  // Strategy 3: bare minimum
  try {
    const hostname = new URL(u).hostname.replace('www.','');
    return {
      title: hostname, description: '', image: '', screenshot: '',
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
      siteName: hostname, type: 'link', url: u,
    };
  } catch {}

  return { title:'', description:'', image:'', screenshot:'', favicon:'', siteName:'', type:'link', url: u };
}

function detectType(url, d = {}) {
  const u = url.toLowerCase();
  if (u.match(/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?|$)/)) return 'image';
  if (u.match(/\.pdf(\?|$)/)) return 'pdf';
  if (u.match(/\.(mp4|mov|webm)(\?|$)/)) return 'video';
  if (u.match(/youtube\.com|youtu\.be|vimeo\.com/)) return 'video';
  if (u.match(/github\.com/)) return 'code';
  if (u.match(/amazon\.|shop\.|etsy\./)) return 'product';
  if (u.match(/twitter\.com|x\.com/)) return 'tweet';
  if ((d.description||'').length > 200) return 'article';
  return 'link';
}

// ─── FIX: getUrlThumbnail was imported in MindApp.jsx but missing here ────────
export function getUrlThumbnail(meta) {
  if (!meta) return null;
  return meta.image || meta.screenshot || null;
}

// ─── FILE PREVIEW (image/PDF → data URL) ─────────────────────────────────────
export async function generateFilePreview(file) {
  if (file.type.startsWith('image/')) {
    return { previewUrl: URL.createObjectURL(file), type: 'image' };
  }
  if (file.type === 'application/pdf') {
    try {
      const previewUrl = await renderPdfPage(file);
      return { previewUrl, type: 'pdf' };
    } catch { return { previewUrl: null, type: 'pdf' }; }
  }
  return { previewUrl: null, type: 'file' };
}

async function renderPdfPage(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf  = await file.arrayBuffer();
  const pdf  = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const vp   = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement('canvas');
  canvas.width  = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas.toDataURL('image/png');
}

// ─── GROQ AI (kept as-is, used if VITE_GROQ_API_KEY is set) ──────────────────
export async function callGroq(messages, system = '') {
  const key = import.meta.env.VITE_GROQ_API_KEY;
  if (!key) return null; // Signal to caller to use Claude fallback
  try {
    const msgs = [];
    if (system) msgs.push({ role:'system', content:system });
    msgs.push(...messages);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
      body: JSON.stringify({ model:'llama3-8b-8192', response_format:{type:'json_object'}, messages: msgs }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch(e) {
    return null;
  }
}

// ─── ANTHROPIC CLAUDE AI — primary AI tagger, no key needed ──────────────────
export async function callClaudeForTags(content, type, meta = {}) {
  const prompt = type === 'link'
    ? `Analyze this saved link. Return ONLY a JSON object, no markdown, no extra text.
URL: ${meta.url || content}
Title: ${meta.title || ''}
Description: ${meta.description || ''}
Site: ${meta.siteName || ''}

JSON format: {"tags": ["tag1", "tag2", "tag3"], "title": "concise title under 60 chars", "summary": "1-2 sentences describing what this page is about"}`
    : `Analyze this saved ${type}. Return ONLY a JSON object, no markdown, no extra text.
Content: "${content.slice(0, 500)}"

JSON format: {"tags": ["tag1", "tag2"], "title": "concise title under 60 chars", "summary": "1 sentence describing it"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'You are a smart tagging assistant for a personal knowledge base. Respond ONLY with a valid JSON object. Tags should be lowercase, short (1-2 words), and useful for filtering/organization.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate structure
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter(t => typeof t === 'string').slice(0, 6) : [],
      title: typeof parsed.title === 'string' ? parsed.title : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch (e) {
    console.warn('Claude AI tagging failed, using local fallback:', e.message);
    return generateBasicTags(content, type, meta);
  }
}

// ─── UNIFIED AI TAGGER — tries Groq first, falls back to local ──────────────
export async function autoTagContent(content, type, meta = {}) {
  // Try Groq first (free, fast) if key is configured
  const groqPrompt = type === 'link'
    ? `URL: ${meta.url || content}\nTitle: ${meta.title || ''}\nDesc: ${meta.description || ''}\nGive 3-5 relevant tags, a short title, and a 2 sentence summary. JSON: {"tags":["tag1"],"title":"title","summary":"summary"}`
    : `Text: "${content.slice(0, 400)}"\nGive 2-4 relevant tags, a short title, 1 sentence summary. JSON: {"tags":["tag1"],"title":"title","summary":"summary"}`;

  const groqRaw = await callGroq([{ role: 'user', content: groqPrompt }], 'Respond ONLY with valid JSON.');

  if (groqRaw) {
    try {
      const parsed = JSON.parse(groqRaw.replace(/```json|```/g, '').trim());
      if (parsed.tags?.length > 0 || parsed.title) return parsed;
    } catch {}
  }

  // Fallback to local tagger (Claude API doesn't support CORS from browser)
  console.warn('Groq unavailable, using local fallback tagger');
  return generateBasicTags(content, type, meta);
}

// ─── LOCAL FALLBACK TAGGER (no API needed) ───────────────────────────────────
function generateBasicTags(content, type, meta = {}) {
  const tags = new Set([type]);

  if (type === 'link') {
    try {
      const hostname = new URL(content.startsWith('http') ? content : 'https://' + content).hostname.replace('www.', '');
      const domainMap = {
        'youtube.com': ['video', 'youtube'], 'youtu.be': ['video', 'youtube'],
        'github.com': ['code', 'github'], 'twitter.com': ['social', 'twitter'],
        'x.com': ['social', 'twitter'], 'medium.com': ['article', 'reading'],
        'reddit.com': ['community', 'reddit'], 'figma.com': ['design', 'figma'],
        'notion.so': ['productivity'], 'arxiv.org': ['research', 'paper'],
        'spotify.com': ['music'], 'linkedin.com': ['professional'],
      };
      for (const [domain, dtags] of Object.entries(domainMap)) {
        if (hostname.includes(domain)) { dtags.forEach(t => tags.add(t)); break; }
      }
      tags.add('bookmark');
    } catch {}
  }

  return {
    tags: [...tags].slice(0, 5),
    title: meta.title || content.slice(0, 60),
    summary: meta.description || '',
  };
}
