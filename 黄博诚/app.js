const stateKey = "birthday-bloom-state-v1";
const dbName = "birthday-bloom-media-v1";
let state = JSON.parse(localStorage.getItem(stateKey) || "null") || { name: "", birthday: "", since: "", greeting: "愿今天的每一份快乐，都恰好被你遇见。", effects: true };
let media = [];
let currentFilter = "all";

const $ = (id) => document.getElementById(id);
const saveState = () => localStorage.setItem(stateKey, JSON.stringify(state));
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) : "尚未设置";
const dayDiff = (a, b) => Math.floor((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2600); }

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media", { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadMedia() {
  try {
    const db = await openDb();
    media = await new Promise((resolve, reject) => {
      const request = db.transaction("media").objectStore("media").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    renderMedia();
    updateDashboard();
  } catch { toast("媒体存储初始化失败，请检查浏览器权限"); }
}
async function addMedia(files) {
  const db = await openDb();
  for (const file of files) {
    await new Promise((resolve, reject) => {
      const request = db.transaction("media", "readwrite").objectStore("media").add({ name: file.name, type: file.type.startsWith("video") ? "video" : "image", blob: file, addedAt: Date.now() });
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
  }
  await loadMedia(); toast(`已添加 ${files.length} 件媒体`);
}
async function deleteMedia(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => { const request = db.transaction("media", "readwrite").objectStore("media").delete(id); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  await loadMedia(); toast("已删除");
}

function updateDashboard() {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  $("todayLabel").textContent = today.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  $("heroTitle").textContent = state.name ? `生日快乐，${state.name}` : "生日快乐";
  $("heroGreeting").textContent = state.greeting || "愿今天的每一份快乐，都恰好被你遇见。";
  const known = state.since ? Math.max(0, dayDiff(state.since, isoToday)) : null;
  $("daysKnown").textContent = known === null ? "—" : `${known} 天`;
  $("timelineDays").textContent = known === null ? "0" : known;
  $("dateSince").textContent = state.since ? `从 ${formatDate(state.since)}` : "设置认识开始日期";
  $("timelineDate").textContent = state.since ? `从 ${formatDate(state.since)} 开始` : "还没有设置开始日期";
  $("timelineDetail").textContent = state.since ? `从那一天到今天，你们已经一起走过了 ${known} 天。` : "在设置中填写你们认识的日期，这里会自动记录相伴的时间。";
  let until = null; let birthdayText = "设置生日日期"; let status = "准备好庆祝";
  if (state.birthday) {
    const birthdayThisYear = new Date(`${today.getFullYear()}-${state.birthday.slice(5)}T00:00:00`);
    until = Math.ceil((birthdayThisYear - new Date(`${isoToday}T00:00:00`)) / 86400000);
    if (until < 0) until = Math.ceil((new Date(`${today.getFullYear() + 1}-${state.birthday.slice(5)}T00:00:00`) - new Date(`${isoToday}T00:00:00`)) / 86400000);
    if (until === 0) { birthdayText = "就是今天！"; status = "今天尽情庆祝"; document.body.classList.add("birthday-mode"); } else birthdayText = `${until} 天后`;
    $("birthdayDate").textContent = formatDate(state.birthday);
  } else $("birthdayDate").textContent = birthdayText;
  $("daysToBirthday").textContent = until === null ? "—" : birthdayText;
  $("birthdayStatus").textContent = status;
  $("mediaCount").textContent = `${media.length} 件`;
  $("storageSummary").textContent = `${media.length} 件媒体和所有设置都保存在当前设备。`;
}

function renderMedia() {
  const list = currentFilter === "all" ? media : media.filter(item => item.type === currentFilter);
  $("mediaHint").textContent = `${list.length} 件`;
  $("mediaGrid").innerHTML = list.length ? "" : `<div class="empty-state"><span>♡</span><p>${media.length ? "这个筛选下还没有内容" : "还没有纪念内容"}</p><small>从一张照片开始，慢慢填满这里。</small></div>`;
  list.forEach(item => {
    const wrap = document.createElement("div"); wrap.className = "media-item";
    const url = URL.createObjectURL(item.blob);
    const element = document.createElement(item.type === "video" ? "video" : "img");
    element.src = url; if (item.type === "video") { element.controls = true; element.muted = true; }
    element.alt = item.name; wrap.appendChild(element);
    const del = document.createElement("button"); del.className = "media-delete"; del.textContent = "×"; del.title = "删除"; del.onclick = () => { if (confirm(`确定删除“${item.name}”？`)) deleteMedia(item.id); };
    wrap.appendChild(del); $("mediaGrid").appendChild(wrap);
  });
}

function populateSettings() { $("nameInput").value = state.name; $("birthdayInput").value = state.birthday; $("sinceInput").value = state.since; $("greetingInput").value = state.greeting; $("effectsInput").checked = state.effects; }
function showPage(name) {
  document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.id === `page-${name}`));
  document.querySelectorAll("[data-page]").forEach(item => item.classList.toggle("active", item.dataset.page === name));
  if (name === "settings") populateSettings();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", event => { const target = event.target.closest("[data-page]"); if (target) showPage(target.dataset.page); });
$("settingsForm").onsubmit = (event) => { event.preventDefault(); state = { name: $("nameInput").value.trim(), birthday: $("birthdayInput").value, since: $("sinceInput").value, greeting: $("greetingInput").value.trim(), effects: $("effectsInput").checked }; saveState(); updateDashboard(); toast("设置已保存"); };
$("effectsInput").onchange = () => { state.effects = $("effectsInput").checked; saveState(); document.body.classList.toggle("effects-off", !state.effects); };
$("mediaInput").onchange = (event) => event.target.files.length && addMedia([...event.target.files]);
document.querySelectorAll(".filter").forEach(button => button.onclick = () => { currentFilter = button.dataset.filter; document.querySelectorAll(".filter").forEach(item => item.classList.toggle("active", item === button)); renderMedia(); });
$("themeToggle").onclick = () => { state.effects = !state.effects; saveState(); document.body.classList.toggle("effects-off", !state.effects); $("effectsInput").checked = state.effects; toast(state.effects ? "特效已开启" : "特效已关闭"); };
$("clearButton").onclick = async () => { if (!confirm("确定清除本机所有设置和媒体吗？此操作不能撤销。")) return; localStorage.removeItem(stateKey); const db = await openDb(); db.transaction("media", "readwrite").objectStore("media").clear(); location.reload(); };

function download(name, content, type) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
$("exportButton").onclick = async () => {
  const files = [];
  for (const item of media) { const buffer = await item.blob.arrayBuffer(); let binary = ""; new Uint8Array(buffer).forEach(byte => binary += String.fromCharCode(byte)); files.push({ ...item, blob: btoa(binary) }); }
  download(`birthday-bloom-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state, media: files }), "application/json");
  toast("备份文件已导出");
};
$("importInput").onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text()); if (!data.state || !Array.isArray(data.media)) throw new Error("格式不正确");
    if (!confirm("导入会覆盖当前设置和媒体，确定继续吗？")) return;
    state = data.state; saveState(); const db = await openDb(); const store = db.transaction("media", "readwrite").objectStore("media"); store.clear();
    for (const item of data.media) { const bytes = Uint8Array.from(atob(item.blob), char => char.charCodeAt(0)); store.add({ name: item.name, type: item.type, blob: new Blob([bytes], { type: item.type === "video" ? "video/mp4" : "image/jpeg" }), addedAt: item.addedAt }); }
    await new Promise(resolve => setTimeout(resolve, 200)); await loadMedia(); populateSettings(); updateDashboard(); toast("备份已恢复");
  } catch { toast("导入失败：备份文件损坏或格式不支持"); }
  event.target.value = "";
};

document.body.classList.toggle("effects-off", !state.effects);
loadMedia(); updateDashboard();
