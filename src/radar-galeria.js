const dialog = document.querySelector(".radar-photo-dialog");
const image = dialog.querySelector("img");
document.querySelectorAll(".radar-figure-zoom").forEach(button => {
  button.addEventListener("click", () => {
    const source = button.querySelector("img");
    image.src = source.src;
    image.alt = source.alt;
    dialog.showModal();
  });
});
dialog.querySelector("button").addEventListener("click", () => dialog.close());
