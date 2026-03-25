(function () {
  'use strict';

  const shelf = document.querySelector('.book-shelf');
  if (!shelf) return;

  const books = [...document.querySelectorAll('.book-cover')];
  const viewMode = document.getElementById('viewMode');
  const authorFilter = document.getElementById('authorFilter');

  if (!viewMode || !authorFilter) return;

  const zhCompare = (a, b) =>
    (a || '').localeCompare(b || '', 'zh');

  // Collect unique authors for the author filter dropdown.
  const authors = [...new Set(books.map(b => b.dataset.author))].sort(zhCompare);
  authors.forEach(a => {
    if (!a) return;
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    authorFilter.appendChild(opt);
  });

  function render() {
    const mode = viewMode.value;
    const selectedAuthor = authorFilter.value;

    // Note: book cards are DOM nodes already in the document; we reorder/move them.
    shelf.innerHTML = '';

    let list = [...books];
    if (selectedAuthor !== 'all') {
      list = list.filter(b => b.dataset.author === selectedAuthor);
    }

    // -------------------------
    // DEFAULT ORDER
    // -------------------------
    if (mode === 'default') {
      list.forEach(b => shelf.appendChild(b));
      return;
    }

    // -------------------------
    // TITLE ORDER
    // -------------------------
    if (mode === 'title') {
      list.sort((a, b) => zhCompare(a.dataset.title, b.dataset.title));
      list.forEach(b => shelf.appendChild(b));
      return;
    }

    // -------------------------
    // AUTHOR + TITLE ORDER (NO GROUP HEADERS)
    // -------------------------
    if (mode === 'authorTitle') {
      list.sort((a, b) => {
        const authorCmp = zhCompare(a.dataset.author, b.dataset.author);
        if (authorCmp !== 0) return authorCmp;
        return zhCompare(a.dataset.title, b.dataset.title);
      });
      list.forEach(b => shelf.appendChild(b));
      return;
    }

    // -------------------------
    // AUTHOR GROUP VIEW
    // -------------------------
    const groups = {};
    list.forEach(b => {
      const author = b.dataset.author;
      if (!groups[author]) groups[author] = [];
      groups[author].push(b);
    });

    const authorsSorted = Object.keys(groups).sort(zhCompare);
    const showHeaders = authorsSorted.length > 1; // avoid redundant headers when filtered.

    authorsSorted.forEach(author => {
      if (showHeaders) {
        const header = document.createElement('div');
        header.className = 'book-author-group';
        header.textContent = author;
        shelf.appendChild(header);
      }

      groups[author].sort((a, b) =>
        zhCompare(a.dataset.title, b.dataset.title)
      );
      groups[author].forEach(b => shelf.appendChild(b));
    });
  }

  viewMode.addEventListener('change', render);
  authorFilter.addEventListener('change', render);

  // Apply the initial filters (default author=all, default mode=default).
  render();
})();

