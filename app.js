/* ============================================================
   Shelf — a minimalist book journal (PWA)
   Vanilla JS, no build step. State lives in localStorage.
   ============================================================ */

(() => {
  'use strict';

  const APP = document.getElementById('app');
  const STORE_KEY = 'shelf.v1';
  const OL = 'https://openlibrary.org';
  const COVER = 'https://covers.openlibrary.org/b/id';

  /* ---------- State ---------- */
  const defaultState = { name: '', books: [] };
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign({}, defaultState, JSON.parse(raw));
    } catch (_) {}
    return Object.assign({}, defaultState);
  }
  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function findBook(key) { return state.books.find((b) => b.key === key); }

  /* ---------- Tiny helpers ---------- */
  const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const coverUrl = (id, size) =>
    id ? `${COVER}/${id}-${size}.jpg` : '';

  function authorLine(a) {
    if (!a) return 'Unknown author';
    if (Array.isArray(a)) return a.slice(0, 2).join(', ') || 'Unknown author';
    return a;
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = el('<div class="toast"></div>'); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  /* ---------- Cover element with graceful fallback ---------- */
  function coverEl(book, size) {
    const id = book.coverId;
    if (id) {
      const img = el(`<img class="cover" alt="${esc(book.title)} cover"
        src="${coverUrl(id, size)}" loading="lazy" />`);
      img.onerror = () => img.replaceWith(fallbackCover(book));
      return img;
    }
    return fallbackCover(book);
  }
  function fallbackCover(book) {
    return el(`<div class="cover cover-fallback">${esc(book.title || 'Untitled')}</div>`);
  }

  /* ============================================================
     ROUTING — very small hash-free view switcher
     ============================================================ */
  function render() {
    if (!state.name) return renderOnboard();
    return renderHome();
  }

  function setView(node) {
    APP.innerHTML = '';
    node.classList.add('fade-in');
    APP.appendChild(node);
    window.scrollTo(0, 0);
  }

  /* ============================================================
     ONBOARDING — ask name + Safari install instructions
     ============================================================ */
  function renderOnboard() {
    const view = el(`
      <div class="onboard">
        <img class="logo" src="icons/icon-192.png" alt="Shelf" />
        <h1>Welcome to Shelf</h1>
        <p class="sub">A quiet place to keep the books you've read — rate them, review them, and find what to read next.</p>
        <input class="field" id="name-input" type="text" autocomplete="given-name"
          placeholder="What's your name?" maxlength="40" />
        <button class="btn btn-block" id="start-btn">Get Started</button>

        <div class="install-card">
          <h3>Add Shelf to your Home Screen</h3>
          <div class="install-step"><span class="num">1</span><span>Tap the <span class="share-icon">Share ⬆️</span> button in Safari</span></div>
          <div class="install-step"><span class="num">2</span><span>Scroll down and tap <b>Add to Home Screen</b></span></div>
          <div class="install-step"><span class="num">3</span><span>Tap <b>Add</b> — Shelf opens like a real app</span></div>
        </div>
      </div>
    `);

    const input = view.querySelector('#name-input');
    const start = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); toast('Please enter your name'); return; }
      state.name = name;
      saveState();
      render();
    };
    view.querySelector('#start-btn').addEventListener('click', start);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });

    setView(view);
    setTimeout(() => input.focus(), 150);
  }

  /* ============================================================
     HOME — greeting, search entry, your shelf
     ============================================================ */
  function renderHome() {
    const view = el(`
      <div>
        <div class="app-header">
          <h1>Shelf</h1>
          <span class="greeting">Hi, ${esc(state.name)} 👋</span>
        </div>

        <div class="search-bar">
          <span class="icon">🔍</span>
          <input id="home-search" type="search" inputmode="search"
            placeholder="Search for a book or author…" />
        </div>

        <h2 class="section-title">Your Shelf</h2>
        <div id="shelf"></div>
      </div>
    `);

    const search = view.querySelector('#home-search');
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && search.value.trim()) renderSearch(search.value.trim());
    });
    // Live search on input (debounced).
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      const q = search.value.trim();
      if (q.length < 2) return;
      timer = setTimeout(() => renderSearch(q, search.value), 450);
    });

    const shelf = view.querySelector('#shelf');
    if (state.books.length === 0) {
      shelf.appendChild(el(`
        <div class="empty">
          <div class="big">📚</div>
          <h3>No books yet</h3>
          <p>Search above to find a book you've read and add it to your shelf.</p>
        </div>
      `));
    } else {
      const grid = el('<div class="book-grid"></div>');
      // Most recently added first.
      [...state.books].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
        .forEach((b) => grid.appendChild(shelfCard(b)));
      shelf.appendChild(grid);
    }

    setView(view);
  }

  function shelfCard(book) {
    const card = el(`<button class="book-card"></button>`);
    card.appendChild(coverEl(book, 'M'));
    card.appendChild(el(`<div class="b-title">${esc(book.title)}</div>`));
    card.appendChild(el(`<div class="b-author">${esc(authorLine(book.author))}</div>`));
    if (book.rating) {
      card.appendChild(el(`<div class="b-mini-stars">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>`));
    }
    card.addEventListener('click', () => renderDetail(book, { fromShelf: true }));
    return card;
  }

  /* ============================================================
     SEARCH — Open Library lookup with cover images
     ============================================================ */
  let searchSeq = 0;
  async function renderSearch(query, prefill) {
    const mySeq = ++searchSeq;
    const view = el(`
      <div>
        <div class="navbar">
          <button class="btn-text back" id="back">‹ Shelf</button>
        </div>
        <div class="search-bar">
          <span class="icon">🔍</span>
          <input id="q" type="search" inputmode="search" placeholder="Search for a book or author…" />
        </div>
        <div id="results"></div>
      </div>
    `);
    const input = view.querySelector('#q');
    input.value = prefill != null ? prefill : query;
    const results = view.querySelector('#results');
    results.appendChild(el('<div class="spinner"></div>'));

    view.querySelector('#back').addEventListener('click', renderHome);
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      timer = setTimeout(() => doSearch(q, results, () => mySeq === searchSeq), 400);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(timer); doSearch(input.value.trim(), results, () => mySeq === searchSeq); }
    });

    setView(view);
    doSearch(query, results, () => mySeq === searchSeq);
  }

  async function searchBooks(query) {
    const url = `${OL}/search.json?q=${encodeURIComponent(query)}&limit=24&fields=key,title,author_name,cover_i,first_publish_year,subject`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('search failed');
    const data = await res.json();
    return (data.docs || []).map(mapDoc).filter((b) => b.title);
  }

  function mapDoc(d) {
    return {
      key: d.key,
      title: d.title,
      author: d.author_name || null,
      coverId: d.cover_i || null,
      year: d.first_publish_year || null,
      subjects: Array.isArray(d.subject) ? d.subject.slice(0, 8) : null
    };
  }

  async function doSearch(query, container, isCurrent) {
    if (!query || query.length < 2) return;
    container.innerHTML = '';
    container.appendChild(el('<div class="spinner"></div>'));
    try {
      const books = await searchBooks(query);
      if (!isCurrent()) return;
      container.innerHTML = '';
      if (books.length === 0) {
        container.appendChild(el(`
          <div class="empty">
            <div class="big">🔍</div>
            <h3>No results</h3>
            <p>Try a different title or author.</p>
          </div>`));
        return;
      }
      const grid = el('<div class="book-grid"></div>');
      books.forEach((b) => {
        const existing = findBook(b.key);
        grid.appendChild(searchCard(existing ? Object.assign({}, b, existing) : b));
      });
      container.appendChild(grid);
    } catch (err) {
      if (!isCurrent()) return;
      container.innerHTML = '';
      container.appendChild(el(`
        <div class="empty">
          <div class="big">📡</div>
          <h3>Couldn't reach the library</h3>
          <p>Check your connection and try again.</p>
        </div>`));
    }
  }

  function searchCard(book) {
    const card = el(`<button class="book-card"></button>`);
    card.appendChild(coverEl(book, 'M'));
    card.appendChild(el(`<div class="b-title">${esc(book.title)}</div>`));
    card.appendChild(el(`<div class="b-author">${esc(authorLine(book.author))}</div>`));
    if (book.rating) {
      card.appendChild(el(`<div class="b-mini-stars">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>`));
    }
    card.addEventListener('click', () => renderDetail(book, {}));
    return card;
  }

  /* ============================================================
     DETAIL — rate, review, save + similar-book recommendations
     ============================================================ */
  function renderDetail(book, opts) {
    opts = opts || {};
    const saved = findBook(book.key);
    const merged = saved ? Object.assign({}, book, saved) : Object.assign({}, book);
    let rating = merged.rating || 0;

    const view = el(`
      <div>
        <div class="navbar">
          <button class="btn-text back" id="back">‹ Back</button>
          <span id="remove-slot"></span>
        </div>

        <div class="detail-top">
          <div id="cover-slot"></div>
          <div class="detail-meta">
            <h2>${esc(merged.title)}</h2>
            <div class="author">${esc(authorLine(merged.author))}</div>
            ${merged.year ? `<div class="year">First published ${esc(merged.year)}</div>` : ''}
            <div id="badge-slot"></div>
          </div>
        </div>

        <div class="rate-block">
          <label>Your rating</label>
          <div class="stars" id="stars"></div>
          <textarea class="review-input" id="review"
            placeholder="Write a few thoughts about this book…">${esc(merged.review || '')}</textarea>
          <div class="detail-actions">
            <button class="btn btn-block" id="save">${saved ? 'Update' : 'Add to Shelf'}</button>
          </div>
        </div>

        <h2 class="section-title">You might also like</h2>
        <div id="similar"><div class="spinner"></div></div>
      </div>
    `);

    view.querySelector('#cover-slot').appendChild(coverEl(merged, 'L'));
    view.querySelector('#back').addEventListener('click', () =>
      opts.fromShelf ? renderHome() : window.history.length ? renderHomeOrBack() : renderHome());

    // Read badge + remove button when already on shelf.
    if (saved) {
      view.querySelector('#badge-slot').appendChild(el('<span class="read-badge">✓ On your shelf</span>'));
      const remove = el('<button class="btn-text" id="remove" style="color:var(--text-secondary)">Remove</button>');
      remove.addEventListener('click', () => {
        state.books = state.books.filter((b) => b.key !== merged.key);
        saveState();
        toast('Removed from shelf');
        renderHome();
      });
      view.querySelector('#remove-slot').appendChild(remove);
    }

    // Stars
    const starsWrap = view.querySelector('#stars');
    function paintStars() {
      starsWrap.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const s = el(`<button class="star ${i <= rating ? 'on' : ''}" aria-label="${i} star">★</button>`);
        s.addEventListener('click', () => {
          rating = (rating === i) ? 0 : i;  // tap same star again to clear
          paintStars();
        });
        starsWrap.appendChild(s);
      }
    }
    paintStars();

    // Save / update
    view.querySelector('#save').addEventListener('click', () => {
      const review = view.querySelector('#review').value.trim();
      const record = {
        key: merged.key,
        title: merged.title,
        author: merged.author,
        coverId: merged.coverId || null,
        year: merged.year || null,
        subjects: merged.subjects || null,
        rating,
        review,
        addedAt: saved && saved.addedAt ? saved.addedAt : Date.now(),
        updatedAt: Date.now()
      };
      const idx = state.books.findIndex((b) => b.key === merged.key);
      if (idx >= 0) state.books[idx] = record; else state.books.push(record);
      saveState();
      toast(saved ? 'Updated ✓' : 'Added to your shelf ✓');
      renderHome();
    });

    setView(view);
    loadSimilar(merged, view.querySelector('#similar'));
  }

  function renderHomeOrBack() { renderHome(); }

  /* ---------- Similar books (recommendations) ---------- */
  async function loadSimilar(book, container) {
    try {
      const recs = await getSimilar(book);
      container.innerHTML = '';
      if (!recs.length) {
        container.appendChild(el(`<p class="hint">No recommendations found for this one.</p>`));
        return;
      }
      const grid = el('<div class="book-grid"></div>');
      recs.forEach((b) => {
        const existing = findBook(b.key);
        grid.appendChild(searchCard(existing ? Object.assign({}, b, existing) : b));
      });
      container.appendChild(grid);
    } catch (_) {
      container.innerHTML = '';
      container.appendChild(el(`<p class="hint">Couldn't load recommendations right now.</p>`));
    }
  }

  async function getSimilar(book) {
    let subjects = book.subjects;
    // If we don't have subjects yet, fetch the work record to get them.
    if ((!subjects || !subjects.length) && book.key) {
      try {
        const res = await fetch(`${OL}${book.key}.json`);
        if (res.ok) {
          const w = await res.json();
          if (Array.isArray(w.subjects)) subjects = w.subjects;
        }
      } catch (_) {}
    }

    const seen = new Set([book.key]);
    const out = [];
    const add = (books) => {
      for (const b of books) {
        if (!b.title || seen.has(b.key)) continue;
        seen.add(b.key);
        out.push(b);
        if (out.length >= 12) break;
      }
    };

    // 1) Prefer books that share a subject/genre.
    if (subjects && subjects.length) {
      const subject = pickSubject(subjects);
      if (subject) {
        try {
          const res = await fetch(
            `${OL}/search.json?subject=${encodeURIComponent(subject)}&limit=20&sort=rating&fields=key,title,author_name,cover_i,first_publish_year,subject`
          );
          if (res.ok) {
            const data = await res.json();
            add((data.docs || []).filter((d) => d.cover_i).map(mapDoc));
          }
        } catch (_) {}
      }
    }

    // 2) Fall back / top up with other books by the same author.
    if (out.length < 6 && book.author) {
      const author = Array.isArray(book.author) ? book.author[0] : book.author;
      try {
        const res = await fetch(
          `${OL}/search.json?author=${encodeURIComponent(author)}&limit=16&fields=key,title,author_name,cover_i,first_publish_year,subject`
        );
        if (res.ok) {
          const data = await res.json();
          add((data.docs || []).filter((d) => d.cover_i).map(mapDoc));
        }
      } catch (_) {}
    }

    return out.slice(0, 8);
  }

  // Skip overly generic catalog subjects; prefer a meaningful genre.
  function pickSubject(subjects) {
    const banned = /(accessible book|protected daisy|in library|large type|overdrive|reading level|fiction in english|popular print|new york times)/i;
    const cleaned = subjects
      .map((s) => String(s).trim())
      .filter((s) => s && s.length < 40 && !banned.test(s));
    return cleaned[0] || subjects[0] || null;
  }

  /* ============================================================
     VERSION FOOTER
     ============================================================ */
  function paintVersion() {
    const v = (window.APP_VERSION || '0.0.0');
    const footer = document.getElementById('version-footer');
    if (footer) footer.textContent = `Shelf · v${v}`;
  }

  /* ============================================================
     SERVICE WORKER — register + auto-reload once on new version
     ============================================================ */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    // When the active service worker changes (a new version took control),
    // reload the page exactly once so the user is on the latest version
    // without manually refreshing or reinstalling.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // If an updated worker is found, ask it to activate immediately.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              nw.postMessage('SKIP_WAITING');
            }
          });
        });
        // Proactively check for a newer version on each load.
        reg.update();
      }).catch(() => {});
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  paintVersion();
  registerSW();
  render();
})();
