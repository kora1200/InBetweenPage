/**
 * Landing Page Studio - Pure Vanilla JS & Supabase
 * Exact UI/UX Implementation from Screenshots
 */

// =============================================================================
// 1. SUPABASE & LOCAL STORAGE CONNECTION
// =============================================================================

const SUPABASE_URL = "https://hxyldnhpbugwmsmabcdo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eWxkbmhwYnVnd21zbWFiY2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODEzMzQsImV4cCI6MjEwNTY1NzMzNH0.WwxjCMaNU_67x0rgYJYd3S0TWW8v4I9OQp8MNtwi4Pg";
const LOCAL_STORAGE_KEY = "pagestudio_curations_v2";

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supabase;
    }
  } catch (e) {
    console.warn('Supabase client init issue:', e);
  }
  return null;
}

// Initial attempt
getSupabase();

function getLocalPosts() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Error reading localStorage:', e);
    return [];
  }
}

function saveLocalPosts(posts) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(posts));
  } catch (e) {
    console.warn('Error saving to localStorage:', e);
  }
}

// =============================================================================
// 2. STATE
// =============================================================================

const state = {
  view: 'dashboard', // 'dashboard' | 'editor' | 'public'
  posts: [],
  isLoading: false,
  activePost: null,
  isEditingNew: true,
  linksSearch: '',
  enteredPin: '',
  publicUnlocked: false,
  collapsedLinks: {},
  allLinksCollapsed: false
};

// =============================================================================
// 3. UTILITIES
// =============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check';
  else if (type === 'error') iconName = 'alert-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px) scale(0.96)';
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateSlug(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || ('curation-' + Math.random().toString(36).substring(2, 7));
}

function formatNumber(num) {
  return new Intl.NumberFormat().format(num || 0);
}

function detectPlatformIcon(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'video';
  if (lower.includes('instagram.com')) return 'camera';
  if (lower.includes('tiktok.com')) return 'music';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'message-circle';
  if (lower.includes('amazon.') || lower.includes('amzn.to')) return 'shopping-bag';
  if (lower.includes('spotify.com')) return 'headphones';
  if (lower.includes('github.com')) return 'code';
  return 'external-link';
}

function triggerConfetti() {
  if (window.confetti) {
    window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
  }
}

// =============================================================================
// 4. STORAGE & CRUD (Supabase + LocalStorage Fallback)
// =============================================================================

async function fetchPosts() {
  state.isLoading = true;
  const localList = getLocalPosts();
  let mergedPosts = [...localList];

  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        const remotePosts = data.map(p => ({
          ...p,
          items: Array.isArray(p.items) ? p.items : (typeof p.items === 'string' ? JSON.parse(p.items || '[]') : []),
          images: Array.isArray(p.images) ? p.images : (typeof p.images === 'string' ? JSON.parse(p.images || '[]') : [])
        }));

        const idMap = new Map();
        remotePosts.forEach(p => idMap.set(p.id, p));
        localList.forEach(p => {
          if (!idMap.has(p.id)) idMap.set(p.id, p);
        });
        mergedPosts = Array.from(idMap.values());
      }
    } catch (err) {
      console.warn('Fetch remote posts error (using local storage):', err);
    }
  }

  state.posts = mergedPosts;
  saveLocalPosts(mergedPosts);
  state.isLoading = false;
  renderDashboard();
}

async function savePost(status = 'draft') {
  const saveDraftBtn = document.getElementById('btn-editor-save-draft');
  const activatePublicBtn = document.getElementById('btn-editor-activate-public');
  const targetBtn = status === 'active' ? activatePublicBtn : saveDraftBtn;
  const originalHtml = targetBtn ? targetBtn.innerHTML : '';

  // 1. Sync all DOM inputs into state.activePost
  if (!state.activePost) {
    state.activePost = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: 'My Curation',
      slug: '',
      description: '',
      code: '',
      theme: status,
      images: [],
      items: [],
      views: 0,
      clicks: 0
    };
  }

  const titleInput = document.getElementById('editor-input-title');
  const slugInput = document.getElementById('editor-input-slug');
  const pinInput = document.getElementById('editor-input-pin');
  const bodyInput = document.getElementById('editor-input-body');

  if (titleInput && titleInput.value.trim()) state.activePost.title = titleInput.value.trim();
  if (slugInput && slugInput.value.trim()) state.activePost.slug = slugInput.value.trim();
  if (pinInput) state.activePost.code = pinInput.value.trim();
  if (bodyInput) state.activePost.description = bodyInput.value;

  let title = (state.activePost.title || '').trim();
  if (!title) {
    title = 'My Curation';
    state.activePost.title = title;
    if (titleInput) titleInput.value = title;
  }

  let slug = (state.activePost.slug || '').trim().toLowerCase();
  if (!slug) {
    slug = generateSlug(title);
    state.activePost.slug = slug;
    if (slugInput) slugInput.value = slug;
  }

  const postPayload = {
    id: state.activePost.id || ('post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
    title,
    description: state.activePost.description || '',
    slug,
    code: state.activePost.code ? state.activePost.code.trim() : null,
    theme: status,
    items: state.activePost.items || [],
    images: state.activePost.images || [],
    views: state.activePost.views || 0,
    clicks: state.activePost.clicks || 0,
    created_at: state.activePost.created_at || new Date().toISOString()
  };

  // Indicate loading state
  if (targetBtn) {
    targetBtn.disabled = true;
    targetBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-current inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
      </svg>
      <span>${status === 'active' ? 'Activating...' : 'Saving...'}</span>
    `;
  }

  try {
    // 1. Immediately save to LocalStorage so data is NEVER lost
    const localPosts = getLocalPosts();
    const existingIdx = localPosts.findIndex(p => p.id === postPayload.id || p.slug === postPayload.slug);
    if (existingIdx >= 0) {
      localPosts[existingIdx] = postPayload;
    } else {
      localPosts.unshift(postPayload);
    }
    saveLocalPosts(localPosts);

    // Update in-memory state
    const stateIdx = state.posts.findIndex(p => p.id === postPayload.id);
    if (stateIdx >= 0) {
      state.posts[stateIdx] = postPayload;
    } else {
      state.posts.unshift(postPayload);
    }
    state.activePost = postPayload;

    // 2. Attempt Supabase upsert
    const client = getSupabase();
    if (client) {
      try {
        const { error } = await client.from('posts').upsert(postPayload);
        if (error) {
          console.warn('Supabase remote save note:', error.message);
        }
      } catch (sbErr) {
        console.warn('Supabase network error, persisted locally:', sbErr);
      }
    }

    triggerConfetti();

    if (status === 'active') {
      openActivatedLinkModal(postPayload);
    } else {
      showToast('Draft saved successfully!', 'success');
      switchView('dashboard');
    }
  } catch (err) {
    console.error('Fatal save error:', err);
    showToast('Saved to storage: ' + (err.message || 'Complete'), 'info');
    if (status === 'active') {
      openActivatedLinkModal(postPayload);
    } else {
      switchView('dashboard');
    }
  } finally {
    if (targetBtn) {
      targetBtn.disabled = false;
      targetBtn.innerHTML = originalHtml;
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

function openActivatedLinkModal(post) {
  const modal = document.getElementById('modal-activated-link');
  const urlEl = document.getElementById('activated-link-url');
  const copyBtn = document.getElementById('btn-copy-activated-link');
  const copyBtnText = document.getElementById('btn-copy-activated-link-text');
  const visitBtn = document.getElementById('btn-visit-activated-link');
  const closeBtn = document.getElementById('btn-close-activated-modal');

  const fullUrl = `${window.location.origin}/p/${post.slug}`;
  if (urlEl) urlEl.textContent = fullUrl;

  // Auto copy link to clipboard for convenience
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullUrl).catch(() => {});
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(fullUrl).then(() => {
        if (copyBtnText) copyBtnText.textContent = 'Copied!';
        showToast('Link copied to clipboard!', 'success');
        setTimeout(() => {
          if (copyBtnText) copyBtnText.textContent = 'Copy';
        }, 2000);
      }).catch(() => {
        showToast('Press Ctrl+C to copy URL', 'info');
      });
    };
  }

  if (visitBtn) {
    visitBtn.onclick = () => {
      if (modal) modal.classList.add('hidden');
      window.history.pushState({}, '', `/p/${post.slug}`);
      switchView('public', { slug: post.slug });
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      if (modal) modal.classList.add('hidden');
      window.history.pushState({}, '', '/');
      switchView('dashboard');
    };
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

let pendingEditPostId = null;
let pendingDeletePostId = null;

function requestEditPost(postId) {
  const post = state.posts.find(item => item.id === postId);
  if (!post) return;

  if (post.code && post.code.trim()) {
    // Post is protected by PIN! Require verification before editing
    pendingEditPostId = postId;
    const modal = document.getElementById('modal-pin-prompt');
    const subtitle = document.getElementById('pin-prompt-subtitle');
    const pinInput = document.getElementById('input-prompt-pin');
    const errorMsg = document.getElementById('pin-prompt-error');

    if (subtitle) {
      subtitle.innerHTML = `<strong>"${escapeHtml(post.title)}"</strong> is locked. Enter the 4–6 digit PIN to edit.`;
    }
    if (pinInput) {
      pinInput.value = '';
      pinInput.type = 'password';
    }
    if (errorMsg) errorMsg.classList.add('hidden');

    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 100);
  } else {
    // Unlocked post: open editor directly
    switchView('editor', { post });
  }
}

function submitEditPinPrompt(e) {
  if (e) e.preventDefault();
  if (!pendingEditPostId) return;
  const post = state.posts.find(item => item.id === pendingEditPostId);
  if (!post) return;

  const pinInput = document.getElementById('input-prompt-pin');
  const errorMsg = document.getElementById('pin-prompt-error');
  const modal = document.getElementById('modal-pin-prompt');

  const enteredPin = (pinInput ? pinInput.value : '').trim();
  if (enteredPin === (post.code || '').trim()) {
    if (modal) modal.classList.add('hidden');
    const targetPost = post;
    pendingEditPostId = null;
    showToast('PIN verified! Opening editor...', 'success');
    switchView('editor', { post: targetPost });
  } else {
    if (errorMsg) {
      errorMsg.textContent = 'Incorrect PIN. Access denied.';
      errorMsg.classList.remove('hidden');
    }
    if (pinInput) {
      pinInput.classList.add('border-rose-500');
      setTimeout(() => pinInput.classList.remove('border-rose-500'), 1000);
      pinInput.value = '';
      pinInput.focus();
    }
  }
}

function openDeleteModal(postId) {
  const post = state.posts.find(item => item.id === postId);
  if (!post) return;

  pendingDeletePostId = postId;
  const modal = document.getElementById('modal-confirm-delete');
  const subtitle = document.getElementById('delete-confirm-subtitle');
  const pinContainer = document.getElementById('delete-pin-container');
  const pinInput = document.getElementById('input-delete-pin');
  const errorMsg = document.getElementById('delete-pin-error');

  if (subtitle) {
    subtitle.innerHTML = `Are you sure you want to permanently delete <strong>"${escapeHtml(post.title)}"</strong>? This action cannot be undone.`;
  }

  if (post.code && post.code.trim()) {
    if (pinContainer) pinContainer.classList.remove('hidden');
    if (pinInput) pinInput.value = '';
    if (errorMsg) errorMsg.classList.add('hidden');
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 100);
  } else {
    if (pinContainer) pinContainer.classList.add('hidden');
    if (pinInput) pinInput.value = '';
    if (errorMsg) errorMsg.classList.add('hidden');
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

async function executeDeletePost() {
  if (!pendingDeletePostId) return;
  const post = state.posts.find(item => item.id === pendingDeletePostId);
  if (!post) return;

  const pinInput = document.getElementById('input-delete-pin');
  const errorMsg = document.getElementById('delete-pin-error');
  const modal = document.getElementById('modal-confirm-delete');

  if (post.code && post.code.trim()) {
    const enteredPin = (pinInput ? pinInput.value : '').trim();
    if (enteredPin !== (post.code || '').trim()) {
      if (errorMsg) {
        errorMsg.textContent = 'Incorrect PIN. Post not deleted.';
        errorMsg.classList.remove('hidden');
      }
      if (pinInput) {
        pinInput.classList.add('border-rose-500');
        setTimeout(() => pinInput.classList.remove('border-rose-500'), 1000);
        pinInput.focus();
      }
      return;
    }
  }

  const postId = post.id;
  // 1. Delete from LocalStorage
  const localList = getLocalPosts().filter(p => p.id !== postId);
  saveLocalPosts(localList);
  state.posts = state.posts.filter(p => p.id !== postId);

  // 2. Close modal
  if (modal) modal.classList.add('hidden');
  pendingDeletePostId = null;

  // 3. Delete from Supabase in background
  const client = getSupabase();
  if (client) {
    try {
      await client.from('posts').delete().eq('id', postId);
    } catch (e) {
      console.warn('Supabase delete error:', e);
    }
  }

  showToast('Post deleted permanently', 'success');
  renderDashboard();
}

async function recordView(post) {
  if (!post || !post.id) return;
  const newViews = (post.views || 0) + 1;
  post.views = newViews;

  // Update local
  const localList = getLocalPosts().map(p => p.id === post.id ? { ...p, views: newViews } : p);
  saveLocalPosts(localList);

  // Update Supabase
  const client = getSupabase();
  if (client) {
    try {
      await client.from('posts').update({ views: newViews }).eq('id', post.id);
    } catch (e) {
      console.warn('View update error:', e);
    }
  }
}

async function recordClick(post, linkId) {
  if (!post || !post.id) return;
  const newClicks = (post.clicks || 0) + 1;
  post.clicks = newClicks;
  const items = (post.items || []).map(item => {
    if (item.id === linkId) return { ...item, clicks: (item.clicks || 0) + 1 };
    return item;
  });
  post.items = items;

  // Update local
  const localList = getLocalPosts().map(p => p.id === post.id ? { ...p, clicks: newClicks, items } : p);
  saveLocalPosts(localList);

  // Update Supabase
  const client = getSupabase();
  if (client) {
    try {
      await client.from('posts').update({ clicks: newClicks, items }).eq('id', post.id);
    } catch (e) {
      console.warn('Click update error:', e);
    }
  }
}

// =============================================================================
// 5. VIEW NAVIGATION & ROUTING
// =============================================================================

function switchView(viewName, options = {}) {
  state.view = viewName;

  const dashboardEl = document.getElementById('view-dashboard');
  const editorEl = document.getElementById('view-editor');
  const publicEl = document.getElementById('view-public');
  const navbarEl = document.getElementById('app-navbar');
  const footerEl = document.getElementById('app-footer');

  if (dashboardEl) dashboardEl.classList.add('hidden');
  if (editorEl) editorEl.classList.add('hidden');
  if (publicEl) publicEl.classList.add('hidden');

  if (viewName === 'dashboard') {
    if (dashboardEl) dashboardEl.classList.remove('hidden');
    if (navbarEl) navbarEl.classList.remove('hidden');
    if (footerEl) footerEl.classList.remove('hidden');
    renderDashboard();
  } else if (viewName === 'editor') {
    if (editorEl) editorEl.classList.remove('hidden');
    if (navbarEl) navbarEl.classList.remove('hidden');
    if (footerEl) footerEl.classList.remove('hidden');
    setupEditor(options.post);
  } else if (viewName === 'public') {
    if (publicEl) publicEl.classList.remove('hidden');
    if (navbarEl) navbarEl.classList.add('hidden');
    if (footerEl) footerEl.classList.add('hidden');
    setupPublic(options.slug);
  }

  if (window.lucide) window.lucide.createIcons();
}

function handleRoute() {
  const path = window.location.pathname;
  const hash = window.location.hash;
  const search = new URLSearchParams(window.location.search);

  const pathMatch = path.match(/^\/p\/([a-zA-Z0-9\-_]+)/);
  if (pathMatch && pathMatch[1]) {
    switchView('public', { slug: pathMatch[1] });
    return;
  }

  const hashMatch = hash.match(/^#\/p\/([a-zA-Z0-9\-_]+)/);
  if (hashMatch && hashMatch[1]) {
    switchView('public', { slug: hashMatch[1] });
    return;
  }

  const querySlug = search.get('p');
  if (querySlug) {
    switchView('public', { slug: querySlug });
    return;
  }

  switchView('dashboard');
}

// =============================================================================
// 6. DASHBOARD RENDERING (Matches Screenshots 6 & 7)
// =============================================================================

function renderDashboard() {
  let totalPosts = state.posts.length;
  let activePosts = 0;
  let draftsPosts = 0;
  let totalViews = 0;
  let totalClicks = 0;

  state.posts.forEach(p => {
    if (p.theme === 'active') activePosts++;
    else draftsPosts++;
    totalViews += (p.views || 0);
    totalClicks += (p.clicks || 0);
  });

  const statTotal = document.getElementById('stat-total-posts');
  const statActive = document.getElementById('stat-active-posts');
  const statDrafts = document.getElementById('stat-drafts-posts');
  const statViews = document.getElementById('stat-total-views');
  const statClicks = document.getElementById('stat-product-clicks');
  const counterLabel = document.getElementById('posts-counter-label');

  if (statTotal) statTotal.textContent = formatNumber(totalPosts);
  if (statActive) statActive.textContent = formatNumber(activePosts);
  if (statDrafts) statDrafts.textContent = formatNumber(draftsPosts);
  if (statViews) statViews.textContent = formatNumber(totalViews);
  if (statClicks) statClicks.textContent = formatNumber(totalClicks);
  if (counterLabel) counterLabel.textContent = `${totalPosts} ${totalPosts === 1 ? 'post' : 'posts'}`;

  const grid = document.getElementById('dashboard-posts-grid');
  const emptyBox = document.getElementById('dashboard-empty-box');

  if (!grid) return;

  if (totalPosts === 0) {
    grid.innerHTML = '';
    if (emptyBox) emptyBox.classList.remove('hidden');
    return;
  }

  if (emptyBox) emptyBox.classList.add('hidden');

  grid.innerHTML = state.posts.map(post => {
    const isLocked = Boolean(post.code);
    const isActive = post.theme === 'active';
    const linkCount = (post.items || []).length;
    const imgCount = (post.images || []).length;

    return `
      <div class="ui-card p-5 bg-white flex flex-col justify-between hover:border-neutral-300 transition-all shadow-sm">
        <div>
          <!-- Header Status -->
          <div class="flex items-start justify-between gap-3 mb-2.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-neutral-100 text-neutral-600 border-neutral-200'} border text-[10px] font-semibold">
                <i data-lucide="${isActive ? 'globe' : 'file-text'}" class="w-3 h-3"></i>
                <span>${isActive ? 'Active' : 'Draft'}</span>
              </span>

              ${isLocked ? `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                  <i data-lucide="lock" class="w-2.5 h-2.5"></i>
                  <span>PIN-Locked</span>
                </span>
              ` : ''}
            </div>

            <button data-action="delete-post" data-id="${post.id}" class="text-neutral-400 hover:text-rose-600 p-1 rounded transition" title="Delete">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- Title -->
          <h3 class="font-bold text-sm text-neutral-900 mb-2 truncate">${escapeHtml(post.title)}</h3>

          ${post.description ? `
            <p class="text-xs text-neutral-500 line-clamp-2 mb-4 leading-relaxed">${escapeHtml(post.description)}</p>
          ` : ''}
        </div>

        <div>
          <!-- Metrics -->
          <div class="grid grid-cols-2 gap-2 py-2 px-3 rounded-lg bg-neutral-50 border border-neutral-200/80 mb-4 text-center">
            <div>
              <p class="text-[10px] uppercase text-neutral-400 font-semibold">Views</p>
              <p class="text-xs font-bold text-neutral-800 font-mono">${formatNumber(post.views)}</p>
            </div>
            <div class="border-l border-neutral-200">
              <p class="text-[10px] uppercase text-neutral-400 font-semibold">Clicks</p>
              <p class="text-xs font-bold text-neutral-800 font-mono">${formatNumber(post.clicks)}</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2">
            <button data-action="copy-link" data-slug="${post.slug}" class="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-medium transition active:scale-95 shadow-sm">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              <span>Copy Link</span>
            </button>

            <button data-action="preview-post" data-id="${post.id}" class="p-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 transition" title="Preview">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>

            <button data-action="edit-post" data-id="${post.id}" class="py-1.5 px-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition active:scale-95 shadow-sm">
              Edit
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// =============================================================================
// 7. EDITOR VIEW (Matches Screenshots 2, 3, 4, 5)
// =============================================================================

function setupEditor(postToEdit) {
  if (postToEdit) {
    state.isEditingNew = false;
    state.activePost = JSON.parse(JSON.stringify(postToEdit));
  } else {
    state.isEditingNew = true;
    state.activePost = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: '',
      slug: '',
      description: '',
      code: '',
      theme: 'draft',
      images: [],
      items: [],
      views: 0,
      clicks: 0
    };
  }

  const headingEl = document.getElementById('editor-page-heading');
  const statusPill = document.getElementById('editor-status-pill');

  if (headingEl) headingEl.textContent = state.isEditingNew ? 'Create Landing Page' : 'Edit Landing Page';
  if (statusPill) {
    const isAct = state.activePost.theme === 'active';
    statusPill.innerHTML = `
      <i data-lucide="${isAct ? 'globe' : 'lock'}" class="w-3 h-3 text-neutral-500"></i>
      <span>${isAct ? 'Active' : 'Draft'}</span>
    `;
  }

  const titleInput = document.getElementById('editor-input-title');
  const slugInput = document.getElementById('editor-input-slug');
  const pinInput = document.getElementById('editor-input-pin');
  const bodyInput = document.getElementById('editor-input-body');

  if (titleInput) titleInput.value = state.activePost.title || '';
  if (slugInput) slugInput.value = state.activePost.slug || '';
  if (pinInput) pinInput.value = state.activePost.code || '';
  if (bodyInput) bodyInput.value = state.activePost.description || '';

  updatePinBadge();
  renderImagesSection();
  renderLinksSection();
}

function updatePinBadge() {
  const pinInput = document.getElementById('editor-input-pin');
  const badgeText = document.getElementById('pin-lock-status-text');
  const badgeIcon = document.querySelector('#pin-lock-status-badge i');
  const badge = document.getElementById('pin-lock-status-badge');

  const hasPin = pinInput && pinInput.value.trim().length > 0;
  if (badgeText) badgeText.textContent = hasPin ? 'PIN-Locked' : 'Open to Anyone';
  if (badge) {
    if (hasPin) {
      badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200';
    } else {
      badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] font-medium border border-neutral-200';
    }
  }
  if (badgeIcon) {
    badgeIcon.setAttribute('data-lucide', hasPin ? 'lock' : 'lock-open');
    if (window.lucide) window.lucide.createIcons();
  }
}

function renderImagesSection() {
  const counter = document.getElementById('editor-images-counter');
  const grid = document.getElementById('editor-images-grid');
  if (!state.activePost) return;

  const images = state.activePost.images || [];
  if (counter) counter.textContent = images.length;

  if (grid) {
    grid.innerHTML = images.map((img, idx) => `
      <div 
        draggable="true" 
        data-img-drag-idx="${idx}" 
        class="relative group rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 transition-all cursor-grab active:cursor-grabbing select-none hover:border-neutral-400"
      >
        <div class="relative">
          <img src="${img.url}" alt="${escapeHtml(img.caption || '')}" class="w-full h-28 object-cover pointer-events-none">
          <div class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono flex items-center gap-1 backdrop-blur-sm pointer-events-none shadow">
            <i data-lucide="grip-vertical" class="w-3 h-3 text-neutral-300"></i>
            <span>#${idx + 1}</span>
          </div>
        </div>
        <div class="p-1.5 bg-white">
          <input 
            type="text" 
            placeholder="Label / Title" 
            value="${escapeHtml(img.caption || '')}" 
            data-img-index="${idx}" 
            class="img-label-input w-full px-2 py-0.5 text-xs bg-neutral-50 border border-neutral-200 rounded text-neutral-800 focus:outline-none focus:border-neutral-900"
          />
        </div>
        <button type="button" data-del-img="${idx}" class="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 text-neutral-600 hover:text-rose-600 shadow-sm transition">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `).join('');

    attachImageDragAndDrop(grid);
  }

  renderLinksSection();
  if (window.lucide) window.lucide.createIcons();
}

function attachImageDragAndDrop(grid) {
  let draggedIdx = null;

  grid.querySelectorAll('[data-img-drag-idx]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedIdx = parseInt(card.getAttribute('data-img-drag-idx'), 10);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedIdx);
      setTimeout(() => card.classList.add('opacity-40', 'scale-95'), 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('opacity-40', 'scale-95');
      grid.querySelectorAll('[data-img-drag-idx]').forEach(c => c.classList.remove('ring-2', 'ring-neutral-900', 'border-neutral-900'));
      draggedIdx = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('ring-2', 'ring-neutral-900', 'border-neutral-900');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('ring-2', 'ring-neutral-900', 'border-neutral-900');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('ring-2', 'ring-neutral-900', 'border-neutral-900');
      const targetIdx = parseInt(card.getAttribute('data-img-drag-idx'), 10);
      if (draggedIdx !== null && draggedIdx !== targetIdx && state.activePost && state.activePost.images) {
        const [moved] = state.activePost.images.splice(draggedIdx, 1);
        state.activePost.images.splice(targetIdx, 0, moved);
        renderImagesSection();
        showToast('Image reordered', 'info');
      }
    });
  });
}

function renderLinksSection() {
  const links = state.activePost ? (state.activePost.items || []) : [];
  const images = state.activePost ? (state.activePost.images || []) : [];
  const container = document.getElementById('editor-links-container');
  const emptyBox = document.getElementById('editor-links-empty');
  const linksBadge = document.getElementById('counter-links-badge');
  const linkedImagesBadge = document.getElementById('counter-images-linked-badge');

  // Multi-image count: count distinct images linked across all links
  const linkedImgIds = new Set();
  links.forEach(l => {
    const ids = l.imageIds || (l.imageId ? [l.imageId] : []);
    ids.forEach(id => {
      if (images.some(img => img.id === id)) linkedImgIds.add(id);
    });
  });

  if (linksBadge) linksBadge.textContent = links.length;
  if (linkedImagesBadge) {
    linkedImagesBadge.textContent = `${linkedImgIds.size} / ${images.length}`;
  }

  if (!container) return;

  const filteredLinks = links.map((link, originalIdx) => ({ link, originalIdx })).filter(({ link }) => {
    if (!state.linksSearch) return true;
    const q = state.linksSearch.toLowerCase();
    return (link.title || '').toLowerCase().includes(q) || (link.url || '').toLowerCase().includes(q);
  });

  if (links.length === 0) {
    container.innerHTML = '';
    if (emptyBox) emptyBox.classList.remove('hidden');
    return;
  }

  if (emptyBox) emptyBox.classList.add('hidden');

  const linksHtml = filteredLinks.map(({ link, originalIdx }) => {
    const rawIds = link.imageIds || (link.imageId ? [link.imageId] : []);
    const connectedImgs = images.filter(img => rawIds.includes(img.id));
    const linkKey = link.id || String(originalIdx);
    const isCollapsed = Boolean(state.collapsedLinks[linkKey]);

    if (isCollapsed) {
      // Collapsed compact row
      return `
        <div 
          draggable="true" 
          data-link-drag-idx="${originalIdx}"
          class="ui-card p-3 bg-white flex items-center justify-between gap-3 shadow-sm select-none border border-neutral-200 hover:border-neutral-300 transition"
        >
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div class="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 p-1" title="Drag to reorder link">
              <i data-lucide="grip-vertical" class="w-4 h-4"></i>
            </div>

            <div class="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 shrink-0">
              <i data-lucide="${detectPlatformIcon(link.url)}" class="w-3.5 h-3.5"></i>
            </div>

            <div class="min-w-0 flex-1 flex items-center gap-2">
              <span class="text-xs font-semibold text-neutral-900 truncate">${escapeHtml(link.title || 'Untitled Link')}</span>
              <span class="text-[11px] text-neutral-400 truncate max-w-[160px] font-mono">${escapeHtml(link.url || 'No URL')}</span>
            </div>

            ${connectedImgs.length > 0 ? `
              <div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium shrink-0">
                <i data-lucide="image" class="w-3 h-3 text-emerald-600"></i>
                <span>${connectedImgs.length} img${connectedImgs.length > 1 ? 's' : ''} linked</span>
              </div>
            ` : ''}
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button type="button" data-toggle-collapse-link="${linkKey}" class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition" title="Expand">
              <i data-lucide="chevron-down" class="w-4 h-4"></i>
            </button>
            <button type="button" data-del-link="${originalIdx}" class="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 transition" title="Delete">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    }

    // Expanded full row
    return `
      <div 
        draggable="true" 
        data-link-drag-idx="${originalIdx}"
        class="ui-card p-3.5 bg-white flex flex-col gap-3 shadow-sm border border-neutral-200 hover:border-neutral-300 transition" 
        data-link-row="${originalIdx}"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div class="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 p-1" title="Drag to reorder link">
              <i data-lucide="grip-vertical" class="w-4 h-4"></i>
            </div>
            <div class="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500 shrink-0">
              <i data-lucide="${detectPlatformIcon(link.url)}" class="w-3.5 h-3.5"></i>
            </div>
            <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input 
                type="text" 
                placeholder="Link Title (e.g. My Shop)" 
                value="${escapeHtml(link.title || '')}" 
                data-link-field="title" 
                data-idx="${originalIdx}"
                class="px-2.5 py-1 text-xs font-medium text-neutral-900 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
              />
              <input 
                type="url" 
                placeholder="https://..." 
                value="${escapeHtml(link.url || '')}" 
                data-link-field="url" 
                data-idx="${originalIdx}"
                class="px-2.5 py-1 text-xs font-mono text-neutral-600 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button type="button" data-toggle-collapse-link="${linkKey}" class="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition" title="Collapse">
              <i data-lucide="chevron-up" class="w-4 h-4"></i>
            </button>
            <button type="button" data-del-link="${originalIdx}" class="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 transition" title="Delete">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Multi-Images chips & Add Image connection button -->
        <div class="flex items-center gap-1.5 flex-wrap pl-9 pt-1 border-t border-neutral-100">
          <span class="text-[11px] font-medium text-neutral-500 mr-1">Linked Images:</span>
          ${connectedImgs.map(img => `
            <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs shadow-sm">
              <img src="${img.url}" class="w-3.5 h-3.5 rounded object-cover" />
              <span class="truncate max-w-[90px] text-[11px] font-medium">${escapeHtml(img.caption || 'Image')}</span>
              <button type="button" data-unlink-single-img="${img.id}" data-link-idx="${originalIdx}" class="text-emerald-700 hover:text-rose-600 ml-0.5 p-0.5 transition" title="Unlink this image">
                <i data-lucide="x" class="w-3 h-3"></i>
              </button>
            </div>
          `).join('')}

          <button type="button" data-link-img-btn="${originalIdx}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium transition shadow-sm whitespace-nowrap">
            <i data-lucide="${connectedImgs.length > 0 ? 'plus' : 'image'}" class="w-3.5 h-3.5 text-neutral-500"></i>
            <span>${connectedImgs.length > 0 ? 'Link more img' : 'Link with img'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${linksHtml}
    <div class="flex items-center gap-2 pt-1">
      <button type="button" id="btn-list-add-link" class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition shadow-sm">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
        <span>Add Link</span>
      </button>
      <button type="button" id="btn-list-paste-links" class="px-3 py-1.5 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-medium transition shadow-sm">
        Paste Links
      </button>
    </div>
  `;

  attachLinkDragAndDrop(container);

  const listAddBtn = document.getElementById('btn-list-add-link');
  if (listAddBtn) {
    listAddBtn.addEventListener('click', () => {
      if (!state.activePost.items) state.activePost.items = [];
      state.activePost.items.push({
        id: 'link_' + Date.now(),
        title: 'Product Link',
        url: 'https://',
        clicks: 0,
        imageIds: []
      });
      renderLinksSection();
    });
  }

  const listPasteBtn = document.getElementById('btn-list-paste-links');
  if (listPasteBtn) {
    listPasteBtn.addEventListener('click', () => {
      const pasteModal = document.getElementById('modal-paste-links');
      const pasteTextarea = document.getElementById('textarea-paste-links');
      if (pasteModal) {
        if (pasteTextarea) pasteTextarea.value = '';
        pasteModal.classList.remove('hidden');
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

function attachLinkDragAndDrop(container) {
  let draggedLinkIdx = null;

  container.querySelectorAll('[data-link-drag-idx]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedLinkIdx = parseInt(card.getAttribute('data-link-drag-idx'), 10);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedLinkIdx);
      setTimeout(() => card.classList.add('opacity-40'), 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('opacity-40');
      container.querySelectorAll('[data-link-drag-idx]').forEach(c => c.classList.remove('ring-2', 'ring-neutral-900', 'border-neutral-900'));
      draggedLinkIdx = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('ring-2', 'ring-neutral-900', 'border-neutral-900');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('ring-2', 'ring-neutral-900', 'border-neutral-900');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('ring-2', 'ring-neutral-900', 'border-neutral-900');
      const targetIdx = parseInt(card.getAttribute('data-link-drag-idx'), 10);
      if (draggedLinkIdx !== null && draggedLinkIdx !== targetIdx && state.activePost && state.activePost.items) {
        const [moved] = state.activePost.items.splice(draggedLinkIdx, 1);
        state.activePost.items.splice(targetIdx, 0, moved);
        renderLinksSection();
        showToast('Link reordered', 'info');
      }
    });
  });
}

function openImagePickerModal(linkIndex) {
  const images = state.activePost ? (state.activePost.images || []) : [];
  if (images.length === 0) {
    showToast('Please upload an image first', 'info');
    return;
  }

  state.currentLinkingLinkIndex = linkIndex;
  const link = state.activePost.items[linkIndex];
  if (!link) return;

  if (!link.imageIds) {
    link.imageIds = link.imageId ? [link.imageId] : [];
  }

  const modal = document.getElementById('modal-link-image');
  const grid = document.getElementById('modal-link-image-grid');
  if (!modal || !grid) return;

  const renderModalGrid = () => {
    const selectedSet = new Set(link.imageIds || []);
    grid.innerHTML = images.map((img, i) => {
      const isSelected = selectedSet.has(img.id);
      return `
        <button 
          type="button" 
          data-toggle-img-id="${img.id}" 
          class="relative group text-left rounded-xl overflow-hidden bg-white shadow-sm transition p-1.5 focus:outline-none border-2 ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-neutral-200 hover:border-neutral-900'}"
        >
          <div class="relative">
            <img src="${img.url}" class="w-full h-20 object-cover rounded mb-1" />
            ${isSelected ? `
              <div class="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                <i data-lucide="check" class="w-3 h-3"></i>
              </div>
            ` : ''}
          </div>
          <p class="text-[11px] font-medium text-neutral-800 truncate">${escapeHtml(img.caption || ('Image ' + (i + 1)))}</p>
        </button>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    grid.querySelectorAll('button[data-toggle-img-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const imgId = btn.getAttribute('data-toggle-img-id');
        const set = new Set(link.imageIds || []);
        if (set.has(imgId)) {
          set.delete(imgId);
        } else {
          set.add(imgId);
        }
        link.imageIds = Array.from(set);
        link.imageId = link.imageIds[0] || null;
        renderModalGrid();
        renderLinksSection();
      });
    });
  };

  renderModalGrid();

  const clearBtn = document.getElementById('btn-clear-link-images');
  if (clearBtn) {
    clearBtn.onclick = () => {
      link.imageIds = [];
      link.imageId = null;
      renderModalGrid();
      renderLinksSection();
      showToast('All images unlinked from this link', 'info');
    };
  }

  modal.classList.remove('hidden');
}

// =============================================================================
// 8. PUBLIC VIEW (Unlisted Standalone Landing Page)
// =============================================================================

async function setupPublic(slug) {
  state.enteredPin = '';
  state.publicUnlocked = false;

  const lockScreen = document.getElementById('public-lock-screen');
  const contentScreen = document.getElementById('public-content-screen');

  if (lockScreen) lockScreen.classList.add('hidden');
  if (contentScreen) contentScreen.classList.add('hidden');

  let post = state.posts.find(p => p.slug === slug);
  if (!post) {
    const localPosts = getLocalPosts();
    post = localPosts.find(p => p.slug === slug);
  }

  const client = getSupabase();
  if (!post && client) {
    try {
      const { data, error } = await client.from('posts').select('*').eq('slug', slug).single();
      if (!error && data) {
        post = {
          ...data,
          items: Array.isArray(data.items) ? data.items : JSON.parse(data.items || '[]'),
          images: Array.isArray(data.images) ? data.images : JSON.parse(data.images || '[]')
        };
      }
    } catch (e) {
      console.warn('Public fetch error:', e);
    }
  }

  if (!post) {
    showToast('Page not found', 'error');
    switchView('dashboard');
    return;
  }

  state.activePost = post;

  if (post.code && post.code.trim().length > 0) {
    showLock(post);
  } else {
    revealPublic(post);
  }
}

function showLock(post) {
  const lockScreen = document.getElementById('public-lock-screen');
  const lockTitle = document.getElementById('lock-screen-title');
  const errorMsg = document.getElementById('lock-error-message');

  if (lockScreen) lockScreen.classList.remove('hidden');
  if (lockTitle) lockTitle.textContent = post.title || 'Protected Post';
  if (errorMsg) errorMsg.textContent = '';

  state.enteredPin = '';
  updatePinDots();

  const hiddenInput = document.getElementById('hidden-pin-input');
  if (hiddenInput) {
    hiddenInput.value = '';
    hiddenInput.focus();
  }
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots-container .pin-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('filled', idx < state.enteredPin.length);
  });
}

function handleKeypad(key) {
  const errorMsg = document.getElementById('lock-error-message');
  if (errorMsg) errorMsg.textContent = '';

  if (key === 'clear') {
    state.enteredPin = '';
    updatePinDots();
    return;
  }

  if (key === 'enter') {
    verifyPin();
    return;
  }

  if (state.enteredPin.length < 6) {
    state.enteredPin += key;
    updatePinDots();
    const reqCode = (state.activePost && state.activePost.code) || '';
    if (state.enteredPin.length === reqCode.length) {
      verifyPin();
    }
  }
}

function verifyPin() {
  if (!state.activePost) return;
  const correct = state.activePost.code || '';
  const card = document.querySelector('#public-lock-screen .ui-card');
  const errorMsg = document.getElementById('lock-error-message');

  if (state.enteredPin === correct) {
    triggerConfetti();
    state.publicUnlocked = true;
    revealPublic(state.activePost);
  } else {
    if (errorMsg) errorMsg.textContent = 'Incorrect passcode';
    if (card) {
      card.classList.add('animate-shake');
      setTimeout(() => card.classList.remove('animate-shake'), 450);
    }
    state.enteredPin = '';
    updatePinDots();
  }
}

// Lightbox State
let currentLightboxImages = [];
let currentLightboxIndex = 0;
let currentLightboxLinks = [];

function openLightbox(images, startIndex, links = []) {
  if (!images || images.length === 0) return;
  currentLightboxImages = images;
  currentLightboxIndex = startIndex >= 0 && startIndex < images.length ? startIndex : 0;
  currentLightboxLinks = links;

  const modal = document.getElementById('modal-image-lightbox');
  if (!modal) return;

  renderLightboxFrame();
  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function renderLightboxFrame() {
  const counter = document.getElementById('lightbox-counter');
  const mainImg = document.getElementById('lightbox-main-img');
  const captionEl = document.getElementById('lightbox-caption');
  const buyBtn = document.getElementById('lightbox-product-link');
  const thumbs = document.getElementById('lightbox-thumbs');

  const total = currentLightboxImages.length;
  const current = currentLightboxImages[currentLightboxIndex];
  if (!current) return;

  if (counter) counter.textContent = `${currentLightboxIndex + 1} / ${total}`;
  if (mainImg) {
    mainImg.src = current.url;
    mainImg.alt = current.caption || `Image ${currentLightboxIndex + 1}`;
  }
  if (captionEl) {
    captionEl.textContent = current.caption || '';
  }

  // Linked product check
  if (buyBtn) {
    const linked = currentLightboxLinks.find(l => (l.imageIds && l.imageIds.includes(current.id)) || l.imageId === current.id);
    if (linked && linked.url) {
      buyBtn.href = linked.url;
      buyBtn.setAttribute('data-link-id', linked.id);
      buyBtn.classList.remove('hidden');
      buyBtn.classList.add('inline-flex');
    } else {
      buyBtn.classList.add('hidden');
      buyBtn.classList.remove('inline-flex');
    }
  }

  // Mini Thumbnails preview below
  if (thumbs) {
    thumbs.innerHTML = currentLightboxImages.map((img, i) => `
      <button 
        type="button" 
        data-lightbox-thumb="${i}"
        class="w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition ${i === currentLightboxIndex ? 'border-white ring-2 ring-white/30 scale-105' : 'border-transparent opacity-60 hover:opacity-100'}"
      >
        <img src="${img.url}" class="w-full h-full object-cover" />
      </button>
    `).join('');

    thumbs.querySelectorAll('[data-lightbox-thumb]').forEach(btn => {
      btn.onclick = () => {
        currentLightboxIndex = parseInt(btn.getAttribute('data-lightbox-thumb'), 10);
        renderLightboxFrame();
      };
    });
  }
}

function closeLightbox() {
  const modal = document.getElementById('modal-image-lightbox');
  if (modal) modal.classList.add('hidden');
}

function prevLightbox() {
  if (currentLightboxImages.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxImages.length) % currentLightboxImages.length;
  renderLightboxFrame();
}

function nextLightbox() {
  if (currentLightboxImages.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxImages.length;
  renderLightboxFrame();
}

function renderWhatsAppGallery(images, links, container, post) {
  if (!images || images.length === 0) {
    container.innerHTML = '';
    return;
  }

  const count = images.length;
  let layoutHtml = '';

  if (count === 1) {
    // Single image: full featured card with responsive aspect ratio
    const img = images[0];
    const linked = links.find(l => (l.imageIds && l.imageIds.includes(img.id)) || l.imageId === img.id);
    layoutHtml = `
      <div class="relative group w-full rounded-2xl overflow-hidden border border-neutral-200/90 bg-neutral-900 shadow-sm cursor-pointer aspect-[16/10] sm:aspect-[16/9]" data-open-lightbox="0">
        <img src="${img.url}" alt="${escapeHtml(img.caption || '')}" class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300">
        ${img.caption ? `
          <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 sm:p-4 pt-6 text-white text-xs sm:text-sm font-medium">
            ${escapeHtml(img.caption)}
          </div>
        ` : ''}
        ${linked ? `
          <a href="${escapeHtml(linked.url)}" target="_blank" rel="noopener noreferrer" data-link-id="${linked.id}" class="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-neutral-900/90 text-white text-xs font-medium flex items-center gap-1.5 shadow-md backdrop-blur-sm hover:bg-black transition z-10">
            <span>Wanna buy?</span>
            <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
          </a>
        ` : ''}
      </div>
    `;
  } else if (count === 2) {
    // 2 images: 2 equal split columns with responsive aspect ratio
    layoutHtml = `
      <div class="grid grid-cols-2 gap-2 sm:gap-3 rounded-2xl overflow-hidden w-full">
        ${images.map((img, i) => {
          const linked = links.find(l => (l.imageIds && l.imageIds.includes(img.id)) || l.imageId === img.id);
          return `
            <div class="relative group aspect-square sm:aspect-[4/3] bg-neutral-900 overflow-hidden rounded-xl border border-neutral-200/90 cursor-pointer shadow-sm" data-open-lightbox="${i}">
              <img src="${img.url}" alt="${escapeHtml(img.caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
              ${img.caption ? `
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-3 pt-5 text-white text-[11px] sm:text-xs font-medium truncate">
                  ${escapeHtml(img.caption)}
                </div>
              ` : ''}
              ${linked ? `
                <a href="${escapeHtml(linked.url)}" target="_blank" rel="noopener noreferrer" data-link-id="${linked.id}" class="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-neutral-900/90 text-white text-[11px] font-medium flex items-center gap-1 shadow backdrop-blur-sm hover:bg-black transition z-10">
                  <span>Wanna buy?</span>
                  <i data-lucide="arrow-up-right" class="w-3 h-3"></i>
                </a>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (count === 3) {
    // 3 images: 1 top hero + 2 bottom split
    layoutHtml = `
      <div class="grid grid-cols-2 gap-2 sm:gap-3 rounded-2xl overflow-hidden w-full">
        <div class="col-span-2 relative group aspect-[16/9] sm:aspect-[21/9] bg-neutral-900 overflow-hidden rounded-xl border border-neutral-200/90 cursor-pointer shadow-sm" data-open-lightbox="0">
          <img src="${images[0].url}" alt="${escapeHtml(images[0].caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
          ${images[0].caption ? `
            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 sm:p-3.5 pt-5 text-white text-xs sm:text-sm font-medium truncate">
              ${escapeHtml(images[0].caption)}
            </div>
          ` : ''}
        </div>
        ${images.slice(1, 3).map((img, idx) => `
          <div class="relative group aspect-square sm:aspect-[4/3] bg-neutral-900 overflow-hidden rounded-xl border border-neutral-200/90 cursor-pointer shadow-sm" data-open-lightbox="${idx + 1}">
            <img src="${img.url}" alt="${escapeHtml(img.caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
            ${img.caption ? `
              <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-4 text-white text-[11px] font-medium truncate">
                ${escapeHtml(img.caption)}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } else {
    // 4 or More Images: 2x2 grid with aspect-square tiles filling the full width cleanly
    const displayImgs = images.slice(0, 4);
    const extraCount = images.length - 4;

    layoutHtml = `
      <div class="grid grid-cols-2 gap-2.5 sm:gap-3.5 rounded-2xl overflow-hidden w-full">
        ${displayImgs.map((img, i) => {
          const isFourth = i === 3 && extraCount > 0;
          return `
            <div class="relative group aspect-square sm:aspect-[4/3] bg-neutral-900 overflow-hidden rounded-xl sm:rounded-2xl border border-neutral-200/90 cursor-pointer shadow-sm" data-open-lightbox="${i}">
              <img src="${img.url}" alt="${escapeHtml(img.caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
              
              ${isFourth ? `
                <!-- Clean, high-contrast overlay for +X remaining images -->
                <div class="absolute inset-0 bg-neutral-950/75 backdrop-blur-[3px] flex flex-col items-center justify-center text-white transition group-hover:bg-neutral-950/85">
                  <span class="text-3xl sm:text-5xl font-light tracking-tight font-mono">+${extraCount}</span>
                  <span class="text-[10px] sm:text-xs uppercase font-semibold tracking-wider text-neutral-300 mt-1">View all ${images.length}</span>
                </div>
              ` : `
                ${img.caption ? `
                  <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 sm:p-2.5 pt-5 text-white text-[11px] sm:text-xs font-medium truncate">
                    ${escapeHtml(img.caption)}
                  </div>
                ` : ''}
              `}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  container.innerHTML = layoutHtml;

  // Click on any tile opens the full lightbox
  container.querySelectorAll('[data-open-lightbox]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('a[data-link-id]')) return;
      const idx = parseInt(el.getAttribute('data-open-lightbox'), 10);
      openLightbox(images, idx, links);
    });
  });

  // Track product clicks on direct links inside gallery
  container.querySelectorAll('a[data-link-id]').forEach(a => {
    a.addEventListener('click', () => {
      const linkId = a.getAttribute('data-link-id');
      recordClick(post, linkId);
    });
  });
}

function revealPublic(post) {
  const lockScreen = document.getElementById('public-lock-screen');
  const contentScreen = document.getElementById('public-content-screen');

  if (lockScreen) lockScreen.classList.add('hidden');
  if (contentScreen) contentScreen.classList.remove('hidden');

  const titleEl = document.getElementById('public-page-title');
  const descEl = document.getElementById('public-page-description');

  if (titleEl) titleEl.textContent = post.title || '';
  if (descEl) {
    if (post.description) {
      const rawHtml = window.marked ? window.marked.parse(post.description) : post.description;
      descEl.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
    } else {
      descEl.innerHTML = '';
    }
  }

  const galleryWrapper = document.getElementById('public-gallery-wrapper');
  const galleryGrid = document.getElementById('public-gallery-grid');
  const images = post.images || [];
  const links = post.items || [];

  if (images.length > 0 && galleryGrid) {
    if (galleryWrapper) galleryWrapper.classList.remove('hidden');
    // Render modern WhatsApp-style collage with clean styling
    renderWhatsAppGallery(images, links, galleryGrid, post);
  } else if (galleryWrapper) {
    galleryWrapper.classList.add('hidden');
  }

  const linksContainer = document.getElementById('public-links-list');

  if (linksContainer) {
    linksContainer.innerHTML = links.map(link => `
      <a 
        href="${escapeHtml(link.url)}" 
        target="_blank" 
        rel="noopener noreferrer" 
        data-link-id="${link.id}"
        class="ui-card p-3.5 bg-white flex items-center justify-between group hover:border-neutral-900 transition-all shadow-sm"
      >
        <div class="flex items-center gap-3 overflow-hidden">
          <div class="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
            <i data-lucide="${detectPlatformIcon(link.url)}" class="w-4 h-4"></i>
          </div>
          <span class="font-medium text-xs text-neutral-900 truncate">${escapeHtml(link.title)}</span>
        </div>
        <div class="flex items-center gap-1 text-xs text-neutral-400 group-hover:text-neutral-900 transition-colors">
          <span>Wanna buy?</span>
          <i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i>
        </div>
      </a>
    `).join('');

    linksContainer.querySelectorAll('a[data-link-id]').forEach(a => {
      a.addEventListener('click', () => {
        const id = a.getAttribute('data-link-id');
        recordClick(post, id);
      });
    });
  }

  if (window.lucide) window.lucide.createIcons();
  recordView(post);
}

// =============================================================================
// 9. EVENT LISTENERS
// =============================================================================

function attachEvents() {
  const brandBtn = document.getElementById('nav-brand-btn');
  const allPostsBtn = document.getElementById('nav-all-posts-btn');
  [brandBtn, allPostsBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        window.history.pushState({}, '', '/');
        switchView('dashboard');
      });
    }
  });

  const topCreateBtn = document.getElementById('btn-top-create-post');
  const dashCreateBtn = document.getElementById('btn-dashboard-create-post');
  const firstCreateBtn = document.getElementById('btn-create-first-post');
  [topCreateBtn, dashCreateBtn, firstCreateBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => switchView('editor', { post: null }));
    }
  });

  const editorBack = document.getElementById('btn-editor-back');
  if (editorBack) {
    editorBack.addEventListener('click', () => {
      window.history.pushState({}, '', '/');
      switchView('dashboard');
    });
  }

  const publicBack = document.getElementById('btn-public-back-studio');
  if (publicBack) {
    publicBack.addEventListener('click', () => {
      window.history.pushState({}, '', '/');
      switchView('dashboard');
    });
  }

  // Dashboard Delegation
  const grid = document.getElementById('dashboard-posts-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      const slug = btn.getAttribute('data-slug');

      if (action === 'delete-post') {
        openDeleteModal(id);
      } else if (action === 'edit-post') {
        requestEditPost(id);
      } else if (action === 'copy-link') {
        const url = `${window.location.origin}/p/${slug}`;
        navigator.clipboard.writeText(url).then(() => {
          showToast('Link copied to clipboard', 'success');
        });
      } else if (action === 'preview-post') {
        const p = state.posts.find(item => item.id === id);
        if (p) {
          handlePreviewPost(p);
        }
      }
    });
  }

  // PIN Prompt Modal (Enter PIN to Edit)
  const formPinPrompt = document.getElementById('form-pin-prompt');
  if (formPinPrompt) {
    formPinPrompt.addEventListener('submit', submitEditPinPrompt);
  }

  const cancelPinPromptBtn = document.getElementById('btn-cancel-pin-prompt');
  const modalPinPrompt = document.getElementById('modal-pin-prompt');
  if (cancelPinPromptBtn && modalPinPrompt) {
    cancelPinPromptBtn.addEventListener('click', () => {
      modalPinPrompt.classList.add('hidden');
      pendingEditPostId = null;
    });
  }

  const togglePromptPinBtn = document.getElementById('btn-toggle-prompt-pin-visibility');
  if (togglePromptPinBtn) {
    togglePromptPinBtn.addEventListener('click', () => {
      const pinInput = document.getElementById('input-prompt-pin');
      if (!pinInput) return;
      const isPwd = pinInput.type === 'password';
      pinInput.type = isPwd ? 'text' : 'password';
      togglePromptPinBtn.innerHTML = `<i data-lucide="${isPwd ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>`;
      if (window.lucide) window.lucide.createIcons();
    });
  }

  // Delete Confirmation Modal (Works 100% in iframe sandboxes)
  const confirmDeleteActionBtn = document.getElementById('btn-confirm-delete-action');
  if (confirmDeleteActionBtn) {
    confirmDeleteActionBtn.addEventListener('click', executeDeletePost);
  }

  const cancelDeleteBtn = document.getElementById('btn-cancel-delete');
  const modalConfirmDelete = document.getElementById('modal-confirm-delete');
  if (cancelDeleteBtn && modalConfirmDelete) {
    cancelDeleteBtn.addEventListener('click', () => {
      modalConfirmDelete.classList.add('hidden');
      pendingDeletePostId = null;
    });
  }

  const deletePinInput = document.getElementById('input-delete-pin');
  if (deletePinInput) {
    deletePinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeDeletePost();
      }
    });
  }

  // Editor Inputs
  const titleInp = document.getElementById('editor-input-title');
  const slugInp = document.getElementById('editor-input-slug');
  const pinInp = document.getElementById('editor-input-pin');
  const bodyInp = document.getElementById('editor-input-body');

  if (titleInp && slugInp) {
    titleInp.addEventListener('input', (e) => {
      if (state.activePost) {
        state.activePost.title = e.target.value;
        if (state.isEditingNew) {
          state.activePost.slug = generateSlug(e.target.value);
          slugInp.value = state.activePost.slug;
        }
      }
    });

    slugInp.addEventListener('input', (e) => {
      if (state.activePost) state.activePost.slug = generateSlug(e.target.value);
    });
  }

  if (pinInp) {
    pinInp.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      pinInp.value = val;
      if (state.activePost) state.activePost.code = val;
      updatePinBadge();
    });
  }

  const clearEditorPinBtn = document.getElementById('btn-clear-editor-pin');
  if (clearEditorPinBtn) {
    clearEditorPinBtn.addEventListener('click', () => {
      if (pinInp) pinInp.value = '';
      if (state.activePost) state.activePost.code = '';
      updatePinBadge();
      showToast('PIN removed. Page is now open to anyone.', 'info');
    });
  }

  const toggleEditorPinBtn = document.getElementById('btn-toggle-editor-pin');
  if (toggleEditorPinBtn) {
    toggleEditorPinBtn.addEventListener('click', () => {
      if (!pinInp) return;
      const isPwd = pinInp.type === 'password';
      pinInp.type = isPwd ? 'text' : 'password';
      toggleEditorPinBtn.innerHTML = `<i data-lucide="${isPwd ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>`;
      if (window.lucide) window.lucide.createIcons();
    });
  }

  if (bodyInp) {
    bodyInp.addEventListener('input', (e) => {
      if (state.activePost) state.activePost.description = e.target.value;
    });
  }

  // Toolbar Actions
  document.querySelectorAll('[data-toolbar]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!bodyInp) return;
      const type = btn.getAttribute('data-toolbar');
      const start = bodyInp.selectionStart;
      const end = bodyInp.selectionEnd;
      const selected = bodyInp.value.substring(start, end) || 'text';
      let replacement = selected;

      if (type === 'bold') replacement = `**${selected}**`;
      else if (type === 'italic') replacement = `*${selected}*`;
      else if (type === 'h2') replacement = `\n## ${selected}\n`;
      else if (type === 'h3') replacement = `\n### ${selected}\n`;
      else if (type === 'ul') replacement = `\n- ${selected}`;
      else if (type === 'ol') replacement = `\n1. ${selected}`;
      else if (type === 'quote') replacement = `\n> ${selected}`;
      else if (type === 'link') replacement = `[${selected}](https://)`;

      bodyInp.setRangeText(replacement, start, end, 'end');
      if (state.activePost) state.activePost.description = bodyInp.value;
    });
  });

  const undoBtn = document.getElementById('btn-toolbar-undo');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      document.execCommand('undo');
    });
  }

  // Image Uploads
  const fileInput = document.getElementById('editor-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (!state.activePost.images) state.activePost.images = [];
          state.activePost.images.push({
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            url: event.target.result,
            caption: f.name.replace(/\.[^/.]+$/, "")
          });
          renderImagesSection();
        };
        reader.readAsDataURL(f);
      });
    });
  }

  const imagesGrid = document.getElementById('editor-images-grid');
  if (imagesGrid) {
    imagesGrid.addEventListener('input', (e) => {
      if (e.target.classList.contains('img-label-input')) {
        const idx = parseInt(e.target.getAttribute('data-img-index'), 10);
        if (state.activePost && state.activePost.images[idx]) {
          state.activePost.images[idx].caption = e.target.value;
        }
      }
    });

    imagesGrid.addEventListener('click', (e) => {
      const delBtn = e.target.closest('button[data-del-img]');
      if (delBtn) {
        const idx = parseInt(delBtn.getAttribute('data-del-img'), 10);
        if (state.activePost && state.activePost.images) {
          state.activePost.images.splice(idx, 1);
          renderImagesSection();
        }
      }
    });
  }

  // Links Actions
  const addLinkBtn = document.getElementById('btn-editor-add-link');
  const emptyAddLinkBtn = document.getElementById('btn-empty-add-link');
  [addLinkBtn, emptyAddLinkBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        if (!state.activePost.items) state.activePost.items = [];
        state.activePost.items.push({
          id: 'link_' + Date.now(),
          title: 'Product Link',
          url: 'https://',
          clicks: 0
        });
        renderLinksSection();
      });
    }
  });

  const searchLinksInput = document.getElementById('editor-search-links-input');
  if (searchLinksInput) {
    searchLinksInput.addEventListener('input', (e) => {
      state.linksSearch = e.target.value.trim();
      renderLinksSection();
    });
  }

  const linksContainer = document.getElementById('editor-links-container');
  if (linksContainer) {
    linksContainer.addEventListener('input', (e) => {
      const field = e.target.getAttribute('data-link-field');
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      if (field && !isNaN(idx) && state.activePost && state.activePost.items[idx]) {
        state.activePost.items[idx][field] = e.target.value;
      }
    });

    linksContainer.addEventListener('click', (e) => {
      const delBtn = e.target.closest('button[data-del-link]');
      if (delBtn) {
        const idx = parseInt(delBtn.getAttribute('data-del-link'), 10);
        if (state.activePost && state.activePost.items) {
          state.activePost.items.splice(idx, 1);
          renderLinksSection();
        }
        return;
      }

      const collapseBtn = e.target.closest('button[data-toggle-collapse-link]');
      if (collapseBtn) {
        const linkKey = collapseBtn.getAttribute('data-toggle-collapse-link');
        state.collapsedLinks[linkKey] = !state.collapsedLinks[linkKey];
        renderLinksSection();
        return;
      }

      const unlinkSingleBtn = e.target.closest('button[data-unlink-single-img]');
      if (unlinkSingleBtn) {
        const imgId = unlinkSingleBtn.getAttribute('data-unlink-single-img');
        const linkIdx = parseInt(unlinkSingleBtn.getAttribute('data-link-idx'), 10);
        if (state.activePost && state.activePost.items && state.activePost.items[linkIdx]) {
          const l = state.activePost.items[linkIdx];
          const ids = (l.imageIds || (l.imageId ? [l.imageId] : [])).filter(id => id !== imgId);
          l.imageIds = ids;
          l.imageId = ids[0] || null;
          renderLinksSection();
          showToast('Image unlinked', 'info');
        }
        return;
      }

      const linkImgBtn = e.target.closest('button[data-link-img-btn]');
      if (linkImgBtn) {
        const idx = parseInt(linkImgBtn.getAttribute('data-link-img-btn'), 10);
        openImagePickerModal(idx);
        return;
      }

      const unlinkImgBtn = e.target.closest('button[data-unlink-img-btn]');
      if (unlinkImgBtn) {
        const idx = parseInt(unlinkImgBtn.getAttribute('data-unlink-img-btn'), 10);
        if (state.activePost && state.activePost.items && state.activePost.items[idx]) {
          state.activePost.items[idx].imageIds = [];
          state.activePost.items[idx].imageId = null;
          renderLinksSection();
          showToast('Images unlinked from link', 'info');
        }
        return;
      }
    });
  }

  // Auto-Link by Order
  const autoLinkOrderBtn = document.getElementById('btn-auto-link-order');
  if (autoLinkOrderBtn) {
    autoLinkOrderBtn.addEventListener('click', () => {
      const images = (state.activePost && state.activePost.images) || [];
      const links = (state.activePost && state.activePost.items) || [];

      if (images.length === 0 || links.length === 0) {
        showToast('Add both images and links first', 'info');
        return;
      }

      links.forEach((link, idx) => {
        if (idx < images.length) {
          link.imageIds = [images[idx].id];
          link.imageId = images[idx].id;
        } else {
          link.imageIds = [];
          link.imageId = null;
        }
      });

      renderLinksSection();
      showToast(`Auto-linked ${Math.min(images.length, links.length)} links with images in current order!`, 'success');
    });
  }

  // Toggle Collapse All Links
  const toggleCollapseBtn = document.getElementById('btn-toggle-collapse-links');
  const toggleCollapseText = document.getElementById('toggle-collapse-links-text');
  if (toggleCollapseBtn) {
    toggleCollapseBtn.addEventListener('click', () => {
      const links = (state.activePost && state.activePost.items) || [];
      state.allLinksCollapsed = !state.allLinksCollapsed;
      links.forEach((link, idx) => {
        const key = link.id || String(idx);
        state.collapsedLinks[key] = state.allLinksCollapsed;
      });
      if (toggleCollapseText) {
        toggleCollapseText.textContent = state.allLinksCollapsed ? 'Expand All' : 'Collapse All';
      }
      renderLinksSection();
    });
  }

  // Link Image Modal Close Handlers
  const closeLinkImgBtn = document.getElementById('btn-close-link-image-modal');
  const cancelLinkImgBtn = document.getElementById('btn-cancel-link-image');
  const modalLinkImg = document.getElementById('modal-link-image');
  [closeLinkImgBtn, cancelLinkImgBtn].forEach(b => {
    if (b && modalLinkImg) {
      b.addEventListener('click', () => modalLinkImg.classList.add('hidden'));
    }
  });

  // Paste Links Modal
  const pasteBtn = document.getElementById('btn-editor-paste-links');
  const emptyPasteBtn = document.getElementById('btn-empty-paste-links');
  const pasteModal = document.getElementById('modal-paste-links');
  const closePasteBtn = document.getElementById('btn-close-paste-modal');
  const cancelPasteBtn = document.getElementById('btn-cancel-paste');
  const submitPasteBtn = document.getElementById('btn-submit-paste');
  const pasteTextarea = document.getElementById('textarea-paste-links');

  [pasteBtn, emptyPasteBtn].forEach(b => {
    if (b && pasteModal) {
      b.addEventListener('click', () => {
        if (pasteTextarea) pasteTextarea.value = '';
        pasteModal.classList.remove('hidden');
      });
    }
  });

  [closePasteBtn, cancelPasteBtn].forEach(b => {
    if (b && pasteModal) {
      b.addEventListener('click', () => pasteModal.classList.add('hidden'));
    }
  });

  if (submitPasteBtn && pasteTextarea && pasteModal) {
    submitPasteBtn.addEventListener('click', () => {
      const lines = pasteTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
      if (!state.activePost.items) state.activePost.items = [];

      lines.forEach(line => {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/i);
        if (urlMatch) {
          const url = urlMatch[1];
          let title = line.replace(url, '').replace(/[:\-]/g, '').trim();
          if (!title) title = 'Product';

          state.activePost.items.push({
            id: 'link_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
            title,
            url,
            clicks: 0
          });
        }
      });

      renderLinksSection();
      pasteModal.classList.add('hidden');
      showToast('Links imported', 'success');
    });
  }

  // Save Draft & Activate Public Link
  const saveDraftBtn = document.getElementById('btn-editor-save-draft');
  const activatePublicBtn = document.getElementById('btn-editor-activate-public');

  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', () => savePost('draft'));
  }

  if (activatePublicBtn) {
    activatePublicBtn.addEventListener('click', () => savePost('active'));
  }

  // Preview Button Handler (Opens Real Page in a New Tab if Active, warns if Draft)
  const previewBtn = document.getElementById('btn-editor-preview');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      // Sync current editor inputs into state.activePost first
      if (state.activePost) {
        const titleInput = document.getElementById('editor-input-title');
        const pinInput = document.getElementById('editor-input-pin');
        const bodyInput = document.getElementById('editor-input-body');
        if (titleInput && titleInput.value.trim()) state.activePost.title = titleInput.value.trim();
        if (pinInput) state.activePost.code = pinInput.value.trim();
        if (bodyInput) state.activePost.description = bodyInput.value;
      }
      handlePreviewPost(state.activePost);
    });
  }

  // Keypad
  document.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-key');
      handleKeypad(k);
    });
  });

  // Lightbox Modal Controls
  const closeLightboxBtn = document.getElementById('btn-close-lightbox');
  const modalLightbox = document.getElementById('modal-image-lightbox');
  const prevLightboxBtn = document.getElementById('btn-lightbox-prev');
  const nextLightboxBtn = document.getElementById('btn-lightbox-next');
  const lightboxBuyBtn = document.getElementById('lightbox-product-link');

  if (closeLightboxBtn) {
    closeLightboxBtn.addEventListener('click', closeLightbox);
  }
  if (modalLightbox) {
    modalLightbox.addEventListener('click', (e) => {
      if (e.target === modalLightbox) closeLightbox();
    });
  }
  if (prevLightboxBtn) {
    prevLightboxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      prevLightbox();
    });
  }
  if (nextLightboxBtn) {
    nextLightboxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      nextLightbox();
    });
  }
  if (lightboxBuyBtn) {
    lightboxBuyBtn.addEventListener('click', () => {
      const linkId = lightboxBuyBtn.getAttribute('data-link-id');
      if (state.activePost && linkId) recordClick(state.activePost, linkId);
    });
  }

  // Keypad & Lightbox Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If lightbox is open:
    if (modalLightbox && !modalLightbox.classList.contains('hidden')) {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') prevLightbox();
      else if (e.key === 'ArrowRight') nextLightbox();
      return;
    }

    if (state.view === 'public' && !state.publicUnlocked && state.activePost && state.activePost.code) {
      if (/^[0-9]$/.test(e.key)) handleKeypad(e.key);
      else if (e.key === 'Backspace') handleKeypad('clear');
      else if (e.key === 'Enter') handleKeypad('enter');
    }
  });

  window.addEventListener('popstate', handleRoute);
  window.addEventListener('hashchange', handleRoute);
}

function handlePreviewPost(post) {
  if (!post) {
    showToast('No post available to preview', 'error');
    return;
  }

  // If the post is currently being created or is a draft (not activated)
  if (post.theme !== 'active') {
    showToast('This post is still a Draft. Please activate the public link to view the real page.', 'error');
    return;
  }

  // Ensure slug exists
  const slug = post.slug || generateSlug(post.title || 'post');
  const targetUrl = `${window.location.origin}/p/${slug}`;

  // Open the real landing page in a new browser tab
  const newTab = window.open(targetUrl, '_blank');
  if (newTab) {
    newTab.focus();
    showToast('Opening real public page in new tab...', 'success');
  } else {
    // If popup blocker intervened, provide fall-back navigation
    showToast('Popup blocked. Click "Copy Link" to view in a new tab.', 'info');
  }
}

// =============================================================================
// 10. INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  attachEvents();
  handleRoute();
  fetchPosts();
});
