'use strict';

{{ $searchDataFile := printf "%s.search-data.json" .Language.Lang }}
{{ $searchData := resources.Get "search-data.json" | resources.ExecuteAsTemplate $searchDataFile . | resources.Minify | resources.Fingerprint }}
{{ $searchConfig := i18n "bookSearchConfig" | default "{}" }}

(function () {
  const searchDataURL = '{{ $searchData.RelPermalink }}';
  const indexConfig = Object.assign({{ $searchConfig }}, {
    includeScore: true,
    useExtendedSearch: true,
    fieldNormWeight: 1.5,
    threshold: 0.2,
    ignoreLocation: true,
    keys: [
      {
        name: 'title',
        weight: 0.7
      },
      {
        name: 'content',
        weight: 0.3
      }
    ]
  });

  const input = document.querySelector('#book-search-input');
  const results = document.querySelector('#book-search-results');
  const spinner = document.querySelector('.book-search-spinner');

  if (!input) {
    return
  }

  // Get current section from data attribute
  const currentSection = input.getAttribute('data-section') || '';

  let indexPromise = null;
  let bookSearchIndex = null;
  let searchErrorMessage = null;

  input.addEventListener('focus', init);
  input.addEventListener('keyup', search);

  document.addEventListener('keypress', focusSearchFieldOnKeyPress);

  /**
   * @param {Event} event
   */
  function focusSearchFieldOnKeyPress(event) {
    if (event.target.value !== undefined) {
      return;
    }

    if (input === document.activeElement) {
      return;
    }

    const characterPressed = String.fromCharCode(event.charCode);
    if (!isHotkey(characterPressed)) {
      return;
    }

    input.focus();
    event.preventDefault();
  }

  /**
   * @param {String} character
   * @returns {Boolean} 
   */
  function isHotkey(character) {
    const dataHotkeys = input.getAttribute('data-hotkeys') || '';
    return dataHotkeys.indexOf(character) >= 0;
  }

  function init() {
    if (indexPromise || bookSearchIndex) return;

    input.removeEventListener('focus', init); // init once
    input.required = true;
    searchErrorMessage = null;

    if (spinner) spinner.classList.remove('hidden');

    indexPromise = fetch(searchDataURL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(pages => {
        // Filter pages based on current section
        let filteredPages = pages;
        if (currentSection) {
          // Only include pages from current section
          filteredPages = pages.filter(page => page.section === currentSection);
        }
        // If no currentSection (root page), use all pages

        bookSearchIndex = new Fuse(filteredPages, indexConfig);
        window.bookSearchIndex = bookSearchIndex; // backwards-compatibility
      })
      .catch(err => {
        console.warn('[book-search] Failed to load index:', err);
        searchErrorMessage = '搜索暂不可用，请稍后再试。';
        bookSearchIndex = { search: () => [] };
      })
      .finally(() => {
        input.required = false;
        if (spinner) spinner.classList.add('hidden');
      })
      .then(() => search());
  }

  function search() {
    const query = (input.value || '').trim();

    while (results.firstChild) {
      results.removeChild(results.firstChild);
    }

    if (!query) {
      return;
    }

    if (!bookSearchIndex) {
      // Index is still loading; start it if needed, and re-run after ready.
      if (!indexPromise) init();
      indexPromise?.then(() => search()).catch(() => {});
      return;
    }

    if (searchErrorMessage) {
      const li = element('<li class="no-results"></li>');
      li.textContent = searchErrorMessage;
      results.appendChild(li);
      return;
    }

    const searchHits = bookSearchIndex.search(query).slice(0,10);
    
    if (searchHits.length === 0) {
      const li = element('<li class="no-results"></li>');
      li.textContent = `No results found${currentSection ? ` in ${currentSection}` : ''}`;
      results.appendChild(li);
      return;
    }
    
    searchHits.forEach(function (page) {
      const li = element('<li><a href></a><small></small></li>');
      const a = li.querySelector('a'), small = li.querySelector('small');

      a.href = page.item.href;
      a.textContent = page.item.title;
      
      // Show section badge only when searching all books (root page)
      if (!currentSection && page.item.section) {
        small.textContent = page.item.section;
      } else {
        small.style.display = 'none';
      }

      results.appendChild(li);
    });
  }

  /**
   * @param {String} content
   * @returns {Node}
   */
  function element(content) {
    const div = document.createElement('div');
    div.innerHTML = content;
    return div.firstChild;
  }
})();