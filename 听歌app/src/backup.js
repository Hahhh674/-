(function () {
  "use strict";

  const FORMAT = "tingge-local-backup";
  const VERSION = 1;
  const STORE_NAMES = ["favorites", "paths", "settings", "feeds", "songs", "videos", "history"];

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new Error("备份中的" + label + "缺失或无效");
  }

  function validateRecord(record, storeName, index) {
    const label = storeName + " 第 " + (index + 1) + " 条记录";
    if (!isObject(record)) throw new Error(label + "格式无效");
    requireString(record.id, label + "标识");
    if (storeName === "paths") {
      requireString(record.name, label + "名称");
      requireString(record.path, label + "路径");
      ["category", "notes"].forEach(function (key) {
        if (record[key] !== undefined && typeof record[key] !== "string") throw new Error(label + "字段无效：" + key);
      });
    } else if (storeName === "favorites") {
      if (["song", "video", "history"].indexOf(record.type) === -1) throw new Error(label + "类型无效");
      requireString(record.contentId, label + "内容标识");
      if (record.snapshot !== undefined && record.snapshot !== null && !isObject(record.snapshot)) {
        throw new Error(label + "收藏快照无效");
      }
    } else if (storeName === "settings") {
      if (!isObject(record.value)) throw new Error(label + "设置值无效");
      if (record.id === "preferences") {
        if (record.value.theme !== undefined && ["tech", "light", "dark"].indexOf(record.value.theme) === -1) {
          throw new Error(label + "主题偏好无效");
        }
        const validSources = ["qq", "netease"];
        if (record.value.songSource !== undefined && validSources.indexOf(record.value.songSource) === -1) {
          throw new Error(label + "歌曲来源无效");
        }
        if (record.value.songRegion !== undefined && ["us", "gb", "ca"].indexOf(record.value.songRegion) === -1) {
          throw new Error(label + "歌曲榜单地区无效");
        }
      }
    } else if (storeName === "feeds") {
      requireString(record.source, label + "来源");
      if (typeof record.updatedAt !== "string" || Number.isNaN(Date.parse(record.updatedAt))) {
        throw new Error(label + "更新时间无效");
      }
      if (!Array.isArray(record.items)) throw new Error(label + "内容列表无效");
      record.items.forEach(function (item, itemIndex) { validateRecord(item, "songs", itemIndex); });
    } else if (["songs", "videos", "history"].indexOf(storeName) !== -1) {
      requireString(record.title, label + "标题");
      ["url", "source", "artist", "publisher"].forEach(function (key) {
        if (record[key] !== undefined && typeof record[key] !== "string") throw new Error(label + "字段无效：" + key);
      });
    }
  }

  function validateBackup(payload) {
    if (!isObject(payload)) throw new Error("备份文件必须是 JSON 对象");
    if (payload.format !== FORMAT) throw new Error("备份文件格式不受支持");
    if (payload.version !== VERSION) throw new Error("备份文件版本不受支持");
    if (typeof payload.exportedAt !== "string" || Number.isNaN(Date.parse(payload.exportedAt))) {
      throw new Error("备份导出时间缺失或无效");
    }
    if (!isObject(payload.data)) throw new Error("备份文件缺少数据内容");
    const data = {};
    STORE_NAMES.forEach(function (storeName) {
      const records = payload.data[storeName];
      if (!Array.isArray(records)) throw new Error("备份缺少必要的数据表：" + storeName);
      const ids = new Set();
      records.forEach(function (record, index) {
        validateRecord(record, storeName, index);
        if (ids.has(record.id)) throw new Error(storeName + "中存在重复记录标识");
        ids.add(record.id);
      });
      data[storeName] = records;
    });
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: payload.exportedAt,
      data: data
    };
  }

  function createBackup(data, now) {
    const payload = {
      format: FORMAT,
      version: VERSION,
      exportedAt: now || new Date().toISOString(),
      data: data
    };
    return validateBackup(payload);
  }

  function summarize(backup) {
    return {
      favorites: backup.data.favorites.length,
      paths: backup.data.paths.length,
      settings: backup.data.settings.length,
      feeds: backup.data.feeds.length,
      cachedItems: backup.data.songs.length + backup.data.videos.length + backup.data.history.length
    };
  }

  window.MusicBackup = {
    format: FORMAT,
    version: VERSION,
    create: createBackup,
    validate: validateBackup,
    summarize: summarize
  };
})();
