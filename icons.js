(function () {
  const icons = {
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>',
    "moon": '<path d="M12 3a6 6 0 0 0 9 7.4 9 9 0 1 1-9-7.4Z"></path>',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 15.1-6.6L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15.1 6.6L3 16"></path><path d="M3 21v-5h5"></path>',
    "shuffle": '<path d="m18 14 4 4-4 4"></path><path d="m18 2 4 4-4 4"></path><path d="M2 18h1.8a6 6 0 0 0 5-2.7L15 6.7A6 6 0 0 1 20 4h2"></path><path d="M2 6h1.8a6 6 0 0 1 5 2.7l.9 1.2"></path><path d="M13.9 14.1 15 15.3A6 6 0 0 0 20 18h2"></path>',
    "sun": '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
    "trash-2": '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
    "trophy": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.7V17c0 .6-.4 1-1 1h6c-.6 0-1-.4-1-1v-2.3"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>'
  };

  function renderIcons() {
    document.querySelectorAll("[data-lucide]").forEach((element) => {
      const name = element.dataset.lucide;
      const body = icons[name];
      if (!body) return;
      element.innerHTML = `<svg class="lucide-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderIcons);
  } else {
    renderIcons();
  }

  window.renderWcfIcons = renderIcons;
})();
