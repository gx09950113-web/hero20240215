// =========================================
// 百川群英錄 | app.js（自動配合 index 版）
// =========================================

// ---------- 小工具 ----------
async function fetchFirst(paths) {
  for (const url of paths) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        return { text, url };
      }
    } catch (_) {}
  }
  throw new Error("No available source: " + paths.join(", "));
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function idToDataKey(id) {
  return id.startsWith("prod-") ? id.slice(5) : id;
}
function buildCandidatePaths(key) {
  return [`data/${key}.json`, `data/${key}.md`, `data/${key}.txt`];
}
function isLikelyMarkdown(text) {
  return /(^|\n)#{1,6}\s|(^|\n)[-\*+]\s|(^|\n)\d+\.\s/.test(text);
}

// ---------- 內容載入 ----------
async function loadSectionAuto(sectionEl) {
  const id = sectionEl.getAttribute("id");
  if (!id) return;
  if (id === "homepage") return;
  if (id === "readme") return;

  const key = idToDataKey(id);
  const candidates = buildCandidatePaths(key);

  sectionEl.dataset.state = "loading";

  try {
    const { text, url } = await fetchFirst(candidates);
    let html = "";

    if (url.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          html = parsed.map(p => `<p>${escapeHTML(p)}</p>`).join("");
        } else if (parsed && typeof parsed === "object") {
          html = `<pre>${escapeHTML(JSON.stringify(parsed, null, 2))}</pre>`;
        } else {
          html = `<pre>${escapeHTML(String(parsed))}</pre>`;
        }
      } catch {
        html = `<pre>${escapeHTML(text)}</pre>`;
      }
    } else if (url.endsWith(".md") || isLikelyMarkdown(text)) {
      html = (window.marked && typeof marked.parse === "function")
        ? marked.parse(text)
        : `<pre>${escapeHTML(text)}</pre>`;
    } else {
      html = `<pre>${escapeHTML(text)}</pre>`;
    }

    sectionEl.innerHTML = html;
    sectionEl.dataset.state = "loaded";
  } catch (err) {
    sectionEl.innerHTML = `<div class="error">載入失敗：${escapeHTML(err.message || String(err))}</div>`;
    sectionEl.dataset.state = "error";
  }
}
function setupAutoLoadAllSections() {
  document.querySelectorAll("main#content > section").forEach(sec => loadSectionAuto(sec));
}

// ---------- ScrollSpy ----------
function setupScrollSpy() {
  const links = document.querySelectorAll("#toc a[href^='#']");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(a => a.classList.remove("active"));
        const id = entry.target.getAttribute("id");
        if (!id) return;
        const sel = `#toc a[href="#${CSS.escape(id)}"]`;
        const active = document.querySelector(sel);
        if (active) active.classList.add("active");
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });

  document.querySelectorAll("main#content > section").forEach(sec => observer.observe(sec));
}

// ---------- README（頁面 + 彈窗） ----------
async function setupReadme() {
  const inlineWrap = document.querySelector("#readme .content");
  const modal = document.getElementById("readme-modal");
  const modalContent = document.getElementById("readme-modal-content");
  const okBtn = document.getElementById("readme-ok");
  const dontShow = document.getElementById("readme-dont-show");

  try {
    const { text } = await fetchFirst(["assets/README.md"]);
    const html = (window.marked && typeof marked.parse === "function")
      ? marked.parse(text)
      : `<pre>${escapeHTML(text)}</pre>`;
    if (inlineWrap) inlineWrap.innerHTML = html;
    if (modalContent) modalContent.innerHTML = html;
  } catch (err) {
    const em = `<div class="error">README 載入失敗：${escapeHTML(err.message || String(err))}</div>`;
    if (inlineWrap) inlineWrap.innerHTML = em;
    if (modalContent) modalContent.innerHTML = em;
  }

  const dont = localStorage.getItem("bcql_dontShowReadme") === "1";
  if (!dont && modal) {
    modal.hidden = false;      // 打開時取消 hidden
    modal.classList.add("open");
  }

  if (okBtn && modal) {
    okBtn.addEventListener("click", () => {
      if (dontShow && dontShow.checked) {
        localStorage.setItem("bcql_dontShowReadme", "1");
      }
      modal.classList.remove("open");
      modal.hidden = true;     // ✅ 關閉時真正隱藏
    });
  }
}

// ---------- 手機 TOC 點擊展開 ----------
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

// ---------- 首頁按鈕：平滑捲動 ----------
function setupHomeButtonScroll() {
  const homeBtn = document.querySelector('.site-header .home-btn[href="#homepage"]');
  if (!homeBtn) return;
  homeBtn.addEventListener("click", (e) => {
    const target = document.getElementById("homepage");
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// —— NEW: 確保有 section，沒有就動態建立並載入 —— //
async function ensureSectionAndLoad(id) {
  if (!id || id === 'homepage' || id === 'readme') {
    const target = document.getElementById(id || 'homepage');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  let sec = document.getElementById(id);
  if (!sec) {
    sec = document.createElement('section');
    sec.id = id;
    sec.innerHTML = '<div class="loading">Loading…</div>';
    const main = document.querySelector('main#content') || document.querySelector('main');
    main.appendChild(sec);
    // 重新初始化 ScrollSpy 以納入新 section（最小改動做法）
    setupScrollSpy();
  }
  await loadSectionAuto(sec);
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// —— NEW: 導覽輔助（保留 hash） —— //
function navigateToId(id) {
  if (!id) return;
  if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  ensureSectionAndLoad(id);
}

// —— NEW: 攔截 TOC 內所有 # 錨點；沒有目標時動態建立 —— //
function setupTocNav() {
  const toc = document.getElementById('toc');
  if (!toc) return;
  toc.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    e.preventDefault();
    navigateToId(id);
  });
}

// —— NEW: 處理載入時的 #hash 以及後續變更 —— //
function setupHashRouting() {
  window.addEventListener('DOMContentLoaded', () => {
    if (location.hash && location.hash.length > 1) {
      const id = decodeURIComponent(location.hash.slice(1));
      ensureSectionAndLoad(id);
    }
  });
  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    ensureSectionAndLoad(id);
  });
}

// ---------- 啟動 ----------
window.addEventListener("DOMContentLoaded", () => {
  setupAutoLoadAllSections();
  setupScrollSpy();
  setupMobileTocToggle();
  setupHomeButtonScroll();
  setupReadme();

  // —— NEW: 啟用導覽與 hash 路由 —— //
  setupTocNav();
  setupHashRouting();
});
