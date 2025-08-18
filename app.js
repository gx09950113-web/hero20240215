/* ================================
 * 百川群英錄 | app.js
 * ================================ */

/** -----------------------------
 * 1) 章節 id → 檔名 映射
 * ----------------------------- */
const SECTION_MAP = {
  // 基礎世界觀
  "basic-principles": "basic-principles",
  "world-history": "world-history",
  "divine-orb": "divine-orb",
  "yin-yang": "yin-yang",

  // 修仙基本知識
  "qi": "qi",
  "root": "root",
  "power": "power",
  "benefits": "benefits",
  "human-cultivation": "human-cultivation",
  "beast-cultivation": "beast-cultivation",
  "demon-cultivation": "demon-cultivation",

  // 世界地理
  "climate": "climate",
  "imperial-customs": "imperial-customs",
  "tax": "tax",
  "law": "law",

  "qj-history": "qj-history",
  "qj-culture": "qj-culture",
  "qj-structure": "qj-structure",
  "zhilingtu": "zhilingtu",

  "xl-history": "xl-history",
  "yang-vs-yin": "yang-vs-yin",
  "xl-structure": "xl-structure",
  "zhuocaoping": "zhuocaoping",

  "yt-history": "yt-history",
  "yt-culture": "yt-culture",
  "yt-structure": "yt-structure",
  "fuhailu": "fuhailu",

  "yl-history": "yl-history",
  "yl-culture": "yl-culture",
  "yl-structure": "yl-structure",
  "baiqishu": "baiqishu",

  "yuqing": "yuqing",

  // 世界產物
  "prod-zhilingtu": "prod-zhilingtu",
  "prod-zhuocaoping": "prod-zhuocaoping",
  "prod-fuhailu": "prod-fuhailu",
  "prod-baiqishu": "prod-baiqishu",
  "prod-menu": "prod-menu",
  "prod-wanxiezong": "prod-wanxiezong",
  "prod-fanshanxi": "prod-fanshanxi",
  "prod-jinyuyan": "prod-jinyuyan",
  "prod-lingcaojing": "prod-lingcaojing",
};

/** 基本設定 */
const DATA_BASE = "data"; // 你的 JSON 目錄
const LOADED_FLAG = Symbol("loadedOnce");

/** -----------------------------
 * 2) 小工具
 * ----------------------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const create = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  Object.assign(el, props);
  children.forEach((c) => {
    if (c == null) return;
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
};

function setSectionLoading(section) {
  section.dataset.state = "loading";
  section.innerHTML = `<div class="loading">載入中…</div>`;
}

function setSectionError(section, msg) {
  section.dataset.state = "error";
  section.innerHTML = `<div class="error">❌ ${msg}</div>`;
}

function setSectionEmpty(section) {
  section.dataset.state = "empty";
  section.innerHTML = `<div class="empty">（尚無內容）</div>`;
}

/** -----------------------------
 * 3) 資料載入與渲染
 * 支援資料格式：
 * - 字串：直接顯示為 <p>
 * - 陣列：每一段 <p> 一段
 * - 物件（可選）：{ title?, subtitle?, blocks?: string[] | {type, text}[] }
 * ----------------------------- */
async function loadSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  // 若載過就不重複
  if (section[LOADED_FLAG]) return;

  // 找不到對應檔名則顯示空
  const filename = SECTION_MAP[sectionId];
  if (!filename) {
    setSectionEmpty(section);
    section[LOADED_FLAG] = true;
    return;
  }

  setSectionLoading(section);

  try {
    const res = await fetch(`${DATA_BASE}/${filename}.json`, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    renderDataToSection(section, data);
    section[LOADED_FLAG] = true;
  } catch (err) {
    console.error(`載入失敗：${filename}.json`, err);
    setSectionError(section, `無法載入 ${filename}.json`);
  }
}

function renderDataToSection(section, data) {
  section.innerHTML = ""; // 清空

  // 標題（若 JSON 內自帶）
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const { title, subtitle, blocks } = data;

    if (title) section.appendChild(create("h2", {}, title));
    if (subtitle) section.appendChild(create("h3", {}, subtitle));

    if (Array.isArray(blocks)) {
      blocks.forEach((b) => {
        if (typeof b === "string") {
          section.appendChild(create("p", {}, b));
        } else if (b && typeof b === "object") {
          const type = b.type || "p";
          const text = b.text ?? "";
          // 安全起見一律文字插入（不信任外來 HTML）
          section.appendChild(create(type, {}, String(text)));
        }
      });
      return;
    }
  }

  // 純陣列
  if (Array.isArray(data)) {
    if (data.length === 0) {
      setSectionEmpty(section);
      return;
    }
    data.forEach((paragraph) => {
      section.appendChild(create("p", {}, String(paragraph)));
    });
    return;
  }

  // 純字串
  if (typeof data === "string") {
    if (data.trim() === "") {
      setSectionEmpty(section);
      return;
    }
    section.appendChild(create("p", {}, data));
    return;
  }

  // 其他未知型態
  section.appendChild(create("pre", {}, JSON.stringify(data, null, 2)));
}

/** -----------------------------
 * 4) Lazy Load：進入視口才載
 * ----------------------------- */
let io;
function setupIntersectionLoader() {
  if (!("IntersectionObserver" in window)) {
    // 後備方案：全部載
    Object.keys(SECTION_MAP).forEach((id) => loadSection(id));
    return;
  }

  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sec = entry.target;
          loadSection(sec.id);
          io.unobserve(sec);
        }
      });
    },
    { rootMargin: "200px 0px 400px 0px", threshold: 0.05 }
  );

  // 對應 main 內所有 section 進行觀察
  $$("#content > section").forEach((sec) => io.observe(sec));

  // 預先載入前兩個章節，提升首屏體驗
  const firstTwo = $$("#content > section").slice(0, 2);
  firstTwo.forEach((sec) => {
    loadSection(sec.id);
    if (io) io.unobserve(sec);
  });
}

/** -----------------------------
 * 5) Smooth Scroll + Scrollspy
 * ----------------------------- */
function setupSmoothScroll() {
  const links = $$("#toc a[href^='#']");
  links.forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      const target = document.getElementById(id);
      if (!target) return;

      // 確保已載入（若還沒載，先載）
      loadSection(id).finally(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.pushState(null, "", `#${id}`);
      });
    });
  });
}

function setupScrollSpy() {
  const linkById = new Map();
  $$("#toc a[href^='#']").forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    linkById.set(id, a);
  });

  const sections = $$("#content > section");

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        const link = linkById.get(id);
        if (!link) return;

        if (entry.isIntersecting) {
          // 清掉所有 active
          $$("#toc a.active").forEach((x) => x.classList.remove("active"));
          link.classList.add("active");
        }
      });
    },
    { rootMargin: "-20% 0px -70% 0px", threshold: 0.1 }
  );

  sections.forEach((sec) => spy.observe(sec));
}

/** -----------------------------
 * 6) 目次收合（有子清單的 li 可點擊展開/收起）
 * ----------------------------- */
function setupCollapsibleTOC() {
  // 讓含子層 ul 的 li 可點擊收合，但不影響點擊子層 a
  $("#toc")?.addEventListener("click", (e) => {
    const triggerLi = e.target.closest("li");
    if (!triggerLi) return;

    // 若點到的是 a，交給 smooth scroll
    if (e.target.tagName.toLowerCase() === "a") return;

    const sub = triggerLi.querySelector(":scope > ul");
    if (sub) {
      triggerLi.classList.toggle("collapsed");
    }
  });

  // 預設展開第一層，摺疊深層（可依喜好調整）
  $$("#toc > nav > ul > li").forEach((li) => {
    li.classList.remove("collapsed");
  });
}

/** -----------------------------
 * 7) Hash 直達
 * ----------------------------- */
function handleInitialHash() {
  const hash = decodeURIComponent(location.hash || "").replace(/^#/, "");
  if (!hash) return;

  const target = document.getElementById(hash);
  if (!target) return;

  // 若此節尚未載入，先載
  loadSection(hash).finally(() => {
    target.scrollIntoView({ behavior: "instant", block: "start" });
  });

  // 展開對應目次（向上把父 li 展開）
  const link = $(`#toc a[href="#${CSS.escape(hash)}"]`);
  if (link) {
    let li = link.closest("li");
    while (li) {
      li.classList.remove("collapsed");
      li = li.parentElement?.closest("li");
    }
  }
}

/** -----------------------------
 * 8) 對外工具（可選）：全部重載
 * ----------------------------- */
async function reloadAllSections() {
  $$("#content > section").forEach((sec) => {
    sec[LOADED_FLAG] = false;
  });
  if (io) io.disconnect();
  setupIntersectionLoader();
}

/** -----------------------------
 * 9) 啟動
 * ----------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  setupIntersectionLoader();
  setupSmoothScroll();
  setupScrollSpy();
  setupCollapsibleTOC();
  handleInitialHash();

  // 公用到 window（可選）
  window._BCQY = {
    reloadAllSections,
    loadSection,
  };
});
