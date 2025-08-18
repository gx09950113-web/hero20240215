/* =======================================================
   app.js — TOC 可收合 + 世界產物條目跨區對應 + README 支援
   - 指定項目：基礎世界觀 / 修仙基本知識 / 世界地理 / 世界產物 可收合
   - 世界產物子項目 → 對應到各宗門底下同名文件
   - ScrollSpy、hash 導航與資料載入（支援 /README.md + /data/{key}.json）
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
    // 這層的標題連結（大分類通常是純文字，但保險抓第一個 <a>）
    const selfA = $("> a", li) || $("a", li);
    const sub = $("> ul", li);
    if (!sub) return;

    const label = (selfA?.textContent || li.firstChild?.textContent || "").trim();
    if (!COLLAPSIBLE_KEYS.has(label)) return;

    li.classList.add("collapsible");
    // 點 li 區域時切換，但點真正的 <a> 仍可導向（保留導航）
    li.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;   // 交給超連結自己處理
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
          links.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");

          // 展開鏈上所有父層 li
          let li = link.closest("li");
          while (li) {
            li.classList.remove("collapsed");
            li = li.parentElement?.closest("li");
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

    const parentLi = li.parentElement?.closest("li");
    const parentA  = parentLi ? $(":scope > a", parentLi) : null;
    const parentText = parentA ? parentA.textContent.trim() : "";

    // 僅在「世界產物」底下啟用 crosswalk
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

/* =======================================================
 * 資料載入：README.md & JSON
 * ======================================================= */

/* 必改 1：README 特判 */
function getDataPath(key) {
  const k = String(key).toLowerCase();
  if (k === "readme") return "/README.md";      // 根目錄 README.md
  return `/data/${key}.json`;
}

/* 必改 2：依副檔名決定用 text() 或 json() */
async function loadSectionData(section) {
  if (!section) return;
  const key = section.dataset.key || section.id;
  if (!key) return;

  section.setAttribute("data-state", "loading");
  const loading = section.querySelector(".loading") || Object.assign(document.createElement("div"), { className: "loading", textContent: "Loading..." });
  if (!loading.isConnected) section.prepend(loading);

  try {
    const url = getDataPath(key);
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);

    let data;
    if (url.endsWith(".md")) {
      data = await res.text();   // README.md
    } else {
      data = await res.json();   // 其他 JSON
    }

    renderSection(section, data);
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

/* 必改 3：renderSection — README 支援 marked 或純文字 */
function renderSection(section, data) {
  const host = section.querySelector(".content") || section;
  $$(".__auto", host).forEach((el) => el.remove());

  // README.md 特判（支援 marked.js，無則退回 <pre>）
  const keyLower = (section.dataset.key || section.id || "").toLowerCase();
  const isReadme = keyLower === "readme";
  if (isReadme) {
    const box = document.createElement("div");
    box.className = "__auto";
    if (typeof marked !== "undefined" && typeof marked.parse === "function") {
      box.innerHTML = marked.parse(String(data));   // Markdown → HTML
    } else {
      const pre = document.createElement("pre");    // 後備純文字
      pre.className = "__auto";
      pre.textContent = String(data);
      box.appendChild(pre);
    }
    host.appendChild(box);
    return; // 不跑下面 JSON render
  }

  // ===== 原 JSON / 字串渲染 =====
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

  loadSectionData(sec);
  sec.scrollIntoView({ behavior: "smooth", block: "start" });

  // 展開 TOC 對應祖先層
  const link = $(`#toc a[href="#${CSS.escape(id)}"]`);
  if (link) {
    let li = link.closest("li");
    while (li) {
      li.classList.remove("collapsed");
      li = li.parentElement?.closest("li");
    }
  }
}

/* ===== 啟動 ===== */
window.addEventListener("DOMContentLoaded", () => {
  setupCollapsibles();
  setupCrossLinks();
  setupScrollSpy();

  // 初次載入：若有 hash 就處理；否則預設顯示 README
  if (location.hash) {
    handleHashChange();
  } else {
    location.hash = "#readme";   // 預設讀 README.md
  }
});

// 之後使用者切換 hash
window.addEventListener("hashchange", handleHashChange);
