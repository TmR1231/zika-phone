"use strict";

(() => {
  const DB_NAME = "zika-phone-v1";
  const DB_VERSION = 1;
  const STATE_KEY = "current";
  const MAX_SNAPSHOTS = 10;
  let dbPromise = null;

  function uid(prefix = "id") {
    const value = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${value}`;
  }

  function blankState() {
    const now = Date.now();
    return {
      version: 1,
      characters: [],
      conversations: [],
      messages: [],
      calls: [],
      cards: [],
      moments: [],
      letters: [],
      reactions: [],
      trash: [],
      settings: {
        meName: "我",
        meAvatarId: "",
        wallpaperId: "",
        fontAssetId: "",
        fontName: "",
        theme: "light",
        bubbleStyle: "default",
        libraryCompact: true,
        dailyCard: null,
        cardCollapse: { owners: [], groups: [] },
        notePresets: ["开心", "难过", "撒娇", "认真", "安慰", "调侃"],
        statusPresets: ["在发呆", "在忙", "在等你", "想聊聊天", "想安静一会儿"],
        readPresets: ["已读不回", "看到了，等会儿再回你", "现在有点忙，晚点说"],
        knowledgePresets: ["想让你复习这个", "你还记得这条吗？"],
        sfx: { in: "ding", out: "bubble", groupIn: "ding", groupOut: "bubble", ring: "ring-warm", volume: 70 },
        dictionary: [],
        nextMomentAtBy: {},
        nextLetterAtBy: {},
        nextCallAtBy: {},
        nextMessageAtBy: {},
        unreadConversationIds: [],
        unreadMomentIds: []
      },
      createdAt: now,
      updatedAt: now
    };
  }

  function normalizeState(value) {
    const base = blankState();
    const input = value && typeof value === "object" ? value : {};
    const state = { ...base, ...input };
    for (const key of ["characters", "conversations", "messages", "calls", "cards", "moments", "letters", "reactions", "trash"]) {
      state[key] = Array.isArray(input[key]) ? input[key] : [];
    }
    state.settings = { ...base.settings, ...(input.settings || {}) };
    for (const key of ["notePresets", "statusPresets", "readPresets", "knowledgePresets", "dictionary", "unreadConversationIds", "unreadMomentIds"]) {
      if (!Array.isArray(state.settings[key])) state.settings[key] = [...base.settings[key]];
    }
    state.settings.sfx = { ...base.settings.sfx, ...(state.settings.sfx || {}) };
    const messageSounds = ["none", "bubble", "ding", "bird", "drop", "piano", "tick"];
    for (const key of ["in", "out", "groupIn", "groupOut"]) {
      if (!messageSounds.includes(state.settings.sfx[key])) state.settings.sfx[key] = base.settings.sfx[key];
    }
    if (!["none", "ring-warm", "ring-classic"].includes(state.settings.sfx.ring)) state.settings.sfx.ring = base.settings.sfx.ring;
    const volume = Number(state.settings.sfx.volume);
    state.settings.sfx.volume = Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 70;
    if (state.settings.dictionary.length) {
      const now = Date.now();
      state.settings.dictionary.slice(0, 500).forEach((entry, index) => {
        const text = String(entry || "").trim().slice(0, 60);
        if (!text) return;
        const id = `dictionary-legacy-${state.createdAt || 0}-${index}`;
        if (state.cards.some(card => card.id === id)) return;
        state.cards.push({
          id,
          kind: "dictionary",
          text,
          characterId: null,
          group: "默认",
          enabled: true,
          createdAt: state.createdAt || now,
          updatedAt: state.updatedAt || now,
          deletedAt: null
        });
      });
      state.settings.dictionary = [];
    }
    for (const key of ["nextMomentAtBy", "nextLetterAtBy", "nextCallAtBy", "nextMessageAtBy"]) {
      if (!state.settings[key] || typeof state.settings[key] !== "object" || Array.isArray(state.settings[key])) state.settings[key] = {};
    }
    state.version = 1;
    return state;
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
        if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("无法打开本地数据库"));
      request.onblocked = () => reject(new Error("本地数据库被另一个页面占用，请关闭旧页面后重试"));
    });
    return dbPromise;
  }

  function run(storeNames, mode, action) {
    return open().then(db => new Promise((resolve, reject) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const transaction = db.transaction(names, mode);
      const stores = names.map(name => transaction.objectStore(name));
      let result;
      try {
        result = action(...stores, transaction);
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        if (result && typeof IDBRequest !== "undefined" && result instanceof IDBRequest) resolve(result.result);
        else resolve(result);
      };
      transaction.onabort = () => reject(transaction.error || new Error("本地数据操作已取消"));
      transaction.onerror = () => reject(transaction.error || new Error("本地数据操作失败"));
    }));
  }

  function call(storeName, mode, method, ...args) {
    return run(storeName, mode, store => store[method](...args));
  }

  async function init() {
    const saved = await call("state", "readonly", "get", STATE_KEY);
    if (saved && saved.value) return normalizeState(saved.value);
    const state = blankState();
    await saveState(state);
    return state;
  }

  async function getState() {
    const saved = await call("state", "readonly", "get", STATE_KEY);
    return saved && saved.value ? normalizeState(saved.value) : init();
  }

  async function saveState(state) {
    state.updatedAt = Date.now();
    await call("state", "readwrite", "put", { key: STATE_KEY, value: state }, STATE_KEY);
    return state;
  }

  function putAsset(asset) {
    return call("assets", "readwrite", "put", asset);
  }

  function getAsset(id) {
    if (!id) return Promise.resolve(null);
    return call("assets", "readonly", "get", id).then(asset => asset || null);
  }

  function getAllAssets() {
    return call("assets", "readonly", "getAll");
  }

  function deleteAsset(id) {
    return call("assets", "readwrite", "delete", id);
  }

  async function createSnapshot(state, reason = "自动备份") {
    const assets = await getAllAssets();
    const snapshot = {
      id: uid("snapshot"),
      createdAt: Date.now(),
      reason,
      state: structuredClone(state),
      assets
    };
    await call("snapshots", "readwrite", "put", snapshot);
    const all = await call("snapshots", "readonly", "getAll");
    const expired = all.sort((a, b) => b.createdAt - a.createdAt).slice(MAX_SNAPSHOTS);
    for (const item of expired) await call("snapshots", "readwrite", "delete", item.id);
    return { id: snapshot.id, createdAt: snapshot.createdAt, reason: snapshot.reason };
  }

  async function listSnapshots() {
    const all = await call("snapshots", "readonly", "getAll");
    return all.sort((a, b) => b.createdAt - a.createdAt).map(item => ({
      id: item.id,
      createdAt: item.createdAt,
      reason: item.reason,
      characters: item.state.characters.length,
      conversations: item.state.conversations.length,
      cards: item.state.cards.length,
      calls: (item.state.calls || []).length,
      moments: (item.state.moments || []).length,
      letters: (item.state.letters || []).length,
      assets: item.assets.length
    }));
  }

  function getSnapshot(id) {
    return call("snapshots", "readonly", "get", id).then(item => item || null);
  }

  function replaceAll(state, assets) {
    const normalized = normalizeState(structuredClone(state));
    return run(["state", "assets"], "readwrite", (stateStore, assetStore) => {
      assetStore.clear();
      for (const asset of assets || []) assetStore.put(asset);
      normalized.updatedAt = Date.now();
      stateStore.put({ key: STATE_KEY, value: normalized }, STATE_KEY);
      return normalized;
    });
  }

  async function restoreSnapshot(id) {
    const snapshot = await getSnapshot(id);
    if (!snapshot) throw new Error("找不到这份本地快照");
    return replaceAll(snapshot.state, snapshot.assets);
  }

  globalThis.ZikaDB = {
    init,
    getState,
    saveState,
    putAsset,
    getAsset,
    getAllAssets,
    deleteAsset,
    createSnapshot,
    listSnapshots,
    getSnapshot,
    restoreSnapshot,
    replaceAll,
    blankState,
    normalizeState,
    uid
  };
})();
