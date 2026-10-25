(function () {
  "use strict";
  const results = document.getElementById("test-results");
  const cases = [
    ["defines exactly six modules", function () {
      const names = Object.keys(window.MusicApp.routes);
      if (names.length !== 6) throw new Error("Expected 6 routes, got " + names.length);
    }],
    ["resolves each supported route", function () {
      Object.keys(window.MusicApp.routes).forEach(function (route) {
        if (window.MusicApp.routeFromHash("#/" + route) !== route) throw new Error("Failed route: " + route);
      });
    }],
    ["falls back to home for unknown routes", function () {
      if (window.MusicApp.routeFromHash("#/missing") !== "home") throw new Error("Unknown route did not fall back to home");
    }],
    ["renders active navigation and correct page heading", function () {
      window.location.hash = "#/videos";
      window.MusicApp.renderShell();
      const active = document.querySelector('[data-route="videos"].active');
      if (!active || active.getAttribute("aria-current") !== "page") throw new Error("Video navigation is not active");
      if (document.getElementById("page-breadcrumb").textContent !== "热门视频") throw new Error("Page heading is incorrect");
    }],
    ["renders all six module headings and active navigation states", function () {
      Object.keys(window.MusicApp.routes).forEach(function (route) {
        window.MusicApp.renderShell(route);
        const active = document.querySelector('[data-route="' + route + '"].active');
        if (!active || active.getAttribute("aria-current") !== "page") throw new Error("Navigation state failed for " + route);
        if (document.getElementById("page-breadcrumb").textContent !== window.MusicApp.routes[route].title) {
          throw new Error("Page title failed for " + route);
        }
      });
    }],
    ["applies the dark dashboard theme and colorful homepage tiles", function () {
      const page = document.querySelector("main.page-content");
      const tile = document.createElement("a");
      tile.className = "quick-link card";
      page.classList.add("home-page");
      document.body.classList.add("home-dashboard-route");
      page.appendChild(tile);
      const pageBackground = window.getComputedStyle(document.body).backgroundColor;
      const tileStyle = window.getComputedStyle(tile);
      const tileDisplay = tileStyle.display;
      const tileBackground = tileStyle.backgroundImage;
      page.removeChild(tile);
      page.classList.remove("home-page");
      document.body.classList.remove("home-dashboard-route");
      if (pageBackground !== "rgb(9, 20, 46)") throw new Error("Homepage dark background was not applied");
      if (tileDisplay !== "flex" || tileBackground.indexOf("linear-gradient") === -1) {
        throw new Error("Homepage module tile styling was not applied");
      }
    }],
    ["applies the blue technology theme to all page surfaces", function () {
      const priorTheme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = "tech";
      const card = document.createElement("article");
      card.className = "content-card";
      document.body.appendChild(card);
      const pageBackground = window.getComputedStyle(document.body).backgroundColor;
      const cardBackground = window.getComputedStyle(card).backgroundColor;
      document.body.removeChild(card);
      if (priorTheme) document.documentElement.dataset.theme = priorTheme;
      else delete document.documentElement.dataset.theme;
      if (pageBackground !== "rgb(9, 20, 46)") throw new Error("Technology theme background was not applied globally");
      if (cardBackground === "rgb(255, 255, 255)") throw new Error("Technology theme did not style a non-home content card");
    }],
    ["escapes untrusted text before rendering", function () {
      const escaped = window.MusicApp.escapeHtml('<img src=x onerror="alert(1)">');
      if (escaped.indexOf("<") !== -1 || escaped.indexOf(">") !== -1) throw new Error("HTML characters were not escaped");
    }],
    ["persists structured records and atomically replaces local data", async function () {
      const store = window.MusicStore.create({ name: "music-tests-" + Date.now() });
      const favorite = { id: "song:test-1", type: "song", contentId: "test-1" };
      await store.put("favorites", favorite);
      await store.put("paths", { id: "path:test-1", name: "音乐", path: "D:\\Music" });
      const saved = await store.get("favorites", favorite.id);
      if (!saved || saved.contentId !== "test-1") throw new Error("Could not read stored favorite");
      const snapshot = await store.exportAll();
      if (snapshot.paths.length !== 1 || snapshot.favorites.length !== 1) throw new Error("Exported store snapshot is incomplete");
      await store.replaceAll({ paths: [{ id: "path:restored", name: "恢复", path: "E:\\Audio" }] });
      const paths = await store.getAll("paths");
      const favorites = await store.getAll("favorites");
      if (paths.length !== 1 || paths[0].id !== "path:restored" || favorites.length !== 0) throw new Error("Replacement did not update all stores");
      await store.clear();
      store.close();
    }],
    ["normalizes QQ song payloads and rejects unsafe URLs", async function () {
      const normalized = window.MusicSources.normalizeQQSongs({
        code: 0,
        date: "2026-10-24",
        topinfo: { ListName: "巅峰榜·热歌" },
        songlist: [
          { data: { songmid: "m1", songid: "1", songname: "Bad Song", singer: [{ name: "Bad Artist" }], albummid: "a1" } },
          { data: { songmid: "m2", songid: "2", songname: "Good Song", singer: [{ name: "Good Artist" }], albummid: "a2" } }
        ]
      }, "2026-10-24T11:00:00.000Z");
      if (normalized.items.length !== 2) throw new Error("QQ song list was not normalized");
      if (normalized.items[1].rank !== 2 || normalized.items[1].artist !== "Good Artist") throw new Error("QQ song rank or artist mapping failed");
      if (normalized.items[1].url.indexOf("https://") !== 0) throw new Error("Unsafe QQ source URL was retained");
    }],
    ["normalizes Douyin hot-search words and filters keyword payloads", async function () {
      const normalized = window.MusicSources.normalizeDouyinHotWords({
        active_time: "2026-10-24T11:00:00+08:00",
        word_list: [
          { word: "  热搜词  " },
          { word: "" }
        ]
      }, "2026-10-24T11:00:00.000Z");
      if (normalized.items.length !== 1 || normalized.items[0].title !== "热搜词") throw new Error("Douyin hot word normalization failed");
      if (normalized.items[0].url.indexOf("https://www.douyin.com/search/") !== 0) throw new Error("Douyin URL mapping failed");
    }],
    ["normalizes only directly playable Wikimedia Commons audio files", function () {
      const normalized = window.MusicSources.normalizeCommonsMedia({
        query: {
          pages: [
            {
              pageid: 7,
              title: "File:Open song.ogg",
              imageinfo: [{
                url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Open_song.ogg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:Open_song.ogg",
                thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Open_song.ogg/320px-Open_song.ogg",
                mime: "audio/ogg",
                extmetadata: {
                  Artist: { value: "<span>Sample Artist</span>" },
                  LicenseShortName: { value: "<a>CC BY-SA 4.0</a>" },
                  ImageDescription: { value: "<p>Open <b>song</b></p>" }
                }
              }]
            },
            {
              pageid: 8,
              title: "File:External.mp3",
              imageinfo: [{
                url: "https://example.com/External.mp3",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:External.mp3",
                mime: "audio/mpeg",
                extmetadata: {}
              }]
            }
          ]
        }
      }, "audio", "2026-10-24T11:00:00.000Z");
      if (normalized.items.length !== 1) throw new Error("A non-Wikimedia media URL was retained");
      const item = normalized.items[0];
      if (item.mediaUrl.indexOf("https://upload.wikimedia.org/") !== 0 || item.mime !== "audio/ogg") {
        throw new Error("Playable media URL or MIME type was not retained");
      }
      if (item.license !== "CC BY-SA 4.0" || item.artist !== "Sample Artist") {
        throw new Error("License attribution metadata was not normalized");
      }
      if (item.description !== "Open song") throw new Error("Description markup was not stripped");
    }],
    ["searches Wikimedia Commons by actual playable media type", async function () {
      const requests = [];
      const result = await window.MusicSources.searchCommonsMedia("video", "forest", async function (url) {
        requests.push(url);
        return {
          ok: true,
          json: async function () {
            return {
              query: {
                pages: [{
                  pageid: 12,
                  title: "File:Forest.webm",
                  imageinfo: [{
                    url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Forest.webm",
                    descriptionurl: "https://commons.wikimedia.org/wiki/File:Forest.webm",
                    mime: "video/webm",
                    extmetadata: { LicenseShortName: { value: "CC0" } }
                  }]
                }]
              }
            };
          }
        };
      });
      if (requests.length !== 3 || requests.some(function (url) {
        const params = new URL(url).searchParams;
        return params.get("gsrsearch").indexOf("forest") === -1 ||
          params.get("gsrsearch").indexOf("filemime:video/") === -1 ||
          params.get("origin") !== "*";
      })) {
        throw new Error("Commons search did not request playable video formats for the search term");
      }
      if (result.items.length !== 1 || result.items[0].mime !== "video/webm") {
        throw new Error("Playable video result was not normalized and deduplicated");
      }
    }],
    ["normalizes historical chart rows from a verifiable public page", async function () {
      const normalized = window.MusicSources.normalizeHistoricalSongs({
        parse: { text: '<table class="wikitable"><tr><th>No.</th><th>Title</th><th>Artist</th></tr><tr><td>1</td><td>Example Song</td><td>Example Artist</td></tr></table>' }
      }, 2023, "2026-10-24T11:00:00.000Z");
      if (normalized.items.length !== 1 || normalized.items[0].title !== "Example Song") throw new Error("Historical chart row was not parsed");
      if (normalized.items[0].rank !== 1 || normalized.items[0].year !== 2023) throw new Error("Historical chart rank or year was not preserved");
      if (normalized.items[0].url.indexOf("https://en.wikipedia.org/wiki/") !== 0) throw new Error("Historical provenance link is incorrect");
      let rejected = false;
      try { window.MusicSources.normalizeHistoricalSongs({ parse: { text: "<p>No chart</p>" } }, 2023, "2026-10-24T11:00:00.000Z"); } catch (_) { rejected = true; }
      if (!rejected) throw new Error("A page without a chart table was accepted");
    }],
    ["requests configured public sources and maps their data", async function () {
      let requested = "";
      const qqSongs = await window.MusicSources.adapters.todaySongs({
        source: "qq",
        fetch: async function (url) {
          requested = url;
          return {
            ok: true,
            json: async function () {
              return {
                code: 0,
                date: "2026-10-24",
                topinfo: { ListName: "巅峰榜·热歌" },
                songlist: [{ data: { songmid: "m1", songid: "1", songname: "QQ Song", singer: [{ name: "QQ Artist" }], albummid: "a1" } }]
              };
            }
          };
        }
      });
      if (requested.indexOf("fcg_v8_toplist_cp") === -1 || qqSongs.source.indexOf("QQ") === -1 || qqSongs.items.length !== 1) {
        throw new Error("QQ source request or payload mapping failed");
      }
      const neteaseSongs = await window.MusicSources.adapters.todaySongs({
        source: "netease",
        fetch: async function (url) {
          requested = url;
          return {
            ok: true,
            json: async function () {
              return {
                result: {
                  name: "热歌榜",
                  updateTime: 1700000000000,
                  tracks: [{ id: 42, name: "Cloud Song", ar: [{ name: "Cloud Artist" }], al: { picUrl: "https://img.example/cloud.jpg" } }]
                }
              };
            }
          };
        }
      });
      if (requested.indexOf("music.163.com") === -1 || neteaseSongs.source.indexOf("网易云") === -1 || neteaseSongs.items.length !== 1) {
        throw new Error("NetEase request or payload mapping failed");
      }
      const year = new Date().getFullYear() - 1;
      const historical = await window.MusicSources.adapters.historicalSongs({
        year: year,
        fetch: async function (url) {
          requested = url;
          return {
            ok: true,
            json: async function () {
              return { parse: { text: '<table class="wikitable"><tr><th>No.</th><th>Title</th><th>Artist</th></tr><tr><td>1</td><td>Chart Song</td><td>Chart Artist</td></tr></table>' } };
            }
          };
        }
      });
      if (requested.indexOf("action=parse") === -1 || requested.indexOf("Hot_100_singles_of_" + year) === -1 || historical.items[0].year !== year) {
        throw new Error("Historical source request did not preserve its requested year");
      }
    }],
    ["keeps last successful content after a failed refresh", async function () {
      const store = window.MusicStore.create({ name: "music-refresh-tests-" + Date.now() });
      let shouldFail = false;
      const service = window.MusicSources.createDataService({
        store: store,
        adapters: {
          todaySongs: async function () {
            if (shouldFail) throw new Error("simulated network failure");
            return { source: "test source", updatedAt: "2026-10-24T10:00:00.000Z", items: [{ id: "song:test", title: "Saved song" }] };
          }
        }
      });
      const updated = await service.refreshSongs("qq");
      shouldFail = true;
      const stale = await service.refreshSongs("qq");
      if (updated.state !== "updated" || stale.state !== "stale") throw new Error("Refresh status was incorrect");
      if (!stale.feed || stale.feed.items[0].title !== "Saved song" || stale.error.indexOf("simulated network failure") === -1) {
        throw new Error("Failed refresh did not preserve cached data and error state");
      }
      await store.clear();
      store.close();
    }],
    ["caches historical chart years independently", async function () {
      const store = window.MusicStore.create({ name: "music-history-cache-tests-" + Date.now() });
      const service = window.MusicSources.createDataService({
        store: store,
        adapters: {
          historicalSongs: async function (options) {
            return {
              source: "test chart",
              updatedAt: "2026-10-24T10:00:00.000Z",
              items: [{ id: "chart:" + options.year, title: "Year " + options.year, year: options.year }]
            };
          }
        }
      });
      await service.refreshHistory(2022);
      await service.refreshHistory(2023);
      const firstFeed = await service.loadFeed("historicalSongs:2022");
      const secondFeed = await service.loadFeed("historicalSongs:2023");
      const saved = await store.getAll("history");
      if (!firstFeed || !secondFeed || saved.length !== 2) throw new Error("Refreshing a year overwrote another cached year");
      await store.clear();
      store.close();
    }],
    ["validates and normalizes saved paths", async function () {
      const createId = function () { return "path:test"; };
      let rejected = false;
      try {
        window.MusicCatalog.normalizePath({ name: "  ", path: "D:\\Music" }, null, "2026-10-24T12:00:00.000Z", createId);
      } catch (error) {
        rejected = error.message.indexOf("不能为空") !== -1;
      }
      if (!rejected) throw new Error("Empty path fields were not rejected");
      const path = window.MusicCatalog.normalizePath({
        name: " 音乐 ", path: " D:\\Music ", category: " 媒体 ", notes: ""
      }, null, "2026-10-24T12:00:00.000Z", createId);
      if (path.name !== "音乐" || path.path !== "D:\\Music" || path.id !== "path:test") throw new Error("Path fields were not normalized");
    }],
    ["filters saved paths by name, path, and category", async function () {
      const record = { name: "音乐收藏", path: "D:\\Music", category: "媒体", notes: "常用" };
      if (!window.MusicCatalog.matchesPath(record, "music", "")) throw new Error("Case-insensitive path search failed");
      if (!window.MusicCatalog.matchesPath(record, "D:\\", "媒体")) throw new Error("Path and category filters failed");
      if (window.MusicCatalog.matchesPath(record, "照片", "媒体")) throw new Error("Non-matching path was included");
    }],
    ["filters historical entries by available year without inventing data", async function () {
      const records = [{ title: "A", year: 1990 }, { title: "B", year: 2001 }, { title: "C" }];
      const result = window.MusicCatalog.filterByYear(records, "1990");
      if (result.length !== 1 || result[0].title !== "A") throw new Error("Historical year filter returned incorrect records");
      if (window.MusicCatalog.filterByYear([], "1990").length !== 0) throw new Error("Empty historical data was populated");
    }],
    ["keeps favorite snapshots available after source list changes", async function () {
      const favorites = new Map([["song:old", { type: "song", snapshot: { id: "old", title: "Saved" } }]]);
      const current = [{ id: "current", title: "Current" }];
      const combined = window.MusicCatalog.withFavoriteSnapshots(current, favorites, "song", false);
      const savedOnly = window.MusicCatalog.withFavoriteSnapshots(current, favorites, "song", true);
      const emptySavedOnly = window.MusicCatalog.withFavoriteSnapshots(current, new Map(), "song", true);
      if (combined.items.length !== 2 || combined.savedCount !== 1) throw new Error("Saved item was lost from the combined list");
      if (savedOnly.items.length !== 1 || savedOnly.items[0].id !== "old") throw new Error("Favorite-only filter returned current items");
      if (emptySavedOnly.items.length !== 0 || emptySavedOnly.savedCount !== 0) throw new Error("Empty favorite filter showed non-favorites");
    }],
    ["creates, edits, searches, and deletes saved paths", async function () {
      const store = window.MusicStore.create({ name: "music-path-crud-tests-" + Date.now() });
      const createId = function () { return "path:crud"; };
      const first = window.MusicCatalog.normalizePath({ name: "音乐", path: "D:\\Music", category: "媒体" }, null, "2026-10-24T10:00:00.000Z", createId);
      await store.put("paths", first);
      const edited = window.MusicCatalog.normalizePath({ name: "音乐收藏", path: "E:\\Audio", category: "常用" }, first, "2026-10-24T11:00:00.000Z", createId);
      await store.put("paths", edited);
      const stored = await store.get("paths", "path:crud");
      if (stored.name !== "音乐收藏" || stored.path !== "E:\\Audio" || stored.createdAt !== first.createdAt) throw new Error("Path edit did not preserve and update expected fields");
      if (!window.MusicCatalog.matchesPath(stored, "audio", "常用")) throw new Error("Edited path cannot be found by search and category");
      await store.delete("paths", "path:crud");
      if ((await store.getAll("paths")).length !== 0) throw new Error("Deleted path still exists");
      await store.clear();
      store.close();
    }],
    ["stores favorite snapshots for later access", async function () {
      const store = window.MusicStore.create({ name: "music-favorite-tests-" + Date.now() });
      const snapshot = { id: "qq:favorite", title: "Saved for later", url: "https://y.qq.com/n/ryqq/song/1" };
      await store.put("favorites", { id: "song:qq:favorite", type: "song", contentId: snapshot.id, snapshot: snapshot });
      const restored = await store.get("favorites", "song:qq:favorite");
      if (!restored || !restored.snapshot || restored.snapshot.title !== "Saved for later") throw new Error("Favorite snapshot was not retained");
      await store.clear();
      store.close();
    }],
    ["creates and validates complete versioned backup files", async function () {
      const store = window.MusicStore.create({ name: "music-backup-roundtrip-tests-" + Date.now() });
      await store.put("favorites", { id: "song:test", type: "song", contentId: "qq:test", snapshot: { id: "qq:test", title: "Test song" } });
      await store.put("paths", { id: "path:test", name: "Music", path: "D:\\Music", category: "", notes: "" });
      await store.put("settings", { id: "preferences", value: { theme: "tech", songSource: "qq" } });
      await store.saveFeed("todaySongs", "songs", {
        source: "QQ 音乐 · 巅峰榜热歌",
        updatedAt: "2026-10-24T10:00:00.000Z",
        items: [{ id: "qq:test", title: "Test song", artist: "Singer", url: "https://y.qq.com/n/ryqq/song/1" }]
      });
      const backup = window.MusicBackup.create(await store.exportAll(), "2026-10-24T12:00:00.000Z");
      const restored = window.MusicBackup.validate(JSON.parse(JSON.stringify(backup)));
      const summary = window.MusicBackup.summarize(restored);
      if (restored.version !== 1 || summary.favorites !== 1 || summary.paths !== 1 || summary.settings !== 1 || summary.cachedItems !== 1) {
        throw new Error("Backup data or metadata did not round-trip");
      }
      await store.clear();
      store.close();
    }],
    ["rejects malformed, incomplete, and unsupported backup files", async function () {
      const valid = window.MusicBackup.create({
        favorites: [], paths: [], settings: [], feeds: [], songs: [], videos: [], history: []
      }, "2026-10-24T12:00:00.000Z");
      const invalids = [
        Object.assign({}, valid, { version: 999 }),
        Object.assign({}, valid, { data: { favorites: [], paths: [] } }),
        Object.assign({}, valid, { data: Object.assign({}, valid.data, { paths: [{ id: "p", name: "Path", path: "" }] }) }),
        Object.assign({}, valid, { data: Object.assign({}, valid.data, { settings: [{ id: "preferences", value: { theme: "remote-css" } }] }) }),
        Object.assign({}, valid, { data: Object.assign({}, valid.data, { settings: [{ id: "preferences", value: { theme: "neon" } }] }) }),
        Object.assign({}, valid, { data: Object.assign({}, valid.data, { settings: [{ id: "preferences", value: { songSource: "spotify" } }] }) })
      ];
      for (const payload of invalids) {
        let rejected = false;
        try { window.MusicBackup.validate(payload); } catch (_) { rejected = true; }
        if (!rejected) throw new Error("An invalid backup was accepted");
      }
    }],
    ["does not change stored data when backup validation fails", async function () {
      const store = window.MusicStore.create({ name: "music-backup-safety-tests-" + Date.now() });
      await store.put("paths", { id: "path:keep", name: "Keep", path: "D:\\Keep" });
      let rejected = false;
      try {
        window.MusicBackup.validate({ format: "wrong", version: 1, exportedAt: "2026-10-24T12:00:00.000Z", data: {} });
      } catch (_) {
        rejected = true;
      }
      const retained = await store.get("paths", "path:keep");
      if (!rejected || !retained) throw new Error("Validation failure changed existing data");
      await store.clear();
      store.close();
    }]
  ];
  async function run() {
    let failures = 0;
    for (const testCase of cases) {
      const item = document.createElement("li");
      try {
        await testCase[1]();
        item.textContent = "通过 — " + testCase[0];
      } catch (error) {
        failures += 1;
        item.textContent = "失败 — " + testCase[0] + ": " + error.message;
        item.style.color = "#bd4a55";
      }
      results.appendChild(item);
    }
    document.getElementById("test-summary").textContent =
      (cases.length - failures) + "/" + cases.length + " 项通过";
    document.documentElement.dataset.testResult = failures ? "failed" : "passed";
  }
  run();
})();
