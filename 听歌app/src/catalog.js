(function () {
  "use strict";

  function normalizePath(input, prior, now, createId) {
    const name = String(input && input.name || "").trim();
    const path = String(input && input.path || "").trim();
    if (!name || !path) throw new Error("名称和路径不能为空");
    const old = prior || {};
    return {
      id: old.id || createId(),
      name: name,
      path: path,
      category: String(input.category || "").trim(),
      notes: String(input.notes || "").trim(),
      createdAt: old.createdAt || now,
      updatedAt: now
    };
  }

  function matchesPath(record, query, category) {
    const text = String(query || "").trim().toLocaleLowerCase();
    const terms = [record.name, record.path, record.category, record.notes].join(" ").toLocaleLowerCase();
    return (!text || terms.indexOf(text) !== -1) && (!category || record.category === category);
  }

  function filterByYear(items, year) {
    return (items || []).filter(function (item) {
      return !year || String(item.year || "") === String(year);
    });
  }

  function withFavoriteSnapshots(items, favorites, type, onlyFavorites) {
    const saved = Array.from(favorites.values()).filter(function (favorite) {
      return favorite.type === type && favorite.snapshot;
    });
    const snapshots = saved.map(function (favorite) { return favorite.snapshot; });
    const sourceItems = items || [];
    return {
      savedCount: saved.length,
      items: onlyFavorites
        ? snapshots
        : sourceItems.concat(snapshots.filter(function (snapshot) {
          return !sourceItems.some(function (item) { return item.id === snapshot.id; });
        }))
    };
  }

  window.MusicCatalog = {
    normalizePath: normalizePath,
    matchesPath: matchesPath,
    filterByYear: filterByYear,
    withFavoriteSnapshots: withFavoriteSnapshots
  };
})();
