(function () {
  "use strict";

  const routes = {
    home: { title: "首页总览", description: "今天的灵感与内容，一站整理。" },
    songs: { title: "今天的热门歌曲", description: "发现今日热门，也把喜欢的歌曲收藏起来。" },
    videos: { title: "热门视频", description: "查看抖音热搜话题，并直接打开抖音搜索相关视频。" },
    paths: { title: "保存路径", description: "整理常用的本机文件与文件夹路径。" },
    history: { title: "过去流行单曲", description: "按年份回看可获得的经典单曲。" },
    settings: { title: "数据与设置", description: "管理本机数据、偏好和备份。" }
  };
  const FEED_IDS = { songs: "todaySongs", videos: "hotVideos", history: "historicalSongs" };
  const store = window.MusicStore.create();
  const dataService = window.MusicSources.createDataService({ store: store });
  let renderVersion = 0;
  let preferences = { theme: "tech", songSource: "qq" };
  let pathForm = null;
  let pathSearch = "";
  let pathCategory = "";
  const refreshErrors = {};
  const favoritesOnly = { songs: false, videos: false };
  const historyErrors = {};
  let selectedHistoryYear = String(new Date().getFullYear() - 1);
  const commonsSearch = {
    audio: { query: "", items: [], error: "", searching: false },
    video: { query: "", items: [], error: "", searching: false }
  };

  function routeFromHash(hash) {
    const route = (hash || "").replace(/^#\/?/, "").split("/")[0];
    return Object.prototype.hasOwnProperty.call(routes, route) ? route : "home";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function formatDate(value) {
    if (!value || Number.isNaN(Date.parse(value))) return "更新时间未知";
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function toast(message) {
    const region = document.getElementById("toast-region");
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(function () { item.remove(); }, 3200);
  }

  function renderShell(route) {
    route = route || routeFromHash(window.location.hash);
    const info = routes[route];
    document.querySelectorAll(".nav-link[data-route]").forEach(function (link) {
      const active = link.dataset.route === route;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.getElementById("page-breadcrumb").textContent = info.title;
  }

  function heading(route, action) {
    const info = routes[route];
    return '<div class="page-heading"><div><p class="eyebrow">YOUR PERSONAL SPACE</p><h1>' +
      escapeHtml(info.title) + '</h1><p>' + escapeHtml(info.description) +
      '</p></div>' + (action || "") + "</div>";
  }

  function emptyState(title, message, icon) {
    return '<section class="card empty-state"><div class="empty-icon" aria-hidden="true">' +
      escapeHtml(icon || "✦") + "</div><h3>" + escapeHtml(title) + "</h3><p>" +
      escapeHtml(message) + "</p></section>";
  }

  function feedMeta(feed) {
    if (!feed) return "";
    return '<p class="feed-meta">来源：' + escapeHtml(feed.source || "未知") +
      "　·　最近更新：" + escapeHtml(formatDate(feed.updatedAt)) + "</p>";
  }

  function externalLink(url, label) {
    const safe = window.MusicSources.safeHttpUrl(url);
    return safe
      ? '<a class="button button-small" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label || "打开来源") + "</a>"
      : '<span class="button button-small button-disabled" aria-disabled="true">来源链接不可用</span>';
  }

  function songCard(song, favoriteIds, compact, history) {
    const type = history ? "history" : "song";
    const favoriteId = type + ":" + song.id;
    const title = escapeHtml(song.title);
    const artist = escapeHtml(song.artist || "歌手信息不可用");
    const rank = song.rank ? '<span class="rank">#' + escapeHtml(song.rank) + "</span>" : "";
    const artwork = window.MusicSources.safeHttpUrl(song.artwork);
    const cover = artwork
      ? '<img class="song-artwork" src="' + escapeHtml(artwork) + '" alt="" loading="lazy">'
      : '<div class="song-artwork artwork-fallback" aria-hidden="true">♫</div>';
    return '<article class="content-card song-card' + (compact ? " compact" : "") + (history ? " history-song" : "") +
      (history && song.year ? '" data-year="' + escapeHtml(song.year) : "") + '">' + cover +
      '<div class="content-info">' + rank + '<h3>' + title + '</h3><p>' + artist + "</p>" +
      '<span class="source-chip">' + escapeHtml(song.source || "来源未提供") + "</span></div>" +
      '<div class="content-actions"><button class="icon-button" data-action="favorite" data-type="' + type + '" data-id="' +
      escapeHtml(song.id) + '" aria-label="' + (favoriteIds.has(favoriteId) ? "取消收藏" : "收藏") + '">' +
      (favoriteIds.has(favoriteId) ? "♥" : "♡") + '</button><button class="button button-small" data-action="detail" data-type="' + type + '" data-id="' +
      escapeHtml(song.id) + '">详情</button>' + externalLink(song.url, "打开来源") + "</div></article>";
  }

  function videoCard(video, favoriteIds) {
    const favoriteId = "video:" + video.id;
    const artwork = window.MusicSources.safeHttpUrl(video.artwork);
    const cover = artwork
      ? '<img class="video-artwork" src="' + escapeHtml(artwork) + '" alt="" loading="lazy">'
      : '<div class="video-artwork artwork-fallback" aria-hidden="true">▷</div>';
    return '<article class="content-card video-card">' + cover + '<div class="content-info"><h3>' +
      escapeHtml(video.title) + '</h3><p>' + escapeHtml(video.publisher || "发布者信息不可用") + '</p><span class="source-chip">' +
      escapeHtml(video.source || "来源未提供") + '</span></div><div class="content-actions"><button class="icon-button" data-action="favorite" data-type="video" data-id="' +
      escapeHtml(video.id) + '" aria-label="' + (favoriteIds.has(favoriteId) ? "取消收藏" : "收藏") + '">' +
      (favoriteIds.has(favoriteId) ? "♥" : "♡") + '</button><button class="button button-small" data-action="detail" data-type="video" data-id="' +
      escapeHtml(video.id) + '">信息</button>' + externalLink(video.url, "打开来源") + "</div></article>";
  }

  function commonsSearchMarkup(kind) {
    const search = commonsSearch[kind];
    const mediaType = kind === "audio" ? "音频" : "视频";
    const results = search.items.length
      ? '<div class="media-results">' + search.items.map(function (item) {
        const artwork = window.MusicSources.safeHttpUrl(item.artwork);
        const cover = artwork
          ? '<img src="' + escapeHtml(artwork) + '" alt="" loading="lazy">'
          : '<span class="media-placeholder" aria-hidden="true">' + (kind === "audio" ? "♫" : "▷") + "</span>";
        const sourceUrl = window.MusicSources.safeHttpUrl(item.url);
        return '<article class="media-result"><div class="media-result-cover">' + cover + '</div><div class="media-result-info"><strong>' +
          escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.artist || item.description || "开放授权媒体文件") +
          '</small><span>' + escapeHtml(item.license) + (sourceUrl
            ? ' · <a class="media-source-link" href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">来源/署名</a>'
            : "") +
          '</span></div><button class="button button-primary button-small" data-action="play-media" data-kind="' + kind +
          '" data-url="' + escapeHtml(item.mediaUrl) + '" data-mime="' + escapeHtml(item.mime) +
          '" data-title="' + escapeHtml(item.title) + '" data-license="' + escapeHtml(item.license) +
          '" data-source-url="' + escapeHtml(item.url) + '">▶ 播放</button></article>';
      }).join("") + "</div>"
      : search.error
        ? '<p class="media-search-error">' + escapeHtml(search.error) + "</p>"
        : '<p class="media-search-empty">' + (search.query ? "未找到匹配的开放授权文件。" : "搜索 Wikimedia Commons 的开放授权媒体，在网页播放器中播放。") + "</p>";
    return '<section class="media-library card"><div class="media-library-heading"><div><span class="media-library-kicker">WIKIMEDIA COMMONS</span><h2>网页内播放 · 开放授权' +
      mediaType + '</h2><p>搜索可直接播放的文件；授权和来源署名随条目展示。商业榜单及抖音热搜不一定有可播放文件。</p></div><span class="media-library-icon">' +
      (kind === "audio" ? "♫" : "▷") + '</span></div><form class="media-search-form" id="media-search-form" data-media-kind="' + kind +
      '"><label class="media-search-input"><span aria-hidden="true">⌕</span><input name="query" value="' + escapeHtml(search.query) +
      '" maxlength="100" placeholder="搜索可播放的' + mediaType + '，例如 ambient music"></label><button class="button button-primary" type="submit" ' +
      (search.searching ? "disabled" : "") + ">" + (search.searching ? "正在搜索…" : "搜索开放授权" + mediaType) +
      '</button></form>' + (search.searching ? '<p class="media-search-status">正在 Wikimedia Commons 搜索开放授权媒体…</p>' : "") +
      results + "</section>";
  }

  async function favoriteSet() {
    const favorites = await store.getAll("favorites");
    return new Map(favorites.map(function (favorite) { return [favorite.id, favorite]; }));
  }

  function quickLink(route, label, icon, detail) {
    return '<a class="quick-link card" href="#/' + route + '"><span class="quick-icon">' + icon +
      '</span><span><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(detail) +
      '</small></span><span class="quick-arrow">↗</span></a>';
  }

  async function homeMarkup() {
    const results = await Promise.all([
      store.get("feeds", FEED_IDS.songs), store.get("feeds", FEED_IDS.videos),
      store.getAll("paths"), store.getAll("feeds")
    ]);
    const songFeed = results[0];
    const videoFeed = results[1];
    const paths = results[2];
    const historyFeed = results[3].filter(function (feed) {
      return feed.id.indexOf(FEED_IDS.history + ":") === 0;
    }).sort(function (a, b) {
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    })[0] || null;
    const favorites = await favoriteSet();
    const recommended = songFeed && songFeed.items && songFeed.items.length ? songFeed.items[0] : null;
    const featured = recommended
      ? '<div class="featured-card"><div class="featured-glow"></div><div class="featured-copy"><p class="eyebrow light-eyebrow">TODAY\'S PICK</p><h2>' +
        escapeHtml(recommended.title) + '</h2><p>' + escapeHtml(recommended.artist) + '</p>' +
        '<div class="featured-meta">' + escapeHtml(songFeed.source) + "　·　" + escapeHtml(formatDate(songFeed.updatedAt)) +
        '</div><div class="featured-actions"><button class="button button-light" data-action="detail" data-type="song" data-id="' +
        escapeHtml(recommended.id) + '">查看详情</button><button class="button button-glass" data-action="favorite" data-type="song" data-id="' +
        escapeHtml(recommended.id) + '">' + (favorites.has("song:" + recommended.id) ? "♥ 已收藏" : "♡ 收藏歌曲") +
        "</button>" + externalLink(recommended.url, "打开来源") + '</div></div><div class="featured-note">TOP ' +
        escapeHtml(recommended.rank || "—") + " <span>今日推荐</span></div></div>"
      : '<div class="featured-card featured-empty"><div class="featured-copy"><p class="eyebrow light-eyebrow">TODAY\'S PICK</p><h2>今天会听到什么？</h2><p>推荐歌曲来自今日热门榜单，不会使用虚构内容。</p><a class="button button-light" href="#/songs">前往歌曲榜单</a></div></div>';
    const videoCount = videoFeed && videoFeed.items ? videoFeed.items.length : 0;
    const historyCount = historyFeed && historyFeed.items ? historyFeed.items.length : 0;
    const pathCount = paths.length;
    const feedWarning = refreshErrors.songs || refreshErrors.videos
      ? '<p class="notice">部分外部内容更新失败，仍显示最近一次成功获取的数据（如有）。</p>' : "";
    const feedLoading = refreshErrors.refreshingSongs || refreshErrors.refreshingVideos
      ? '<p class="loading-state">正在获取公开榜单内容…</p>' : "";
    const today = new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date());
    return '<div class="home-status-row"><span><i class="home-live-dot"></i>个人音乐看板</span><time>' +
      escapeHtml(today) + '</time><span class="home-local-status">● 本机模式</span></div>' +
      heading("home") + featured + feedWarning + feedLoading +
      '<div class="section-heading"><div><h2>常用功能</h2><p>选择一个内容空间继续探索</p></div></div>' +
      '<div class="quick-grid">' +
      quickLink("home", "今日看板", "⌂", "推荐歌曲与内容概览") +
      quickLink("songs", "热门歌曲", "♫", songFeed ? songFeed.items.length + " 首歌曲 · QQ 音乐 / 网易云" : "浏览并刷新公开榜单") +
      quickLink("videos", "抖音热搜", "▷", videoFeed ? videoCount + " 个话题 · 点击跳转搜索" : "查看公开热搜话题") +
      quickLink("paths", "保存路径", "▤", pathCount + " 条本机记录") +
      quickLink("history", "历史榜单", "◷", historyCount ? historyCount + " 首已缓存歌曲" : "按年份回看经典单曲") +
      quickLink("settings", "数据与设置", "⚙", "收藏 " + favorites.size + " 条 · 备份与偏好") +
      "</div>" +
      '<div class="section-heading section-heading-spaced"><div><h2>数据概览</h2><p>来源数据与本机记录实时汇总</p></div></div>' +
      '<div class="summary-grid"><a class="summary-card card" href="#/videos"><span class="summary-icon purple">▷</span><div><small>热门视频</small><strong>' +
      videoCount + "</strong><span>" + (videoFeed ? escapeHtml(formatDate(videoFeed.updatedAt)) : "尚未获取") +
      '</span></div></a><a class="summary-card card" href="#/paths"><span class="summary-icon green">▤</span><div><small>保存路径</small><strong>' +
      pathCount + "</strong><span>本机登记路径</span></div></a><a class=\"summary-card card\" href=\"#/history\"><span class=\"summary-icon orange\">◷</span><div><small>过去流行单曲</small><strong>" +
      historyCount + "</strong><span>" + (historyCount ? "条历史记录" : "暂无可靠数据") + "</span></div></a></div>";
  }

  async function songsMarkup() {
    const [feed, favorites] = await Promise.all([store.get("feeds", FEED_IDS.songs), favoriteSet()]);
    const status = refreshErrors.songs;
    const collection = window.MusicCatalog.withFavoriteSnapshots(feed && feed.items || [], favorites, "song", favoritesOnly.songs);
    const items = collection.items;
    const content = items.length
      ? '<div class="content-list">' + items.map(function (song) { return songCard(song, favorites, false); }).join("") + "</div>"
      : favoritesOnly.songs ? emptyState("还没有收藏歌曲", "点击歌曲旁的收藏按钮后，它会保存在这里。", "♡") :
        emptyState(status ? "暂时无法获取歌曲" : "还没有歌曲数据", status || "点击“刷新榜单”从 QQ 音乐热歌榜获取歌曲；如来源不可用会自动尝试网易云音乐。", "♫");
    return heading("songs", '<button class="button button-primary" data-action="refresh-songs" ' +
      (refreshErrors.refreshingSongs ? "disabled" : "") + ">" +
      (refreshErrors.refreshingSongs ? "正在刷新…" : "↻ 刷新榜单") + "</button>") +
      '<div class="feed-panel card"><div class="feed-panel-top"><div><strong>今日热门歌曲</strong><p>QQ 音乐巅峰榜·热歌，网易云音乐热歌榜作为自动备用来源</p></div>' +
      '<span class="data-pill">' + (feed && feed.items ? feed.items.length + " 首" : "等待数据") + "</span></div>" +
      '<label class="favorite-filter"><input type="checkbox" data-favorite-filter="songs"' + (favoritesOnly.songs ? " checked" : "") + '> 只看已收藏（' + collection.savedCount + "）</label>" +
      feedMeta(feed) + (feed && feed.warning ? '<p class="notice">' + escapeHtml(feed.warning) + "</p>" : "") +
      (status && feed ? '<p class="error-inline">更新失败：' + escapeHtml(status) + "，继续显示最近一次成功获取的内容。</p>" : "") +
      (status && !feed ? '<p class="error-inline">更新失败：' + escapeHtml(status) + "</p>" : "") + "</div>" +
      commonsSearchMarkup("audio") + content;
  }

  async function videosMarkup() {
    const [feed, favorites] = await Promise.all([store.get("feeds", FEED_IDS.videos), favoriteSet()]);
    const status = refreshErrors.videos;
    const collection = window.MusicCatalog.withFavoriteSnapshots(feed && feed.items || [], favorites, "video", favoritesOnly.videos);
    const items = collection.items;
    const content = items.length
      ? '<div class="video-grid">' + items.map(function (video) { return videoCard(video, favorites); }).join("") + "</div>"
      : favoritesOnly.videos ? emptyState("还没有收藏话题", "点击话题旁的收藏按钮后，它会保存在这里。", "♡") :
        emptyState(status ? "暂时无法获取抖音热搜" : "还没有抖音热搜数据", status || "点击“刷新热搜”获取抖音公开热搜话题；每个话题都可跳转到抖音搜索。", "▷");
    return heading("videos", '<button class="button button-primary" data-action="refresh-videos" ' +
      (refreshErrors.refreshingVideos ? "disabled" : "") + ">" +
      (refreshErrors.refreshingVideos ? "正在刷新…" : "↻ 刷新热搜") + "</button>") +
      '<div class="feed-panel card"><div class="feed-panel-top"><div><strong>抖音热搜话题</strong><p>公开热搜词条；点击“抖音搜索”查看对应视频，不将关键词伪装成视频</p></div>' +
      '<span class="data-pill">' + (feed && feed.items ? feed.items.length + " 个" : "等待数据") + "</span></div>" +
      '<label class="favorite-filter"><input type="checkbox" data-favorite-filter="videos"' + (favoritesOnly.videos ? " checked" : "") + '> 只看已收藏（' + collection.savedCount + "）</label>" +
      feedMeta(feed) + (status && feed ? '<p class="error-inline">更新失败：' + escapeHtml(status) + "，继续显示最近一次成功获取的内容。</p>" : "") +
      (status && !feed ? '<p class="error-inline">更新失败：' + escapeHtml(status) + "</p>" : "") + "</div>" +
      commonsSearchMarkup("video") + content;
  }

  function pathItemMarkup(path) {
    return '<article class="path-row card" data-path-row data-name="' + escapeHtml(path.name) + '" data-path="' +
      escapeHtml(path.path) + '" data-category="' + escapeHtml(path.category || "") + '" data-notes="' +
      escapeHtml(path.notes || "") + '"><div class="path-symbol">⌁</div><div class="path-info"><div class="path-title-row"><h3>' +
      escapeHtml(path.name) + '</h3>' + (path.category ? '<span class="tag">' + escapeHtml(path.category) + "</span>" : "") +
      '</div><code>' + escapeHtml(path.path) + '</code>' + (path.notes ? '<p>' + escapeHtml(path.notes) + "</p>" : "") +
      '</div><div class="path-actions"><button class="button button-small" data-action="copy-path" data-id="' +
      escapeHtml(path.id) + '">复制</button><button class="button button-small" data-action="edit-path" data-id="' +
      escapeHtml(path.id) + '">编辑</button><button class="button button-small button-danger" data-action="delete-path" data-id="' +
      escapeHtml(path.id) + '">删除</button></div></article>';
  }

  function pathFormMarkup() {
    if (!pathForm) return "";
    const path = pathForm.record || {};
    return '<form class="path-form card" id="path-form"><div class="form-heading"><div><h2>' +
      (path.id ? "编辑路径" : "新增路径") + '</h2><p>只登记路径文字，不会扫描或读取本机文件。</p></div><button type="button" class="icon-button" data-action="cancel-path">×</button></div>' +
      '<div class="form-grid"><label>名称 <input name="name" required maxlength="80" value="' + escapeHtml(path.name || "") + '" placeholder="例如：音乐收藏"></label>' +
      '<label>路径 <input name="path" required maxlength="1000" value="' + escapeHtml(path.path || "") + '" placeholder="例如：D:\\Music"></label>' +
      '<label>分类或标签 <input name="category" maxlength="50" value="' + escapeHtml(path.category || "") + '" placeholder="例如：音乐"></label>' +
      '<label class="form-wide">备注 <textarea name="notes" maxlength="500" rows="2" placeholder="可选">' + escapeHtml(path.notes || "") + '</textarea></label></div>' +
      '<div class="form-actions"><button class="button" type="button" data-action="cancel-path">取消</button><button class="button button-primary" type="submit">保存路径</button></div></form>';
  }

  async function pathsMarkup() {
    const paths = await store.getAll("paths");
    const categories = Array.from(new Set(paths.map(function (path) { return path.category; }).filter(Boolean))).sort();
    const options = categories.map(function (category) {
      return '<option value="' + escapeHtml(category) + '"' + (pathCategory === category ? " selected" : "") + ">" + escapeHtml(category) + "</option>";
    }).join("");
    return heading("paths", '<button class="button button-primary" data-action="new-path">＋ 新增路径</button>') +
      pathFormMarkup() + '<div class="path-toolbar card"><label class="search-field"><span>⌕</span><input type="search" data-path-search value="' +
      escapeHtml(pathSearch) + '" placeholder="搜索名称或路径"></label><label class="filter-field"><span>分类</span><select data-path-category><option value="">全部分类</option>' +
      options + "</select></label><span class=\"path-count\">" + paths.length + " 条记录</span></div>" +
      (paths.length ? '<div class="path-list">' + paths.map(pathItemMarkup).join("") +
        '<div class="filter-empty" data-filter-empty hidden>没有符合条件的路径。</div></div>' :
        emptyState("还没有保存路径", "添加常用的本机文件或文件夹路径，方便日后查找和复制。", "⌁")) +
      '<p class="notice">浏览器不会扫描本机文件，也不保证能直接打开任意路径。</p>';
  }

  async function historyMarkup() {
    const [allSongs, feed, favorites] = await Promise.all([
      store.getAll("history"),
      store.get("feeds", FEED_IDS.history + ":" + selectedHistoryYear),
      favoriteSet()
    ]);
    const songs = feed && feed.items ? feed.items : [];
    const availableYears = Array.from(new Set(allSongs.map(function (song) { return song.year; }).filter(Boolean)));
    const yearOptions = [];
    for (let year = new Date().getFullYear() - 1; year >= 1958; year -= 1) {
      yearOptions.push('<option value="' + year + '"' + (String(year) === selectedHistoryYear ? " selected" : "") + ">" +
        year + (availableYears.indexOf(year) !== -1 ? " · 已缓存" : "") + "</option>");
    }
    const error = historyErrors[selectedHistoryYear];
    const list = songs.length
      ? '<div class="content-list">' +
        songs.map(function (song) { return songCard(song, favorites, false, true); }).join("") + "</div>"
      : emptyState(error ? "该年份暂时无法获取" : "该年份尚未加载", error || "选择年份并点击“加载该年榜单”。页面不使用未经核实的歌曲或排名。", "◷");
    return heading("history") + '<div class="history-toolbar card"><label>榜单年份 <select data-history-year>' + yearOptions.join("") +
      '</select></label><button class="button button-primary button-small" data-action="refresh-history" ' +
      (refreshErrors.refreshingHistory ? "disabled" : "") + ">" +
      (refreshErrors.refreshingHistory ? "正在加载…" : feed ? "↻ 刷新该年榜单" : "加载该年榜单") +
      "</button><span>" + (availableYears.length ? availableYears.length + " 个年份已缓存" : "尚无本机历史缓存") + "</span></div>" +
      '<div class="feed-panel card"><div class="feed-panel-top"><div><strong>' + escapeHtml(selectedHistoryYear) +
      " 年 Billboard 年终榜单</strong><p>仅显示公开页面中可核实的歌曲与排名</p></div><span class=\"data-pill\">" +
      (feed ? songs.length + " 条" : "等待加载") + "</span></div>" + feedMeta(feed) +
      (error && feed ? '<p class="error-inline">更新失败：' + escapeHtml(error) + "，仍显示该年份最近一次成功数据。</p>" : "") +
      (error && !feed ? '<p class="error-inline">更新失败：' + escapeHtml(error) + "</p>" : "") + "</div>" + list;
  }

  async function settingsMarkup() {
    const data = await store.exportAll();
    const favoriteCount = data.favorites.length;
    const pathCount = data.paths.length;
    const feedCount = data.feeds.length;
    return heading("settings") +
      '<section class="settings-card card"><div class="settings-title"><div><h2>基础偏好</h2><p>偏好设置只保存在当前浏览器。</p></div></div>' +
      '<div class="settings-row"><div><strong>首选歌曲来源</strong><small>优先使用首选榜单；请求失败时自动尝试另一个音乐平台</small></div><select data-setting="songSource"><option value="qq"' +
      (preferences.songSource === "qq" ? " selected" : "") + '>QQ 音乐 · 巅峰榜热歌</option><option value="netease"' +
      (preferences.songSource === "netease" ? " selected" : "") + '>网易云音乐 · 热歌榜</option></select></div>' +
      '<div class="theme-setting"><div class="theme-setting-heading"><strong>界面主题</strong><small>选择喜欢的配色，所有页面都会同步切换</small></div>' +
      '<div class="theme-options" role="radiogroup" aria-label="界面主题">' +
      '<label class="theme-option theme-option-tech"><input type="radio" name="theme" data-setting="theme" value="tech"' +
      (preferences.theme === "tech" ? " checked" : "") + '><span class="theme-preview" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>深蓝科技</strong><small>蓝色渐变 · 科技看板</small></span></label>' +
      '<label class="theme-option theme-option-light"><input type="radio" name="theme" data-setting="theme" value="light"' +
      (preferences.theme === "light" ? " checked" : "") + '><span class="theme-preview" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>浅色</strong><small>清爽明亮 · 经典布局</small></span></label>' +
      '<label class="theme-option theme-option-dark"><input type="radio" name="theme" data-setting="theme" value="dark"' +
      (preferences.theme === "dark" ? " checked" : "") + '><span class="theme-preview" aria-hidden="true"><i></i><i></i><i></i></span><span><strong>深色</strong><small>柔和暗色 · 夜间浏览</small></span></label>' +
      "</div></div></section>" +
      '<section class="settings-card card"><div class="settings-title"><div><h2>本机数据与备份</h2><p>站点数据仅保存在此浏览器，不会上传云端。</p></div><span class="storage-badge"><i></i> IndexedDB 本机存储</span></div>' +
      '<div class="data-stats"><div><strong>' + favoriteCount + '</strong><span>条收藏</span></div><div><strong>' + pathCount +
      '</strong><span>条保存路径</span></div><div><strong>' + feedCount + '</strong><span>份内容缓存</span></div></div>' +
      '<div class="settings-actions"><button class="button button-primary" data-action="export-backup">导出数据备份</button><label class="button file-button">选择备份文件<input type="file" data-action="import-backup" accept="application/json,.json"></label><button class="button button-danger" data-action="clear-data">清空本机数据</button></div>' +
      '<p class="settings-footnote">清理浏览器站点数据、使用隐私模式或更换浏览器都可能导致本机数据不可用。建议定期导出备份；恢复备份会整体替换当前数据。</p></section>';
  }

  async function pageMarkup(route) {
    if (route === "home") return homeMarkup();
    if (route === "songs") return songsMarkup();
    if (route === "videos") return videosMarkup();
    if (route === "paths") return pathsMarkup();
    if (route === "history") return historyMarkup();
    return settingsMarkup();
  }

  async function renderPage() {
    const route = routeFromHash(window.location.hash);
    const version = ++renderVersion;
    const pageContent = document.querySelector(".page-content");
    if (pageContent) pageContent.classList.toggle("home-page", route === "home");
    document.body.classList.toggle("home-dashboard-route", route === "home");
    renderShell(route);
    const app = document.getElementById("app");
    app.innerHTML = heading(route) + '<div class="loading-state">正在读取本机数据…</div>';
    try {
      const markup = await pageMarkup(route);
      if (version === renderVersion) app.innerHTML = markup;
    } catch (error) {
      if (version === renderVersion) {
        app.innerHTML = heading(route) + '<div class="error-state">读取本机数据失败：' + escapeHtml(error.message || "未知错误") + "</div>";
      }
    }
  }

  async function toggleFavorite(type, contentId) {
    const id = type + ":" + contentId;
    const existing = await store.get("favorites", id);
    if (existing) {
      await store.delete("favorites", id);
      toast("已取消收藏");
    } else {
      const storeName = type === "song" ? "songs" : type === "video" ? "videos" : "history";
      const snapshot = await store.get(storeName, contentId);
      await store.put("favorites", { id: id, type: type, contentId: contentId, snapshot: snapshot || null, savedAt: new Date().toISOString() });
      toast("已加入收藏");
    }
    await renderPage();
  }

  async function openDetail(type, id) {
    const storeName = type === "song" ? "songs" : type === "video" ? "videos" : "history";
    const item = await store.get(storeName, id);
    const favorite = item ? null : await store.get("favorites", type + ":" + id);
    const detail = item || (favorite && favorite.snapshot);
    if (!detail) {
      toast("内容已不可用，请先刷新来源");
      return;
    }
    const dialog = document.getElementById("detail-dialog");
    const title = detail.title || "内容详情";
    const description = type === "song" ? detail.artist || "歌手信息不可用" : detail.publisher || "发布者信息不可用";
    document.getElementById("detail-body").innerHTML =
      '<p class="eyebrow">' + escapeHtml(detail.source || "来源未提供") + '</p><h2>' +
      escapeHtml(title) + '</h2><p>' + escapeHtml(description) + "</p>" +
      (detail.rank ? "<p>榜单排名：" + escapeHtml(detail.rank) + "</p>" : "") +
      (detail.year ? "<p>年份：" + escapeHtml(detail.year) + "</p>" : "") +
      "<p>最近获取：" + escapeHtml(formatDate(detail.updatedAt)) + "</p>" +
      '<div class="detail-link">' + externalLink(detail.url, "打开来源页面") + "</div>";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else toast("当前浏览器无法打开详情窗口");
  }

  function openMediaPlayer(button) {
    const mediaUrl = window.MusicSources.safeHttpUrl(button.dataset.url);
    const sourceUrl = window.MusicSources.safeHttpUrl(button.dataset.sourceUrl);
    if (!mediaUrl || new URL(mediaUrl).hostname !== "upload.wikimedia.org") {
      throw new Error("媒体地址不安全或不可用");
    }
    const kind = button.dataset.kind === "video" ? "video" : "audio";
    const title = button.dataset.title || "正在播放";
    const mime = button.dataset.mime || "";
    const dialog = document.getElementById("media-dialog");
    const playerMarkup = kind === "video"
      ? '<video id="media-player" controls playsinline preload="metadata"><source src="' + escapeHtml(mediaUrl) +
        '" type="' + escapeHtml(mime) + '">当前浏览器不支持此视频格式。</video>'
      : '<audio id="media-player" controls preload="metadata"><source src="' + escapeHtml(mediaUrl) +
        '" type="' + escapeHtml(mime) + '">当前浏览器不支持此音频格式。</audio>';
    document.getElementById("media-dialog-body").innerHTML =
      '<p class="eyebrow">WIKIMEDIA COMMONS · ' + (kind === "audio" ? "开放授权音频" : "开放授权视频") +
      '</p><h2>' + escapeHtml(title) + "</h2>" + playerMarkup + '<p class="media-player-license">' +
      escapeHtml(button.dataset.license || "许可证信息未提供") + (sourceUrl
        ? ' · <a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看来源与署名</a>'
        : "") + '</p><div class="dialog-actions"><button class="button" data-action="close-media">关闭播放器</button></div>';
    if (!dialog.open) dialog.showModal();
    const player = document.getElementById("media-player");
    player.addEventListener("error", function () {
      toast("媒体无法播放，可能是格式不受支持或来源暂时不可用");
    }, { once: true });
    const playback = player.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(function () {
        toast("浏览器未能自动开始播放，请使用播放器上的播放按钮");
      });
    }
  }

  async function searchCommons(kind, query) {
    const search = commonsSearch[kind];
    if (!search || search.searching) return;
    search.query = query;
    search.error = "";
    search.searching = true;
    await renderPage();
    try {
      const result = await window.MusicSources.searchCommonsMedia(kind, query);
      search.items = result.items;
    } catch (error) {
      search.error = error && error.message ? error.message : "开放授权媒体搜索失败";
    } finally {
      search.searching = false;
      await renderPage();
    }
  }

  async function refreshFeed(kind) {
    const isSongs = kind === "songs";
    const busyKey = isSongs ? "refreshingSongs" : "refreshingVideos";
    const errorKey = isSongs ? "songs" : "videos";
    if (refreshErrors[busyKey]) return;
    refreshErrors[busyKey] = true;
    refreshErrors[errorKey] = "";
    await renderPage();
    let result;
    try {
      result = isSongs
        ? await dataService.refreshSongs(preferences.songSource)
        : await dataService.refreshVideos();
      refreshErrors[errorKey] = result.state === "updated" ? "" : result.error;
    } catch (error) {
      refreshErrors[errorKey] = error.message || "内容更新失败";
    } finally {
      refreshErrors[busyKey] = false;
    }
    await renderPage();
    if (result && result.state === "updated") toast("内容已更新");
    else if (result && result.state === "stale") toast("更新失败，仍显示最近一次成功数据");
    else toast("更新失败，暂无可显示数据");
  }

  async function refreshHistory() {
    if (refreshErrors.refreshingHistory) return;
    const year = selectedHistoryYear;
    refreshErrors.refreshingHistory = true;
    delete historyErrors[year];
    await renderPage();
    let result;
    try {
      result = await dataService.refreshHistory(Number(year));
      if (result.state === "updated") delete historyErrors[year];
      else historyErrors[year] = result.error;
    } catch (error) {
      historyErrors[year] = error.message || "历史榜单更新失败";
    } finally {
      refreshErrors.refreshingHistory = false;
    }
    await renderPage();
    toast(result && result.state === "updated" ? "该年份榜单已更新" :
      result && result.state === "stale" ? "更新失败，仍显示该年份最近一次成功数据" : "该年份榜单暂不可用");
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("浏览器拒绝复制，请手动选择路径复制");
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    try {
      if (action === "favorite") await toggleFavorite(button.dataset.type, button.dataset.id);
      else if (action === "detail") await openDetail(button.dataset.type, button.dataset.id);
      else if (action === "play-media") openMediaPlayer(button);
      else if (action === "close-media") document.getElementById("media-dialog").close();
      else if (action === "refresh-songs") await refreshFeed("songs");
      else if (action === "refresh-videos") await refreshFeed("videos");
      else if (action === "refresh-history") await refreshHistory();
      else if (action === "new-path") { pathForm = { record: null }; await renderPage(); }
      else if (action === "cancel-path") { pathForm = null; await renderPage(); }
      else if (action === "edit-path") {
        const record = await store.get("paths", button.dataset.id);
        if (!record) throw new Error("该路径记录已不存在");
        pathForm = { record: record };
        await renderPage();
      } else if (action === "delete-path") {
        if (!window.confirm("确定删除这条保存路径吗？此操作不可撤销。")) return;
        await store.delete("paths", button.dataset.id);
        toast("路径已删除");
        await renderPage();
      } else if (action === "copy-path") {
        const record = await store.get("paths", button.dataset.id);
        if (!record) throw new Error("该路径记录已不存在");
        await copyText(record.path);
        toast("路径已复制");
      } else if (action === "export-backup") {
        await exportBackup();
      } else if (action === "clear-data") {
        if (!window.confirm("这会清除收藏、路径、设置和内容缓存，且无法撤销。确定继续吗？")) return;
        if (!window.confirm("再次确认：是否永久清空当前浏览器中的全部 App 数据？")) return;
        await store.clear();
        preferences = { theme: "tech", songSource: "qq" };
        Object.keys(refreshErrors).forEach(function (key) { delete refreshErrors[key]; });
        Object.keys(historyErrors).forEach(function (key) { delete historyErrors[key]; });
        document.documentElement.dataset.theme = "tech";
        toast("本机数据已清空");
        await renderPage();
      } else if (action === "close-detail") document.getElementById("detail-dialog").close();
    } catch (error) {
      toast(error.message || "操作失败");
    }
  }

  async function handleSubmit(event) {
    if (event.target.id === "media-search-form") {
      event.preventDefault();
      const formData = new FormData(event.target);
      await searchCommons(event.target.dataset.mediaKind, String(formData.get("query") || "").trim());
      return;
    }
    if (event.target.id !== "path-form") return;
    event.preventDefault();
    const formData = new FormData(event.target);
    const name = String(formData.get("name") || "").trim();
    const path = String(formData.get("path") || "").trim();
    if (!name || !path) {
      toast("名称和路径不能为空");
      return;
    }
    const prior = pathForm && pathForm.record ? pathForm.record : {};
    const record = window.MusicCatalog.normalizePath({
      name: name,
      path: path,
      category: formData.get("category"),
      notes: formData.get("notes")
    }, prior, new Date().toISOString(), function () {
      return "path:" + (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(16).slice(2));
    });
    await store.put("paths", record);
    pathForm = null;
    toast(prior.id ? "路径已更新" : "路径已保存");
    await renderPage();
  }

  function filterPaths() {
    let visible = 0;
    document.querySelectorAll("[data-path-row]").forEach(function (row) {
      const show = window.MusicCatalog.matchesPath({
        name: row.dataset.name,
        path: row.dataset.path,
        category: row.dataset.category,
        notes: row.dataset.notes
      }, pathSearch, pathCategory);
      row.hidden = !show;
      if (show) visible += 1;
    });
    const noResults = document.querySelector("[data-filter-empty]");
    if (noResults) noResults.hidden = visible !== 0;
  }

  async function handleChange(event) {
    const target = event.target;
    if (target.matches("[data-path-category]")) {
      pathCategory = target.value;
      filterPaths();
    } else if (target.matches("[data-setting]")) {
      preferences[target.dataset.setting] = target.value;
      await store.put("settings", { id: "preferences", value: preferences });
      document.documentElement.dataset.theme = preferences.theme;
      toast("偏好设置已保存");
    } else if (target.matches("[data-history-year]")) {
      selectedHistoryYear = target.value;
      await renderPage();
    } else if (target.matches("[data-favorite-filter]")) {
      favoritesOnly[target.dataset.favoriteFilter] = target.checked;
      await renderPage();
    } else if (target.matches('[data-action="import-backup"]') && target.files && target.files[0]) {
      try {
        await importBackupFile(target.files[0]);
      } finally {
        target.value = "";
      }
    }
  }

  function handleInput(event) {
    if (event.target.matches("[data-path-search]")) {
      pathSearch = event.target.value;
      filterPaths();
    }
  }

  function normalizePreferences(raw) {
    const next = { theme: "tech", songSource: "qq" };
    const value = raw && typeof raw === "object" ? raw : {};
    if (["tech", "light", "dark"].indexOf(value.theme) !== -1) next.theme = value.theme;
    if (value.songSource === "netease") next.songSource = "netease";
    else if (value.songSource === "qq") next.songSource = "qq";
    else if (value.songRegion === "us" || value.songRegion === "gb" || value.songRegion === "ca") next.songSource = "qq";
    return next;
  }

  async function loadPreferences() {
    const saved = await store.get("settings", "preferences");
    if (saved && saved.value) {
      preferences = normalizePreferences(Object.assign({}, preferences, saved.value));
    } else {
      preferences = normalizePreferences(preferences);
    }
    document.documentElement.dataset.theme = preferences.theme;
  }

  async function exportBackup() {
    const data = await store.exportAll();
    const backup = window.MusicBackup.create(data);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tingge-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("备份文件已导出");
  }

  async function importBackupFile(file) {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw new Error("备份文件不是有效的 JSON 格式");
    }
    const backup = window.MusicBackup.validate(parsed);
    const summary = window.MusicBackup.summarize(backup);
    const confirmed = window.confirm(
      "将整体替换当前本机数据：收藏 " + summary.favorites + " 条、保存路径 " +
      summary.paths + " 条、设置 " + summary.settings + " 项、内容缓存 " +
      summary.cachedItems + " 条。此操作无法自动合并，是否继续？"
    );
    if (!confirmed) return;
    await store.replaceAll(backup.data);
    pathForm = null;
    Object.keys(refreshErrors).forEach(function (key) { delete refreshErrors[key]; });
    Object.keys(historyErrors).forEach(function (key) { delete historyErrors[key]; });
    await loadPreferences();
    await renderPage();
    toast("备份恢复成功，当前数据已整体替换");
  }

  async function initialize() {
    try {
      await store.open();
      await loadPreferences();
      await renderPage();
      refreshMissingFeeds().catch(function (error) {
        refreshErrors.songs = error.message || "公开内容更新失败";
        renderPage();
      });
    } catch (error) {
      const app = document.getElementById("app");
      app.innerHTML = heading("home") + '<div class="error-state">无法读取本机数据：' +
        escapeHtml(error.message || "未知错误") + "。请使用支持 IndexedDB 的桌面浏览器重试。</div>";
    }
  }

  async function refreshMissingFeeds() {
    const [songs, videos] = await Promise.all([
      store.get("feeds", FEED_IDS.songs),
      store.get("feeds", FEED_IDS.videos)
    ]);
    const pending = [];
    if (!songs) {
      refreshErrors.refreshingSongs = true;
      pending.push(dataService.refreshSongs(preferences.songSource).then(function (result) {
        refreshErrors.songs = result.state === "updated" ? "" : result.error;
      }).finally(function () {
        refreshErrors.refreshingSongs = false;
      }));
    }
    if (!videos) {
      refreshErrors.refreshingVideos = true;
      pending.push(dataService.refreshVideos().then(function (result) {
        refreshErrors.videos = result.state === "updated" ? "" : result.error;
      }).finally(function () {
        refreshErrors.refreshingVideos = false;
      }));
    }
    if (pending.length) {
      await renderPage();
      await Promise.all(pending);
      await renderPage();
    }
  }

  if (!document.documentElement.hasAttribute("data-test-page")) {
    document.getElementById("app").addEventListener("error", function (event) {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.matches(".song-artwork, .video-artwork")) return;
      const fallback = document.createElement("div");
      fallback.className = image.className + " artwork-fallback";
      fallback.setAttribute("aria-hidden", "true");
      fallback.textContent = image.classList.contains("video-artwork") ? "▷" : "♫";
      image.replaceWith(fallback);
    }, true);
    const mediaDialog = document.getElementById("media-dialog");
    if (mediaDialog) {
      mediaDialog.addEventListener("close", function () {
        const player = document.getElementById("media-player");
        if (!player) return;
        player.pause();
        player.removeAttribute("src");
        player.querySelectorAll("source").forEach(function (source) { source.remove(); });
        player.load();
      });
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", function (event) {
      handleSubmit(event).catch(function (error) { toast(error.message || "保存失败"); });
    });
    document.addEventListener("change", function (event) {
      handleChange(event).catch(function (error) { toast(error.message || "设置未能保存"); });
    });
    document.addEventListener("input", handleInput);
    window.addEventListener("hashchange", renderPage);
    window.addEventListener("DOMContentLoaded", initialize);
  }
  window.MusicApp = {
    routes: routes,
    routeFromHash: routeFromHash,
    renderShell: renderShell,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    renderPage: renderPage,
    initialize: initialize
  };
})();
