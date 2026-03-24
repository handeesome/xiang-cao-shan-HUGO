(function () {
  const menu = document.querySelector("aside .book-menu-content");
  if (!menu) return;

  window.addEventListener("beforeunload", () => {
    localStorage.setItem("menu.scrollTop", String(menu.scrollTop));
  });

  const saved = Number(localStorage.getItem("menu.scrollTop") || 0);
  if (Number.isFinite(saved) && saved >= 0) {
    menu.scrollTop = saved;
  }
})();
