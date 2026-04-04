document.addEventListener("DOMContentLoaded", () => {
  const tocLinks = document.querySelectorAll('#TableOfContents a[href^="#"]');
  const tocToggle = document.getElementById("toc-control");

  tocLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });

      if (tocToggle) tocToggle.checked = false;
      history.replaceState(null, "", `#${id}`);
    });
  });
});