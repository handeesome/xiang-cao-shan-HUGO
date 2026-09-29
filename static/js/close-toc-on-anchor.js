document.addEventListener("DOMContentLoaded", () => {
  const tocLinks = document.querySelectorAll('#TableOfContents a[href^="#"]');
  const tocToggle = document.getElementById("toc-control");

  tocLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      e.preventDefault();
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });

      if (tocToggle) {
        tocToggle.checked = false;
        tocToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
      history.replaceState(null, "", `#${id}`);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  });
});
