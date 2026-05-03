import { useState, useEffect, useCallback, useRef } from 'react';
import * as svc from './supabaseService';
import { fetchLinkMeta, getUrlThumbnail, autoTagContent } from './aiService';
import { formatBytes } from './mockData';
import {
  Search, Star, Trash2, Link2, FileText, X, Check, CloudUpload,
  Plus, Moon, Sun, Sparkles, Grid, Settings, ExternalLink,
  Globe, Film, Code, ShoppingBag, FileImage, Loader, MessageCircle, Home, RotateCcw
} from 'lucide-react';
import {
  motion, AnimatePresence,
  cardVariants, sidebarIconVariants, modalOverlayVariants, panelVariants,
  sheetVariants, toastVariants, dragOverlayVariants, popupVariants, emptyStateVariants,
  useGsapSidebarIcons, AmbientParticles
} from './animations';

// ─── TYPE ICON MAP ────────────────────────────────────────────────────────────
const TYPE_ICONS = {
  link: <Globe size={11} />,
  article: <FileText size={11} />,
  video: <Film size={11} />,
  code: <Code size={11} />,
  product: <ShoppingBag size={11} />,
  tweet: <MessageCircle size={11} />,
  image: <FileImage size={11} />,
  pdf: <FileText size={11} />,
};

// ─── LINK PREVIEW CARD ───────────────────────────────────────────────────────
function LinkPreviewCard({ meta, isLoading }) {
  const [imgError, setImgError] = useState(false);
  const thumb = getUrlThumbnail(meta);

  if (isLoading) {
    return (
      <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Fetching preview...</span>
      </div>
    );
  }

  if (!meta) return null;

  return (
    <div className="link-preview-card">
      {thumb && !imgError && (
        <div className="link-preview-img-wrap">
          <img
            src={thumb}
            alt={meta.title}
            className="link-preview-img"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
      )}
      {!thumb && (
        <div className="link-preview-placeholder">
          <Globe size={32} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
        </div>
      )}
      <div className="link-preview-body">
        {meta.favicon && (
          <img src={meta.favicon} alt="" style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {meta.siteName && <div className="link-preview-site">{meta.siteName}</div>}
          {meta.title && <div className="link-preview-title">{meta.title}</div>}
          {meta.description && <div className="link-preview-desc">{meta.description}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── PDF PAGE CANVAS — renders first page of a PDF from a URL ────────────────
function PdfPageCanvas({ url, height = 260 }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    async function render() {
      try {
        // Load PDF.js from CDN if not already loaded
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

        const pdf = await window.pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const containerWidth = canvas.parentElement?.clientWidth || 280;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        canvas.width = scaled.width;
        canvas.height = scaled.height;

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
        if (!cancelled) setRendered(true);
      } catch (e) {
        console.warn('PDF render failed:', e);
        if (!cancelled) setError(true);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return (
      <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, background: 'var(--bg-hover)', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}>
        <FileText size={36} style={{ color: 'var(--text-secondary)', opacity: 0.35 }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 1 }}>PDF</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-card) var(--radius-card) 0 0', position: 'relative', background: '#f8f8f5', minHeight: rendered ? 0 : height, display: 'flex', alignItems: 'flex-start' }}>
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
      {!rendered && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <Loader size={20} style={{ color: 'var(--text-secondary)', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Rendering PDF...</div>
        </div>
      )}
      <div className="card-pdf-badge">PDF</div>
    </div>
  );
}

// ─── CARD THUMBNAIL ───────────────────────────────────────────────────────────
function CardThumbnail({ card }) {
  const [imgError, setImgError] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);

  // ── PDF: use PdfPageCanvas to render first page live from storage URL ──
  if (card.mime_type === 'application/pdf' || card.type === 'pdf') {
    // Use storage_url (signed URL of the PDF file) for rendering
    const pdfUrl = card.storage_url || card.thumbnail_url || null;
    return <PdfPageCanvas url={pdfUrl} height={220} />;
  }

  // ── Image ──
  if ((card.type === 'image' || card.mime_type?.startsWith('image/')) && (card.thumbnail_url || card.storage_url)) {
    const src = card.thumbnail_url || card.storage_url;
    if (!imgError) {
      return <img className="mind-card-img" src={src} alt={card.title || ''} loading="lazy" style={{ maxHeight: 260, objectFit: 'cover', objectPosition: 'top' }} onError={() => setImgError(true)} />;
    }
  }

  // ── Link thumbnails ──
  if (card.type === 'link') {
    // YouTube: direct thumbnail from video ID
    const ytMatch = (card.content || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      return (
        <div style={{ position: 'relative', borderRadius: 'var(--radius-card) var(--radius-card) 0 0', overflow: 'hidden' }}>
          <img className="mind-card-img" src={`https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`} alt="" loading="lazy" style={{ maxHeight: 180, objectFit: 'cover', width: '100%', display: 'block' }} onError={() => {}} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
            <div style={{ width: 44, height: 44, background: 'rgba(0,0,0,0.72)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderLeft: '16px solid white', marginLeft: 4 }} />
            </div>
          </div>
        </div>
      );
    }

    // OG / screenshot image from metadata
    if (card.thumbnail_url && !imgError) {
      return <img className="mind-card-img" src={card.thumbnail_url} alt="" loading="lazy" style={{ maxHeight: 220, objectFit: 'cover', objectPosition: 'top' }} onError={() => setImgError(true)} />;
    }

    // Microlink screenshot fallback
    if (card.content && !imgError && !screenshotError) {
      return (
        <img
          className="mind-card-img"
          src={`https://api.microlink.io?url=${encodeURIComponent(card.content)}&screenshot=true&meta=false&embed=screenshot.url`}
          alt=""
          loading="lazy"
          style={{ maxHeight: 180, objectFit: 'cover', objectPosition: 'top', width: '100%', display: 'block', borderRadius: 'var(--radius-card) var(--radius-card) 0 0' }}
          onError={() => setScreenshotError(true)}
        />
      );
    }
  }

  return null;
}

// ─── DETAIL PREVIEW ───────────────────────────────────────────────────────────
function DetailPreview({ card, previewUrl }) {
  const [imgError, setImgError] = useState(false);

  // Full-res image
  if (card.mime_type?.startsWith('image/') || card.type === 'image') {
    const src = previewUrl || card.thumbnail_url;
    if (src && !imgError) {
      return (
        <img
          src={src}
          alt={card.title || ''}
          className="detail-img"
          onError={() => setImgError(true)}
        />
      );
    }
  }

  // PDF: full iframe viewer — use previewUrl (freshly fetched signed URL) or card.storage_url
  if (card.mime_type === 'application/pdf' || card.type === 'pdf') {
    const pdfSrc = previewUrl || card.storage_url;
    if (pdfSrc) {
      return (
        <div style={{ width: '100%', borderRadius: 'var(--radius-card)', overflow: 'hidden', marginBottom: 24, border: '1px solid var(--border-light)' }}>
          <iframe
            src={`${pdfSrc}#toolbar=1&navpanes=0&scrollbar=1`}
            style={{ width: '100%', height: '60vh', border: 'none', display: 'block' }}
            title={card.title || 'PDF'}
          />
        </div>
      );
    }
    // Fallback: show a placeholder if no URL available
    return (
      <div style={{ width: '100%', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, background: 'var(--bg-main)', borderRadius: 'var(--radius-card)', marginBottom: 24, border: '1px solid var(--border-light)' }}>
        <FileText size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>PDF preview loading...</div>
      </div>
    );
  }

  // Link with OG image / screenshot
  if (card.type === 'link') {
    const thumb = card.thumbnail_url;
    if (thumb && !imgError) {
      return (
        <img
          src={thumb}
          alt={card.title || ''}
          className="detail-img"
          onError={() => setImgError(true)}
        />
      );
    }
    // Fallback: live embed via microlink
    if (card.content) {
      return (
        <div style={{ width: '100%', borderRadius: 'var(--radius-card)', overflow: 'hidden', marginBottom: 24, border: '1px solid var(--border-light)', background: 'var(--bg-main)' }}>
          <img
            src={`https://api.microlink.io?url=${encodeURIComponent(card.content)}&screenshot=true&meta=false&embed=screenshot.url`}
            alt={card.title || ''}
            className="detail-img"
            style={{ marginBottom: 0 }}
            onError={() => setImgError(true)}
          />
        </div>
      );
    }
  }

  return null;
}

// ─── INLINE ADD CARD (isolated state, no conflicts with modal) ────────────────
function InlineAddCard({ onSubmit, loading }) {
  const [val, setVal] = useState('');
  const handleSave = () => {
    if (!val.trim()) return;
    onSubmit(val.trim());
    setVal('');
  };
  return (
    <div className="mind-card quick-add-card" style={{ animationDelay: '0ms' }}>
      <div className="mind-card-body" style={{ padding: '20px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          {loading ? '✦ Thinking...' : '+ Add to Vivyn'}
        </div>
        <textarea
          placeholder="Paste a link, type a note..."
          style={{ width: '100%', minHeight: 90, border: 'none', background: 'transparent', resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)', fontWeight: 400, lineHeight: 1.6 }}
          value={val}
          onChange={e => setVal(e.target.value)}
          disabled={loading}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } }}
        />
        {val.trim() && (
          <button
            onClick={handleSave}
            disabled={loading}
            style={{ marginTop: 8, padding: '6px 14px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {loading ? 'Saving...' : 'Save →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function MindApp({ user, onSignOut }) {
  const [cards, setCards] = useState([]);
  const [search, setSearch] = useState('');

  const [addContent, setAddContent] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [addType, setAddType] = useState('note');
  const [addTitle, setAddTitle] = useState('');

  // Live link preview in add modal
  const [linkPreviewMeta, setLinkPreviewMeta] = useState(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const linkPreviewTimer = useRef(null);

  const [previewCard, setPreviewCard] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sideSpill, setSideSpill] = useState('');

  const [dragging, setDrag] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewTrash, setViewTrash] = useState(false);
  const [viewStarred, setViewStarred] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const fRef = useRef(null);
  const dc = useRef(0);

  const iconsRef = useRef(null);

  // GSAP entrance animations
  useGsapSidebarIcons(iconsRef);

  const toast = useCallback((text, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const opts = { trashed: viewTrash };
      if (search) opts.search = search;
      if (viewStarred) opts.starred = true;
      let c = await svc.listCards(opts);

      // Resolve signed storage URLs in parallel for all cards with a storage_path
      const resolved = await Promise.all(c.map(async (card) => {
        if (!card.storage_path) return card;
        try {
          // Get a fresh signed URL for the actual file (used for PDF viewer + image fallback)
          const signedUrl = await svc.getSignedUrl(card.storage_path, 86400);
          return {
            ...card,
            storage_url: signedUrl,
            // For images: use as thumbnail if none set; for PDFs: we render via PdfPageCanvas using storage_url
            thumbnail_url: card.thumbnail_url || (card.mime_type?.startsWith('image/') ? signedUrl : card.thumbnail_url),
          };
        } catch {
          return card;
        }
      }));

      setCards(resolved);
    } catch (e) { console.error('Load:', e); }
  }, [search, viewTrash, viewStarred]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { document.body.classList.toggle('dark-mode', isDark); }, [isDark]);
  useEffect(() => {
    if (!user) return;
    const unsub = svc.subscribeToCards(user.id, () => loadData());
    return unsub;
  }, [user, loadData]);

  // ── Auto-repair: fix link cards with bad titles (hostname/raw URL) ──
  const repairRan = useRef(false);
  useEffect(() => {
    if (repairRan.current || cards.length === 0) return;
    repairRan.current = true;

    const isBadTitle = (title, content) => {
      const t = (title || '').trim().toLowerCase();
      if (!t) return true;
      // Title is the raw URL itself
      if (t.startsWith('http://') || t.startsWith('https://')) return true;
      // Title is just a hostname
      try {
        const hostname = new URL(content.startsWith('http') ? content : 'https://' + content).hostname.replace('www.', '').toLowerCase();
        if (t === hostname || t === 'www.' + hostname) return true;
      } catch {}
      return false;
    };

    const needsRepair = cards.filter(c => {
      if (c.type !== 'link' || !c.content) return false;
      return isBadTitle(c.title, c.content);
    });

    if (needsRepair.length === 0) return;

    (async () => {
      let anyFixed = false;
      for (const card of needsRepair) {
        try {
          const meta = await fetchLinkMeta(card.content);
          // Only update if the new title is actually useful (not another hostname)
          if (meta.title && !isBadTitle(meta.title, card.content)) {
            const updates = { title: meta.title };
            if (meta.image && !card.thumbnail_url) updates.thumbnail_url = meta.image;
            if (meta.siteName || meta.description) {
              updates.metadata = { ...(card.metadata || {}), ...meta, linkType: meta.type };
            }
            await svc.updateCard(card.id, updates);
            anyFixed = true;
          }
        } catch {}
      }
      if (anyFixed) loadData();
    })();
  }, [cards]);

  // ── Live link preview debounce ──
  useEffect(() => {
    if (addType !== 'link') { setLinkPreviewMeta(null); return; }
    const val = addContent.trim();
    // FIX: accept https://, http://, www., or bare domain like "github.com/..."
    const looksLikeUrl = /^(https?:\/\/)/.test(val) || /^www\./i.test(val) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(val);
    if (!val || !looksLikeUrl) { setLinkPreviewMeta(null); return; }

    clearTimeout(linkPreviewTimer.current);
    setLinkPreviewLoading(true);
    linkPreviewTimer.current = setTimeout(async () => {
      try {
        const meta = await fetchLinkMeta(val);
        setLinkPreviewMeta(meta);
      } catch {}
      setLinkPreviewLoading(false);
    }, 800);

    return () => clearTimeout(linkPreviewTimer.current);
  }, [addContent, addType]);

  // ── File upload ──
  const handleUpload = async (fileList) => {
    if (!fileList?.length) return;
    toast(`Uploading ${fileList.length} file${fileList.length > 1 ? 's' : ''}...`);
    for (const file of fileList) {
      try {
        await svc.uploadFileAsCard(file, user.id, ['upload']);
        toast(`Saved ${file.name} ✓`, 'success');
      } catch (e) {
        toast(`Failed: ${file.name}`, 'error');
        console.error(e);
      }
    }
    loadData();
  };

  // ── Submit card ──
  const submitCard = async (rawContent, overrideType, overrideTitle) => {
    const trimmed = rawContent.trim();
    if (!trimmed) return;
    setLoading(true);

    try {
      // Detect URLs loosely (http/https OR www. prefix OR bare domain)
      const isUrl = /^(https?:\/\/)[^ "]+$/.test(trimmed)
        || /^www\.[^ "]+/.test(trimmed)
        || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^ "]*/.test(trimmed);

      const type = overrideType || (isUrl ? 'link' : 'note');

      let meta = {};

      if (isUrl || type === 'link') {
        toast('Fetching page info...', 'info');
        try { meta = await fetchLinkMeta(trimmed); } catch {}
      }

      // AI tagging via Groq (if key set) or Claude API fallback
      toast('✦ AI tagging...', 'info');
      let aiResponse = { tags: [], title: '', summary: '' };
      try {
        aiResponse = await autoTagContent(trimmed, type, meta);
      } catch (e) {
        console.warn('AI tagging error:', e);
      }

      // Determine final title: explicit > AI > meta > fallback
      const finalTitle = overrideTitle?.trim()
        || aiResponse.title
        || meta.title
        || (type === 'note' ? trimmed.slice(0, 60) : null);

      const card = {
        owner_id: user.id,
        type,
        title: finalTitle || null,
        content: trimmed,
        thumbnail_url: meta.image || meta.screenshot || null,
        metadata: {
          ...meta,
          summary: aiResponse.summary,
          linkType: meta.type,
        },
      };

      await svc.createCard(card, aiResponse.tags || []);
      toast('Saved to Vivyn ✓', 'success');
      setAddContent('');
      setAddTitle('');
      setLinkPreviewMeta(null);
      loadData();
    } catch (e) {
      toast(e.message || 'Failed to save', 'error');
    }
    setLoading(false);
  };

  const handleStar = async (card, e) => {
    e?.stopPropagation();
    try { await svc.toggleCardStar(card.id, !card.starred); loadData(); } catch {}
  };

  const handleTrash = async (card, e) => {
    e?.stopPropagation();
    
    if (card.trashed) {
      // Already in trash — permanently delete
      try {
        await svc.deleteCard(card.id, card.storage_path || null);
        toast('Permanently deleted ✓', 'success');
        setPreviewCard(null);
        loadData();
      } catch (err) {
        toast('Failed to delete', 'error');
        console.error(err);
      }
    } else {
      // Move to trash first
      try {
        await svc.trashCard(card.id);
        toast('Moved to trash ✓', 'success');
        setPreviewCard(null);
        loadData();
      } catch (err) {
        toast('Failed to trash', 'error');
        console.error(err);
      }
    }
  };

  const handleRestore = async (card, e) => {
    e?.stopPropagation();
    try {
      await svc.restoreCard(card.id);
      toast('Restored ✓', 'success');
      setPreviewCard(null);
      loadData();
    } catch (err) {
      toast('Failed to restore', 'error');
      console.error(err);
    }
  };

  const handlePreview = async (card) => {
    setPreviewCard(card);
    setSideSpill(card.annotation || '');
    setPreviewUrl('');
    if (card.storage_path) {
      try {
        const u = await svc.getSignedUrl(card.storage_path);
        setPreviewUrl(u);
      } catch {}
    }
  };

  const saveSideSpill = async () => {
    if (!previewCard) return;
    try { await svc.updateCard(previewCard.id, { annotation: sideSpill }); } catch {}
    loadData();
  };

  const getHostname = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } };

  const handleDragEnter = e => { e.preventDefault(); dc.current++; setDrag(true); };
  const handleDragLeave = e => { e.preventDefault(); dc.current--; if (dc.current <= 0) { setDrag(false); dc.current = 0; } };
  const handleDrop = e => { e.preventDefault(); dc.current = 0; setDrag(false); handleUpload(e.dataTransfer.files); };

  const isImageOnly = (c) => (c.type === 'image' || c.mime_type?.startsWith('image/')) && !c.title && !c.content;

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100%{opacity:0.4} 50%{opacity:0.8} }

        .link-preview-card { border-radius: 12px; overflow: hidden; border: 1px solid var(--border-light); background: var(--bg-main); margin-bottom: 16px; }
        .link-preview-img-wrap { width: 100%; height: 180px; overflow: hidden; background: var(--bg-hover); }
        .link-preview-img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
        .link-preview-placeholder { height: 120px; display: flex; align-items: center; justify-content: center; background: var(--bg-hover); }
        .link-preview-body { padding: 12px 14px; display: flex; align-items: flex-start; gap: 10px; }
        .link-preview-site { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); font-weight: 600; margin-bottom: 2px; }
        .link-preview-title { font-size: 13px; font-weight: 600; color: var(--text-primary); line-height: 1.3; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .link-preview-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .card-pdf-preview { width: 100%; height: 260px; position: relative; overflow: hidden; border-radius: var(--radius-card) var(--radius-card) 0 0; background: #f5f5f0; }
        .card-pdf-badge { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); color: white; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 1px; }

        .card-type-badge { display: inline-flex; align-items: center; gap: 4px; }
        .card-tag { text-transform: lowercase !important; font-size: 11px !important; letter-spacing: 0 !important; }
        
        .website-screenshot { width: 100%; height: 220px; object-fit: cover; object-position: top; display: block; border-radius: var(--radius-card) var(--radius-card) 0 0; }
        .website-screenshot-wrap { position: relative; overflow: hidden; border-radius: var(--radius-card) var(--radius-card) 0 0; }
        .website-favicon-overlay { position: absolute; bottom: 8px; left: 10px; width: 20px; height: 20px; border-radius: 4px; background: white; padding: 2px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }

        .quick-add-card { border: 1px dashed var(--border-search) !important; box-shadow: none !important; }
        .quick-add-card:hover { transform: none !important; border-color: var(--text-secondary) !important; }
      `}</style>

      <div
        style={{ height: '100vh', width: '100vw', background: 'var(--bg-main)' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="main-wrapper">

          {/* SIDEBAR */}
          <nav className="thin-sidebar">
            <div className="sidebar-icons" ref={iconsRef}>
              <motion.button className={`side-icon ${!viewStarred && !viewTrash && !search && !showSearch && !showSettings ? 'active' : ''}`} variants={sidebarIconVariants} initial="rest" whileHover="hover" whileTap="tap" onClick={() => { setViewStarred(false); setViewTrash(false); setSearch(''); setShowSearch(false); setShowSettings(false); }} title="Home"><Home size={22} /></motion.button>
              <motion.button className={`side-icon ${showSearch ? 'active' : ''}`} variants={sidebarIconVariants} initial="rest" whileHover="hover" whileTap="tap" onClick={() => { setShowSearch(!showSearch); setShowSettings(false); }} title="Search"><Search size={22} /></motion.button>
              <motion.button className="side-icon" variants={sidebarIconVariants} initial="rest" whileHover="hover" whileTap="tap" onClick={() => setAddModal(true)} title="Add new"><Plus size={22} /></motion.button>
              <motion.button className={`side-icon ${viewStarred ? 'active' : ''}`} variants={sidebarIconVariants} initial="rest" whileHover="hover" whileTap="tap" onClick={() => { setViewStarred(!viewStarred); setViewTrash(false); setShowSettings(false); setShowSearch(false); }} title="Starred">
                <Star size={22} fill={viewStarred ? 'currentColor' : 'none'} />
              </motion.button>
              <motion.button className={`side-icon ${showSettings ? 'active' : ''}`} variants={sidebarIconVariants} initial="rest" whileHover="hover" whileTap="tap" onClick={() => { setShowSettings(!showSettings); setShowSearch(false); }} title="Settings"><Settings size={22} /></motion.button>

              <AnimatePresence>
                {showSettings && (
                  <motion.div className="settings-popup" variants={popupVariants} initial="hidden" animate="visible" exit="exit">
                    <button className="popup-item" onClick={() => { setViewTrash(!viewTrash); setViewStarred(false); setShowSettings(false); }}>
                      {viewTrash ? 'View Active' : 'View Trash'}
                    </button>
                    <button className="popup-item" onClick={onSignOut}>Sign Out</button>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showSearch && (
                  <motion.div className="settings-popup" style={{ bottom: 'auto', top: 0, width: 240 }} variants={popupVariants} initial="hidden" animate="visible" exit="exit">
                    <input
                      className="sheet-input"
                      placeholder="Search..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      autoFocus
                      style={{ marginBottom: 0 }}
                      onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); } }}
                    />
                    {search && (
                      <button className="popup-item" onClick={() => { setSearch(''); setShowSearch(false); }} style={{ textAlign: 'center', color: 'var(--text-primary)' }}>Clear</button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          {/* MAIN CONTENT */}
          <main className="content-area">

            {/* App Title */}
            <div className="giant-search-container">
              <div className="giant-search">Vivyn</div>
            </div>

            <div className="grid-container">
              {cards.length > 0 || search || viewTrash ? (
                <div className="masonry">

                  {/* QUICK ADD INLINE CARD */}
                  {!search && !viewTrash && !viewStarred && (
                    <InlineAddCard onSubmit={submitCard} loading={loading} />
                  )}

                  <AnimatePresence mode="popLayout">
                  {cards.map((c, i) => (
                    <motion.div
                      key={c.id}
                      className={`mind-card ${isImageOnly(c) ? 'image-only' : ''}`}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      custom={i}
                      layout
                      onClick={() => handlePreview(c)}
                      whileHover={{ y: -4, boxShadow: 'var(--shadow-hover)', transition: { duration: 0.2 } }}
                    >
                      {/* ── THUMBNAIL ── */}
                      <CardThumbnail card={c} />

                      {/* ── BODY ── */}
                      {!isImageOnly(c) && (
                        <div className="mind-card-body">
                          {(c.title || c.type === 'link') && (
                            <div className="mind-card-title">
                              {c.title || getHostname(c.content)}
                            </div>
                          )}

                          {c.type !== 'link' && c.content && (
                            <div className="mind-card-text">
                              {c.type === 'quote' ? `"${c.content}"` : c.content}
                            </div>
                          )}

                          <div className="mind-card-meta">
                            <span className="card-type-badge">
                              {TYPE_ICONS[c.metadata?.linkType || c.type] || <Link2 size={11} />}
                              {c.type === 'link' ? getHostname(c.content) : c.type}
                            </span>
                            {c.size > 0 && <><FileText size={11} /> {formatBytes(c.size)}</>}
                            {c.starred && <Star size={11} fill="currentColor" style={{ marginLeft: 'auto' }} />}
                          </div>

                          {c.tags?.length > 0 && (
                            <div className="card-tags">
                              {c.tags.slice(0, 3).map(t => (
                                <span key={t.id} className="card-tag">{t.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div className="empty-state" variants={emptyStateVariants} initial="hidden" animate="visible" style={{ position: 'relative' }}>
                  <AmbientParticles />
                  <Search size={40} style={{ position: 'relative', zIndex: 1 }} />
                  <p style={{ position: 'relative', zIndex: 1 }}>Your Vivyn is clear</p>
                  <div style={{ fontSize: 14, position: 'relative', zIndex: 1 }}>Drop files here or click + to save something</div>
                </motion.div>
              )}
            </div>
          </main>
        </div>

        {/* ── QUICK ADD MODAL ── */}
        <AnimatePresence>
        {addModal && (
          <>
            <motion.div className="modal-overlay" style={{ background: 'transparent', zIndex: 90 }} onClick={() => { setAddModal(false); setLinkPreviewMeta(null); }} variants={modalOverlayVariants} initial="hidden" animate="visible" exit="exit" />
            <motion.div className="sheet-modal" style={{ zIndex: 101 }} variants={sheetVariants} initial="hidden" animate="visible" exit="exit">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div className="sheet-tabs" style={{ margin: 0, flex: 1 }}>
                  {['note', 'link', 'quote'].map(t => (
                    <div key={t} className={`sheet-tab ${addType === t ? 'active' : ''}`} onClick={() => { setAddType(t); setAddContent(''); setLinkPreviewMeta(null); }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </div>
                  ))}
                </div>
                <button onClick={() => { setAddModal(false); setLinkPreviewMeta(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginLeft: 12 }}><X size={18} /></button>
              </div>

              {addType !== 'link' && (
                <input className="sheet-input" placeholder="Title (optional)" value={addTitle} onChange={e => setAddTitle(e.target.value)} />
              )}

              {addType === 'link' ? (
                <>
                  <input
                    className="sheet-input"
                    placeholder="https://..."
                    value={addContent}
                    onChange={e => setAddContent(e.target.value)}
                    autoFocus
                  />
                  {/* LIVE LINK PREVIEW */}
                  {(linkPreviewLoading || linkPreviewMeta) && (
                    <LinkPreviewCard meta={linkPreviewMeta} isLoading={linkPreviewLoading} />
                  )}
                </>
              ) : (
                <textarea
                  className="sheet-textarea"
                  placeholder={addType === 'quote' ? '"Enter quote text..."' : 'Write your note...'}
                  value={addContent}
                  onChange={e => setAddContent(e.target.value)}
                  autoFocus
                />
              )}

              <div className="sheet-actions">
                <button
                  style={{ background: 'var(--bg-main)', color: 'var(--text-primary)', padding: '10px 16px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}
                  onClick={() => { setAddModal(false); fRef.current?.click(); }}
                >
                  <CloudUpload size={15} /> Upload
                </button>
                <button
                  className="btn-more"
                  onClick={() => {
                    submitCard(addContent.trim(), addType, addTitle.trim() || undefined);
                    setAddModal(false);
                    setAddTitle('');
                    setLinkPreviewMeta(null);
                  }}
                  disabled={loading || !addContent.trim()}
                >
                  {loading ? 'Saving...' : 'Save →'}
                </button>
              </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>

        {/* ── CARD DETAIL PANEL ── */}
        <AnimatePresence>
        {previewCard && (
          <motion.div className="modal-overlay" onClick={() => { setPreviewCard(null); setPreviewUrl(''); }} variants={modalOverlayVariants} initial="hidden" animate="visible" exit="exit">
            <div className="modal-close-area" onClick={() => { setPreviewCard(null); setPreviewUrl(''); }} />

            <motion.div className="modal-panel" onClick={e => e.stopPropagation()} variants={panelVariants} initial="hidden" animate="visible" exit="exit">
              <button className="modal-close" onClick={() => { setPreviewCard(null); setPreviewUrl(''); }}><X size={18} /></button>

              {/* Source link */}
              {previewCard.type === 'link' && previewCard.content && (
                <a href={previewCard.content} target="_blank" rel="noopener noreferrer" className="warp-btn">
                  {previewCard.metadata?.favicon && (
                    <img src={previewCard.metadata.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} onError={e => e.target.style.display = 'none'} />
                  )}
                  {previewCard.metadata?.siteName || getHostname(previewCard.content)}
                  <ExternalLink size={11} />
                </a>
              )}

              {/* Rich preview */}
              <DetailPreview card={previewCard} previewUrl={previewUrl} />

              <div className="detail-title">{previewCard.title || 'Saved Item'}</div>



              {/* Tags */}
              <div className="ai-panel">
                <div className="ai-panel-header">Tags</div>
                <div className="tags-wave">
                  {(previewCard.tags || []).length > 0
                    ? previewCard.tags.map(t => <div key={t.id} className="tag-chip">{t.name}</div>)
                    : <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No tags yet</div>}
                </div>
              </div>

              {/* Notes */}
              <div className="ai-panel" style={{ flex: 1 }}>
                <div className="ai-panel-header">Notes</div>
                <div className="sidespill-box">
                  <textarea
                    className="sidespill-input"
                    placeholder="Add a personal note..."
                    value={sideSpill}
                    onChange={e => setSideSpill(e.target.value)}
                    onBlur={saveSideSpill}
                    maxLength={500}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="action-row">
                <div className="action-icons">
                  <button className="action-icon" onClick={() => handleStar(previewCard)} title={previewCard.starred ? 'Unstar' : 'Star'}>
                    <Star size={18} fill={previewCard.starred ? 'var(--text-primary)' : 'none'} />
                  </button>
                  {previewCard.trashed ? (
                    <>
                      <button className="action-icon" onClick={() => handleRestore(previewCard)} title="Restore">
                        <RotateCcw size={18} />
                      </button>
                      <button className="action-icon" onClick={() => handleTrash(previewCard)} title="Delete permanently" style={{ color: '#e53e3e' }}>
                        <Trash2 size={18} />
                      </button>
                    </>
                  ) : (
                    <button className="action-icon" onClick={() => handleTrash(previewCard)} title="Move to trash">
                      <Trash2 size={18} />
                    </button>
                  )}
                  {previewCard.type === 'link' && (
                    <a href={previewCard.content} target="_blank" rel="noopener noreferrer" className="action-icon" style={{ textDecoration: 'none' }} title="Open original">
                      <ExternalLink size={18} />
                    </a>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {previewCard.created_at ? new Date(previewCard.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Drag overlay */}
        <AnimatePresence>
        {dragging && (
          <motion.div className="modal-overlay" style={{ zIndex: 1000, background: 'rgba(26,26,26,0.85)', flexDirection: 'column', gap: 16 }} variants={dragOverlayVariants} initial="hidden" animate="visible" exit="exit">
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}>
              <CloudUpload size={48} color="white" style={{ opacity: 0.8 }} />
            </motion.div>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-heading)', color: 'white' }}>Drop to save</div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Toasts */}
        <div className="toast-container">
          <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} className="toast" variants={toastVariants} initial="hidden" animate="visible" exit="exit" layout>
              {t.type === 'success' ? <Check size={14} /> : <div style={{ width: 6, height: 6, background: 'var(--text-primary)', borderRadius: '50%' }} />}
              <span>{t.text}</span>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>

        <input type="file" ref={fRef} hidden multiple onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
      </div>
    </>
  );
}
