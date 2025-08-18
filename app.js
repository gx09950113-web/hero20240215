/* =======================================================
   app.js — TOC 可收合 + 世界產物條目跨區對應 + README.md 渲染
   - 指定項目：基礎世界觀 / 修仙基本知識 / 世界地理 / 世界產物 可收合
   - 世界產物子項目 → 對應到各宗門底下同名文件
   - README.md 初始載入並用 marked 轉成 HTML
   - 其它章節依 /data/{key}.json 載入
   ======================================================= */

/* 快捷選擇器 */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* 文字轉 slug（拿來推斷 section id 或資料 key） */
const slugify = (t) =>
  t.trim()
   .replace(/\s+/g, "-")
   .replace(/[^\w\u4e00-\u9fa5-]/g, "")
   .toLowerCase();

/* ===== 可收合的「指定按鈕」清單 =====
   目標：#toc 中文字為下列者的 <li> 加上收合能力 */
const COLLAPSIBLE_KEYS = new Set([
  "基礎世界觀",
  "修仙基本知識",
  "世界地理",
  "世界產物",
  "千訣宗",   // 👈 新增
  "玄靈宗",   // 👈 新增
  "衍天宗",   // 👈 新增
  "云嵐宗",
]);

/* ===== 世界產物 → 各宗門同名文件 的對應關係 =====
   規則：當使用者在 TOC 下點到「世界產物/xxx」，實際轉向到「世界地理/{宗門}/xxx」 */
const PRODUCT_CROSSWALK = {
  "執靈圖": ["千訣宗", "執靈圖"],
  "灼草經": ["玄靈宗", "灼草經"],
  "符海錄": ["衍天宗", "符海錄"],
  "百器書": ["云嵐宗", "百器書"],
};

/* ===== 初始化：收合行為 ===== */
function setupCollapsibles() {
  const toc = $("#toc");
  if (!toc) return;

  // 為「有子層」的 li 加可收合；僅限指定文字的項目
  $$("#toc li").forEach((li) => {
    const a = $("> a", li) || $("a", li);  // 該層標題連結
    const sub = $("> ul", li);             // 子層 UL
    if (!a || !sub) return;

    const text = a.textContent.trim();
    if (!COLLAPSIBLE_KEYS.has(text)) return;

    li.classList.add("collapsible"); // 標記一下
    // 點 li 區域時切換，但點真正的 <a> 仍可導向（保留導航）
    li.addEventListener("click", (e) => {
      if (e.target.closest("a")) return; // 點到連結就放行
      li.classList.toggle("collapsed");
    });
  });
}

/* ===== ScrollSpy：同步高亮 TOC 連結 ===== */
function setupScrollSpy() {
  const links = $$("#toc a[href^='#']");
  const map = new Map(); // sectionId -> link
  links.forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    const sec = document.getElementById(id);
    if (sec) map.set(id, a);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        const link = map.get(id);
        if (!link) return;
        if (entry.isIntersecting) {
          // 清掉舊 active
          links.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");

          // 確保 link 所在父層展開
          const li = link.closest("li");
          let p = li?.parentElement;
          while (p && p !== document) {
            if (p.tagName === "UL") {
              const pli = p.closest("li");
              if (pli) pli.classList.remove("collapsed");
            }
            p = p.parentElement;
          }
        }
      });
    },
    { rootMargin: "-30% 0px -60% 0px", threshold: 0.01 }
  );

  map.forEach((_, id) => {
    const sec = document.getElementById(id);
    if (sec) io.observe(sec);
  });
}

/* ===== 導航攔截：世界產物 → 各宗門同名文件 ===== */
function setupCrossLinks() {
  $("#toc")?.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const leafText = link.textContent.trim();
    const li = link.closest("li");
    if (!li) return;

    const parentA = $(":scope > a", li.parentElement?.closest("li") || document.createElement("div"));
    const parentText = parentA ? parentA.textContent.trim() : "";

    // 只在「世界產物」底下啟用 crosswalk
    if (parentText === "世界產物" && PRODUCT_CROSSWALK[leafText]) {
      e.preventDefault();
      const [sect, doc] = PRODUCT_CROSSWALK[leafText]; // 例如 ["千訣宗","執靈圖"]
      const targetId = slugify(`${sect}-${doc}`);

      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.pushState(null, "", `#${encodeURIComponent(targetId)}`);
      } else {
        location.hash = `#${encodeURIComponent(targetId)}`;
      }
    }
  });
}

/* ===== 資料載入路徑：README 用 .md，其它用 /data/{key}.json ===== */
function getDataPath(key) {
  const k = String(key).toLowerCase();
  if (k === "readme") return "/README.md";     // ⭐ README 特例
  return `/data/${key}.json`;
}

/* ===== 載入 section 資料：自動判斷 .md or .json ===== */
async function loadSectionData(section) {
  if (!section) return;
  const key = section.dataset.key || section.id;
  if (!key) return;

  section.setAttribute("data-state", "loading");
  const loading = section.querySelector(".loading") || Object.assign(document.createElement("div"), { className: "loading", textContent: "Loading..." });
  if (!loading.isConnected) section.prepend(loading);

  try {
    const path = getDataPath(key);
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status + " " + res.statusText);

    if (path.endsWith(".md")) {
      // Markdown → HTML（需要 index.html 先載入 assets/libs/marked.js）
      const md = await res.text();
      const html = (typeof marked?.parse === "function")
        ? marked.parse(md)
        : (typeof marked === "function" ? marked(md) : md); // 極端 fallback
      renderMarkdown(section, html);
    } else {
      const data = await res.json();
      renderSection(section, data);
    }

    section.setAttribute("data-state", "ready");
    loading.remove();
  } catch (err) {
    section.setAttribute("data-state", "error");
    const errBox = section.querySelector(".error") || Object.assign(document.createElement("div"), { className: "error" });
    errBox.textContent = `載入失敗：${err.message}`;
    if (!errBox.isConnected) section.prepend(errBox);
    loading.remove();
  }
}

/* ===== 渲染 JSON（維持原本行為） ===== */
function renderSection(section, data) {
  const host = section.querySelector(".content") || section;
  // 清空舊內容（保留非自動產生元素）
  $$(".__auto", host).forEach((el) => el.remove());

  if (Array.isArray(data)) {
    data.forEach((para) => {
      const p = document.createElement("p");
      p.className = "__auto";
      p.textContent = String(para);
      host.appendChild(p);
    });
  } else if (data && typeof data === "object") {
    Object.entries(data).forEach(([k, v]) => {
      const h3 = document.createElement("h3");
      h3.className = "__auto";
      h3.textContent = k;
      host.appendChild(h3);

      const p = document.createElement("p");
      p.className = "__auto";
      p.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      host.appendChild(p);
    });
  } else if (typeof data === "string") {
    const p = document.createElement("p");
    p.className = "__auto";
    p.textContent = data;
    host.appendChild(p);
  } else {
    const empty = document.createElement("div");
    empty.className = "empty __auto";
    empty.textContent = "（空）";
    host.appendChild(empty);
  }
}

/* ===== 渲染 Markdown（readme 用） ===== */
function renderMarkdown(section, html) {
  const host = section.querySelector(".content") || section;
  host.innerHTML = html; // README 是你自己寫的可信來源，直接插入
}

/* ===== 根據 hash 顯示/載入對應 section ===== */
function handleHashChange() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!id) return;

  // 如果對應 section 不存在，就動態建立（可選）
  let sec = document.getElementById(id);
  if (!sec) {
    sec = document.createElement("section");
    sec.id = id;
    const h2 = document.createElement("h2");
    h2.textContent = id;
    sec.appendChild(h2);
    $("#content")?.appendChild(sec);
  }

  // 嘗試載入資料（依 id 或 data-key）
  loadSectionData(sec);

  // 捲動到可視
  sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===== 啟動 ===== */
window.addEventListener("DOMContentLoaded", () => {
  setupCollapsibles();
  setupCrossLinks();
  setupScrollSpy();

  // ⭐ 先載入 README（需要 index.html 有 <section id="readme"><div class="content"></div>）
  const readmeSec = document.getElementById("readme");
  if (readmeSec) loadSectionData(readmeSec);

  // 若網址列有 #hash，就切到對應章節
  if (location.hash) handleHashChange();
});

// 之後使用者切 hash
window.addEventListener("hashchange", handleHashChange);
