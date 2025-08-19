// =========================================
// 百川群英錄 | app.js（單檢視版 viewer）
// - 遞迴展開 JSON（物件/陣列巢狀成 <ul>）
// - 只覆蓋 #viewer .content，不刪標題
// - 缺少 #viewer-title/.content 會自動補齊
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
    } catch {}
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
  return /(^|\n)#{1,6}\s|(^|\n)[-*+]\s|(^|\n)\d+\.\s/.test(text);
}

// ===== 世界氣候（頂部顯示全地圖）設定 =====
const CLIMATE_KEY = "climate"; // ← 和你的 <a href="#climate"> 對齊
const CLIMATE_IMAGE_SRC = "assets/images/0全地圖.jpg";

// ===== 各宗門圖標設定（依據 section id 前綴/對應檔名判斷）=====
const GROUP_ICON = {
  royal: "assets/images/royal-icon.png",
  qj:    "assets/images/qj-icon.png",
  xl:    "assets/images/xl-icon.png",
  yt:    "assets/images/yt-icon.png",
  yl:    "assets/images/yl-icon.png",
};

// 依據 key 推斷所屬群組
function inferGroupFromKey(key) {
  // 皇城
  if (key.startsWith("royal-") || key === "baichuan-law") return "royal";
  // 千訣宗（含產物：執靈圖）
  if (key.startsWith("qj-") || key === "zhilingtu") return "qj";
  // 玄靈宗（含產物：灼草經）
  if (key.startsWith("xl-") || key === "zhuocaoping" || key === "yang-vs-yin") return "xl";
  // 衍天宗（含產物：符海錄）
  if (key.startsWith("yt-") || key === "fuhailu") return "yt";
  // 云嵐宗（含產物：百器書）
  if (key.startsWith("yl-") || key === "baiqishu") return "yl";
  return null;
}

// ---------- JSON 渲染（遞迴展開） ----------
function renderJsonObjectAsList(obj) {
  const esc = (x) => escapeHTML(x);
  const isPrimitive = (v) => v === null || typeof v !== "object";

  const renderValue = (v) => {
    if (isPrimitive(v)) return esc(String(v));

    if (Array.isArray(v)) {
      const allPrim = v.every(isPrimitive);
      if (allPrim) {
        return `<ul class="kv-list">` + v.map(x => `<li>${esc(String(x))}</li>`).join("") + `</ul>`;
      }
      return `<ul class="kv-list">` + v.map(x => `<li>${renderValue(x)}</li>`).join("") + `</ul>`;
    }

    // === 支援「說明 + 格式」：若物件含有 { 說明, 格式 }，依格式套樣式 ===
    const fmt = v && typeof v === "object" && !Array.isArray(v)
      ? (v["格式"] || v["format"] || null)
      : null;

    const color  = fmt && (fmt["文字顏色"] || fmt["顏色"] || fmt["color"]);
    const weight = fmt && (fmt["字重"]     || fmt["fontWeight"] || fmt["字體粗細"]);

    let inner = `<ul class="kv-list">`;
    for (const [k, vv] of Object.entries(v)) {
      if (k === "格式" || k === "format") continue; // 格式屬性只用來控制樣式，不顯示

      let valueHtml;
      if (k === "說明" && (color || weight)) {
        const css = [
          color  ? `color:${escapeHTML(String(color))}` : "",
          weight ? `font-weight:${escapeHTML(String(weight))}` : ""
        ].filter(Boolean).join(";");

        valueHtml = `<span style="${css}">${esc(String(vv))}</span>`;
      } else {
        valueHtml = isPrimitive(vv) ? esc(String(vv)) : renderValue(vv);
      }

      inner += `<li><strong>${esc(k)}：</strong>${valueHtml}</li>`;
    }
    inner += `</ul>`;
    return inner;
  };

  let html = `<div class="prose">`;
  for (const [key, val] of Object.entries(obj)) {
    html += `<div class="kv-group"><h3>${esc(key)}</h3>${renderValue(val)}</div>`;
  }
  html += `</div>`;
  return html;
}

// ---------- 內容載入（支援 dataset.key） ----------
async function loadSectionAuto(sectionEl) {
  const id = sectionEl.getAttribute("id");
  if (!id) return;

  const rawKey = sectionEl.dataset.key || id;
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

    // ★★★ 世界氣候：在 JSON/Markdown 區塊「上方」插入全地圖 ★★★
    if (key === CLIMATE_KEY) {
      const mapBlock = `
        <div class="map-wrapper">
          <h2 class="section-title">世界氣候</h2>
          <img class="map-image" src="${CLIMATE_IMAGE_SRC}" alt="世界全地圖">
        </div>
      `;
      html = mapBlock + `<div class="json-section">${html}</div>`;
    }

    // ★★★ 宗門/皇城：在頂部插入對應 icon（依據 key 判斷）★★★
    const group = inferGroupFromKey(key);
    if (group && GROUP_ICON[group]) {
      const iconBlock = `
        <div class="section-badge">
          <img src="${GROUP_ICON[group]}" alt="${group}-icon">
        </div>
      `;
      html = iconBlock + html;
    }

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

// ---------- 首頁按鈕：清空其他 section，只留 homepage ----------
function setupHomeButtonScroll() {
  const homeBtn = document.querySelector('.site-header .home-btn[href="#homepage"]');
  if (!homeBtn) return;

  homeBtn.addEventListener("click", (e) => {
    const homepage = document.getElementById("homepage");
    if (!homepage) return;
    e.preventDefault();

// 1) 刪除 main#content 內除了 homepage 與 home-hero 以外的所有 section
const hero = document.getElementById("home-hero");
document.querySelectorAll("main#content > section").forEach(sec => {
  if (sec !== homepage && sec !== hero) sec.remove();
});

    // 2) 若存在 viewer，也移除（以確保畫面只剩首頁）
    const viewer = document.getElementById("viewer");
    if (viewer) viewer.remove();

    // 3) 捲動到首頁、同步 URL hash
    homepage.scrollIntoView({ behavior: "smooth", block: "start" });
    if (location.hash !== "#homepage") history.pushState(null, "", "#homepage");

    // 4) TOC 高亮重置
    document.querySelectorAll("#toc a").forEach(a => a.classList.remove("active"));
  });
}

// ---------- TOC 高亮輔助 ----------
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

  if (targetId === "homepage" || targetId === "readme") {
    const sec = document.getElementById(targetId);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

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
const hero = document.getElementById("home-hero");
if (main) {
  const anchor = hero || home;
  anchor ? main.insertBefore(viewer, anchor.nextSibling) : main.appendChild(viewer);
}
  } else {
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

  const titleEl = viewer.querySelector("#viewer-title");
  viewer.dataset.key = targetId;
  if (titleEl) titleEl.textContent = findTocLabelById(targetId) || targetId;

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

// —— 主題切換 —— //
function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("theme", mode);
    btn.textContent = mode === "dark" ? "☀️" : "🌙";
    btn.setAttribute("aria-label", mode === "dark" ? "切換為亮色模式" : "切換為暗色模式");
    btn.setAttribute("title", mode === "dark" ? "切換為亮色模式" : "切換為暗色模式");
  }

  // 初始化圖示
  setTheme(currentTheme());

  btn.addEventListener("click", () => {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
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
  setupScrollSpy();
  setupMobileTocToggle();
  setupHomeButtonScroll();
  setupReadme();
  setupTocNav();
  setupThemeToggle();  // ✅ 新增
  setupHashRouting();
});
