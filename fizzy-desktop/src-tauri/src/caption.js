(function () {
  if (document.getElementById("fizzy-caption")) return;

  const style = document.createElement("style");
  style.textContent = `
    .header {
      -webkit-app-region: drag;
      padding-inline-end: calc(var(--main-padding, 1rem) + 138px);
    }
    .header a,
    .header button,
    .header input,
    .header select,
    .header textarea,
    .header dialog {
      -webkit-app-region: no-drag;
    }
    #fizzy-caption {
      position: fixed;
      top: 0;
      right: 0;
      z-index: 2147483647;
      display: flex;
      height: 32px;
      -webkit-app-region: no-drag;
    }
    #fizzy-caption button {
      appearance: none;
      width: 46px;
      height: 32px;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: #e8e8e8;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    #fizzy-caption button:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    #fizzy-caption button[data-act="close"]:hover {
      background: #c42b1c;
      color: #fff;
    }
    #fizzy-caption svg {
      width: 10px;
      height: 10px;
      fill: currentColor;
    }
  `;
  document.documentElement.appendChild(style);

  const root = document.createElement("div");
  root.id = "fizzy-caption";
  root.innerHTML = `
    <button type="button" data-act="min" title="Minimize" aria-label="Minimize">
      <svg viewBox="0 0 10 10"><rect y="4.5" width="10" height="1"/></svg>
    </button>
    <button type="button" data-act="max" title="Maximize" aria-label="Maximize">
      <svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>
    </button>
    <button type="button" data-act="close" title="Close" aria-label="Close">
      <svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
    </button>
  `;
  document.documentElement.appendChild(root);

  function api() {
    return window.__TAURI__ && window.__TAURI__.window;
  }

  function bind() {
    const win = api() && api().getCurrentWindow();
    if (!win) return false;
    root.querySelector("[data-act=min]").onclick = () => win.minimize();
    root.querySelector("[data-act=max]").onclick = () => win.toggleMaximize();
    root.querySelector("[data-act=close]").onclick = () => win.close();
    return true;
  }

  if (!bind()) {
    const timer = setInterval(() => {
      if (bind()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 4000);
  }
})();
