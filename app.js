/* =======================================================
   app.js — 置頂 TOC + README 彈窗 + 內容載入 + 跨跳
   ======================================================= */

/* 小工具 */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

/* 產品（世界產物）→ 各宗門對應 */
const PRODUCT_MAP = new Map([
  ["#prod-zhilingtu",   "#zhilingtu"],    // 世界產物/執靈圖 → 千訣宗/執靈圖
  ["#prod-zhuocaoping", "#zhuocaoping"],  // 世界產物/灼草經 → 玄靈宗/灼草經
  ["#prod-fuhailu",     "#fuhailu"],      // 世界產物/符海錄 → 衍天宗/符海錄
  ["#prod-baiqishu",    "#baiqishu"],     // 世界產物/百器書 → 云嵐宗/百器書
]);

/* ========= 導航行為：世界產物跨跳 ========= */
function setupProductCrosswalk() {
  $("#toc")?.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#']");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;

    if (PRODUCT_MAP.has(href)) {
      e.preventDefault();
      const to = PRODUCT_MAP.get(href);
      if (to) location.hash = to;
    }
  });
}

/* ========= ScrollSpy：同步 TOC 高亮 ========= */
function setupScrollSpy() {
  const linkById = new Map();
  $$("#toc a[href^='#']").forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    if (id) linkById.set(id, a);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      const link = linkById.get(id);
      if (!link) return;
      if (entry.isIntersecting) {
        $$("#toc a").forEach((x) => x.classList.remove("active"));
        link.classList.add("active");
      }
    });
  }, { rootMargin: "-30% 0px -60% 0px", threshold: 0.01 });

  linkById.forEach((_, id) => {
    const sec = document.getElementById(id);
    if (sec) io.observe(sec);
  });
}

/* ========= 資料來源決策 ========= */
function getDataPath(key) {
  const k = String(key).toLowerCase();
  if (k === "readme") return "/README.md";
  return `/data/${key}.json`;
}

/* ========= 載入指定 section 的資料 ========= */
async function loadSectionData(section) {
  if (!section) return;
  const key = section.dataset.key || section.id;
  if (!key) return;

  section.setAttribute("data-state", "loading");
  let loading = section.querySelector(".loading");
  if (!loading) {
    loading = Object.assign(document.createElement("div"), { className: "loading", textContent: "Loading..." });
    section.prepend(loading);
  }

  try {
    const url = getDataPath(key);
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const data = url.endsWith(".md") ? await res.text() : await res.json();
    renderSection(section, data);
    section.setAttribute("data-state", "ready");
  } catch (err) {
    section.setAttribute("data-state", "error");
    const errBox = section.querySelector(".error") || Object.assign(document.createElement("div"), { className: "error" });
    errBox.textContent = `載入失敗：${err.message}`;
    if (!errBox.isConnected) section.prepend(errBox);
  } finally {
    loading?.remove();
  }
}

/* ========= 把資料渲染到 section ========= */
function renderSection(section, data) {
  const host = section.querySelector(".content") || section;
  $$(".__auto", host).forEach((el) => el.remove());

  // README：Markdown 轉 HTML（若未載入 marked，退回純文字）
  if ((section.dataset.key?.toLowerCase() === "readme") || (section.id.toLowerCase() === "readme")) {
    const box = document.createElement("div");
    box.className = "__auto";
    if (typeof marked !== "undefined" && typeof marked.parse === "function") {
      box.innerHTML = marked.parse(String(data));
    } else {
      const pre = document.createElement("pre");
      pre.className = "__auto";
      pre.textContent = String(data);
      box.appendChild(pre);
    }
    host.appendChild(box);
    return;
  }

  // 其他：支援 Array / Object / String
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

/* ========= 依 hash 載入相對應 section ========= */
function handleHashChange() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!id) return;

  let sec = document.getElementById(id);
  if (!sec) {
    // 若找不到，動態建立一個空殼
    sec = document.createElement("section");
    sec.id = id;
    const h2 = document.createElement("h2");
    h2.textContent = id;
    sec.appendChild(h2);
    $("#content")?.appendChild(sec);
  }

  loadSectionData(sec);
  sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ========= README 彈窗：載入 & 顯示 ========= */
async function setupReadmeModal() {
  const modal = document.getElementById("readme-modal");
  if (!modal) return;
  // 若用戶選擇不再顯示，就略過
  if (localStorage.getItem("readme:dontShow") === "1") return;

  const contentBox = document.getElementById("readme-modal-content");
  const okBtn = document.getElementById("readme-ok");
  const dontShow = document.getElementById("readme-dont-show");

  // 載入 README.md
  let text = "";
  try {
    const res = await fetch("/README.md", { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    text = await res.text();
  } catch (err) {
    text = `README 載入失敗：${err.message}`;
  }

  // 渲染 Markdown
  if (typeof marked !== "undefined" && typeof marked.parse === "function") {
    contentBox.innerHTML = marked.parse(text);
  } else {
    const pre = document.createElement("pre");
    pre.textContent = text;
    contentBox.replaceChildren(pre);
  }

  // 顯示 modal
  openReadmeModal();

  // 行為
  function openReadmeModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeReadmeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (dontShow?.checked) localStorage.setItem("readme:dontShow", "1");
  }

  okBtn?.addEventListener("click", closeReadmeModal);
  modal.querySelector(".modal-backdrop")?.addEventListener("click", closeReadmeModal);
  document.addEventListener("keydown", (e) => {
    if (!modal.hidden && e.key === "Escape") closeReadmeModal();
  });
}

/* ========= 啟動 ========= */
window.addEventListener("DOMContentLoaded", () => {
  setupProductCrosswalk();
  setupScrollSpy();

  // 若網址已有 #hash，載入對應章節
  if (location.hash) {
    handleHashChange();
  }
  // 如果你還是想主內容預設顯示 readme，可取消註解下一行：
  // else { location.hash = "#readme"; }

  // 額外：顯示 README 的「彈窗」版本
  setupReadmeModal();
});

window.addEventListener("hashchange", handleHashChange);
