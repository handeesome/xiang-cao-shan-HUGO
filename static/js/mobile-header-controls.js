(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const controls = Array.from(
      document.querySelectorAll("[data-toggle-control]")
    );

    const syncControl = (control, toggle) => {
      const expanded = toggle.checked;
      control.setAttribute("aria-expanded", String(expanded));
      control.setAttribute(
        "aria-label",
        expanded
          ? control.dataset.labelExpanded
          : control.dataset.labelCollapsed
      );
    };

    const tocControl = controls.find(
      (control) => control.dataset.toggleControl === "toc-control"
    );
    const tocToggle = document.getElementById("toc-control");
    const tocPanel = document.getElementById("book-mobile-toc");
    const tocLinks = tocPanel
      ? Array.from(tocPanel.querySelectorAll('a[href^="#"]'))
      : [];
    const tocTargets = tocLinks
      .map((link) => {
        const id = link.getAttribute("href")?.slice(1);
        return id ? document.getElementById(id) : null;
      })
      .filter(Boolean);

    const updateActiveTocLink = () => {
      if (!tocLinks.length) return;

      const headerOffset =
        document.querySelector(".book-header")?.getBoundingClientRect().height ||
        0;
      let activeTarget = tocTargets[0];

      tocTargets.forEach((target) => {
        if (target.getBoundingClientRect().top <= headerOffset + 24) {
          activeTarget = target;
        }
      });

      const reachedPageEnd =
        Math.ceil(window.scrollY + window.innerHeight) >=
        document.documentElement.scrollHeight - 2;
      if (reachedPageEnd) {
        activeTarget = tocTargets[tocTargets.length - 1];
      }

      tocLinks.forEach((link) => {
        const isActive = link.getAttribute("href") === `#${activeTarget?.id}`;
        if (isActive) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    const focusActiveTocLink = () => {
      const activeLink =
        tocPanel?.querySelector('a[aria-current="location"]') || tocLinks[0];
      activeLink?.focus({ preventScroll: true });
    };

    controls.forEach((control) => {
      const toggle = document.getElementById(control.dataset.toggleControl);
      if (!toggle) return;

      syncControl(control, toggle);

      toggle.addEventListener("change", () => {
        syncControl(control, toggle);

        if (toggle === tocToggle && toggle.checked) {
          updateActiveTocLink();
          requestAnimationFrame(focusActiveTocLink);
        }
      });

      control.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        control.click();
      });
    });

    ["menu-control", "toc-control"].forEach((toggleId) => {
      const toggle = document.getElementById(toggleId);
      const labels = Array.from(
        document.querySelectorAll(`label[for="${toggleId}"]`)
      );

      labels.forEach((label) => {
        label.addEventListener("click", (event) => {
          if (!toggle) return;

          // A label normally focuses its hidden checkbox at the top of the
          // page, which makes mobile browsers jump away from the reading spot.
          event.preventDefault();
          const scrollLeft = window.scrollX;
          const scrollTop = window.scrollY;
          toggle.checked = !toggle.checked;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
          window.scrollTo(scrollLeft, scrollTop);
        });
      });
    });

    let scrollFrame;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          updateActiveTocLink();
          scrollFrame = null;
        });
      },
      { passive: true }
    );

    tocLinks.forEach((link) => {
      link.addEventListener("click", () => {
        tocLinks.forEach((item) => item.removeAttribute("aria-current"));
        link.setAttribute("aria-current", "location");
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (!tocToggle?.checked) return;
      if (tocControl?.contains(event.target) || tocPanel?.contains(event.target)) {
        return;
      }

      tocToggle.checked = false;
      tocToggle.dispatchEvent(new Event("change", { bubbles: true }));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      const expandedControl = controls.find((control) => {
        const toggle = document.getElementById(control.dataset.toggleControl);
        return toggle?.checked;
      });
      if (!expandedControl) return;

      const toggle = document.getElementById(
        expandedControl.dataset.toggleControl
      );
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      expandedControl.focus();
    });

    updateActiveTocLink();
  });
})();
