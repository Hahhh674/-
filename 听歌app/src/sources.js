(function () {
  "use strict";

  const QQ_TOP_SONGS_URL = "https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?type=top&topid=26&page=1&num=50";
  const NETEASE_HOT_SONGS_URL = "https://music.163.com/api/playlist/detail?id=3778678";
  const DOUYIN_HOT_WORDS_URL = "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/";
  const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
  const SONG_SOURCES = ["qq", "netease"];
  const COMMONS_MIME_TYPES = {
    audio: ["audio/ogg", "audio/mpeg", "audio/flac", "audio/wav"],
    video: ["video/webm", "video/ogg", "video/mp4"]
  };

  function safeHttpUrl(value) {
    if (typeof value !== "string") return "";
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function normalizeQQSongs(payload, now) {
    if (!payload || payload.code !== 0 || !Array.isArray(payload.songlist)) {
      throw new Error("QQ 音乐热歌榜返回的数据格式不正确");
    }
    const updatedAt = payload.date && !Number.isNaN(Date.parse(payload.date))
      ? new Date(payload.date).toISOString()
      : now;
    const items = payload.songlist.slice(0, 50).reduce(function (list, entry, index) {
      const song = entry && entry.data;
      const title = song && (song.songname || song.songorig);
      const songId = song && (song.songmid || song.songid);
      const artists = song && Array.isArray(song.singer)
        ? song.singer.map(function (singer) { return singer && singer.name; }).filter(Boolean)
        : [];
      if (!songId || !title || !artists.length) return list;
      const albumId = song.albummid;
      list.push({
        id: "qq:" + String(songId),
        title: String(title),
        artist: artists.join(" / "),
        rank: index + 1,
        year: null,
        artwork: albumId
          ? "https://y.gtimg.cn/music/photo_new/T002R300x300M000" + encodeURIComponent(String(albumId)) + ".jpg"
          : "",
        source: "QQ 音乐 · " + String(payload.topinfo && payload.topinfo.ListName || "巅峰榜·热歌"),
        url: "https://y.qq.com/n/ryqq/song/" + encodeURIComponent(String(songId)),
        updatedAt: updatedAt
      });
      return list;
    }, []);
    if (!items.length) throw new Error("QQ 音乐热歌榜没有可用歌曲");
    return { source: items[0].source, updatedAt: updatedAt, items: items };
  }

  function normalizeNetEaseSongs(payload, now) {
    const playlist = payload && (payload.result || payload.playlist);
    const tracks = playlist && Array.isArray(playlist.tracks) ? playlist.tracks : null;
    if (!tracks) throw new Error("网易云音乐热歌榜返回的数据格式不正确");
    const updatedAt = playlist.updateTime && !Number.isNaN(Number(playlist.updateTime))
      ? new Date(Number(playlist.updateTime)).toISOString()
      : now;
    const items = tracks.slice(0, 50).reduce(function (list, track, index) {
      const artists = Array.isArray(track.ar) ? track.ar : track.artists;
      const names = Array.isArray(artists)
        ? artists.map(function (artist) { return artist && artist.name; }).filter(Boolean)
        : [];
      if (!track.id || !track.name || !names.length) return list;
      const image = track.al && (track.al.picUrl || track.al.blurPicUrl) ||
        track.album && (track.album.picUrl || track.album.blurPicUrl) || "";
      const published = track.publishTime || track.album && track.album.publishTime;
      list.push({
        id: "netease:" + String(track.id),
        title: String(track.name),
        artist: names.join(" / "),
        rank: index + 1,
        year: published && Number.isFinite(Number(published))
          ? new Date(Number(published)).getFullYear()
          : null,
        artwork: safeHttpUrl(image),
        source: "网易云音乐 · " + String(playlist.name || "热歌榜"),
        url: "https://music.163.com/#/song?id=" + encodeURIComponent(String(track.id)),
        updatedAt: updatedAt
      });
      return list;
    }, []);
    if (!items.length) throw new Error("网易云音乐热歌榜没有可用歌曲");
    return { source: items[0].source, updatedAt: updatedAt, items: items };
  }

  function normalizeDouyinHotWords(payload, now) {
    if (!payload || !Array.isArray(payload.word_list)) {
      throw new Error("抖音热榜返回的数据格式不正确");
    }
    const items = payload.word_list.slice(0, 50).reduce(function (list, entry, index) {
      if (!entry || typeof entry.word !== "string" || !entry.word.trim()) return list;
      const title = entry.word.trim();
      list.push({
        id: "douyin:" + title,
        title: title,
        publisher: "抖音热榜",
        artwork: "",
        source: "抖音 · 热搜话题",
        url: "https://www.douyin.com/search/" + encodeURIComponent(title),
        rank: index + 1,
        updatedAt: now
      });
      return list;
    }, []);
    if (!items.length) throw new Error("抖音热榜暂未返回可用话题");
    const updatedAt = payload.active_time && !Number.isNaN(Date.parse(payload.active_time))
      ? new Date(payload.active_time.replace(" ", "T") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(payload.active_time) ? "" : "Z")).toISOString()
      : now;
    items.forEach(function (item) { item.updatedAt = updatedAt; });
    return { source: "抖音 · 热搜话题", updatedAt: updatedAt, items: items };
  }

  function normalizeHistoricalSongs(payload, year, now) {
    if (!payload || payload.error || !payload.parse || typeof payload.parse.text !== "string") {
      throw new Error("未找到该年份可用的 Billboard 年终榜单");
    }
    const pageUrl = safeHttpUrl("https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_" + year);
    const documentNode = new DOMParser().parseFromString(payload.parse.text, "text/html");
    const tables = Array.from(documentNode.querySelectorAll("table.wikitable"));
    let items = [];
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      const headerRow = rows.find(function (row) {
        const labels = Array.from(row.querySelectorAll("th")).map(function (cell) {
          return cell.textContent.trim().toLowerCase();
        });
        return labels.some(function (label) { return label.indexOf("title") !== -1 || label.indexOf("song") !== -1; }) &&
          labels.some(function (label) { return label.indexOf("artist") !== -1; });
      });
      if (!headerRow) continue;
      const headers = Array.from(headerRow.querySelectorAll("th")).map(function (cell) {
        return cell.textContent.trim().toLowerCase();
      });
      const titleIndex = headers.findIndex(function (label) { return label.indexOf("title") !== -1 || label.indexOf("song") !== -1; });
      const artistIndex = headers.findIndex(function (label) { return label.indexOf("artist") !== -1; });
      const rankIndex = headers.findIndex(function (label) { return label.indexOf("no") !== -1 || label.indexOf("rank") !== -1; });
      items = rows.reduce(function (list, row) {
        if (row === headerRow) return list;
        const cells = Array.from(row.querySelectorAll("th, td"));
        const title = cells[titleIndex] ? cells[titleIndex].textContent.trim() : "";
        const artist = cells[artistIndex] ? cells[artistIndex].textContent.trim() : "";
        if (!title || !artist) return list;
        const rankText = rankIndex >= 0 && cells[rankIndex] ? cells[rankIndex].textContent.trim() : "";
        const rank = Number.parseInt(rankText.replace(/[^\d]/g, ""), 10);
        list.push({
          id: "billboard:" + year + ":" + (Number.isFinite(rank) ? rank : list.length + 1),
          title: title,
          artist: artist,
          rank: Number.isFinite(rank) ? rank : list.length + 1,
          year: Number(year),
          source: "Wikipedia · Billboard 年终 Hot 100",
          url: pageUrl,
          updatedAt: now
        });
        return list;
      }, []);
      if (items.length) break;
    }
    if (!items.length) throw new Error("该年份的公开页面中没有识别到有效歌曲表格");
    return { source: "Wikipedia · Billboard 年终 Hot 100", updatedAt: now, items: items };
  }

  function stripMarkup(value) {
    if (typeof value !== "string") return "";
    const parsed = new DOMParser().parseFromString(value, "text/html");
    return (parsed.body.textContent || "").trim();
  }

  function normalizeCommonsMedia(payload, kind, now) {
    const supportedMimes = COMMONS_MIME_TYPES[kind];
    if (!supportedMimes || !payload || payload.error) {
      throw new Error("Wikimedia Commons 未返回有效的媒体数据");
    }
    const rawPages = payload.query && payload.query.pages;
    const pages = !rawPages ? [] : Array.isArray(rawPages)
      ? rawPages
      : Object.keys(rawPages).map(function (key) { return rawPages[key]; });
    const items = pages.reduce(function (list, page) {
      const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
      const mediaUrl = info && safeHttpUrl(info.url);
      const mediaHost = mediaUrl ? new URL(mediaUrl).hostname : "";
      if (!info || !mediaUrl || mediaHost !== "upload.wikimedia.org" ||
          supportedMimes.indexOf(String(info.mime || "").toLowerCase()) === -1) return list;
      const metadata = info.extmetadata || {};
      const title = stripMarkup(page.title || "");
      const description = stripMarkup(metadata.ImageDescription && metadata.ImageDescription.value);
      const creator = stripMarkup(metadata.Artist && metadata.Artist.value);
      const license = stripMarkup(metadata.LicenseShortName && metadata.LicenseShortName.value);
      const pageUrl = safeHttpUrl(info.descriptionurl);
      if (!title || !pageUrl) return list;
      list.push({
        id: "commons:" + String(page.pageid || title),
        title: title.replace(/^File:/, ""),
        artist: creator || "",
        publisher: creator || "Wikimedia Commons",
        description: description,
        source: "Wikimedia Commons",
        license: license || "许可证信息未提供",
        mime: String(info.mime).toLowerCase(),
        artwork: safeHttpUrl(info.thumburl),
        mediaUrl: mediaUrl,
        url: pageUrl,
        updatedAt: now
      });
      return list;
    }, []);
    return { source: "Wikimedia Commons", updatedAt: now, items: items };
  }

  async function searchCommonsMedia(kind, query, fetchImpl) {
    if (["audio", "video"].indexOf(kind) === -1) throw new Error("请选择音频或视频类型");
    const searchTerm = String(query || "").trim();
    if (searchTerm.length < 2) throw new Error("请输入至少两个字符进行搜索");
    const mimes = COMMONS_MIME_TYPES[kind];
    const results = await Promise.all(mimes.map(async function (mime) {
      const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: "filemime:" + mime + " " + searchTerm,
        gsrnamespace: "6",
        gsrlimit: "15",
        prop: "imageinfo",
        iiprop: "url|mime|extmetadata",
        iiurlwidth: "320",
        format: "json",
        origin: "*"
      });
      const payload = await requestJson(COMMONS_API_URL + "?" + params.toString(), fetchImpl);
      return normalizeCommonsMedia(payload, kind, new Date().toISOString()).items;
    }));
    const seen = new Set();
    const items = results.reduce(function (all, group) {
      group.forEach(function (item) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          all.push(item);
        }
      });
      return all;
    }, []).slice(0, 30);
    if (!items.length) throw new Error("没有找到可直接播放的开放授权" + (kind === "audio" ? "音频" : "视频") + "文件");
    return { source: "Wikimedia Commons", updatedAt: new Date().toISOString(), items: items };
  }

  async function requestJson(url, fetchImpl) {
    const fetcher = fetchImpl || window.fetch.bind(window);
    const controller = window.AbortController ? new AbortController() : null;
    const timer = controller ? window.setTimeout(function () { controller.abort(); }, 12000) : null;
    try {
      const response = await fetcher(url, controller ? { signal: controller.signal, headers: { Accept: "application/json" } } : { headers: { Accept: "application/json" } });
      if (!response || !response.ok) {
        throw new Error("公开内容来源请求失败" + (response && response.status ? "（HTTP " + response.status + "）" : ""));
      }
      return await response.json();
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("公开内容来源请求超时");
      throw error;
    } finally {
      if (timer !== null) window.clearTimeout(timer);
    }
  }

  const adapters = {
    async todaySongs(options) {
      const source = options && SONG_SOURCES.indexOf(options.source) !== -1 ? options.source : "qq";
      const url = source === "netease" ? NETEASE_HOT_SONGS_URL : QQ_TOP_SONGS_URL;
      const payload = await requestJson(url, options && options.fetch);
      const now = new Date().toISOString();
      return source === "netease" ? normalizeNetEaseSongs(payload, now) : normalizeQQSongs(payload, now);
    },
    async trendingVideos(options) {
      const payload = await requestJson(DOUYIN_HOT_WORDS_URL, options && options.fetch);
      return normalizeDouyinHotWords(payload, new Date().toISOString());
    },
    async historicalSongs(options) {
      const year = Number(options && options.year);
      const currentYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < 1958 || year >= currentYear) {
        throw new Error("请选择 1958 年至上一完整年度之间的有效年份");
      }
      const page = "Billboard_Year-End_Hot_100_singles_of_" + year;
      const url = "https://en.wikipedia.org/w/api.php?action=parse&page=" + encodeURIComponent(page) +
        "&prop=text&format=json&formatversion=2&origin=*";
      return normalizeHistoricalSongs(await requestJson(url, options && options.fetch), year, new Date().toISOString());
    },
    async commonsMedia(options) {
      return searchCommonsMedia(options && options.kind, options && options.query, options && options.fetch);
    }
  };

  function createDataService(options) {
    const store = options.store;
    const sourceAdapters = options.adapters || adapters;

    async function refresh(feedId, storeName, fetcher) {
      try {
        const fresh = await fetcher();
        if (!fresh || !Array.isArray(fresh.items) || !fresh.source || !fresh.updatedAt) {
          throw new Error("内容来源返回了无效数据");
        }
        await store.saveFeed(feedId, storeName, fresh, storeName === "history");
        return { state: "updated", feed: fresh, error: "" };
      } catch (error) {
        const cached = await store.get("feeds", feedId);
        return {
          state: cached && Array.isArray(cached.items) && cached.items.length ? "stale" : "unavailable",
          feed: cached || null,
          error: error && error.message ? error.message : "内容更新失败"
        };
      }
    }

    async function refreshSongs(preferredSource) {
      const primary = SONG_SOURCES.indexOf(preferredSource) !== -1 ? preferredSource : "qq";
      const fallback = primary === "qq" ? "netease" : "qq";
      let primaryError;
      try {
        const fresh = await sourceAdapters.todaySongs({ source: primary });
        if (!fresh || !Array.isArray(fresh.items) || !fresh.items.length) throw new Error("首选来源没有可用歌曲");
        await store.saveFeed("todaySongs", "songs", fresh);
        return { state: "updated", feed: fresh, error: "", warning: "" };
      } catch (error) {
        primaryError = error && error.message ? error.message : "首选音乐来源请求失败";
      }
      try {
        const fresh = await sourceAdapters.todaySongs({ source: fallback });
        if (!fresh || !Array.isArray(fresh.items) || !fresh.items.length) throw new Error("备用来源没有可用歌曲");
        fresh.warning = primaryError + "；已自动切换到 " + fresh.source;
        await store.saveFeed("todaySongs", "songs", fresh);
        return { state: "updated", feed: fresh, error: "", warning: fresh.warning };
      } catch (fallbackError) {
        const cached = await store.get("feeds", "todaySongs");
        const fallbackMessage = fallbackError && fallbackError.message ? fallbackError.message : "备用音乐来源请求失败";
        return {
          state: cached && Array.isArray(cached.items) && cached.items.length ? "stale" : "unavailable",
          feed: cached || null,
          error: primaryError + "；备用来源也不可用：" + fallbackMessage
        };
      }
    }

    return {
      refreshSongs: refreshSongs,
      refreshVideos: function () {
        return refresh("hotVideos", "videos", function () { return sourceAdapters.trendingVideos({}); });
      },
      refreshHistory: function (year) {
        const feedId = "historicalSongs:" + year;
        return refresh(feedId, "history", function () { return sourceAdapters.historicalSongs({ year: year }); });
      },
      loadFeed: function (feedId) { return store.get("feeds", feedId); }
    };
  }

  window.MusicSources = {
    adapters: adapters,
    createDataService: createDataService,
    normalizeQQSongs: normalizeQQSongs,
    normalizeNetEaseSongs: normalizeNetEaseSongs,
    normalizeDouyinHotWords: normalizeDouyinHotWords,
    normalizeHistoricalSongs: normalizeHistoricalSongs,
    normalizeCommonsMedia: normalizeCommonsMedia,
    searchCommonsMedia: searchCommonsMedia,
    safeHttpUrl: safeHttpUrl
  };
})();
