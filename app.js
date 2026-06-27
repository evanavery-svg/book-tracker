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
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21l-8.8-8.3a5 5 0 1 1 7.1-7.1L12 7.3l1.7-1.7a5 5 0 1 1 7.1 7.1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5h14a1 1 0 0 1 1 1V17l-4 4H6a1 1 0 0 1-1-1z"/><path d="M20 16h-4v4"/><path d="M9 8h7M9 12h5"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.2 2c.7 3.1-1.1 4.8-2.6 6.2C9.1 9.6 8 11 8 12.9a4.2 4.2 0 0 0 8.4.2c0-1.4-.5-2.5-1.1-3.4 1 .3 1.8 1.1 2.2 2.1.4-3.8-1.9-7.3-4.3-9.8z"/></svg>'
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
     GENRES — turn Open Library's messy `subjects` into a clean,
     fleshed-out set of recognizable genres.

     Each book is classified by a majority vote across its subjects.
     Generic "fiction"/"nonfiction" tags are only used as a last
     resort, so a specific genre (Sci-Fi, Fantasy, History, …) always
     wins when one is present. Subjects are listed by Open Library
     roughly in order of prominence, so ties break toward the genre
     that appeared earliest.
     ============================================================ */
  // Specific genres, ordered by priority (earlier wins a tie of equal votes).
  const GENRE_RULES = [
    ['Science Fiction',    /science[ -]?fiction|\bsci[ -]?fi\b|space opera|cyberpunk|steampunk|time travel|interstellar|androids?|\brobots?\b|extraterrestrial|galactic|space flight/i],
    ['Dystopian',          /dystopia|post-?apocalyptic|apocalyp/i],
    ['Fantasy',            /fantasy|sword and sorcery|\bmagic|wizard|witch|sorcer|dragons?|\belves\b|\belf\b|mythical|enchant|\bfae\b/i],
    ['Horror',             /horror|haunt|ghosts?\b|vampire|werewolf|zombie|occult|supernatural|paranormal|monsters?\b/i],
    ['Mystery',            /myster|detective|whodunit|sleuth|private investigator/i],
    ['Thriller',           /thriller|suspense|espionage|\bspy\b|\bspies\b|conspiracy/i],
    ['Crime',              /\bcrime|criminal|murder|\bnoir\b|mafia|gangster|\bheist|underworld/i],
    ['Romance',            /romance|romantic fiction|love stor|chick lit/i],
    ['Historical Fiction', /historical fiction|historical novel|historical romance/i],
    ['Adventure',          /adventure|survival stories|seafaring|\btreasure|\bquest\b|expedition/i],
    ['Western',            /western stories|\bwesterns\b|\bcowboy|wild west/i],
    ['Graphic Novel',      /graphic novel|comic|manga|cartoon|superhero/i],
    ['Young Adult',        /young adult|teenage|coming of age/i],
    ["Children's",         /juvenile|children|picture book|early reader|middle grade|nursery|bedtime/i],
    ['Fairy Tales',        /fairy tale|folklore|folk tale|legends|mythology/i],
    ['Humor',              /humor|humour|satire|parody|comedies/i],
    ['Poetry',             /poetry|poems|\bverse\b|sonnet/i],
    ['Drama',              /\bdrama\b|\bplays\b|playscript|theater|theatre|tragedy/i],
    ['Short Stories',      /short stories|short story/i],
    ['Classics',           /\bclassic|classical literature/i],

    ['Memoir',             /memoir|autobiograph|diaries|\bdiary\b/i],
    ['Biography',          /biograph/i],
    ['History',            /\bhistory\b|historical|world war|civil war|ancient|medieval|revolution|\bempire\b|dynasty/i],
    ['Science',            /\bscience\b|physics|biology|chemistry|astronomy|cosmos|mathematics|geology|evolution|genetics|neuroscience/i],
    ['Technology',         /technology|computers?|programming|software|engineering|artificial intelligence|\binternet\b/i],
    ['Psychology',         /psycholog|cognitive|\bmind\b|mental health|emotions?\b/i],
    ['Philosophy',         /philosoph|\bethics\b|metaphysic|existential|\bstoic|\blogic\b/i],
    ['Self-Help',          /self-?help|personal development|self-?improvement|motivation|productivity|\bhabits\b|mindfulness|happiness/i],
    ['Business',           /business|economic|\bfinance\b|management|entrepreneur|leadership|marketing|investing/i],
    ['Politics',           /politic|government|democracy|election|public policy|civil rights/i],
    ['Religion',           /religio|spiritual|christian|\bbible\b|theology|buddhis|\bislam|hindu|judaism|\bfaith\b|prayer/i],
    ['Travel',             /\btravel|voyages|geography/i],
    ['Cooking',            /\bcook|cookery|recipe|cuisine|baking|gastronom/i],
    ['Art & Design',       /\bart\b|painting|sculpture|photography|\bdesign\b|architecture|drawing|fashion/i],
    ['Health',             /health|fitness|\bdiet\b|nutrition|wellness|exercise|medicine|medical/i],
    ['Nature',             /nature|natural history|environment|ecology|climate|wildlife|gardening/i],
    ['True Crime',         /true crime/i],
    ['Music',              /\bmusic\b|musicians|composers|\bjazz\b|\bopera\b/i],
    ['Sports',             /sports|football|baseball|basketball|athletics/i],
    ['Education',          /education|teaching|\bstudy\b|learning|\blanguage/i],
    ['Essays',             /essays|literary collections/i]
  ];
  // Catch-alls used only when nothing specific matched.
  const GENRE_FALLBACK = [
    ['Nonfiction', /non-?fiction/i],
    ['Fiction',    /fiction|novel|stories/i]
  ];

  function matchRule(rules, s) {
    for (const [name, re] of rules) if (re.test(s)) return name;
    return null;
  }

  // Primary genre for a book, or null when it has no usable subjects.
  function genreOf(book) {
    const subs = Array.isArray(book && book.subjects) ? book.subjects : [];
    if (!subs.length) return null;
    const counts = new Map();
    const firstSeen = new Map();
    let fallback = null;
    subs.forEach((raw, i) => {
      const s = String(raw);
      const g = matchRule(GENRE_RULES, s);
      if (g) {
        counts.set(g, (counts.get(g) || 0) + 1);
        if (!firstSeen.has(g)) firstSeen.set(g, i);
      } else if (!fallback) {
        fallback = matchRule(GENRE_FALLBACK, s);
      }
    });
    if (!counts.size) return fallback;
    let best = null, bestN = -1, bestSeen = Infinity;
    counts.forEach((n, g) => {
      const seen = firstSeen.get(g);
      if (n > bestN || (n === bestN && seen < bestSeen)) { best = g; bestN = n; bestSeen = seen; }
    });
    return best;
  }

  // Tally primary genres across books → [genre, count] sorted descending.
  function genreBreakdown(books) {
    const counts = new Map();
    books.forEach((b) => {
      const g = genreOf(b);
      if (g) counts.set(g, (counts.get(g) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  // Warm, editorial categorical palette that harmonizes with the paper theme.
  const GENRE_PALETTE = ['#b0573a', '#c79447', '#6f7d5e', '#4f6d7a', '#8a6c8e', '#9c6b4f'];
  const GENRE_OTHER_COLOR = '#bdb6aa';

  /* ---------- Reading Insights card (donut of most-read genres) ---------- */
  function paintInsights(node) {
    node.innerHTML = '';
    const read = state.books.filter((b) => bookStatus(b) === 'read');
    const breakdown = genreBreakdown(read);
    const totalCategorized = breakdown.reduce((s, [, n]) => s + n, 0);
    // Wait until there's enough read to make the chart meaningful.
    if (breakdown.length < 2 || totalCategorized < 3) return;

    // Show the top genres individually; collapse the long tail into "Other".
    const TOP = 5;
    const segments = breakdown.slice(0, TOP).map(([name, count], i) => ({
      name, count, color: GENRE_PALETTE[i % GENRE_PALETTE.length]
    }));
    const otherCount = breakdown.slice(TOP).reduce((s, [, n]) => s + n, 0);
    if (otherCount > 0) segments.push({ name: 'Other', count: otherCount, color: GENRE_OTHER_COLOR });

    const total = segments.reduce((s, x) => s + x.count, 0);
    const topGenre = segments[0].name;

    // Donut via the stroke-dasharray technique (circumference normalized to 100).
    let cumulative = 0;
    const ring = segments.map((seg) => {
      const pct = (seg.count / total) * 100;
      const dash = `${pct.toFixed(2)} ${(100 - pct).toFixed(2)}`;
      const offset = (100 - cumulative + 25).toFixed(2);
      cumulative += pct;
      return `<circle class="donut-seg" cx="18" cy="18" r="15.91549431"
        fill="none" stroke="${seg.color}" stroke-width="4.4"
        stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>`;
    }).join('');

    const legend = segments.map((seg) => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${seg.color}"></span>
        <span class="legend-name">${esc(seg.name)}</span>
        <span class="legend-count">${seg.count}</span>
      </div>`).join('');

    const card = el(`
      <div class="insights-card">
        <div class="insights-head">
          <div class="insights-headings">
            <div class="insights-eyebrow">Most read genres</div>
            <div class="insights-top">${esc(topGenre)}</div>
            <div class="insights-sub">across ${total} ${total === 1 ? 'book' : 'books'} you've read</div>
          </div>
          <button class="insights-share" aria-label="Share your reading insights">${ICON.share}</button>
        </div>
        <div class="insights-body">
          <svg class="donut" viewBox="0 0 36 36" role="img" aria-label="Most read genres breakdown">${ring}</svg>
          <div class="insights-legend">${legend}</div>
        </div>
      </div>
    `);

    card.querySelector('.insights-share').addEventListener('click', () => {
      haptic();
      shareInsightsCard(segments, topGenre, total);
    });

    node.appendChild(card);
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
        <div id="streak"></div>
        <div id="onthisday"></div>
        <div id="insights"></div>
        <div id="activity"></div>
        <div id="favorites"></div>

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
    paintStreak(view.querySelector('#streak'));
    paintOnThisDay(view.querySelector('#onthisday'));
    paintInsights(view.querySelector('#insights'));
    paintActivity(view.querySelector('#activity'));
    paintFavorites(view.querySelector('#favorites'));
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
    const pace = readingPace();
    if (pace && pace.pace >= 1) parts.push(`≈${Math.round(pace.pace)} pages/day`);
    node.textContent = parts.join('  ·  ');
  }

  /* ---------- Filter + sort controls ---------- */
  const SORTS = [
    ['recent', 'Recently added'],
    ['oldest', 'Oldest added'],
    ['rating', 'Highest rated'],
    ['title', 'Title (A–Z)'],
    ['author', 'Author'],
    ['longest', 'Most pages'],
    ['shortest', 'Fewest pages'],
    ['progress', 'Reading progress']
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
    // Custom shelves/tags appear as their own chips (value "tag:Name").
    allTags().forEach((t) => filters.push([`tag:${t}`, t]));

    const chips = el('<div class="chips"></div>');
    filters.forEach(([key, label]) => {
      const isTag = key.startsWith('tag:');
      const chip = el(`<button class="chip ${isTag ? 'chip-tag' : ''} ${state.ui.filter === key ? 'on' : ''}">${esc(label)}</button>`);
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
    if (f && f.startsWith('tag:')) {
      const t = f.slice(4);
      books = books.filter((b) => bookTags(b).includes(t));
    } else if (f === 'read' || f === 'want' || f === 'reading') {
      books = books.filter((b) => bookStatus(b) === f);
    }

    const titleKey = (b) => (b.title || '').toLowerCase();
    const authorKey = (b) => {
      const a = Array.isArray(b.author) ? b.author[0] : b.author;
      return (a || '￿').toLowerCase(); // unknown authors sort last
    };
    const pagesKey = (b) => Number(b.pages) || 0;
    const progKey = (b) => { const p = bookProgress(b); return p == null ? -1 : p; };
    const sorters = {
      recent: (a, b) => bookTime(b) - bookTime(a),
      oldest: (a, b) => bookTime(a) - bookTime(b),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || bookTime(b) - bookTime(a),
      title: (a, b) => titleKey(a).localeCompare(titleKey(b)),
      author: (a, b) => authorKey(a).localeCompare(authorKey(b)) || titleKey(a).localeCompare(titleKey(b)),
      // Most pages first; books with no page count fall to the bottom.
      longest: (a, b) => pagesKey(b) - pagesKey(a) || bookTime(b) - bookTime(a),
      // Fewest pages first; books with no page count still fall to the bottom.
      shortest: (a, b) => {
        const pa = pagesKey(a), pb = pagesKey(b);
        if (!pa && !pb) return bookTime(b) - bookTime(a);
        if (!pa) return 1;
        if (!pb) return -1;
        return pa - pb || bookTime(b) - bookTime(a);
      },
      // Furthest-along reading first; books without progress fall to the bottom.
      progress: (a, b) => progKey(b) - progKey(a) || bookTime(b) - bookTime(a)
    };
    books.sort(sorters[state.ui.sort] || sorters.recent);

    if (books.length === 0) {
      node.appendChild(el(`
        <div class="empty">
          <div class="glyph">${ICON.book}</div>
          <h3>${f === 'want' ? 'Nothing on your list yet'
            : f === 'reading' ? 'Not reading anything yet'
            : f && f.startsWith('tag:') ? `No books in “${esc(f.slice(4))}”`
            : 'No books here'}</h3>
          <p>${f === 'want'
            ? 'Find a book and mark it “Want to Read” to save it for later.'
            : f === 'reading'
            ? 'Open a book and mark it “Reading” to track it here.'
            : f && f.startsWith('tag:')
            ? 'Open a book and add this tag to file it on this shelf.'
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
    const coverWrap = el('<div class="cover-wrap"></div>');
    coverWrap.appendChild(coverEl(book, 'M'));
    if (book.favorite) coverWrap.appendChild(el(`<span class="cover-heart">${ICON.heartFill}</span>`));
    card.appendChild(coverWrap);
    card.appendChild(el(`<div class="b-title">${esc(book.title)}</div>`));
    card.appendChild(el(`<div class="b-author">${esc(authorLine(book.author))}</div>`));
    const status = bookStatus(book);
    if (status === 'want') {
      card.appendChild(el(`<div class="b-want">${ICON.bookmark} Want to read</div>`));
    } else if (status === 'reading') {
      card.appendChild(el(`<div class="b-reading">${ICON.book} Reading</div>`));
      const p = bookProgress(book);
      if (p != null) {
        card.appendChild(el(`<div class="b-progress"><div class="b-progress-fill" style="width:${Math.round(p * 100)}%"></div></div>`));
        card.appendChild(el(`<div class="b-author" style="margin-top:4px">${Math.round(p * 100)}% · p.${book.currentPage} of ${book.pages}</div>`));
      } else if (book.startedAt) {
        card.appendChild(el(`<div class="b-author" style="margin-top:3px">Since ${esc(formatDate(book.startedAt))}</div>`));
      }
    } else if (book.rating) {
      card.appendChild(el(miniStars(book.rating)));
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
    const url = `${OL}/search.json?q=${encodeURIComponent(query)}&limit=24&fields=key,title,author_name,cover_i,first_publish_year,subject,number_of_pages_median`;
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
      subjects: Array.isArray(d.subject) ? d.subject.slice(0, 8) : null,
      pages: d.number_of_pages_median || null
    };
  }

  async function doSearch(query, container, isCurrent) {
    if (!query || query.length < 2) return;
    container.innerHTML = '';

    // Your own shelf first — full-text across titles, authors, reviews,
    // genres, tags and notes (works offline, instant).
    const local = searchLocal(query);
    if (local.length) {
      const sec = el(`<div class="result-section"><h3 class="result-label">On your shelf · ${local.length}</h3></div>`);
      const grid = el('<div class="book-grid"></div>');
      local.forEach((b) => grid.appendChild(shelfCard(b)));
      sec.appendChild(grid);
      container.appendChild(sec);
    }

    // Then the Open Library catalogue.
    const libWrap = el('<div class="result-section"></div>');
    container.appendChild(libWrap);
    libWrap.appendChild(el('<div class="spinner"></div>'));
    try {
      const books = await searchBooks(query);
      if (!isCurrent()) return;
      libWrap.innerHTML = '';
      if (books.length === 0) {
        if (!local.length) {
          libWrap.appendChild(el(`
            <div class="empty">
              <div class="glyph">${ICON.search}</div>
              <h3>No results</h3>
              <p>Try a different title or author.</p>
            </div>`));
        }
        return;
      }
      libWrap.appendChild(el(`<h3 class="result-label">From the library</h3>`));
      const grid = el('<div class="book-grid"></div>');
      books.forEach((b) => {
        const existing = findBook(b.key);
        grid.appendChild(searchCard(existing ? Object.assign({}, b, existing) : b));
      });
      libWrap.appendChild(grid);
    } catch (err) {
      if (!isCurrent()) return;
      libWrap.innerHTML = '';
      libWrap.appendChild(el(`
        <div class="empty">
          <div class="glyph">${ICON.offline}</div>
          <h3>${local.length ? 'Library unavailable' : "Couldn't reach the library"}</h3>
          <p>${local.length ? 'Showing matches from your shelf.' : 'Check your connection and try again.'}</p>
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
    let favorite = !!merged.favorite;
    let tags = bookTags(merged).slice();
    let notes = bookNotes(merged).slice();

    const view = el(`
      <div>
        <div class="navbar">
          <button class="btn-text back" id="back">${ICON.chevron} Back</button>
          <span class="navbar-actions">
            <button class="icon-btn fav-btn" id="fav-btn" aria-label="Add to favorites"></button>
            <span id="remove-slot"></span>
          </span>
        </div>

        <div class="detail-top">
          <div id="cover-slot"></div>
          <div class="detail-meta">
            <h2>${esc(merged.title)}</h2>
            <div class="author">${esc(authorLine(merged.author))}</div>
            ${merged.year ? `<div class="year">First published ${esc(merged.year)}</div>` : ''}
            ${merged.series ? `<div class="series-line">${esc(merged.series)}${merged.seriesIndex ? ` <span>#${esc(merged.seriesIndex)}</span>` : ''}</div>` : ''}
            ${(() => { const g = genreOf(merged); return g ? `<div class="genre-tag">${esc(g)}</div>` : ''; })()}
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

          <div class="date-row" id="pages-row">
            <label for="pages">${ICON.pages} Pages</label>
            <input class="date-input num-input" type="number" inputmode="numeric" id="pages"
              min="1" max="20000" placeholder="—" value="${esc(merged.pages || '')}" />
          </div>

          <div id="progress-row">
            <label for="current-page" style="display:block">Reading progress</label>
            <div class="progress-edit">
              <input class="date-input num-input" type="number" inputmode="numeric" id="current-page"
                min="0" placeholder="Current page" value="${esc(merged.currentPage || '')}" />
              <div class="progress-bar"><div class="progress-bar-fill" id="progress-fill"></div></div>
            </div>
            <div class="progress-text" id="progress-text"></div>
            <div class="pace-hint" id="pace-hint"></div>
          </div>

          <div id="series-row">
            <label for="series">${ICON.bookmark} Series</label>
            <div class="series-edit">
              <input class="series-name" type="text" id="series" maxlength="60"
                placeholder="Series name (optional)" value="${esc(merged.series || '')}" />
              <input class="series-index num-input" type="number" inputmode="numeric" id="series-index"
                min="0" max="999" placeholder="#" value="${esc(merged.seriesIndex || '')}" />
            </div>
          </div>

          <div id="tags-row">
            <label>Shelves &amp; tags</label>
            <div class="tag-edit" id="tag-edit"></div>
          </div>

          <div id="notes-block">
            <label>${ICON.note} Notes &amp; highlights</label>
            <div id="notes-list"></div>
            <div class="note-compose">
              <textarea class="review-input note-text" id="note-input" placeholder="Save a quote or a thought…"></textarea>
              <div class="note-compose-foot">
                <input class="date-input num-input note-page" type="number" inputmode="numeric" id="note-page" min="0" placeholder="Page" />
                <button class="btn btn-secondary note-add" id="add-note">${ICON.plus} Add note</button>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <button class="btn btn-block" id="save"></button>
          </div>
        </div>

        <div id="series-next"></div>

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
    const pagesRow = view.querySelector('#pages-row');
    const progressRow = view.querySelector('#progress-row');
    const pagesInput = view.querySelector('#pages');
    const currentPageInput = view.querySelector('#current-page');
    const progressFill = view.querySelector('#progress-fill');
    const progressText = view.querySelector('#progress-text');
    const paceHint = view.querySelector('#pace-hint');

    // Live reading-progress bar from page numbers, plus a "days left" estimate
    // based on your personal pace across the books you've finished.
    function updateProgress() {
      const total = Number(pagesInput.value) || 0;
      const cur = Number(currentPageInput.value) || 0;
      if (total > 0 && cur > 0) {
        const pct = Math.max(0, Math.min(100, Math.round((cur / total) * 100)));
        progressFill.style.width = pct + '%';
        const left = Math.max(0, total - cur);
        progressText.textContent = `${pct}% · ${left} page${left === 1 ? '' : 's'} left`;
      } else {
        progressFill.style.width = '0%';
        progressText.textContent = total > 0 ? `of ${total} pages` : '';
      }
      const pace = readingPace();
      if (pace && pace.pace >= 1 && total > 0 && cur > 0 && cur < total) {
        const days = Math.max(1, Math.ceil((total - cur) / pace.pace));
        paceHint.textContent = `At your pace (~${Math.round(pace.pace)} pages/day), about ${days} day${days === 1 ? '' : 's'} to finish`;
        paceHint.style.display = '';
      } else {
        paceHint.style.display = 'none';
      }
    }
    pagesInput.addEventListener('input', updateProgress);
    currentPageInput.addEventListener('input', updateProgress);

    // Favorite heart (persists immediately when the book is already saved).
    const favBtn = view.querySelector('#fav-btn');
    function paintFav() {
      favBtn.innerHTML = favorite ? ICON.heartFill : ICON.heart;
      favBtn.classList.toggle('on', favorite);
    }
    favBtn.addEventListener('click', () => {
      favorite = !favorite;
      haptic();
      paintFav();
      const idx = state.books.findIndex((b) => b.key === merged.key);
      if (idx >= 0) {
        state.books[idx].favorite = favorite;
        saveState();
        toast(favorite ? 'Added to favorites ♥' : 'Removed from favorites');
      }
    });
    paintFav();

    // Custom shelves / tags editor.
    const dl = el('<datalist id="tag-suggestions"></datalist>');
    allTags().forEach((t) => dl.appendChild(el(`<option value="${esc(t)}"></option>`)));
    view.appendChild(dl);
    const tagEdit = view.querySelector('#tag-edit');
    function paintTags() {
      tagEdit.innerHTML = '';
      tags.forEach((t, i) => {
        const chip = el(`<span class="tag-chip">${esc(t)}<button class="tag-x" aria-label="Remove tag">${ICON.close}</button></span>`);
        chip.querySelector('.tag-x').addEventListener('click', () => { tags.splice(i, 1); paintTags(); });
        tagEdit.appendChild(chip);
      });
      const addWrap = el('<span class="tag-add-wrap"><input class="tag-add" placeholder="Add tag…" maxlength="24" list="tag-suggestions" /></span>');
      const input = addWrap.querySelector('.tag-add');
      const commit = () => {
        const v = input.value.trim();
        if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
          tags.push(v);
          paintTags();
          const ni = tagEdit.querySelector('.tag-add');
          if (ni) ni.focus();
        } else { input.value = ''; }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      tagEdit.appendChild(addWrap);
    }
    paintTags();

    // Notes & highlights.
    const notesList = view.querySelector('#notes-list');
    const noteInput = view.querySelector('#note-input');
    const notePage = view.querySelector('#note-page');
    function paintNotes() {
      notesList.innerHTML = '';
      if (!notes.length) {
        notesList.appendChild(el('<p class="notes-empty">No notes yet — save a favorite quote or a thought.</p>'));
        return;
      }
      notes.slice()
        .sort((a, b) => (a.page || 0) - (b.page || 0) || (a.createdAt || 0) - (b.createdAt || 0))
        .forEach((n) => {
          const item = el(`
            <div class="note-item">
              <div class="note-body">${esc(n.text)}</div>
              <div class="note-foot">
                ${n.page ? `<span class="note-pageno">Page ${esc(n.page)}</span>` : '<span></span>'}
                <button class="note-del" aria-label="Delete note">${ICON.close}</button>
              </div>
            </div>
          `);
          item.querySelector('.note-del').addEventListener('click', () => { notes = notes.filter((x) => x !== n); paintNotes(); });
          notesList.appendChild(item);
        });
    }
    view.querySelector('#add-note').addEventListener('click', () => {
      const text = noteInput.value.trim();
      if (!text) { noteInput.focus(); return; }
      notes.push({ text, page: Number(notePage.value) || null, createdAt: Date.now() });
      noteInput.value = ''; notePage.value = '';
      haptic();
      paintNotes();
    });
    paintNotes();

    function applyStatus() {
      const isWant = currentStatus === 'want';
      const isReading = currentStatus === 'reading';
      const isRead = currentStatus === 'read';

      ratingRow.style.display = isRead ? '' : 'none';
      startedRow.style.display = (isReading || isRead) ? '' : 'none';
      finishedRow.style.display = isRead ? '' : 'none';
      pagesRow.style.display = (isReading || isRead) ? '' : 'none';
      progressRow.style.display = isReading ? '' : 'none';
      updateProgress();

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
          haptic();
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
        pages: Number(pagesInput.value) || merged.pages || null,
        currentPage: currentStatus === 'reading' ? (Number(currentPageInput.value) || null) : null,
        series: view.querySelector('#series').value.trim() || null,
        seriesIndex: Number(view.querySelector('#series-index').value) || null,
        tags: tags.slice(),
        notes: notes.slice(),
        favorite: favorite,
        addedAt: saved && saved.addedAt ? saved.addedAt : Date.now(),
        updatedAt: Date.now()
      };
      const idx = state.books.findIndex((b) => b.key === merged.key);
      if (idx >= 0) state.books[idx] = record; else state.books.push(record);
      saveState();
      haptic();
      const msg = saved ? 'Updated ✓'
        : isWant ? 'Saved to Want to Read ✓'
        : currentStatus === 'reading' ? 'Added to Currently Reading ✓'
        : 'Added to your shelf ✓';
      toast(msg);
      renderHome();
    });

    paintSeriesNext(view.querySelector('#series-next'), merged);
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
     EXTRAS — favorites, custom shelves/tags, notes & highlights,
     page progress, activity heatmap, on-this-day, haptics, share.
     ============================================================ */

  // A subtle haptic tick where supported (Android/Chrome). iOS PWAs no-op.
  function haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (_) {}
  }

  // ---- Per-book accessors (all fields optional / back-compatible) ----
  function bookTags(b) {
    return Array.isArray(b && b.tags) ? b.tags.filter(Boolean) : [];
  }
  function bookNotes(b) {
    return Array.isArray(b && b.notes) ? b.notes : [];
  }
  // Reading progress 0..1 when both page counts are known, else null.
  function bookProgress(b) {
    const total = Number(b && b.pages) || 0;
    const cur = Number(b && b.currentPage) || 0;
    if (total > 0 && cur > 0) return Math.max(0, Math.min(1, cur / total));
    return null;
  }
  // Every custom tag in use, most-used first.
  function allTags() {
    const counts = new Map();
    state.books.forEach((b) => bookTags(b).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }

  const miniStars = (n) => `<div class="b-mini-stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</div>`;

  /* ---------- Date math (local, DST-safe via midday anchor) ---------- */
  function addDaysISO(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  function dayDiff(a, b) {
    return Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
  }

  /* ---------- Reading streak (#1) ---------- */
  // Distinct days you engaged with a book: started it, finished it, or jotted a
  // note. Derived from existing data, so it works for books added before this.
  function readingDays() {
    const days = new Set();
    state.books.forEach((b) => {
      if (b.finishedAt) days.add(b.finishedAt);
      if (b.startedAt) days.add(b.startedAt);
      bookNotes(b).forEach((n) => {
        if (n && n.createdAt) days.add(isoOf(new Date(n.createdAt)));
      });
    });
    return [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  }

  function streakInfo() {
    const days = readingDays();
    if (!days.length) return { current: 0, longest: 0, total: 0 };
    const set = new Set(days);

    // Longest run of consecutive calendar days, ever.
    let longest = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
      if (dayDiff(days[i - 1], days[i]) === 1) { run++; longest = Math.max(longest, run); }
      else run = 1;
    }

    // Current streak counts back from today; yesterday keeps it alive so a
    // streak doesn't "break" until you've actually missed a full day.
    let cursor = todayISO();
    if (!set.has(cursor)) cursor = addDaysISO(todayISO(), -1);
    let current = 0;
    if (set.has(cursor)) {
      current = 1;
      let prev = addDaysISO(cursor, -1);
      while (set.has(prev)) { current++; prev = addDaysISO(prev, -1); }
    }
    return { current, longest, total: days.length };
  }

  function paintStreak(node) {
    node.innerHTML = '';
    const { current, longest, total } = streakInfo();
    // Wait for a little history so the card isn't noise.
    if (total < 3 && current < 2) return;
    const loggedToday = new Set(readingDays()).has(todayISO());

    const label = current > 0
      ? (loggedToday ? 'Current reading streak' : 'Streak alive — read today to keep it')
      : 'No active streak — pick up a book today';

    const card = el(`
      <div class="streak-card">
        <div class="streak-flame ${current > 0 ? 'lit' : ''}">${ICON.flame}</div>
        <div class="streak-main">
          <div class="streak-num">${current} <span>day${current === 1 ? '' : 's'}</span></div>
          <div class="streak-label">${label}</div>
        </div>
        <div class="streak-best">
          <div class="streak-best-num">${longest}</div>
          <div class="streak-best-label">Best</div>
        </div>
      </div>
    `);
    node.appendChild(card);
  }

  /* ---------- Reading pace (#5) ---------- */
  // Median pages-per-day across the books you've finished that have a page
  // count and both a start and finish date. Median resists the odd outlier
  // (a book you took a year to finish, or sped through in a night).
  function readingPace() {
    const rates = [];
    state.books.forEach((b) => {
      if (bookStatus(b) !== 'read') return;
      const pages = Number(b.pages) || 0;
      if (!pages || !b.startedAt || !b.finishedAt) return;
      const span = dayDiff(b.startedAt, b.finishedAt);
      if (isNaN(span) || span < 0) return;
      rates.push(pages / Math.max(1, span + 1));   // inclusive of both days
    });
    if (!rates.length) return null;
    rates.sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    const pace = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
    return { pace, samples: rates.length };
  }

  /* ---------- Book series (#6) ---------- */
  function seriesSiblings(book) {
    const name = (book.series || '').trim().toLowerCase();
    if (!name) return [];
    return state.books
      .filter((b) => b.key !== book.key && (b.series || '').trim().toLowerCase() === name)
      .sort((a, b) => (Number(a.seriesIndex) || 0) - (Number(b.seriesIndex) || 0));
  }

  // The next book you haven't read in this series — preferring the one whose
  // index comes right after the current book, else the lowest unread.
  function nextInSeries(book) {
    const unread = seriesSiblings(book).filter((b) => bookStatus(b) !== 'read');
    if (!unread.length) return null;
    const idx = Number(book.seriesIndex) || 0;
    const after = unread
      .filter((b) => (Number(b.seriesIndex) || 0) > idx)
      .sort((a, b) => (Number(a.seriesIndex) || 0) - (Number(b.seriesIndex) || 0));
    return after[0] || unread[0];
  }

  function paintSeriesNext(slot, book) {
    slot.innerHTML = '';
    const next = nextInSeries(book);
    if (!next) return;
    const sub = `${next.seriesIndex ? '#' + next.seriesIndex + ' · ' : ''}${esc(next.series)}`;
    const card = el(`
      <button class="next-series">
        <div class="mini-eyebrow">${ICON.bookmark} Next in series</div>
        <div class="ns-body">
          <div class="ns-cover"></div>
          <div class="ns-meta">
            <div class="ns-title">${esc(next.title)}</div>
            <div class="ns-sub">${sub}</div>
            <div class="ns-status">${bookStatus(next) === 'reading' ? 'Currently reading' : 'On your want-to-read list'}</div>
          </div>
        </div>
      </button>
    `);
    card.querySelector('.ns-cover').appendChild(coverEl(next, 'M'));
    card.addEventListener('click', () => renderDetail(next, { fromShelf: true }));
    slot.appendChild(card);
  }

  /* ---------- Favorites row (#7) ---------- */
  function paintFavorites(node) {
    node.innerHTML = '';
    const favs = state.books.filter((b) => b.favorite)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || bookTime(b) - bookTime(a));
    if (favs.length === 0) return;

    const card = el(`
      <div class="fav-block">
        <div class="fav-head">
          <span class="mini-eyebrow">${ICON.heartFill} Favorites</span>
        </div>
        <div class="fav-row"></div>
      </div>
    `);
    const row = card.querySelector('.fav-row');
    favs.forEach((b) => {
      const item = el('<button class="fav-item"></button>');
      item.appendChild(coverEl(b, 'M'));
      item.appendChild(el(`<div class="b-title">${esc(b.title)}</div>`));
      if (b.rating) item.appendChild(el(miniStars(b.rating)));
      item.addEventListener('click', () => renderDetail(b, { fromShelf: true }));
      row.appendChild(item);
    });
    node.appendChild(card);
  }

  /* ---------- On this day (#9) ---------- */
  function paintOnThisDay(node) {
    node.innerHTML = '';
    const now = new Date();
    const mmdd = todayISO().slice(5);
    const thisYear = now.getFullYear();
    const matches = state.books.filter((b) => {
      if (bookStatus(b) !== 'read' || !b.finishedAt) return false;
      return b.finishedAt.slice(5) === mmdd && Number(b.finishedAt.slice(0, 4)) < thisYear;
    }).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    if (!matches.length) return;

    const book = matches[0];
    const yearsAgo = thisYear - Number(book.finishedAt.slice(0, 4));
    const when = yearsAgo === 1 ? 'A year ago today' : `${yearsAgo} years ago today`;
    const snippet = book.review
      ? (book.review.length > 130 ? book.review.slice(0, 130).trim() + '…' : book.review)
      : '';

    const card = el(`
      <button class="otd-card">
        <div class="mini-eyebrow">${ICON.calendar} On this day</div>
        <div class="otd-body">
          <div class="otd-cover"></div>
          <div class="otd-meta">
            <div class="otd-when">${when} you finished</div>
            <div class="otd-title">${esc(book.title)}</div>
            <div class="otd-author">${esc(authorLine(book.author))}</div>
            ${book.rating ? `<div style="margin-top:6px">${miniStars(book.rating)}</div>` : ''}
            ${snippet ? `<div class="otd-review">“${esc(snippet)}”</div>` : ''}
          </div>
        </div>
      </button>
    `);
    card.querySelector('.otd-cover').appendChild(coverEl(book, 'M'));
    card.addEventListener('click', () => renderDetail(book, { fromShelf: true }));
    node.appendChild(card);
  }

  /* ---------- Reading activity heatmap (#2) ---------- */
  function paintActivity(node) {
    node.innerHTML = '';
    const reads = state.books.filter((b) => bookStatus(b) === 'read' && b.finishedAt);
    if (reads.length < 2) return;

    const counts = new Map();
    reads.forEach((b) => counts.set(b.finishedAt, (counts.get(b.finishedAt) || 0) + 1));

    const WEEKS = 26;                          // ~6 months
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7;      // 0 = Monday
    const lastMonday = new Date(today); lastMonday.setDate(today.getDate() - dow);
    const start = new Date(lastMonday); start.setDate(lastMonday.getDate() - (WEEKS - 1) * 7);

    let total = 0;
    const monthLabels = [];
    const cols = [];
    let lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const colCells = [];
      const colFirst = new Date(start); colFirst.setDate(start.getDate() + w * 7);
      const m = colFirst.getMonth();
      if (m !== lastMonth) {
        monthLabels.push(`<span class="hm-month" style="grid-column:${w + 1}">${colFirst.toLocaleString(undefined, { month: 'short' })}</span>`);
        lastMonth = m;
      }
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
        const iso = isoOf(day);
        const future = day > today;
        const n = future ? -1 : (counts.get(iso) || 0);
        if (n > 0) total += n;
        const lvl = n < 0 ? 'future' : n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3;
        const tip = n > 0 ? `${iso} · ${n} finished` : iso;
        colCells.push(`<span class="hm-cell hm-${lvl}" title="${tip}"></span>`);
      }
      cols.push(`<div class="hm-col">${colCells.join('')}</div>`);
    }

    const card = el(`
      <div class="activity-card">
        <div class="activity-head">
          <span class="mini-eyebrow">${ICON.calendar} Reading activity</span>
          <span class="activity-sub">${total} finished · 6 months</span>
        </div>
        <div class="hm-scroll">
          <div class="hm-months">${monthLabels.join('')}</div>
          <div class="hm-grid">${cols.join('')}</div>
        </div>
        <div class="hm-legend">
          <span>Less</span>
          <span class="hm-cell hm-0"></span>
          <span class="hm-cell hm-1"></span>
          <span class="hm-cell hm-2"></span>
          <span class="hm-cell hm-3"></span>
          <span>More</span>
        </div>
      </div>
    `);
    node.appendChild(card);
  }

  /* ---------- Full-text search of your own shelf (#6) ---------- */
  function searchLocal(query) {
    const q = query.toLowerCase();
    return state.books.filter((b) => {
      const hay = [
        b.title,
        Array.isArray(b.author) ? b.author.join(' ') : b.author,
        b.review,
        genreOf(b),
        bookTags(b).join(' '),
        bookNotes(b).map((n) => n.text).join(' ')
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  /* ---------- Richer share card for Reading Insights (#10) ---------- */
  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  async function shareInsightsCard(segments, topGenre, total) {
    try {
      const W = 1080, H = 1350;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');

      g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(31,29,26,0.10)'; g.lineWidth = 2;
      roundRectPath(g, 46, 46, W - 92, H - 92, 36); g.stroke();

      g.textAlign = 'left';
      g.fillStyle = '#a8a299';
      g.font = '700 30px Georgia, "Times New Roman", serif';
      g.fillText('M O S T   R E A D   G E N R E S', 100, 150);

      g.fillStyle = '#b0573a';
      g.font = '700 104px Georgia, "Times New Roman", serif';
      g.fillText(topGenre, 96, 256);

      g.fillStyle = '#76716a';
      g.font = '400 36px Georgia, "Times New Roman", serif';
      g.fillText(`across ${total} ${total === 1 ? 'book' : 'books'} read`, 100, 312);

      // Donut
      const cx = W / 2, cy = 660, R = 200, lw = 78;
      let a0 = -Math.PI / 2;
      segments.forEach((s) => {
        const a1 = a0 + (s.count / total) * Math.PI * 2;
        g.beginPath(); g.lineWidth = lw; g.lineCap = 'butt';
        g.strokeStyle = s.color; g.arc(cx, cy, R, a0, a1); g.stroke();
        a0 = a1;
      });

      // Legend
      let ly = 980;
      segments.forEach((s) => {
        g.fillStyle = s.color; roundRectPath(g, 110, ly - 30, 36, 36, 10); g.fill();
        g.fillStyle = '#1f1d1a';
        g.font = '700 42px Georgia, "Times New Roman", serif';
        g.textAlign = 'left'; g.fillText(s.name, 170, ly);
        g.fillStyle = '#76716a';
        g.textAlign = 'right'; g.fillText(String(s.count), W - 110, ly);
        ly += 66;
      });

      g.textAlign = 'center';
      g.fillStyle = '#aaa49a';
      g.font = '700 32px Georgia, "Times New Roman", serif';
      g.fillText('S H E L F', W / 2, H - 86);

      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const file = new File([blob], 'shelf-reading.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Reading on Shelf' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'shelf-reading.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        toast('Saved your insights image ✓');
      }
    } catch (_) {
      const text = `My most-read genre on Shelf is ${topGenre}.`;
      if (navigator.share) navigator.share({ title: 'My Reading on Shelf', text }).catch(() => {});
      else toast(`${topGenre} is your top genre`);
    }
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
