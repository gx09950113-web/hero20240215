// =========================================
// 百川群英錄 | app.js（單檢視版 viewer）
// - TOC 點選只用 #viewer 載入覆蓋，不再新增 section
// - JSON 物件：渲染成卡片＋條列（扁平鍵值 → <ul> 條列）
// - Markdown：外層 .prose 排版
// - 手機 TOC 點擊展開、README 彈窗、首頁按鈕
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

// ✅ JSON 物件 → 卡片＋條列（全為原始值時，輸出單一 <ul>）
function renderJsonObjectAsList(obj) {
  const esc = (x) => escapeHTML(x);
  const entries = Object.entries(obj);
  const allPrimitive = entries.every(([_, v]) =>
    !Array.isArray(v) && (v === null || typeof v !== "object")
  );

  let html = '<div class="prose">';

  if (allPrimitive) {
    html += `<ul class="kv-list">` + entries.map(([k, v]) =>
      `<li><strong>${esc(k)}：</strong>${esc(v)}</li>`
    ).join("") + `</ul>`;
    html += `</div>`;
    return html;
  }

  for (const [key, val] of entries) {
    html += `<div class="kv-group"><h3>${esc(key)}</h3>`;
    if (Array.isArray(val)) {
      html += `<ul class="kv-list">` + val.map(v => `<li>${esc(v)}</li>`).join("") + `</ul>`;
    } else if (val && typeof val === "object") {
      html += `<ul class="kv-list">` +
        Object.entries(val).map(([k2, v2]) =>
          `<li><strong>${esc(k2)}：</strong>${
            Array.isArray(v2) ? esc(v2.join("、")) :
            (v2 && typeof v2 === "object") ? esc(JSON.stringify(v2)) :
            esc(v2)
          }</li>`
        ).join("") +
      `</ul>`;
    } else {
      html += `<p>${esc(val)}</p>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

// ---------- 內容載入（支援 dataset.key） ----------
async function loadSectionAuto(sectionEl) {
  const id = sectionEl.getAttribute("id");
  if (!id) return;

  // 用 data-key 指向真正資料 key（viewer 會用）
  const rawKey = sectionEl.dataset.key || id;

  // 這兩個不是透過這支載入
  if (rawKey === "homepage" || rawKey === "readme") return;

  const key = idToDataKey(rawKey);
  const candidates = buildCandidatePaths(key);

  sectionEl.dataset.state = "loading";

  try {
    const { text, url } = await fetchFirst(candidates);
    let html = "";

    if (url.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          html = `<div class="prose">` + parsed.map(p => `<p>${escapeHTML(p)}</p>`).join("") + `</div>`;
        } else if (parsed && typeof parsed === "object") {
          html = renderJsonObjectAsList(parsed);
        } else {
          html = `<pre>${escapeHTML(String(parsed))}</pre>`;
        }
      } catch {
        html = `<pre>${escapeHTML(text)}</pre>`;
      }
    } else if (url.endsWith(".md") || isLikelyMarkdown(text)) {
      html = (window.marked && typeof marked.parse === "function")
        ? `<div class="prose">${marked.parse(text)}</div>`
        : `<pre>${escapeHTML(text)}</pre>`;
    } else {
      html = `<pre>${escapeHTML(text)}</pre>`;
    }

    // ★ 只更新內容容器；避免把 #viewer-title 一起覆蓋掉
    const contentEl = sectionEl.querySelector(".content") || sectionEl;
    contentEl.innerHTML = html;

    sectionEl.dataset.state = "loaded";
  } catch (err) {
    const contentEl = sectionEl.querySelector(".content") || sectionEl;
    contentEl.innerHTML = `<div class="error">載入失敗：${escapeHTML(err.message || String(err))}</div>`;
    sectionEl.dataset.state = "error";
  }
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
      ? `<div class="prose">${marked.parse(text)}</div>`
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
    modal.hidden = false;
    modal.classList.add("open");
  }

  if (okBtn && modal) {
    okBtn.addEventListener("click", () => {
      if (dontShow && dontShow.checked) {
        localStorage.setItem("bcql_dontShowReadme", "1");
      }
      modal.classList.remove("open");
      modal.hidden = true;
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

// ---------- TOC 高亮輔助（單檢視時手動處理） ----------
function findTocLabelById(id) {
  const a = document.querySelector(`#toc a[href="#${CSS.escape(id)}"]`);
  return a ? a.textContent.trim() : "";
}
function setActiveById(id) {
  document.querySelectorAll("#toc a").forEach(a => a.classList.remove("active"));
  const link = document.querySelector(`#toc a[href="#${CSS.escape(id)}"]`);
  if (link) link.classList.add("active");
}

// ---------- 單檢視：#viewer 覆蓋載入 ----------
async function ensureSectionAndLoad(targetId) {
  if (!targetId) return;

  // 特例：首頁/README 不走 viewer
  if (targetId === "homepage" || targetId === "readme") {
    const sec = document.getElementById(targetId);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  // 1) 準備（或建立）viewer
  let viewer = document.getElementById("viewer");
  if (!viewer) {
    viewer = document.createElement("section");
    viewer.id = "viewer";
    viewer.innerHTML = `
      <h2 id="viewer-title"></h2>
      <div class="content"><div class="loading">Loading…</div></div>
    `;
    const main = document.querySelector("main#content") || document.querySelector("main");
    const home = document.getElementById("homepage");
    if (main) {
      home ? main.insertBefore(viewer, home.nextSibling) : main.appendChild(viewer);
    }
  } else {
    // ★ 若先前被覆蓋掉標題/內容，這裡補回來
    if (!viewer.querySelector("#viewer-title")) {
      const h2 = document.createElement("h2");
      h2.id = "viewer-title";
      viewer.prepend(h2);
    }
    if (!viewer.querySelector(".content")) {
      const div = document.createElement("div");
      div.className = "content";
      viewer.appendChild(div);
    }
  }

  // 2) 用 data-key 指向目標，並設定標題
  const titleEl = viewer.querySelector("#viewer-title");
  viewer.dataset.key = targetId; // ★ 關鍵：loadSectionAuto 會用 dataset.key
  if (titleEl) titleEl.textContent = findTocLabelById(targetId) || targetId;

  // 3) 載入並捲動
  await loadSectionAuto(viewer);
  viewer.scrollIntoView({ behavior: "smooth", block: "start" });
}

// —— 導覽輔助（保留 hash） —— //
function navigateToId(id) {
  if (!id) return;
  if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
  setActiveById(id);
  ensureSectionAndLoad(id);
}

// —— 攔截 TOC 內所有 # 錨點 —— //
function setupTocNav() {
  const toc = document.getElementById("toc");
  if (!toc) return;
  toc.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href").slice(1);
    if (!id) return;
    e.preventDefault();
    navigateToId(id);
  });
}

// —— 處理初始與後續 hash 變更 —— //
function setupHashRouting() {
  window.addEventListener("DOMContentLoaded", () => {
    if (location.hash && location.hash.length > 1) {
      const id = decodeURIComponent(location.hash.slice(1));
      setActiveById(id);
      ensureSectionAndLoad(id);
    }
  });
  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    setActiveById(id);
    ensureSectionAndLoad(id);
  });
}

// ---------- 啟動 ----------
window.addEventListener("DOMContentLoaded", () => {
  // 原本會把所有 section 都載入；單檢視模式用不到，拿掉以免重複請求
  // setupAutoLoadAllSections();

  setupScrollSpy();
  setupMobileTocToggle();
  setupHomeButtonScroll();
  setupReadme();

  setupTocNav();
  setupHashRouting();
});
