// =========================================
// 百川群英錄 | app.js
// - 動態載入 JSON/MD
// - ScrollSpy
// - README 彈窗
// - TOC hover(桌機) / click(手機)
// =========================================

// 動態載入 JSON / Markdown
async function loadSection(sectionId, file) {
  const el = document.querySelector(`#${sectionId}`);
  if (!el) return;

  try {
    el.dataset.state = "loading";
    const res = await fetch(`data/${file}`);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const text = await res.text();
    let html;
    if (file.endsWith(".json")) {
      const arr = JSON.parse(text);
      html = arr.map(p => `<p>${p}</p>`).join("");
    } else if (file.endsWith(".md")) {
      html = marked.parse(text);
    } else {
      html = `<pre>${text}</pre>`;
    }
    el.innerHTML = html;
    el.dataset.state = "loaded";
  } catch (err) {
    el.innerHTML = `<div class="error">載入失敗：${err.message}</div>`;
    el.dataset.state = "error";
  }
}

// 範例配置
function setupProductCrosswalk() {
  loadSection("world-climate", "world-climate.json");
  loadSection("qianjue-history", "qianjue-history.json");
  loadSection("xuanling-history", "xuanling-history.json");
  loadSection("yantian-history", "yantian-history.json");
  loadSection("yunlan-history", "yunlan-history.json");
  loadSection("yuqing", "yuqing.json");
  loadSection("plants", "plants.json");
  loadSection("talismans", "talismans.json");
  loadSection("weapons", "weapons.json");
}

// ScrollSpy
function setupScrollSpy() {
  const links = document.querySelectorAll("#toc a[href^='#']");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(a => a.classList.remove("active"));
        const id = entry.target.getAttribute("id");
        const active = document.querySelector(`#toc a[href="#${id}"]`);
        if (active) active.classList.add("active");
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });

  document.querySelectorAll("main > section").forEach(sec => observer.observe(sec));
}

// README Modal
function setupReadmeModal() {
  const modal = document.getElementById("readme-modal");
  const modalContent = document.getElementById("readme-content");
  const closeBtn = modal.querySelector(".modal-close");

  document.querySelectorAll('[data-modal="readme"]').forEach(link => {
    link.addEventListener("click", async e => {
      e.preventDefault();
      modal.classList.add("open");
      try {
        const res = await fetch("README.md");
        const text = await res.text();
        modalContent.innerHTML = marked.parse(text);
      } catch {
        modalContent.innerHTML = "<div class='error'>README 載入失敗</div>";
      }
    });
  });
  closeBtn.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", e => {
    if (e.target === modal) modal.classList.remove("open");
  });
}

// Mobile TOC Toggle
function setupMobileTocToggle() {
  const toc = document.getElementById("toc");
  if (!toc) return;
  let bound = false;

  function onClick(e) {
    const a = e.target.closest("#toc li > a");
    if (!a) return;
    const li = a.parentElement;
    if (!li.querySelector(":scope > ul")) return;
    if (!window.matchMedia("(max-width: 980px)").matches) return;
    e.preventDefault();

    const parent = li.parentElement;
    parent.querySelectorAll(":scope > li.open").forEach(x => {
      if (x !== li) x.classList.remove("open");
    });
    li.classList.toggle("open");
  }

  function onDocClick(e) {
    if (!window.matchMedia("(max-width: 980px)").matches) return;
    if (!e.target.closest("#toc")) {
      document.querySelectorAll("#toc li.open").forEach(li => li.classList.remove("open"));
    }
  }

  function bind() {
    if (bound) return;
    toc.addEventListener("click", onClick);
    document.addEventListener("click", onDocClick);
    bound = true;
  }
  function unbind() {
    if (!bound) return;
    toc.removeEventListener("click", onClick);
    document.removeEventListener("click", onDocClick);
    bound = false;
  }
  function update() {
    if (window.matchMedia("(max-width: 980px)").matches) bind();
    else unbind();
  }

  update();
  window.matchMedia("(max-width: 980px)").addEventListener("change", update);
}

// 啟動
window.addEventListener("DOMContentLoaded", () => {
  setupProductCrosswalk();
  setupScrollSpy();
  setupMobileTocToggle();
  setupReadmeModal();
});
