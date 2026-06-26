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
  const defaultState = {
    name: '',
    books: [],
    ui: { filter: 'all', sort: 'recent' },
    goals: { daily: 0, weekly: 0, monthly: 0 }
  };
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = Object.assign({}, defaultState, JSON.parse(raw));
        s.ui = Object.assign({}, defaultState.ui, s.ui);
        s.goals = Object.assign({}, defaultState.goals, s.goals);
        return s;
      }
    } catch (_) {}
    return JSON.parse(JSON.stringify(defaultState));
  }
  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function findBook(key) { return state.books.find((b) => b.key === key); }

  // Status is one of 'want' | 'reading' | 'read'. Books saved before these
  // existed (no status field) are treated as read.
  function bookStatus(b) {
    return b.status === 'want' || b.status === 'reading' ? b.status : 'read';
  }
  // A comparable timestamp for "recent" sorting: finished, else started, else added.
  function bookTime(b) {
    const d = b.finishedAt || b.startedAt;
    if (d) { const t = Date.parse(d); if (!isNaN(t)) return t; }
    return b.addedAt || 0;
  }
  const isoOf = (d) => {
    // Local-date ISO (YYYY-MM-DD), not UTC, so "today" matches the user's clock.
    const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return x.toISOString().slice(0, 10);
  };
  const todayISO = () => isoOf(new Date());
  function formatDate(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /* ---------- Goal periods (week starts Monday) ---------- */
  function periodBounds(period) {
    const now = new Date();
    const dow = now.getDay();                 // 0=Sun … 6=Sat
    if (period === 'daily') {
      return { start: todayISO(), end: todayISO(), daysLeft: 1, label: 'Today' };
    }
    if (period === 'weekly') {
      const fromMon = (dow + 6) % 7;          // days since Monday
      const start = new Date(now); start.setDate(now.getDate() - fromMon);
      const daysLeft = 7 - fromMon;           // includes today
      return { start: isoOf(start), end: todayISO(), daysLeft, label: 'This Week' };
    }
    // monthly
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;   // includes today
    return { start: isoOf(start), end: todayISO(), daysLeft, label: 'This Month' };
  }

  // Count read books finished within [start, end] (inclusive, ISO strings).
  function booksFinishedIn(start, end) {
    return state.books.filter((b) =>
      bookStatus(b) === 'read' && b.finishedAt && b.finishedAt >= start && b.finishedAt <= end
    ).length;
  }

  // Format a per-day pace number cleanly (e.g. 1, 1.5, 0.3).
  function fmtPace(n) {
    return (Math.round(n * 10) / 10).toString();
  }

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

  /* ---------- Inline line icons (stroke = currentColor) ---------- */
  const ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 4.5V21.5"/></svg>',
    offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a7 7 0 0 1 11-2"/><path d="M8.5 16.5a4 4 0 0 1 6 0"/><circle cx="12" cy="20" r="0.6" fill="currentColor"/><path d="M3 3l18 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>'
  };
  const icon = (name) => `<span class="ico">${ICON[name] || ''}</span>`;

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
          <div class="install-step"><span class="num">1</span><span>Tap the <span class="share-pill">${icon('share')} Share</span> button in Safari</span></div>
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
          <h1 class="wordmark">Shelf</h1>
          <span class="greeting">Hi, ${esc(state.name)}</span>
        </div>

        <div class="search-bar">
          <span class="icon">${ICON.search}</span>
          <input id="home-search" type="search" inputmode="search"
            placeholder="Search for a book or author…" />
        </div>

        <div id="goals"></div>

        <h2 class="section-title">Your Shelf</h2>
        <p class="shelf-stats" id="stats"></p>
        <div class="shelf-controls" id="controls"></div>
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

    paintGoals(view.querySelector('#goals'));
    paintStats(view.querySelector('#stats'));
    buildControls(view.querySelector('#controls'), view.querySelector('#shelf'));
    paintShelf(view.querySelector('#shelf'));

    setView(view);
  }

  /* ============================================================
     GOALS — daily / weekly / monthly reading targets + pace
     ============================================================ */
  const GOAL_PERIODS = [
    ['daily', 'Daily', 'day'],
    ['weekly', 'Weekly', 'week'],
    ['monthly', 'Monthly', 'month']
  ];

  // Build the "X to go · ≈Y/day" pace line for a goal.
  function goalPaceText(period, goal, done) {
    const remaining = goal - done;
    if (remaining <= 0) return { reached: true, text: 'Goal reached 🎉' };
    const noun = remaining === 1 ? 'book' : 'books';
    if (period === 'daily') {
      return { reached: false, text: `${remaining} more ${noun} to hit today's goal` };
    }
    const { daysLeft } = periodBounds(period);
    if (daysLeft <= 1) {
      return { reached: false, text: `${remaining} more ${noun} to read today` };
    }
    const pace = remaining / daysLeft;
    const dayWord = daysLeft === 1 ? 'day' : 'days';
    if (pace <= 1) {
      return { reached: false, text: `${remaining} to go · about 1 a day over the next ${daysLeft} ${dayWord}` };
    }
    return { reached: false, text: `${remaining} to go · ≈${fmtPace(pace)} books/day over the next ${daysLeft} ${dayWord}` };
  }

  function paintGoals(node) {
    node.innerHTML = '';
    const active = GOAL_PERIODS.filter(([key]) => state.goals[key] > 0);

    const card = el('<div class="goals-card"></div>');
    const head = el(`
      <div class="goals-head">
        <span class="goals-title">${ICON.target} Reading Goals</span>
        <button class="btn-text goals-edit">${active.length ? 'Edit' : ''}</button>
      </div>
    `);
    head.querySelector('.goals-edit').addEventListener('click', renderGoals);
    card.appendChild(head);

    if (active.length === 0) {
      const empty = el(`
        <div class="goals-empty">
          <p>Set a daily, weekly, or monthly goal to keep your reading on pace.</p>
          <button class="btn goals-set">Set a Goal</button>
        </div>
      `);
      empty.querySelector('.goals-set').addEventListener('click', renderGoals);
      card.appendChild(empty);
    } else {
      active.forEach(([key, , unit]) => {
        const goal = state.goals[key];
        const { start, end, label } = periodBounds(key);
        const done = booksFinishedIn(start, end);
        const pace = goalPaceText(key, goal, done);
        const pct = Math.max(0, Math.min(1, done / goal));
        const row = el(`
          <div class="goal-row ${pace.reached ? 'reached' : ''}">
            <div class="goal-row-top">
              <span class="goal-label">${label}</span>
              <span class="goal-count">${done} / ${goal} ${goal === 1 ? 'book' : 'books'}</span>
            </div>
            <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct * 100}%"></div></div>
            <div class="goal-pace">${pace.text}</div>
          </div>
        `);
        card.appendChild(row);
      });
    }
    node.appendChild(card);
  }

  /* ---------- Goals editor ---------- */
  function renderGoals() {
    const draft = Object.assign({}, state.goals);

    const view = el(`
      <div>
        <div class="navbar">
          <button class="btn-text back" id="back">${ICON.chevron} Shelf</button>
        </div>
        <h2 class="section-title" style="margin-top:6px">Reading Goals</h2>
        <p class="hint" style="margin:-8px 2px 20px">Set how many books you'd like to finish. We'll show the daily pace you need to stay on track.</p>
        <div id="goal-fields"></div>
        <div class="detail-actions" style="margin-top:24px">
          <button class="btn btn-block" id="save-goals">Save Goals</button>
        </div>
      </div>
    `);

    view.querySelector('#back').addEventListener('click', renderHome);
    const fields = view.querySelector('#goal-fields');

    GOAL_PERIODS.forEach(([key, label, unit]) => {
      const field = el(`
        <div class="goal-field">
          <div class="goal-field-main">
            <div>
              <div class="goal-field-label">${label}</div>
              <div class="goal-field-sub">books per ${unit}</div>
            </div>
            <div class="stepper">
              <button class="step-btn" data-d="-1" aria-label="decrease">−</button>
              <span class="step-val">${draft[key]}</span>
              <button class="step-btn" data-d="1" aria-label="increase">+</button>
            </div>
          </div>
          <div class="goal-field-pace"></div>
        </div>
      `);

      const valEl = field.querySelector('.step-val');
      const paceEl = field.querySelector('.goal-field-pace');

      const refresh = () => {
        valEl.textContent = draft[key];
        // Live pace preview for week/month, based on what's already read this period.
        if ((key === 'weekly' || key === 'monthly') && draft[key] > 0) {
          const { start, end, daysLeft } = periodBounds(key);
          const done = booksFinishedIn(start, end);
          const remaining = Math.max(0, draft[key] - done);
          if (remaining === 0) {
            paceEl.textContent = `Already reached — ${done} read this ${unit}.`;
          } else {
            const pace = remaining / daysLeft;
            const paceStr = pace <= 1 ? 'about 1' : `≈${fmtPace(pace)}`;
            paceEl.textContent = `${paceStr} book${pace > 1 ? 's' : ''}/day for the next ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;
          }
          paceEl.style.display = '';
        } else {
          paceEl.style.display = 'none';
        }
      };
      refresh();

      field.querySelectorAll('.step-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const d = parseInt(btn.dataset.d, 10);
          draft[key] = Math.max(0, Math.min(99, (draft[key] || 0) + d));
          refresh();
        });
      });
      fields.appendChild(field);
    });

    view.querySelector('#save-goals').addEventListener('click', () => {
      state.goals = draft;
      saveState();
      const any = draft.daily || draft.weekly || draft.monthly;
      toast(any ? 'Goals saved ✓' : 'Goals cleared');
      renderHome();
    });

    setView(view);
  }

  /* ---------- Shelf stats line ---------- */
  function paintStats(node) {
    const read = state.books.filter((b) => bookStatus(b) === 'read');
    const reading = state.books.filter((b) => bookStatus(b) === 'reading');
    const want = state.books.filter((b) => bookStatus(b) === 'want');
    const rated = read.filter((b) => b.rating > 0);
    if (state.books.length === 0) { node.textContent = ''; return; }
    const parts = [];
    parts.push(`${read.length} ${read.length === 1 ? 'book' : 'books'} read`);
    if (rated.length) {
      const avg = rated.reduce((s, b) => s + b.rating, 0) / rated.length;
      parts.push(`${avg.toFixed(1)}★ average`);
    }
    if (reading.length) parts.push(`${reading.length} reading`);
    if (want.length) parts.push(`${want.length} to read`);
    node.textContent = parts.join('  ·  ');
  }

  /* ---------- Filter + sort controls ---------- */
  const SORTS = [
    ['recent', 'Recently added'],
    ['rating', 'Highest rated'],
    ['title', 'Title'],
    ['author', 'Author']
  ];
  function buildControls(node, shelfNode) {
    node.innerHTML = '';
    if (state.books.length === 0) return;

    const filters = [
      ['all', 'All'],
      ['reading', 'Reading'],
      ['read', 'Read'],
      ['want', 'Want to Read']
    ];
    const chips = el('<div class="chips"></div>');
    filters.forEach(([key, label]) => {
      const chip = el(`<button class="chip ${state.ui.filter === key ? 'on' : ''}">${label}</button>`);
      chip.addEventListener('click', () => {
        state.ui.filter = key; saveState();
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        paintShelf(shelfNode);
      });
      chips.appendChild(chip);
    });

    const sortWrap = el('<div class="sort-wrap"></div>');
    const options = SORTS.map(([k, l]) =>
      `<option value="${k}" ${state.ui.sort === k ? 'selected' : ''}>${l}</option>`).join('');
    const select = el(`<select class="sort-select" aria-label="Sort books">${options}</select>`);
    select.addEventListener('change', () => {
      state.ui.sort = select.value; saveState();
      paintShelf(shelfNode);
    });
    sortWrap.appendChild(select);

    node.appendChild(chips);
    node.appendChild(sortWrap);
  }

  /* ---------- Shelf grid (filtered + sorted) ---------- */
  function paintShelf(node) {
    node.innerHTML = '';
    if (state.books.length === 0) {
      node.appendChild(el(`
        <div class="empty">
          <div class="glyph">${ICON.book}</div>
          <h3>No books yet</h3>
          <p>Search above to find a book you've read and add it to your shelf.</p>
        </div>
      `));
      return;
    }

    let books = state.books.slice();
    const f = state.ui.filter;
    if (f === 'read' || f === 'want' || f === 'reading') books = books.filter((b) => bookStatus(b) === f);

    const titleKey = (b) => (b.title || '').toLowerCase();
    const authorKey = (b) => {
      const a = Array.isArray(b.author) ? b.author[0] : b.author;
      return (a || '￿').toLowerCase(); // unknown authors sort last
    };
    const sorters = {
      recent: (a, b) => bookTime(b) - bookTime(a),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || bookTime(b) - bookTime(a),
      title: (a, b) => titleKey(a).localeCompare(titleKey(b)),
      author: (a, b) => authorKey(a).localeCompare(authorKey(b)) || titleKey(a).localeCompare(titleKey(b))
    };
    books.sort(sorters[state.ui.sort] || sorters.recent);

    if (books.length === 0) {
      node.appendChild(el(`
        <div class="empty">
          <div class="glyph">${ICON.book}</div>
          <h3>${f === 'want' ? 'Nothing on your list yet'
            : f === 'reading' ? 'Not reading anything yet'
            : 'No books here'}</h3>
          <p>${f === 'want'
            ? 'Find a book and mark it “Want to Read” to save it for later.'
            : f === 'reading'
            ? 'Open a book and mark it “Reading” to track it here.'
            : 'Try a different filter.'}</p>
        </div>
      `));
      return;
    }

    const grid = el('<div class="book-grid"></div>');
    books.forEach((b) => grid.appendChild(shelfCard(b)));
    node.appendChild(grid);
  }

  function shelfCard(book) {
    const card = el(`<button class="book-card"></button>`);
    card.appendChild(coverEl(book, 'M'));
    card.appendChild(el(`<div class="b-title">${esc(book.title)}</div>`));
    card.appendChild(el(`<div class="b-author">${esc(authorLine(book.author))}</div>`));
    const status = bookStatus(book);
    if (status === 'want') {
      card.appendChild(el(`<div class="b-want">${ICON.bookmark} Want to read</div>`));
    } else if (status === 'reading') {
      card.appendChild(el(`<div class="b-reading">${ICON.book} Reading</div>`));
      if (book.startedAt) {
        card.appendChild(el(`<div class="b-author" style="margin-top:3px">Since ${esc(formatDate(book.startedAt))}</div>`));
      }
    } else if (book.rating) {
      card.appendChild(el(`<div class="b-mini-stars">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</div>`));
      if (book.finishedAt) {
        card.appendChild(el(`<div class="b-author" style="margin-top:3px">${esc(formatDate(book.finishedAt))}</div>`));
      }
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
          <button class="btn-text back" id="back">${ICON.chevron} Shelf</button>
        </div>
        <div class="search-bar">
          <span class="icon">${ICON.search}</span>
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
            <div class="glyph">${ICON.search}</div>
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
          <div class="glyph">${ICON.offline}</div>
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
    let currentStatus = bookStatus(merged);  // 'want' | 'reading' | 'read'

    const view = el(`
      <div>
        <div class="navbar">
          <button class="btn-text back" id="back">${ICON.chevron} Back</button>
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
          <label>Status</label>
          <div class="status-toggle status-toggle-3" id="status-toggle">
            <button class="status-btn" data-s="want">Want to Read</button>
            <button class="status-btn" data-s="reading">Reading</button>
            <button class="status-btn" data-s="read">Read</button>
          </div>

          <div id="rating-row">
            <label style="display:block;margin-top:18px">Your rating</label>
            <div class="stars" id="stars"></div>
            <textarea class="review-input" id="review"
              placeholder="Write a few thoughts about this book…">${esc(merged.review || '')}</textarea>
          </div>

          <div class="date-row" id="started-row">
            <label for="started">${ICON.calendar} Started</label>
            <input class="date-input" type="date" id="started"
              value="${esc(merged.startedAt || '')}" max="${todayISO()}" />
          </div>

          <div class="date-row" id="finished-row">
            <label for="finished">${ICON.calendar} Finished</label>
            <input class="date-input" type="date" id="finished"
              value="${esc(merged.finishedAt || '')}" max="${todayISO()}" />
          </div>

          <div class="detail-actions">
            <button class="btn btn-block" id="save"></button>
          </div>
        </div>

        <h2 class="section-title">You might also like</h2>
        <div id="similar"><div class="spinner"></div></div>
      </div>
    `);

    view.querySelector('#cover-slot').appendChild(coverEl(merged, 'L'));
    view.querySelector('#back').addEventListener('click', () => renderHome());

    // On-shelf badge + remove button.
    const badgeSlot = view.querySelector('#badge-slot');
    function paintBadge() {
      if (!saved) { badgeSlot.innerHTML = ''; return; }
      const map = {
        want: `${ICON.bookmark} Want to Read`,
        reading: `${ICON.book} Currently Reading`,
        read: `${ICON.check} Read`
      };
      badgeSlot.innerHTML = `<span class="read-badge">${map[currentStatus]}</span>`;
    }
    if (saved) {
      const remove = el('<button class="btn-text" style="color:var(--text-secondary)">Remove</button>');
      remove.addEventListener('click', () => {
        state.books = state.books.filter((b) => b.key !== merged.key);
        saveState();
        toast('Removed from shelf');
        renderHome();
      });
      view.querySelector('#remove-slot').appendChild(remove);
    }

    // Show only the fields relevant to the chosen status.
    const ratingRow = view.querySelector('#rating-row');
    const startedRow = view.querySelector('#started-row');
    const finishedRow = view.querySelector('#finished-row');
    const startedInput = view.querySelector('#started');
    const finishedInput = view.querySelector('#finished');
    const saveBtn = view.querySelector('#save');

    function applyStatus() {
      const isWant = currentStatus === 'want';
      const isReading = currentStatus === 'reading';
      const isRead = currentStatus === 'read';

      ratingRow.style.display = isRead ? '' : 'none';
      startedRow.style.display = (isReading || isRead) ? '' : 'none';
      finishedRow.style.display = isRead ? '' : 'none';

      // Sensible date defaults the first time a status is chosen.
      if ((isReading || isRead) && !startedInput.value && !merged.startedAt) {
        startedInput.value = isReading ? todayISO() : '';
      }
      if (isReading && !startedInput.value) startedInput.value = todayISO();
      if (isRead && !finishedInput.value) finishedInput.value = merged.finishedAt || todayISO();

      saveBtn.textContent = saved ? 'Update'
        : isWant ? 'Add to Want to Read'
        : isReading ? 'Start Reading'
        : 'Add to Shelf';

      view.querySelectorAll('.status-btn').forEach((b) =>
        b.classList.toggle('on', b.dataset.s === currentStatus));
      paintBadge();
    }

    view.querySelector('#status-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-s]');
      if (!btn) return;
      currentStatus = btn.dataset.s;
      applyStatus();
    });

    // Stars
    const starsWrap = view.querySelector('#stars');
    function paintStars() {
      starsWrap.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const s = el(`<button class="star ${i <= rating ? 'on' : ''}" aria-label="${i} star">★</button>`);
        s.addEventListener('click', () => {
          rating = (rating === i) ? 0 : i;
          paintStars();
        });
        starsWrap.appendChild(s);
      }
    }
    paintStars();
    applyStatus();

    // Save / update
    saveBtn.addEventListener('click', () => {
      const review = view.querySelector('#review').value.trim();
      const startedAt = startedInput.value || null;
      const finishedAt = finishedInput.value || null;
      const isRead = currentStatus === 'read';
      const isWant = currentStatus === 'want';
      const record = {
        key: merged.key,
        title: merged.title,
        author: merged.author,
        coverId: merged.coverId || null,
        year: merged.year || null,
        subjects: merged.subjects || null,
        status: currentStatus,
        rating: isRead ? rating : 0,
        review: isRead ? review : '',
        startedAt: isWant ? null : (startedAt || merged.startedAt || null),
        finishedAt: isRead ? (finishedAt || merged.finishedAt || todayISO()) : null,
        addedAt: saved && saved.addedAt ? saved.addedAt : Date.now(),
        updatedAt: Date.now()
      };
      const idx = state.books.findIndex((b) => b.key === merged.key);
      if (idx >= 0) state.books[idx] = record; else state.books.push(record);
      saveState();
      const msg = saved ? 'Updated ✓'
        : isWant ? 'Saved to Want to Read ✓'
        : currentStatus === 'reading' ? 'Added to Currently Reading ✓'
        : 'Added to your shelf ✓';
      toast(msg);
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
    if (footer) footer.textContent = `Shelf · v${v} · © Avery LLC`;
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

    let swReg = null;

    // Ask a freshly-installed (or already-waiting) worker to take over now.
    function activateNew(reg) {
      const nw = reg.installing || reg.waiting;
      if (!nw) return;
      if (nw.state === 'installed' && navigator.serviceWorker.controller) {
        nw.postMessage('SKIP_WAITING');
      }
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          nw.postMessage('SKIP_WAITING');
        }
      });
    }

    // Check the server for a newer service worker.
    function checkForUpdate() {
      if (swReg) swReg.update().catch(() => {});
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        swReg = reg;
        if (reg.waiting) activateNew(reg);            // an update was already pending
        reg.addEventListener('updatefound', () => activateNew(reg));
        checkForUpdate();
      }).catch(() => {});
    });

    // iOS keeps installed PWAs frozen and restores them WITHOUT re-firing
    // `load`, so re-check for updates whenever the app is brought back to the
    // foreground. This is what lets a reopened Home Screen app pick up a new
    // version on its own (network-first means the fresh files are already
    // available; this triggers the swap + one-time reload into them).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.addEventListener('pageshow', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
  }

  /* ============================================================
     BOOT
     ============================================================ */
  paintVersion();
  registerSW();
  render();
})();
