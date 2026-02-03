document.querySelectorAll("[data-level]").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-level");
    if (target) window.location.href = target;
  });
});
