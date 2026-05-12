
export async function fetchLinkMeta(url) {
  const u = url.startsWith('http') ? url : 'https://' + url;
  const isYouTube = /youtube\.com|youtu\.be/i.test(u);
  if (isYouTube) {
    try {
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
          let ytDescription = '';
          try {
            const mlRes = await fetch(
              `https://api.microlink.io?url=${encodeURIComponent(ytUrl)}&meta=true`,
              { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
            );
            const mlData = await mlRes.json();
            if (mlData.status === 'success') {
              ytDescription = mlData.data?.description || '';
            }
          } catch {}

          return {
            title:       d.title,
            description: ytDescription,
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
export function getUrlThumbnail(meta) {
  if (!meta) return null;
  return meta.image || meta.screenshot || null;
}
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
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768'];

export async function callGroq(messages, system = '') {
  const key = import.meta.env.VITE_GROQ_API_KEY;
  if (!key) { console.warn('No VITE_GROQ_API_KEY set'); return null; }

  for (const model of GROQ_MODELS) {
    try {
      const msgs = [];
      if (system) msgs.push({ role:'system', content:system });
      msgs.push(...messages);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
        body: JSON.stringify({ model, max_tokens: 512, temperature: 0.3, response_format:{type:'json_object'}, messages: msgs }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`Groq model ${model} failed (HTTP ${res.status}):`, errText);
        continue; // Try next model
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log(`Groq (${model}) returned:`, content.slice(0, 200));
        return content;
      }
      console.warn(`Groq model ${model}: empty response`);
    } catch(e) {
      console.warn(`Groq model ${model} error:`, e.message);
    }
  }

  console.error('All Groq models failed');
  return null;
}
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
export async function autoTagContent(content, type, meta = {}) {
  let groqPrompt;
  if (type === 'link') {
    const isVideo = meta.type === 'video' || /youtube\.com|youtu\.be|vimeo\.com/i.test(content);
    groqPrompt = `You are an expert content analyst. Analyze this URL and generate a detailed summary.

URL: ${meta.url || content}
Title: ${meta.title || 'Unknown'}
Description: ${meta.description || 'None provided'}
Site: ${meta.siteName || 'Unknown'}
Author: ${meta.author || 'Unknown'}
Type: ${isVideo ? 'Video' : 'Webpage'}

INSTRUCTIONS:
1. Generate 3-5 relevant lowercase tags for categorization
2. Generate a clear, concise title (under 60 chars)
3. MOST IMPORTANT: Generate a detailed 2-line summary (2-3 sentences) that captures 90% of what this ${isVideo ? 'video' : 'page'} is about. ${isVideo ? 'Describe what the video covers, its main topic, key points discussed, and what viewers will learn.' : 'Describe the main topic, key information, and what readers will find.'} Be specific and informative, not vague.

Respond with ONLY this JSON:
{"tags":["tag1","tag2","tag3"],"title":"clear title","summary":"Detailed 2-3 sentence summary covering the main content, key points, and what makes this ${isVideo ? 'video' : 'page'} valuable. Be specific about the topic and details discussed."}`;
  } else {
    groqPrompt = `Analyze this saved ${type}. Generate tags, title, and a concise summary.

Content: "${content.slice(0, 600)}"

INSTRUCTIONS:
1. Generate 2-4 relevant lowercase tags
2. Generate a short title (under 60 chars)
3. Generate a 1-2 sentence summary that captures the essence of this content

Respond with ONLY this JSON:
{"tags":["tag1","tag2"],"title":"short title","summary":"1-2 sentence summary"}`;
  }

  const systemPrompt = 'You are an intelligent content analysis AI for a personal knowledge base app called Vivyn. Your job is to analyze URLs and content, then generate accurate tags, titles, and DETAILED summaries. For summaries: be specific, informative, and cover the key points. Never say "this video is about..." — instead directly state what the content covers. Respond ONLY with valid JSON, no markdown fences.';

  const groqRaw = await callGroq([{ role: 'user', content: groqPrompt }], systemPrompt);

  if (groqRaw) {
    try {
      const parsed = JSON.parse(groqRaw.replace(/```json|```/g, '').trim());
      if (parsed.summary || parsed.tags?.length > 0 || parsed.title) {
        console.log('AI summary generated:', parsed.summary?.slice(0, 100));
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse Groq response:', e.message, groqRaw?.slice(0, 200));
    }
  }
  console.warn('Groq unavailable or failed, using local fallback tagger');
  return generateBasicTags(content, type, meta);
}
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
  let summary = '';
  if (meta.description) {
    summary = meta.description;
  } else if (meta.title) {
    const parts = [];
    if (meta.siteName) parts.push(`From ${meta.siteName}`);
    if (meta.author) parts.push(`by ${meta.author}`);
    parts.push(`— ${meta.title}`);
    summary = parts.join(' ');
  }
  if (summary.length > 300) summary = summary.slice(0, 297) + '...';

  return {
    tags: [...tags].slice(0, 5),
    title: meta.title || content.slice(0, 60),
    summary,
  };
}
