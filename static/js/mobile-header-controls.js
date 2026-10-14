(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const controls = Array.from(
      document.querySelectorAll("[data-toggle-control]")
    );
    const mobileView = window.matchMedia("(max-width: 1024px)");
    const menuControl = controls.find(
      (control) => control.dataset.toggleControl === "menu-control"
    );
    const menuToggle = document.getElementById("menu-control");
    const menuPanel = document.getElementById("book-menu-panel");
    const menuContent = menuPanel?.querySelector(".book-menu-content");
    const menuBackground = Array.from(
      document.querySelectorAll(".book-page, .book-toc, body > .banner-header, .reading-preferences")
    );
    let menuScrollPosition = 0;
    let menuWasOpen = false;
    let menuHasOpened = false;

    const isVisibleMenuElement = (element) => {
      if (!element.getClientRects().length) return false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (
          parent.tagName === "DETAILS" && !parent.open &&
          !parent.querySelector("summary")?.contains(element)
        ) return false;
      }
      return true;
    };

    const getMenuFocusableElements = () =>
      menuContent
        ? Array.from(
            menuContent.querySelectorAll(
              'summary, a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter(isVisibleMenuElement)
        : [];

    const setMenuBackgroundInactive = (inactive) => {
      menuBackground.forEach((element) => {
        element.inert = inactive;
        if (inactive) {
          element.setAttribute("aria-hidden", "true");
        } else {
          element.removeAttribute("aria-hidden");
        }
      });
    };

    const syncMenuState = () => {
      const open = Boolean(menuToggle?.checked && mobileView.matches);

      if (open) {
        menuScrollPosition = window.scrollY;
        document.body.style.setProperty(
          "--book-menu-scroll-offset",
          `-${menuScrollPosition}px`
        );
        document.body.classList.add("book-menu-open");
        setMenuBackgroundInactive(true);
        menuContent?.setAttribute("role", "dialog");
        menuContent?.setAttribute("aria-modal", "true");
        menuContent?.setAttribute("aria-label", "站点导航");
        requestAnimationFrame(() => {
          if (!menuToggle?.checked || !mobileView.matches) return;

          let focusTarget = getMenuFocusableElements()[0];
          if (!menuHasOpened) {
            const currentChapter = menuContent?.querySelector(
              '.book-chapter-tree a[aria-current="page"]'
            );
            if (currentChapter && isVisibleMenuElement(currentChapter)) {
              const menuBounds = menuContent.getBoundingClientRect();
              const chapterBounds = currentChapter.getBoundingClientRect();
              if (
                chapterBounds.top < menuBounds.top + 16 ||
                chapterBounds.bottom > menuBounds.bottom - 16
              ) {
                // Scroll only the drawer; the reading page stays in place.
                menuContent.scrollTop +=
                  chapterBounds.top - menuBounds.top -
                  (menuContent.clientHeight - chapterBounds.height) / 2;
              }
              focusTarget = currentChapter;
            }
            menuHasOpened = true;
          }
          focusTarget?.focus({ preventScroll: true });
        });
      } else {
        document.body.classList.remove("book-menu-open");
        document.body.style.removeProperty("--book-menu-scroll-offset");
        setMenuBackgroundInactive(false);
        menuContent?.removeAttribute("role");
        menuContent?.removeAttribute("aria-modal");
        menuContent?.removeAttribute("aria-label");

        if (menuWasOpen) {
          window.scrollTo(0, menuScrollPosition);
          if (mobileView.matches) {
            requestAnimationFrame(() => menuControl?.focus());
          }
        }
      }

      menuWasOpen = open;
    };

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
      if (activeLink) {
        const panelBounds = tocPanel.getBoundingClientRect();
        const linkBounds = activeLink.getBoundingClientRect();
        if (
          linkBounds.top < panelBounds.top + 8 ||
          linkBounds.bottom > panelBounds.bottom - 8
        ) {
          tocPanel.scrollTop +=
            linkBounds.top - panelBounds.top -
            (tocPanel.clientHeight - linkBounds.height) / 2;
        }
      }
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

    menuToggle?.addEventListener("change", syncMenuState);
    mobileView.addEventListener("change", () => {
      if (!mobileView.matches && menuToggle?.checked) {
        menuToggle.checked = false;
        menuToggle.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      syncMenuState();
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
          if (toggleId !== "menu-control") {
            window.scrollTo(scrollLeft, scrollTop);
          }
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
      if (event.key === "Tab" && menuToggle?.checked && mobileView.matches) {
        const focusable = getMenuFocusableElements();
        if (!focusable.length) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

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
    syncMenuState();
  });
})();
