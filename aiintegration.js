import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "secondbrain-cards";
const COLORS = ["#f0e6d3", "#d4e8d4", "#d3e4f0", "#e8d4f0", "#f0d4d4", "#f0f0d4", "#d4f0ee"];

// ─── Groq API ────────────────────────────────────────────────────────────────
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile"; // fast & smart

async function callGroq(messages, systemPrompt = "") {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 512,
      temperature: 0.3,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// Parse JSON safely from Groq (strips markdown fences)
function parseJSON(raw) {
  const clean = raw.replace(/```json|```/gi, "").trim();
  return JSON.parse(clean);
}

// ─── AI: Tags + Summary ───────────────────────────────────────────────────────
// Returns { tags: string[], title: string, summary: string }
async function getAIMetadata(type, content, ogTitle = "", ogDesc = "") {
  let prompt = "";

  if (type === "image") {
    prompt = `The user saved an image to their second brain app.
${content ? `They added this note: "${content}"` : "No description was given."}

Respond ONLY with valid JSON (no markdown, no extra text):
{"tags":["tag1","tag2","tag3"],"title":"short title","summary":"one sentence about this image"}`;

  } else if (type === "link") {
    prompt = `The user saved this URL to their second brain:
URL: ${content}
${ogTitle ? `Page title: ${ogTitle}` : ""}
${ogDesc ? `Page description: ${ogDesc}` : ""}

Analyze the URL and any metadata above, then respond ONLY with valid JSON:
{"tags":["tag1","tag2","tag3"],"title":"${ogTitle || "short readable title"}","summary":"1-2 sentence summary of what this link is about"}`;

  } else {
    // note / quote
    prompt = `The user saved this note/text to their second brain:
"${content}"

Respond ONLY with valid JSON (no markdown, no extra text):
{"tags":["tag1","tag2","tag3"],"title":"short title (5 words max)","summary":"one sentence capturing the core idea"}`;
  }

  const raw = await callGroq(
    [{ role: "user", content: prompt }],
    "You are an intelligent second-brain assistant. You tag and summarize content so the user can find it later. Always respond with valid JSON only — no markdown fences, no explanations."
  );

  return parseJSON(raw);
}

// ─── AI: Smart Search ─────────────────────────────────────────────────────────
async function aiSearch(query, cards) {
  const cardsSummary = cards
    .map(c => `ID:${c.id} | Type:${c.type} | Tags:${c.tags?.join(",")} | Title:${c.title || ""} | Content:${c.content.slice(0, 100)}`)
    .join("\n");

  const raw = await callGroq(
    [{
      role: "user",
      content: `User query: "${query}"\n\nCards:\n${cardsSummary}\n\nReturn ONLY a JSON array of the most relevant card IDs (max 10). Example: ["123","456"]. If nothing matches, return [].`,
    }],
    "You are a smart search engine for a personal second brain. Return ONLY a valid JSON array of IDs. No explanation."
  );

  return parseJSON(raw);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function isUrl(str) {
  return /^https?:\/\//i.test(str.trim()) || /^www\./i.test(str.trim());
}

function extractDomain(url) {
  try {
    return new URL(url.startsWith("http") ? url : "https://" + url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

async function fetchLinkMeta(url) {
  try {
    const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url.startsWith("http") ? url : "https://" + url)}`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    if (data.status === "success") {
      return {
        title: data.data.title || "",
        description: data.data.description || "",
        image: data.data.image?.url || data.data.screenshot?.url || "",
        favicon: `https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=32`,
      };
    }
  } catch {}
  return { title: "", description: "", image: "", favicon: `https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=32` };
}

// ─── Tag colors ───────────────────────────────────────────────────────────────
// Dynamic color from string hash so any AI-generated tag gets a consistent color
function tagColor(label) {
  const palette = [
    "#ffe082", "#80cbc4", "#ce93d8", "#ef9a9a",
    "#80deea", "#a5d6a7", "#ffab91", "#90caf9",
    "#f48fb1", "#bcaaa4", "#b0bec5", "#ffe0b2",
  ];
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function Tag({ label }) {
  const color = tagColor(label?.toLowerCase() || "");
  return (
    <span style={{
      background: color + "44",
      color: color.replace(/[0-9a-f]{2}$/i, "cc"),
      border: `1px solid ${color}66`,
      borderRadius: 999,
      fontSize: 10,
      padding: "2px 8px",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}>{label}</span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ card, onDelete, onTap }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onTap(card)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: card.color || "#fff",
        borderRadius: 16,
        padding: "16px",
        cursor: "pointer",
        transition: "transform 0.18s, box-shadow 0.18s",
        transform: hover ? "translateY(-3px) scale(1.01)" : "none",
        boxShadow: hover ? "0 12px 32px rgba(0,0,0,0.13)" : "0 2px 8px rgba(0,0,0,0.06)",
        position: "relative",
        wordBreak: "break-word",
        minHeight: 80,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {card.type === "image" && card.imageData && (
        <img src={card.imageData} alt="" style={{ borderRadius: 10, width: "100%", objectFit: "cover", maxHeight: 160 }} />
      )}
      {card.type === "link" ? (
        <>
          {card.ogImage && (
            <img src={card.ogImage} alt="" style={{ borderRadius: 10, width: "100%", objectFit: "cover", maxHeight: 140, background: "#eee" }}
              onError={e => { e.target.style.display = "none"; }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {card.favicon && <img src={card.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 3 }} onError={e => e.target.style.display = "none"} />}
            <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{extractDomain(card.content)}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#222", lineHeight: 1.4 }}>{card.title || card.content}</div>
          {card.summary
            ? <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{card.summary.slice(0, 120)}{card.summary.length > 120 ? "…" : ""}</div>
            : card.ogDesc && !card.ogImage && <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5 }}>{card.ogDesc.slice(0, 100)}{card.ogDesc.length > 100 ? "…" : ""}</div>
          }
        </>
      ) : (
        <>
          {card.title && <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{card.title}</div>}
          <div style={{ fontSize: 14, color: "#222", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {card.content.length > 180 ? card.content.slice(0, 180) + "…" : card.content}
          </div>
          {card.summary && (
            <div style={{ fontSize: 11, color: "#555", background: "rgba(0,0,0,0.04)", borderRadius: 8, padding: "6px 10px", lineHeight: 1.5 }}>
              {card.summary}
            </div>
          )}
        </>
      )}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: "auto" }}>
        {card.tags?.map(t => <Tag key={t} label={t} />)}
      </div>
      <div style={{ fontSize: 10, color: "#aaa", textAlign: "right" }}>{timeAgo(card.ts)}</div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(card.id); }}
        style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,0.08)", border: "none",
          borderRadius: "50%", width: 22, height: 22,
          cursor: "pointer", display: hover ? "flex" : "none",
          alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "#666"
        }}
      >×</button>
    </div>
  );
}

// ─── Card Detail ──────────────────────────────────────────────────────────────
function CardDetail({ card, onClose }) {
  if (!card) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      backdropFilter: "blur(4px)"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: card.color || "#fff",
        borderRadius: "24px 24px 0 0",
        padding: "28px 24px 40px",
        width: "100%", maxWidth: 600,
        maxHeight: "85vh", overflowY: "auto",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18)"
      }}>
        <div style={{ width: 40, height: 4, background: "rgba(0,0,0,0.15)", borderRadius: 2, margin: "0 auto 20px" }} />
        {card.type === "image" && card.imageData && (
          <img src={card.imageData} alt="" style={{ borderRadius: 12, width: "100%", marginBottom: 16 }} />
        )}
        {card.type === "link" && card.ogImage && (
          <img src={card.ogImage} alt="" style={{ borderRadius: 12, width: "100%", marginBottom: 14, objectFit: "cover", maxHeight: 220 }}
            onError={e => e.target.style.display = "none"} />
        )}
        {card.type === "link" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            {card.favicon && <img src={card.favicon} alt="" style={{ width: 16, height: 16, borderRadius: 3 }} />}
            <div style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>{extractDomain(card.content)}</div>
          </div>
        )}
        {card.title && <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10, color: "#111" }}>{card.title}</div>}
        <div style={{ fontSize: 15, color: "#333", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{card.content}</div>

        {/* AI Summary block */}
        {card.summary && (
          <div style={{
            marginTop: 14, fontSize: 13, color: "#444",
            background: "rgba(0,0,0,0.06)", borderRadius: 12,
            padding: "12px 16px", lineHeight: 1.7,
            borderLeft: "3px solid rgba(0,0,0,0.15)"
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", marginBottom: 4 }}>AI SUMMARY</div>
            {card.summary}
          </div>
        )}

        {/* Tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
          {card.tags?.map(t => <Tag key={t} label={t} />)}
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 14 }}>{new Date(card.ts).toLocaleString()}</div>
        {card.type === "link" && (
          <a href={card.content.startsWith("http") ? card.content : "https://" + card.content}
            target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 16, padding: "10px 20px", background: "#222", color: "#fff", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            Open Link ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [cards, setCards] = useState([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [imageData, setImageData] = useState(null);
  const fileRef = useRef();

  // Load from storage
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res) setCards(JSON.parse(res.value));
      } catch {}
    })();
  }, []);

  const saveCards = useCallback(async (newCards) => {
    setCards(newCards);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(newCards)); } catch {}
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const addCard = async () => {
    if (!input.trim() && !imageData) return;
    setLoading(true);
    setShowAdd(false);

    const content = input.trim();
    const type = imageData ? "image" : isUrl(content) ? "link" : "note";
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    let tags = [], title = "", summary = "", ogImage = "", ogDesc = "", favicon = "";

    try {
      if (type === "link") {
        // Step 1: fetch OG metadata
        setLoadingMsg("Fetching page info…");
        const meta = await fetchLinkMeta(content);
        ogImage = meta.image || "";
        ogDesc = meta.description || "";
        favicon = meta.favicon || "";
        if (meta.title) title = meta.title;

        // Step 2: Groq — tags + summary using OG data as context
        setLoadingMsg("AI tagging & summarizing…");
        const ai = await getAIMetadata("link", content, meta.title, meta.description);
        tags = ai.tags || [];
        summary = ai.summary || "";
        if (!title && ai.title) title = ai.title;

      } else if (type === "image") {
        setLoadingMsg("AI tagging image…");
        const ai = await getAIMetadata("image", content);
        tags = ai.tags || [];
        title = ai.title || "";
        summary = ai.summary || "";

      } else {
        // note
        setLoadingMsg("AI tagging & summarizing…");
        const ai = await getAIMetadata("note", content);
        tags = ai.tags || [];
        title = ai.title || "";
        summary = ai.summary || "";
      }
    } catch (err) {
      console.error("Groq AI error:", err);
      // Graceful fallback — save without AI metadata
      showToast("Saved (AI unavailable)");
    }

    const newCard = {
      id: Date.now().toString(),
      content: content || "",
      type,
      tags,
      title,
      summary,
      ogImage,
      ogDesc,
      favicon,
      color,
      ts: Date.now(),
      ...(imageData ? { imageData } : {}),
    };

    await saveCards([newCard, ...cards]);
    setInput("");
    setImageData(null);
    setLoading(false);
    setLoadingMsg("");
    if (!toast) showToast("Saved ✓");
  };

  const deleteCard = async (id) => {
    await saveCards(cards.filter(c => c.id !== id));
    setSelected(null);
    showToast("Deleted");
  };

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const ids = await aiSearch(search, cards);
      setSearchResults(cards.filter(c => ids.includes(c.id)));
    } catch {
      // Fallback: simple keyword search
      setSearchResults(cards.filter(c =>
        c.content.toLowerCase().includes(search.toLowerCase()) ||
        c.title?.toLowerCase().includes(search.toLowerCase()) ||
        c.summary?.toLowerCase().includes(search.toLowerCase()) ||
        c.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
      ));
    }
    setSearchLoading(false);
  };

  const handleImagePick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImageData(ev.target.result);
    reader.readAsDataURL(file);
  };

  const displayed = searchResults !== null ? searchResults :
    tab === "all" ? cards :
    cards.filter(c => c.type === tab);

  const types = ["all", "note", "link", "image"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f5f0",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      maxWidth: 680,
      margin: "0 auto",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{
        padding: "28px 20px 0",
        position: "sticky", top: 0, zIndex: 10,
        background: "linear-gradient(to bottom, #f8f5f0 80%, transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.5px" }}>my mind</div>
            <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.08em" }}>{cards.length} things saved</div>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            background: "#1a1a1a", color: "#fff", border: "none",
            borderRadius: 14, padding: "10px 18px", fontSize: 22,
            cursor: "pointer", lineHeight: 1, fontWeight: 300,
            boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
          }}>+</button>
        </div>

        {/* Search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults(null); }}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Search your mind..."
            style={{
              flex: 1, padding: "11px 16px", borderRadius: 14,
              border: "1.5px solid #e0dbd3", background: "#fff",
              fontSize: 15, outline: "none", fontFamily: "inherit",
              color: "#222",
            }}
          />
          <button onClick={handleSearch} style={{
            background: "#1a1a1a", color: "#fff", border: "none",
            borderRadius: 14, padding: "0 16px", cursor: "pointer", fontSize: 16
          }}>
            {searchLoading ? "⏳" : "🔍"}
          </button>
        </div>

        {/* Tabs */}
        {searchResults === null && (
          <div style={{ display: "flex", gap: 6, marginBottom: 4, overflowX: "auto", paddingBottom: 4 }}>
            {types.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "6px 16px", borderRadius: 999,
                border: "1.5px solid " + (tab === t ? "#1a1a1a" : "#e0dbd3"),
                background: tab === t ? "#1a1a1a" : "#fff",
                color: tab === t ? "#fff" : "#666",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                textTransform: "capitalize", fontWeight: tab === t ? 600 : 400,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>{t === "all" ? `All (${cards.length})` : t}</button>
            ))}
          </div>
        )}
        {searchResults !== null && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#888" }}>{searchResults.length} results for "{search}"</span>
            <button onClick={() => { setSearchResults(null); setSearch(""); }} style={{
              fontSize: 11, color: "#aaa", background: "none", border: "none", cursor: "pointer"
            }}>clear</button>
          </div>
        )}
      </div>

      {/* Cards grid */}
      <div style={{ padding: "12px 16px 100px", columns: "2", columnGap: 12 }}>
        {displayed.length === 0 && (
          <div style={{ textAlign: "center", color: "#bbb", padding: "60px 20px", fontSize: 15, columnSpan: "all" }}>
            {cards.length === 0 ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Your mind is empty</div>
                <div style={{ fontSize: 13 }}>Tap + to save your first thought, link, or image</div>
              </>
            ) : "Nothing found"}
          </div>
        )}
        {displayed.map(card => (
          <div key={card.id} style={{ breakInside: "avoid", marginBottom: 12 }}>
            <Card card={card} onDelete={deleteCard} onTap={setSelected} />
          </div>
        ))}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center",
          backdropFilter: "blur(4px)"
        }} onClick={() => { setShowAdd(false); setImageData(null); }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: "24px 24px 0 0",
            padding: "24px 20px 40px", width: "100%", maxWidth: 600,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.15)"
          }}>
            <div style={{ width: 40, height: 4, background: "#e0dbd3", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Add to your mind</div>

            {imageData && (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <img src={imageData} alt="" style={{ borderRadius: 12, width: "100%", maxHeight: 200, objectFit: "cover" }} />
                <button onClick={() => setImageData(null)} style={{
                  position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)",
                  border: "none", borderRadius: "50%", width: 26, height: 26,
                  color: "#fff", cursor: "pointer", fontSize: 14
                }}>×</button>
              </div>
            )}

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={imageData ? "Add a note about this image..." : "Paste a link, write a note, or share an idea..."}
              autoFocus
              rows={4}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 14,
                border: "1.5px solid #e0dbd3", background: "#faf8f5",
                fontSize: 15, outline: "none", fontFamily: "inherit",
                resize: "none", color: "#222", lineHeight: 1.6,
                boxSizing: "border-box"
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={() => fileRef.current?.click()} style={{
                padding: "12px", borderRadius: 14, border: "1.5px solid #e0dbd3",
                background: "#faf8f5", cursor: "pointer", fontSize: 18
              }}>🖼️</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImagePick} />
              <button onClick={addCard} disabled={loading || (!input.trim() && !imageData)} style={{
                flex: 1, padding: "14px", borderRadius: 14,
                background: loading ? "#ccc" : "#1a1a1a",
                color: "#fff", border: "none", fontSize: 15,
                fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}>
                {loading ? (loadingMsg || "Saving…") : "Save to mind →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card detail */}
      <CardDetail card={selected} onClose={() => setSelected(null)} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a1a", color: "#fff", padding: "10px 22px",
          borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)", zIndex: 200,
          animation: "fadeIn 0.2s ease"
        }}>{toast}</div>
      )}

      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; padding: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        ::-webkit-scrollbar { width: 0; }
        textarea:focus { border-color: #1a1a1a !important; }
        input:focus { border-color: #1a1a1a !important; }
      `}</style>
    </div>
  );
}
