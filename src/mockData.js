const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','it','as','be','was','are','been','has','had','do','does','did',
  'will','would','could','should','may','might','can','this','that','these',
  'those','i','you','he','she','we','they','my','your','his','her','our',
  'their','its','me','him','us','them','what','which','who','whom','how',
  'when','where','why','not','no','nor','so','if','then','than','too','very',
  'just','about','up','out','into','over','after','before','between','under',
  'above','below','all','each','every','both','few','more','most','other',
  'some','such','only','own','same','new','old','also','back','even','still',
  'well','here','there','now','get','got','set','let','put','take','make',
  'http','https','www','com','org','net','io','co','file','folder',
]);

const DOMAIN_TAGS = {
  'youtube.com': ['youtube', 'video'],
  'youtu.be': ['youtube', 'video'],
  'github.com': ['github', 'code', 'dev'],
  'twitter.com': ['twitter', 'social'],
  'x.com': ['twitter', 'social'],
  'instagram.com': ['instagram', 'social', 'photo'],
  'linkedin.com': ['linkedin', 'professional'],
  'medium.com': ['medium', 'article', 'reading'],
  'reddit.com': ['reddit', 'community'],
  'stackoverflow.com': ['stackoverflow', 'code', 'dev'],
  'figma.com': ['figma', 'design'],
  'dribbble.com': ['dribbble', 'design'],
  'behance.net': ['behance', 'design'],
  'pinterest.com': ['pinterest', 'inspiration'],
  'spotify.com': ['spotify', 'music'],
  'notion.so': ['notion', 'productivity'],
  'docs.google.com': ['google-docs', 'document'],
  'sheets.google.com': ['google-sheets', 'spreadsheet'],
  'arxiv.org': ['arxiv', 'research', 'paper'],
  'wikipedia.org': ['wikipedia', 'reference'],
  'amazon.com': ['amazon', 'shopping'],
  'unsplash.com': ['unsplash', 'photo', 'stock'],
};

const MIME_TAGS = {
  'image': ['image', 'visual'],
  'video': ['video', 'media'],
  'audio': ['audio', 'music'],
  'application/pdf': ['pdf', 'document'],
  'text': ['text', 'document'],
  'application/zip': ['archive', 'compressed'],
  'application/json': ['json', 'data', 'code'],
  'text/html': ['html', 'web'],
  'text/css': ['css', 'style', 'code'],
  'text/javascript': ['javascript', 'code'],
  'application/javascript': ['javascript', 'code'],
};

export function autoTag(card) {
  const tags = new Set();

  if (card.type) tags.add(card.type);

  if (card.title) {
    const words = card.title
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .toLowerCase()
      .split(/[\s\-_.,]+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    words.forEach(w => tags.add(w));
  }

  if (card.content && card.type === 'note') {
    const words = card.content
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .toLowerCase()
      .split(/[\s\-_.,]+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([w]) => tags.add(w));
  }

  if (card.content && card.type === 'link') {
    try {
      const url = new URL(card.content);
      const hostname = url.hostname.replace('www.', '');
      for (const [domain, dtags] of Object.entries(DOMAIN_TAGS)) {
        if (hostname.includes(domain)) {
          dtags.forEach(t => tags.add(t));
          break;
        }
      }
      if (tags.size <= 2) {
        const parts = hostname.split('.')[0];
        if (parts.length > 2) tags.add(parts);
      }
      tags.add('bookmark');
    } catch {}
  }

  if (card.mime_type) {
    for (const [key, mtags] of Object.entries(MIME_TAGS)) {
      if (card.mime_type.startsWith(key) || card.mime_type === key) {
        mtags.forEach(t => tags.add(t));
        break;
      }
    }
    const ext = card.title?.split('.').pop()?.toLowerCase();
    if (ext && ext.length <= 5 && ext.length >= 2) tags.add(ext);
  }

  if (card.type === 'quote') tags.add('quote');

  return [...tags].slice(0, 8);
}

const CARD_COLORS = {
  image: '#34a853',
  note: '#8ab4f8',
  link: '#f9ab00',
  file: '#a142f4',
  quote: '#ea4335',
};

const CARD_ICONS = {
  image: 'ImageIcon',
  note: 'StickyNote',
  link: 'Link2',
  file: 'FileText',
  quote: 'Quote',
};

export function getCardColor(type) {
  return CARD_COLORS[type] || '#5f6368';
}

export function getCardIcon(type) {
  return CARD_ICONS[type] || 'File';
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

const TAG_PALETTE = [
  '#8ab4f8', '#f28b82', '#81c995', '#fdd663', '#d7aefb',
  '#a1c9f7', '#f6aea9', '#a8dab5', '#fce8b2', '#c5a3ed',
  '#78d9ec', '#e6c9a8', '#b4ddd3', '#f4b8b8', '#b8d4f0',
];

export function tagColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}
