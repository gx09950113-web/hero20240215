// =========================================
// 百川群英錄 | app.js（配合 index.html 現況版）
// - 自動掃描 <main> > section 依 ID 載入 /data/ 同名檔
// - 支援 .json → .md → .txt 順序嘗試
// - prod-* 會映射為去掉前綴後的同名檔
// - README：同時渲染頁面內 #readme 與彈窗，來源 assets/README.md
// - ScrollSpy / 手機 TOC 維持
// - 禁止點背景就關閉 README（只允許按鈕）
// =========================================

// ---- 小工具 --------------------------------
async function fetchFirst(paths) {
  for (const url of paths) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch (_) {}
  }
  throw new Error("No available source: " + paths.join(", "));
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function idToDataKey(id) {
  // prod-xxx -> xxx；其他照原 ID
  return id.startsWith("prod-") ? id.slice(5) : id;
}

function buildCandidatePaths(key) {
  // 依序嘗試 .json → .md → .txt
  return [`data/${key}.json`, `data/${key}.md`, `data/${key}.txt`];
}

// ---- 動態載入 --------------------------------
async function loadSectionAuto(sectionEl) {
  const id = sectionEl.getAttribute("id");
  if (!id) return;

  const key = idToDataKey(id);
  const candidates = buildCandidatePaths(key);

  sectionEl.dataset.state = "loading";
  try {
    const text = await fetchFirst(candidates);

    let html;
    if (candidates[0].endsWith(".json") && text.trim().startsWith("[") || text.trim().startsWith("{")) {
      // 嘗試以 JSON 解析（支援陣列或物件）
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          html = parsed.map(p => `<p>${escapeHTML(String(p))}</p>`).join("");
        } else {
          // 物件就直接漂亮轉 pre
          html = `<pre>${escapeHTML(JSON.stringify(parsed, null, 2))}</pre>`;
        }
      } catch {
        // 解析失敗就當作純文字
        html = `<pre>${escapeHTML(text)}</pre>`;
      }
    } else if (text.includes("# ") || text.includes("## ") || text.includes("\n- ")) {
      // 粗略判斷 markdown，若有 marked 就轉
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
  const sections = document.querySelectorAll("main > section"); // 直接用你 index 的所有區塊
  sections.forEach(sec => {
    // 若 section 內沒東西或看起來是占位，就幫忙載
    const isEmpty = sec.innerHTML.trim() === "" || /<div[^>]*class=["'][^"']*loading/i.test(sec.innerHTML);
    if (isEmpty || sec.id === "readme") {
      loadSectionAuto(sec);
    }
  });
}

// ---- ScrollSpy --------------------------------
function setupScrollSpy() {
  const links = document.querySelectorAll("#toc a[href^='#']");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(a => a.classList.remove("active"));
        const id = entry.target.getAttribute("id");
        const active = document.querySelector(`#toc a[href="#${CSS.escape(id)}"]`);
        if (active) active.classList.add("active");
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });

  document.querySelectorAll("main > section").forEach(sec => observer.observe(sec));
}

// ---- README（頁面 + 彈窗） --------------------
// 你的 index 裡：#readme（頁面區塊）、#readme-modal / #readme-modal-content / #readme-ok（彈窗）
// 並且有 backdrop，但無 .modal-close 與 data-modal 觸發器。 參見 index 結構。
// 我們做法：
// 1) 載入 assets/README.md
// 2) 渲染到 #readme .content 與 #readme-modal-content
// 3) 第一次進站如果沒有「dontShowReadme」就自動打開彈窗
// 4) 只允許按「我知道了」關閉；不在背景點擊時關閉
async function setupReadme() {
  const inlineWrap = document.querySelector("#readme .content");
  const modal = document.getElementById("readme-modal");
  const modalContent = document.getElementById("readme-modal-content");
  const okBtn = document.getElementById("readme-ok");
  const dontShow = document.getElementById("readme-dont-show");

  // 載入 README
  try {
    const raw = await fetchFirst(["assets/README.md"]); // 修正正確路徑
    const html = (window.marked && typeof marked.parse === "function")
      ? marked.parse(raw)
      : `<pre>${escapeHTML(raw)}</pre>`;

    if (inlineWrap) inlineWrap.innerHTML = html;
    if (modalContent) modalContent.innerHTML = html;
  } catch (err) {
    const em = `<div class="error">README 載入失敗：${escapeHTML(err.message || String(err))}</div>`;
    if (inlineWrap) inlineWrap.innerHTML = em;
    if (modalContent) modalContent.innerHTML = em;
  }

  // 自動開啟（僅第一次）
  const dont = localStorage.getItem("bcql_dontShowReadme") === "1";
  if (!dont && modal) {
    modal.hidden = false;                // 你的 index 初始是 hidden
    modal.classList.add("open");
  }

  // 僅允許按鈕關閉（不掛背景點擊）
  if (okBtn && modal) {
    okBtn.addEventListener("click", () => {
      if (dontShow && dontShow.checked) {
        localStorage.setItem("bcql_dontShowReadme", "1");
      }
      modal.classList.remove("open");
      // 可選：關閉後維持 display，不再切回 hidden，避免動畫跳動
    });
  }
}

// ---- TOC（手機點擊展開/收合） -----------------
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

// ---- 啟動 ------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  setupAutoLoadAllSections();  // 依你的 index sections 自動載入
  setupScrollSpy();
  setupMobileTocToggle();
  setupReadme();               // README（頁面 + 彈窗）
});
