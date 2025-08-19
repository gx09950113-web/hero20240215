// =========================================
// 百川群英錄 | app.js（自動配合 index 版）
// - 自動掃描 <main>#content > section 的 id 來載入 /data/{id}.json|.md|.txt
// - prod-* 會去掉前綴後再找同名檔
// - #homepage 固定文案；#readme 只用來顯示 README（不覆蓋）
// - README 來源：assets/README.md（同時渲染頁內與彈窗）；僅按鈕關閉；支援「下次不要再出現」
// - ScrollSpy / 手機 TOC；首頁按鈕平滑捲動
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
  // prod-xxx -> xxx；其他維持原樣
  return id.startsWith("prod-") ? id.slice(5) : id;
}

function buildCandidatePaths(key) {
  // 依序嘗試 .json → .md → .txt
  return [`data/${key}.json`, `data/${key}.md`, `data/${key}.txt`];
}

function isLikelyMarkdown(text) {
  // 粗略判斷：有標題/清單符號等
  return /(^|\n)#{1,6}\s|(^|\n)[-\*+]\s|(^|\n)\d+\.\s/.test(text);
}

// ---------- 內容載入 ----------
async function loadSectionAuto(sectionEl) {
  const id = sectionEl.getAttribute("id");
  if (!id) return;

  // 跳過固定/特例
  if (id === "homepage") return; // 固定文案，不覆蓋
  // #readme 內容由 setupReadme() 處理
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
      } catch (e) {
        // 解析失敗就當純文字
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
  const sections = document.querySelectorAll("main#content > section");
  sections.forEach(sec => loadSectionAuto(sec));
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

  // 讀取 README 文字
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

  // 第一次自動開啟（localStorage 旗標）
  const dont = localStorage.getItem("bcql_dontShowReadme") === "1";
  if (!dont && modal) {
    // 你的 index 初始是 hidden；開啟時去掉 hidden 並加 open class（若有）
    modal.hidden = false;
    modal.classList.add("open");
  }

  // 僅按鈕關閉，不綁背景關閉（依你的需求）
  if (okBtn && modal) {
    okBtn.addEventListener("click", () => {
      if (dontShow && dontShow.checked) {
        localStorage.setItem("bcql_dontShowReadme", "1");
      }
      modal.classList.remove("open");
      // 可選：modal.hidden = true;（若你希望完全隱藏）
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

// ---------- 啟動 ----------
window.addEventListener("DOMContentLoaded", () => {
  setupAutoLoadAllSections(); // 自動載入（依 id → /data/{id}.*）
  setupScrollSpy();
  setupMobileTocToggle();
  setupHomeButtonScroll();
  setupReadme();             // README（頁面 + 彈窗）
});
