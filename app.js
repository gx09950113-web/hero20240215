/* =======================================================
   app.js — TOC 可收合 + 世界產物跨區對應 + README.md 彈窗
   ======================================================= */

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const slugify = (t) =>
  t.trim().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "").toLowerCase();

/* 可收合的按鈕清單 */
const COLLAPSIBLE_KEYS = new Set([
  "基礎世界觀",
  "修仙基本知識",
  "世界地理",
  "世界產物",
  "千訣宗",
  "玄靈宗",
  "衍天宗",
  "云嵐宗",
]);

/* 世界產物 crosswalk */
const PRODUCT_CROSSWALK = {
  "執靈圖": ["千訣宗", "執靈圖"],
  "灼草經": ["玄靈宗", "灼草經"],
  "符海錄": ["衍天宗", "符海錄"],
  "百器書": ["云嵐宗", "百器書"],
};

function setupCollapsibles() {
  $$("#toc li").forEach((li) => {
    const a = $(":scope > a", li) || $("a", li);
    const sub = $("> ul", li);
    if (!a || !sub) return;
    const text = a.textContent.trim();
    if (!COLLAPSIBLE_KEYS.has(text)) return;
    li.classList.add("collapsible");
    li.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      li.classList.toggle("collapsed");
    });
  });
}

function setupScrollSpy() {
  const links = $$("#toc a[href^='#']");
  const map = new Map();
  links.forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    const sec = document.getElementById(id);
    if (sec) map.set(id, a);
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      const link = map.get(id);
      if (!link) return;
      if (entry.isIntersecting) {
        links.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        let p = link.closest("li")?.parentElement;
        while (p && p !== document) {
          if (p.tagName === "UL") {
            const pli = p.closest("li");
            if (pli) pli.classList.remove("collapsed");
          }
          p = p.parentElement;
        }
      }
    });
  }, { rootMargin: "-30% 0px -60% 0px", threshold: 0.01 });
  map.forEach((_, id) => {
    const sec = document.getElementById(id);
    if (sec) io.observe(sec);
  });
}

function setupCrossLinks() {
  $("#toc")?.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    const leafText = link.textContent.trim();
    const li = link.closest("li");
    if (!li) return;
    const parentA = $(":scope > a", li.parentElement?.closest("li") || document.createElement("div"));
    const parentText = parentA ? parentA.textContent.trim() : "";
    if (parentText === "世界產物" && PRODUCT_CROSSWALK[leafText]) {
      e.preventDefault();
      const [sect, doc] = PRODUCT_CROSSWALK[leafText];
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

/* Data path */
function getDataPath(key) {
  const k = String(key).toLowerCase();
  if (k === "readme") return "assets/README.md"; // README 放 assets/
  return `/data/${key}.json`;
}

async function loadSectionData(section) {
  if (!section) return;
  const key = section.dataset.key || section.id;
  if (!key) return;
  try {
    const path = getDataPath(key);
    const res = await fetch(path);
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    if (path.endsWith(".md")) {
      const md = await res.text();
      const html = (typeof marked?.parse === "function") ? marked.parse(md) : (typeof marked === "function" ? marked(md) : md);
      renderMarkdown(section, html);
    } else {
      const data = await res.json();
      renderSection(section, data);
    }
  } catch (err) {
    section.innerHTML = `<div class="error">載入失敗：${err.message}</div>`;
  }
}

function renderSection(section, data) {
  const host = section.querySelector(".content") || section;
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
  }
}

function renderMarkdown(section, html) {
  const host = section.querySelector(".content") || section;
  host.innerHTML = html;
}

/* README Modal */
function shouldShowReadmeModal() {
  try { return localStorage.getItem("hideReadme") !== "1"; }
  catch { return true; }
}
function setDontShowReadme(flag) {
  try { localStorage.setItem("hideReadme", flag ? "1" : "0"); } catch {}
}
async function showReadmeModal() {
  if (!shouldShowReadmeModal()) return;
  const modal = document.getElementById("readme-modal");
  const contentEl = document.getElementById("readme-modal-content");
  const okBtn = document.getElementById("readme-ok");
  const dontShow = document.getElementById("readme-dont-show");
  if (!modal || !contentEl || !okBtn || !dontShow) return;
  const res = await fetch(getDataPath("readme"));
  if (res.ok) {
    const md = await res.text();
    const html = (typeof marked?.parse === "function") ? marked.parse(md) : (typeof marked === "function" ? marked(md) : md);
    contentEl.innerHTML = html;
  } else {
    contentEl.textContent = `載入 README 失敗：${res.status} ${res.statusText}`;
  }
  modal.hidden = false;
  function close() {
    setDontShowReadme(dontShow.checked);
    modal.hidden = true;
  }
  okBtn.onclick = close;
  modal.querySelector(".modal-backdrop").onclick = close;
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
}

/* Hash change */
function handleHashChange() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!id) return;
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
}

/* 啟動 */
window.addEventListener("DOMContentLoaded", () => {
  setupCollapsibles();
  setupCrossLinks();
  setupScrollSpy();
  const readmeSec = document.getElementById("readme");
  if (readmeSec) loadSectionData(readmeSec);
  showReadmeModal();
  if (location.hash) handleHashChange();
});
window.addEventListener("hashchange", handleHashChange);
