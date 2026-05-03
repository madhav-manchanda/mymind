import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_URL.startsWith('http')) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('Supabase init failed:', e.message);
}
export function getSupabase() {
  return supabase;
}
export function isConfigured() {
  return supabase !== null;
}
function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Set your .env credentials.');
  return supabase;
}
export async function signUp(email, password) {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}
export async function signIn(email, password) {
  const sb = requireSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() {
  const sb = requireSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}
export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function listCards(options = {}) {
  const sb = requireSupabase();
  let query = sb.from('cards').select('*, card_tags(tag_id, tags(id, name, color))');

  if (options.trashed) {
    query = query.eq('trashed', true);
  } else {
    query = query.eq('trashed', false);
  }

  if (options.starred) {
    query = query.eq('starred', true);
  }

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.search) {
    const s = `%${options.search}%`;
    query = query.or(`title.ilike.${s},content.ilike.${s}`);
  }

  if (options.tagId) {
    const { data: cardIds } = await sb
      .from('card_tags')
      .select('card_id')
      .eq('tag_id', options.tagId);
    if (cardIds?.length) {
      query = query.in('id', cardIds.map(c => c.card_id));
    } else {
      return [];
    }
  }

  query = query.order('created_at', { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(card => ({
    ...card,
    tags: (card.card_tags || [])
      .map(ct => ct.tags)
      .filter(Boolean),
  }));
}

export async function getCard(cardId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('cards')
    .select('*, card_tags(tag_id, tags(id, name, color))')
    .eq('id', cardId)
    .single();
  if (error) throw error;
  return {
    ...data,
    tags: (data.card_tags || []).map(ct => ct.tags).filter(Boolean),
  };
}

export async function createCard(card, tagNames = []) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('cards')
    .insert({
      owner_id: card.owner_id,
      type: card.type,
      title: card.title || null,
      content: card.content || null,
      thumbnail_url: card.thumbnail_url || null,
      storage_path: card.storage_path || null,
      mime_type: card.mime_type || null,
      size: card.size || 0,
      color: card.color || null,
      metadata: card.metadata || {},
      starred: false,
      trashed: false,
    })
    .select()
    .single();
  if (error) throw error;

  if (tagNames.length > 0) {
    await ensureTagsForCard(data.id, card.owner_id, tagNames);
  }

  return data;
}

export async function updateCard(cardId, updates) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('cards')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) throw error;
}

export async function trashCard(cardId) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('cards')
    .update({ trashed: true, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) throw error;
}

export async function restoreCard(cardId) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('cards')
    .update({ trashed: false, updated_at: new Date().toISOString() })
    .eq('id', cardId);
  if (error) throw error;
}

export async function deleteCard(cardId, storagePath) {
  const sb = requireSupabase();
  if (storagePath) {
    try {
      await sb.storage.from('user-files').remove([storagePath]);
    } catch (e) {
      console.warn('Storage delete error:', e);
    }
  }
  const { error } = await sb.from('cards').delete().eq('id', cardId);
  if (error) throw error;
}

export async function toggleCardStar(cardId, starred) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('cards')
    .update({ starred })
    .eq('id', cardId);
  if (error) throw error;
}

export async function listTags(ownerId) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('tags')
    .select('*, card_tags(card_id)')
    .eq('owner_id', ownerId)
    .order('name');
  if (error) throw error;
  return (data || []).map(t => ({
    ...t,
    count: (t.card_tags || []).length,
  }));
}

export async function createTag(name, ownerId, color) {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('tags')
    .insert({ name: name.toLowerCase().trim(), owner_id: ownerId, color: color || null })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await sb
        .from('tags')
        .select('*')
        .eq('name', name.toLowerCase().trim())
        .eq('owner_id', ownerId)
        .single();
      return existing;
    }
    throw error;
  }
  return data;
}

export async function deleteTag(tagId) {
  const sb = requireSupabase();
  const { error } = await sb.from('tags').delete().eq('id', tagId);
  if (error) throw error;
}

async function ensureTagsForCard(cardId, ownerId, tagNames) {
  const sb = requireSupabase();
  for (const name of tagNames) {
    const cleanName = name.toLowerCase().trim();
    if (!cleanName || cleanName.length < 2) continue;

    let tag;
    const { data: existing } = await sb
      .from('tags')
      .select('id')
      .eq('name', cleanName)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (existing) {
      tag = existing;
    } else {
      const { data: newTag, error } = await sb
        .from('tags')
        .insert({ name: cleanName, owner_id: ownerId })
        .select('id')
        .single();
      if (error) continue;
      tag = newTag;
    }

    await sb
      .from('card_tags')
      .upsert({ card_id: cardId, tag_id: tag.id }, { onConflict: 'card_id,tag_id' })
      .select();
  }
}

export async function addTagToCard(cardId, tagId) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('card_tags')
    .upsert({ card_id: cardId, tag_id: tagId }, { onConflict: 'card_id,tag_id' });
  if (error) throw error;
}

export async function removeTagFromCard(cardId, tagId) {
  const sb = requireSupabase();
  const { error } = await sb
    .from('card_tags')
    .delete()
    .eq('card_id', cardId)
    .eq('tag_id', tagId);
  if (error) throw error;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  try {
    const { data } = await supabase.storage.getBucket('user-files');
    if (data) { bucketReady = true; return; }
  } catch {}
  try {
    await supabase.storage.createBucket('user-files', { public: false });
    bucketReady = true;
  } catch (e) {
    console.warn('Could not create bucket (may need admin):', e.message);
  }
}

export async function uploadFileAsCard(file, ownerId, tagNames = []) {
  await ensureBucket();
  const storagePath = `${ownerId}/cards/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('user-files')
    .upload(storagePath, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const isImage = file.type.startsWith('image');
  const isPdf = file.type === 'application/pdf';
  let thumbnailUrl = null;

  if (isImage || isPdf) {
    try {
      const { data } = await supabase.storage
        .from('user-files')
        .createSignedUrl(storagePath, 86400);
      thumbnailUrl = data?.signedUrl || null;
    } catch {}
  }

  const card = await createCard({
    owner_id: ownerId,
    type: isImage ? 'image' : 'file',
    title: file.name,
    content: null,
    thumbnail_url: thumbnailUrl,
    storage_path: storagePath,
    mime_type: file.type || 'application/octet-stream',
    size: file.size,
    color: null,
    metadata: {},
  }, tagNames);

  return card;
}

export async function getSignedUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from('user-files')
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function getUsedStorage() {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('cards')
    .select('size')
    .eq('trashed', false);
  if (error) throw error;
  return (data || []).reduce((sum, f) => sum + (f.size || 0), 0);
}

export function subscribeToCards(ownerId, onChange) {
  const channel = supabase
    .channel('card-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cards',
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => { onChange(payload); }
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function refreshImageUrls(cards) {
  const updated = [];
  for (const card of cards) {
    if ((card.type === 'image') && card.storage_path && !card.thumbnail_url) {
      try {
        const url = await getSignedUrl(card.storage_path, 86400);
        updated.push({ ...card, thumbnail_url: url });
      } catch {
        updated.push(card);
      }
    } else {
      updated.push(card);
    }
  }
  return updated;
}
