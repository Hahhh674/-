(function () {
  "use strict";

  const DATABASE_NAME = "listening-life";
  const DATABASE_VERSION = 1;
  const STORE_NAMES = ["favorites", "paths", "settings", "feeds", "songs", "videos", "history"];

  function requestResult(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("本机数据读取失败")); };
    });
  }

  function transactionResult(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function () { reject(transaction.error || new Error("本机数据写入失败")); };
      transaction.onabort = function () { reject(transaction.error || new Error("本机数据事务已取消")); };
    });
  }

  function createStore(options) {
    const name = options && options.name ? options.name : DATABASE_NAME;
    let databasePromise;

    function open() {
      if (!window.indexedDB) return Promise.reject(new Error("当前浏览器不支持本机结构化存储"));
      if (!databasePromise) {
        databasePromise = new Promise(function (resolve, reject) {
          const request = window.indexedDB.open(name, DATABASE_VERSION);
          request.onupgradeneeded = function () {
            const db = request.result;
            STORE_NAMES.forEach(function (storeName) {
              if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
              }
            });
          };
          request.onsuccess = function () {
            const db = request.result;
            db.onversionchange = function () {
              db.close();
              databasePromise = null;
            };
            resolve(db);
          };
          request.onerror = function () {
            databasePromise = null;
            reject(request.error || new Error("无法打开本机数据库"));
          };
          request.onblocked = function () {
            databasePromise = null;
            reject(new Error("本机数据库升级被其他页面阻止，请关闭其他 App 页面后重试"));
          };
        });
      }
      return databasePromise;
    }

    async function read(storeName, key) {
      const db = await open();
      const tx = db.transaction(storeName, "readonly");
      const done = transactionResult(tx);
      const result = await Promise.all([requestResult(tx.objectStore(storeName).get(key)), done]);
      return result[0];
    }

    async function readAll(storeName) {
      const db = await open();
      const tx = db.transaction(storeName, "readonly");
      const done = transactionResult(tx);
      const result = await Promise.all([requestResult(tx.objectStore(storeName).getAll()), done]);
      return result[0];
    }

    async function write(storeName, value) {
      const db = await open();
      const tx = db.transaction(storeName, "readwrite");
      const done = transactionResult(tx);
      tx.objectStore(storeName).put(value);
      await done;
    }

    async function remove(storeName, key) {
      const db = await open();
      const tx = db.transaction(storeName, "readwrite");
      const done = transactionResult(tx);
      tx.objectStore(storeName).delete(key);
      await done;
    }

    async function clear() {
      const db = await open();
      const tx = db.transaction(STORE_NAMES, "readwrite");
      const done = transactionResult(tx);
      STORE_NAMES.forEach(function (storeName) { tx.objectStore(storeName).clear(); });
      await done;
    }

    async function replaceAll(data) {
      const db = await open();
      const tx = db.transaction(STORE_NAMES, "readwrite");
      const done = transactionResult(tx);
      STORE_NAMES.forEach(function (storeName) {
        const store = tx.objectStore(storeName);
        store.clear();
        (data[storeName] || []).forEach(function (record) { store.put(record); });
      });
      await done;
    }

    async function saveFeed(feedId, storeName, feed, mergeItems) {
      if (["songs", "videos", "history"].indexOf(storeName) === -1) {
        throw new Error("不支持的内容缓存类型");
      }
      const db = await open();
      const tx = db.transaction(["feeds", storeName], "readwrite");
      const done = transactionResult(tx);
      const items = tx.objectStore(storeName);
      if (!mergeItems) items.clear();
      (feed.items || []).forEach(function (item) { items.put(item); });
      tx.objectStore("feeds").put({
        id: feedId,
        source: feed.source,
        updatedAt: feed.updatedAt,
        items: feed.items || []
      });
      await done;
    }

    async function exportAll() {
      const result = {};
      for (const storeName of STORE_NAMES) result[storeName] = await readAll(storeName);
      return result;
    }

    function close() {
      if (databasePromise) {
        databasePromise.then(function (db) { db.close(); });
        databasePromise = null;
      }
    }

    return {
      name: name,
      stores: STORE_NAMES.slice(),
      open: open,
      get: read,
      getAll: readAll,
      put: write,
      delete: remove,
      clear: clear,
      replaceAll: replaceAll,
      saveFeed: saveFeed,
      exportAll: exportAll,
      close: close
    };
  }

  window.MusicStore = { create: createStore, databaseName: DATABASE_NAME, storeNames: STORE_NAMES.slice() };
})();
