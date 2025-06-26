document.addEventListener('DOMContentLoaded', function () {
  const tocLinks = document.querySelectorAll('#TableOfContents a[href^="#"]');
  const tocToggle = document.getElementById('toc-control');
  const header = document.querySelector('.book-header');
  const toc = document.querySelector('#TableOfContents');

  tocLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href').substring(1);
      const targetEl = document.getElementById(targetId);

      if (targetEl) {
        e.preventDefault();

        // Calculate dynamic offset
        const headerHeight = header ? header.offsetHeight : 0;
        const tocHeight = toc ? toc.offsetHeight : 0;
        const offset = headerHeight + tocHeight + 8; // +8 for some spacing buffer

        // Scroll to the anchor target with offset
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        // Close the TOC
        if (tocToggle) {
          tocToggle.checked = false;
        }
      }
    });
  });
});
