document.addEventListener('DOMContentLoaded', function () {
  const tocLinks = document.querySelectorAll('#TableOfContents a[href^="#"]');
  const tocToggle = document.getElementById('toc-control');

  tocLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      // Optional short delay allows anchor jump before hiding
      setTimeout(() => {
        if (tocToggle) {
          tocToggle.checked = false;
        }
      }, 100);
    });
  });
});
