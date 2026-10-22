document.querySelectorAll(".nav-wrap").forEach((navWrap) => {
  const toggle = navWrap.querySelector(".nav-toggle");
  const nav = navWrap.querySelector(".main-nav");

  if (!toggle || !nav) return;

  const closeNavigation = () => {
    navWrap.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  };

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    navWrap.classList.toggle("nav-open", !isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeNavigation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavigation();
  });

  document.addEventListener("click", (event) => {
    if (!navWrap.contains(event.target)) closeNavigation();
  });
});

const menuSearch = document.querySelector("#menu-search-input");

if (menuSearch) {
  const status = document.querySelector("#menu-search-status");
  const categories = [...document.querySelectorAll(".menu-category")];

  menuSearch.closest("form").addEventListener("submit", (event) => {
    event.preventDefault();
  });

  menuSearch.addEventListener("input", () => {
    const query = menuSearch.value.trim().toLocaleLowerCase();
    let visibleItems = 0;

    categories.forEach((category) => {
      const title = category.querySelector("summary h2").textContent.trim().toLocaleLowerCase();
      const rows = [...category.querySelectorAll(".menu-price-list li")];
      const titleMatches = query !== "" && title.includes(query);
      let categoryItems = 0;

      rows.forEach((row) => {
        const rowMatches = query === "" || titleMatches || row.textContent.toLocaleLowerCase().includes(query);
        row.hidden = !rowMatches;
        if (rowMatches) categoryItems += 1;
      });

      category.hidden = query !== "" && categoryItems === 0;
      category.open = query !== "" && categoryItems > 0;
      visibleItems += categoryItems;
    });

    if (query === "") {
      status.textContent = "";
    } else if (visibleItems === 0) {
      status.textContent = `No dishes found for “${menuSearch.value.trim()}”.`;
    } else {
      status.textContent = `${visibleItems} ${visibleItems === 1 ? "dish" : "dishes"} found.`;
    }
  });
}
