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

    controls.forEach((control) => {
      const toggle = document.getElementById(control.dataset.toggleControl);
      if (!toggle) return;

      syncControl(control, toggle);

      toggle.addEventListener("change", () => {
        syncControl(control, toggle);
      });

      control.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        control.click();
      });
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
  });
})();
