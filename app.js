"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const uid = ZikaDB.uid;
  const els = {
    statusTime: $("statusTime"),
    homeDate: $("homeDate"),
    homeClock: $("homeClock"),
    homeGreeting: $("homeGreeting"),
    homeWallpaper: $("homeWallpaper"),
    homeRecentList: $("homeRecentList"),
    conversationList: $("conversationList"),
    characterList: $("characterList"),
    cardList: $("cardList"),
    cardCount: $("cardCount"),
    cardSearch: $("cardSearch"),
    cardOwnerFilter: $("cardOwnerFilter"),
    cardGroupFilter: $("cardGroupFilter"),
    momentList: $("momentList"),
    letterList: $("letterList"),
    letterDirectionFilter: $("letterDirectionFilter"),
    letterCharacterFilter: $("letterCharacterFilter"),
    profileAvatar: $("profileAvatar"),
    profileName: $("profileName"),
    dataStats: $("dataStats"),
    storageUsage: $("storageUsage"),
    storagePersistBtn: $("storagePersistBtn"),
    mainNav: $("mainNav"),
    conversationView: $("conversationView"),
    conversationAvatar: $("conversationAvatar"),
    conversationTitle: $("conversationTitle"),
    conversationSubtitle: $("conversationSubtitle"),
    messageScroll: $("messageScroll"),
    messageList: $("messageList"),
    messageInput: $("messageInput"),
    composerForm: $("composerForm"),
    composerHint: $("composerHint"),
    typingIndicator: $("typingIndicator"),
    typingText: $("typingText"),
    sendMessageBtn: $("sendMessageBtn"),
    chatImageBtn: $("chatImageBtn"),
    talkBtn: $("talkBtn"),
    modalLayer: $("modalLayer"),
    sheetTitle: $("sheetTitle"),
    sheetBody: $("sheetBody"),
    confirmLayer: $("confirmLayer"),
    confirmTitle: $("confirmTitle"),
    confirmMessage: $("confirmMessage"),
    confirmOkBtn: $("confirmOkBtn"),
    confirmCancelBtn: $("confirmCancelBtn"),
    imageViewer: $("imageViewer"),
    viewerImage: $("viewerImage"),
    toast: $("toast"),
    loadingScreen: $("loadingScreen"),
    avatarInput: $("avatarInput"),
    wallpaperInput: $("wallpaperInput"),
    fontInput: $("fontInput"),
    chatImageInput: $("chatImageInput"),
    importInput: $("importInput"),
    textImportInput: $("textImportInput"),
    socialImageInput: $("socialImageInput"),
    libraryImageInput: $("libraryImageInput"),
    callView: $("callView"),
    callExpandBtn: $("callExpandBtn"),
    callKind: $("callKind"),
    callAvatar: $("callAvatar"),
    callName: $("callName"),
    callStatus: $("callStatus"),
    callDuration: $("callDuration"),
    callSelfView: $("callSelfView"),
    callScene: $("callScene"),
    callExpression: $("callExpression"),
    callLocation: $("callLocation"),
    callOutfit: $("callOutfit")
  };

  const kindLabels = {
    character: "角色",
    conversation: "会话",
    card: "字卡",
    moment: "朋友圈",
    letter: "信件",
    message: "消息",
    messageBatch: "整批聊天记录"
  };
  const avatarColors = ["#9bafc5", "#c695ad", "#a99abf", "#91ad9e", "#c6a18e", "#8ea9b4"];
  const assetUrls = new Map();
  const replyTimers = new Map();
  const quizTimers = new Map();
  const typingNames = new Map();
  const recentCards = new Map();
  const modalTempAssets = new Set();
  let state = null;
  let currentView = "home";
  let activeConversationId = null;
  let toastTimer = null;
  let confirmResolver = null;
  let lastFocused = null;
  let avatarCallback = null;
  let socialImageCallback = null;
  let socialImageKind = "moment";
  let wallpaperRequest = 0;
  let fontRequest = 0;
  let appliedFontAssetId = "";
  let appliedFontFace = null;
  let pendingImport = null;
  let composerBusy = false;
  let libraryKind = "card";
  let pendingLibraryImages = [];
  let activeCall = null;
  let callDrag = null;
  let suppressCallExpandClick = false;
  let pendingQuote = null;
  let callSchedulerBusy = false;
  const compactOpenGroups = new Set();

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function clampText(value, max) {
    return String(value ?? "").trim().slice(0, max);
  }

  function safeColor(value, fallback = "") {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  }

  function colorFor(name) {
    let hash = 0;
    for (const char of String(name || "角色")) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return avatarColors[hash % avatarColors.length];
  }

  function activeCharacters() {
    return state.characters.filter(item => !item.deletedAt);
  }

  function activeCards(kind = "card") {
    return state.cards.filter(item => {
      if ((item.kind || "card") !== kind) return false;
      if (item.deletedAt) return false;
      if (item.characterId === null) return true;
      const owner = characterById(item.characterId);
      return Boolean(owner && !owner.deletedAt);
    });
  }

  function characterById(id) {
    return state.characters.find(item => item.id === id) || null;
  }

  function conversationById(id) {
    return state.conversations.find(item => item.id === id) || null;
  }

  function privateCharacter(conversation) {
    if (!conversation || conversation.type !== "private") return null;
    return characterById(conversation.participantIds[0]);
  }

  function activeConversations() {
    return state.conversations.filter(conversation => {
      if (conversation.deletedAt) return false;
      if (conversation.type === "group") return true;
      const character = privateCharacter(conversation);
      return Boolean(character && !character.deletedAt);
    });
  }

  function cardsForCharacter(characterId) {
    const usePublicCards = characterById(characterId)?.usePublicCards !== false;
    return activeCards().filter(card => isCardEnabled(card) && (card.characterId === characterId || (card.characterId === null && usePublicCards)));
  }

  function dictionaryCardsForCharacter(characterId) {
    return activeCards("dictionary").filter(card => isCardEnabled(card) && (card.characterId === null || card.characterId === characterId));
  }

  function dictionaryPoolForCharacter(character, settings) {
    if (!settings.mergeCards || (!settings.dictionarySingle && !settings.dictionaryMulti)) return [];
    const pool = dictionaryCardsForCharacter(character.id).map(card => card.text);
    if (settings.dictionaryMixShort) pool.push(...ZikaUtils.shortDictionaryTexts(cardsForCharacter(character.id)));
    return [...new Set(pool)];
  }

  function knowledgeCards() {
    return activeCards("knowledge").filter(isCardEnabled);
  }

  function formatKnowledgePush(card, preset) {
    return preset;
  }

  function emojiCardsForCharacter(characterId) {
    return activeCards("emoji").filter(card => isCardEnabled(card) && (card.characterId === null || card.characterId === characterId));
  }

  function mediaCardsForCharacter(kind, characterId) {
    return activeCards(kind).filter(card => isCardEnabled(card) && card.assetId && (card.characterId === null || card.characterId === characterId));
  }

  function activeLibraryCards() {
    return activeCards(libraryKind);
  }

  function libraryNoun() {
    return ({ card: "字卡", dictionary: "词条", emoji: "emoji", sticker: "表情包", image: "图片", knowledge: "知识字卡" })[libraryKind] || "字卡";
  }

  function isImageLibrary(kind = libraryKind) {
    return kind === "sticker" || kind === "image";
  }

  function conversationTitle(conversation) {
    if (!conversation) return "未知会话";
    if (conversation.type === "group") return conversation.title || "未命名群聊";
    return privateCharacter(conversation)?.name || "已离开的角色";
  }

  function lastMessage(conversationId) {
    let latest = null;
    for (const message of state.messages) {
      if (message.conversationId !== conversationId || message.deletedAt) continue;
      if (!latest || message.createdAt > latest.createdAt) latest = message;
    }
    return latest;
  }

  function conversationTimestamp(conversation) {
    return lastMessage(conversation.id)?.createdAt || conversation.updatedAt || conversation.createdAt || 0;
  }

  function sortedConversations() {
    return activeConversations().sort((a, b) => conversationTimestamp(b) - conversationTimestamp(a));
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const rest = seconds % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function formatListTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    if (sameDay(date, now)) return formatTime(timestamp);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return "昨天";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatFullTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${formatTime(timestamp)}`;
  }

  function formatMessageDivider(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    if (sameDay(date, now)) return formatTime(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${formatTime(timestamp)}`;
  }

  function dateStamp() {
    const date = new Date();
    const time = `${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}_${time}`;
  }

  function localDayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function renderDailyGreeting() {
    if (!state) {
      els.homeGreeting.textContent = "把想说的话，留在自己的小手机里。";
      return;
    }
    const saved = state.settings.dailyCard;
    const daily = ZikaUtils.selectDailyCard(activeCards().filter(isCardEnabled), saved, localDayKey());
    if (!daily) {
      els.homeGreeting.textContent = "今天还没有字卡，先收进一句喜欢的话吧。";
      els.homeGreeting.removeAttribute("title");
      return;
    }
    els.homeGreeting.textContent = daily.text;
    els.homeGreeting.title = daily.text;
    if (daily !== saved) {
      state.settings.dailyCard = daily;
      ZikaDB.saveState(state).catch(error => {
        console.warn("每日字卡保存失败", error);
        toast("每日字卡已显示，但保存没有成功");
      });
    }
  }

  function updateClock() {
    const now = new Date();
    const time = formatTime(now);
    els.statusTime.textContent = time;
    els.homeClock.textContent = time;
    els.homeDate.textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(now);
    renderDailyGreeting();
  }

  function toast(message, duration = 2400) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, duration);
  }

  function playSound(key, loop = false) {
    const settings = state?.settings?.sfx || {};
    return ZikaSFX.play(settings[key], settings.volume, loop);
  }

  function playConversationSound(conversation, direction) {
    const key = conversation.type === "group"
      ? direction === "in" ? "groupIn" : "groupOut"
      : direction === "in" ? "in" : "out";
    playSound(key);
  }

  function openSheet(title, html) {
    lastFocused = document.activeElement;
    els.sheetTitle.textContent = title;
    els.sheetBody.innerHTML = html;
    els.modalLayer.hidden = false;
    requestAnimationFrame(() => $("closeSheetBtn").focus());
  }

  function assetInUse(id) {
    if (!id) return false;
    if (state.settings.meAvatarId === id || state.settings.wallpaperId === id || state.settings.fontAssetId === id) return true;
    if (state.characters.some(item => item.avatarId === id)) return true;
    if (state.cards.some(item => item.assetId === id)) return true;
    return state.messages.some(item => item.assetId === id);
  }

  async function closeSheet() {
    if (els.modalLayer.hidden) return;
    els.modalLayer.hidden = true;
    els.sheetBody.innerHTML = "";
    pendingImport = null;
    const temporary = [...modalTempAssets];
    modalTempAssets.clear();
    for (const id of temporary) {
      if (!assetInUse(id)) {
        const url = assetUrls.get(id);
        if (url) URL.revokeObjectURL(url);
        assetUrls.delete(id);
        await ZikaDB.deleteAsset(id);
      }
    }
    if (lastFocused && lastFocused.isConnected) lastFocused.focus();
  }

  function confirmAction(title, message, confirmText = "确定", danger = false) {
    if (confirmResolver) confirmResolver(false);
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOkBtn.textContent = confirmText;
    els.confirmOkBtn.classList.toggle("danger", danger);
    els.confirmOkBtn.classList.toggle("primary", !danger);
    els.confirmLayer.hidden = false;
    requestAnimationFrame(() => els.confirmCancelBtn.focus());
    return new Promise(resolve => {
      confirmResolver = resolve;
    });
  }

  function settleConfirm(value) {
    if (!confirmResolver) return;
    const resolve = confirmResolver;
    confirmResolver = null;
    els.confirmLayer.hidden = true;
    resolve(value);
  }

  function avatarMarkup(person, size = "") {
    const name = person?.name || "角色";
    const initial = Array.from(name.trim() || "角色")[0] || "角";
    const color = safeColor(person?.color, colorFor(name));
    const asset = person?.avatarId ? ` data-avatar-asset="${esc(person.avatarId)}"` : "";
    return `<span class="avatar ${size}" style="--avatar-color:${esc(color)}"${asset}>${esc(initial)}</span>`;
  }

  function groupAvatarMarkup(size = "") {
    return `<span class="avatar group-avatar ${size}"><span class="icon icon-chat" aria-hidden="true"></span></span>`;
  }

  function conversationAvatarMarkup(conversation, size = "") {
    if (conversation.type === "group") return groupAvatarMarkup(size);
    return avatarMarkup(privateCharacter(conversation), size);
  }

  async function getAssetURL(id) {
    if (!id) return "";
    if (assetUrls.has(id)) return assetUrls.get(id);
    const asset = await ZikaDB.getAsset(id);
    if (!asset || !(asset.blob instanceof Blob)) return "";
    const url = URL.createObjectURL(asset.blob);
    assetUrls.set(id, url);
    return url;
  }

  function clearAssetURLs() {
    for (const url of assetUrls.values()) URL.revokeObjectURL(url);
    assetUrls.clear();
  }

  function hydrateImages(root = document) {
    root.querySelectorAll("[data-avatar-asset]").forEach(async element => {
      const id = element.dataset.avatarAsset;
      if (!id || element.dataset.loadedAsset === id) return;
      const url = await getAssetURL(id);
      if (!url || !element.isConnected || element.dataset.avatarAsset !== id) return;
      const image = document.createElement("img");
      image.className = "avatar-image";
      image.alt = "";
      image.src = url;
      Object.assign(image.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover"
      });
      element.replaceChildren(image);
      element.dataset.loadedAsset = id;
    });
    root.querySelectorAll("img[data-image-asset]").forEach(async image => {
      const id = image.dataset.imageAsset;
      const url = await getAssetURL(id);
      if (url && image.isConnected && image.dataset.imageAsset === id) image.src = url;
      else if (!url) image.alt = "这张图片没有找回来";
    });
  }

  async function decodeImage(file) {
    if ("createImageBitmap" in globalThis) return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败"));
      };
      image.src = url;
    });
  }

  async function saveImage(file, kind) {
    if (!file) throw new Error("没有选择图片");
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("请使用 PNG、JPG、WebP 或 GIF 图片");
    if (file.size > 15 * 1024 * 1024) throw new Error("图片超过 15MB，请先缩小一点");
    const source = await decodeImage(file);
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("没有读到图片尺寸");
    if (file.type === "image/gif" && isImageLibrary(kind)) {
      if (typeof source.close === "function") source.close();
      const asset = {
        id: uid("asset"),
        blob: file,
        name: file.name || "表情包.gif",
        type: "image/gif",
        width: sourceWidth,
        height: sourceHeight,
        createdAt: Date.now()
      };
      await ZikaDB.putAsset(asset);
      return asset.id;
    }
    const canvas = document.createElement("canvas");
    let sx = 0;
    let sy = 0;
    let sw = sourceWidth;
    let sh = sourceHeight;
    if (kind === "avatar") {
      const side = Math.min(sourceWidth, sourceHeight);
      sx = (sourceWidth - side) / 2;
      sy = (sourceHeight - side) / 2;
      sw = side;
      sh = side;
      canvas.width = 512;
      canvas.height = 512;
    } else {
      const limit = kind === "wallpaper" ? 1920 : 1600;
      const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    }
    const context = canvas.getContext("2d");
    context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    if (typeof source.close === "function") source.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("图片转换失败")), "image/webp", 0.88);
    });
    const asset = {
      id: uid("asset"),
      blob,
      name: file.name || "图片",
      type: blob.type,
      width: canvas.width,
      height: canvas.height,
      createdAt: Date.now()
    };
    await ZikaDB.putAsset(asset);
    return asset.id;
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("本地资产备份失败"));
      reader.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("备份里的本地资产无法读取");
    return response.blob();
  }

  function applyTheme() {
    const theme = state.settings.theme === "dark" ? "dark" : "light";
    const bubble = ["default", "miffy", "custom"].includes(state.settings.bubbleStyle) ? state.settings.bubbleStyle : "default";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bubble = bubble;
    const customCss = String(state.settings.customBubbleCss || "");
    $("customBubbleStyle").textContent = bubble === "custom" ? customCss : "";
    $("customBubbleEditor").hidden = bubble !== "custom";
    if ($("customBubbleCss").value !== customCss) $("customBubbleCss").value = customCss;
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#111111" : "#f4f4f2";
    document.querySelectorAll("[data-theme-value]").forEach(button => {
      const selected = button.dataset.themeValue === theme;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-bubble-value]").forEach(button => {
      const selected = button.dataset.bubbleValue === document.documentElement.dataset.bubble;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function updateFontLabel(failed = false) {
    $("currentFontName").textContent = state.settings.fontAssetId
      ? `${state.settings.fontName || "已上传字体"}${failed ? "（读取失败）" : ""}`
      : "系统默认字体";
  }

  async function saveFont(file) {
    if (!file) throw new Error("没有选择字体文件");
    const extension = String(file.name || "").toLocaleLowerCase().match(/\.(ttf|otf|woff2|woff)$/)?.[1];
    if (!extension) throw new Error("请使用 TTF、OTF、WOFF 或 WOFF2 字体");
    if (file.size > 20 * 1024 * 1024) throw new Error("字体超过 20MB，请先压缩或换一个小一点的文件");
    const type = ({ ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" })[extension];
    const asset = {
      id: uid("font"),
      kind: "font",
      blob: file.slice(0, file.size, type),
      name: file.name,
      type,
      createdAt: Date.now()
    };
    await ZikaDB.putAsset(asset);
    return asset.id;
  }

  async function applyCustomFont() {
    const request = ++fontRequest;
    const id = state.settings.fontAssetId || "";
    updateFontLabel();
    if (id === appliedFontAssetId) return Boolean(!id || appliedFontFace);
    const clear = () => {
      if (appliedFontFace && document.fonts?.delete) document.fonts.delete(appliedFontFace);
      appliedFontFace = null;
      appliedFontAssetId = "";
      document.documentElement.style.removeProperty("--custom-font");
    };
    if (!id) {
      clear();
      return true;
    }
    try {
      if (typeof FontFace !== "function" || !document.fonts?.add) throw new Error("当前浏览器不支持自定义字体");
      const url = await getAssetURL(id);
      if (!url) throw new Error("没有找到字体文件");
      const family = `ZikaCustomFont_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const face = new FontFace(family, `url("${url}")`);
      await face.load();
      if (request !== fontRequest) return false;
      clear();
      document.fonts.add(face);
      document.documentElement.style.setProperty("--custom-font", `"${family}"`);
      appliedFontFace = face;
      appliedFontAssetId = id;
      updateFontLabel();
      return true;
    } catch {
      if (request === fontRequest) {
        clear();
        updateFontLabel(true);
      }
      return false;
    }
  }

  async function applyWallpaper() {
    const request = ++wallpaperRequest;
    const id = state.settings.wallpaperId;
    const url = id ? await getAssetURL(id) : "";
    if (request !== wallpaperRequest) return;
    els.homeWallpaper.style.backgroundImage = url
      ? `linear-gradient(180deg, rgba(34,40,55,.08), rgba(38,38,52,.28)), url("${url}")`
      : "";
  }

  function emptyState(icon, title, copy, action = "", label = "") {
    return `<div class="empty-state"><span class="empty-icon"><span class="icon icon-${icon}" aria-hidden="true"></span></span><strong>${esc(title)}</strong><p>${esc(copy)}</p>${action ? `<button class="small-button primary" type="button" data-action="${esc(action)}">${esc(label)}</button>` : ""}</div>`;
  }

  function messagePreview(conversation) {
    const message = lastMessage(conversation.id);
    if (!message) return conversation.type === "group" ? "人齐了，说第一句吧" : "还没有记录，说第一句吧";
    const sender = message.senderId === "me" ? "我" : message.senderName || "角色";
    const content = [message.quiz ? "[问卷]" : "", message.assetId ? (message.mediaKind === "sticker" ? "[表情包]" : "[图片]") : "", message.text || ""].filter(Boolean).join(" ");
    if (message.senderId === "system") return content || "一条通知";
    return `${conversation.type === "group" ? `${sender}：` : ""}${content || "一条消息"}`;
  }

  function conversationItemMarkup(conversation, recent = false) {
    const timestamp = conversationTimestamp(conversation);
    const unread = state.settings.unreadConversationIds.includes(conversation.id);
    return `<button class="${recent ? "recent-item" : "conversation-item"}" type="button" data-conversation-id="${esc(conversation.id)}">${conversationAvatarMarkup(conversation, recent ? "small" : "")}<span class="item-copy"><span class="item-topline"><span class="item-title">${esc(conversationTitle(conversation))}${conversation.type === "group" ? '<span class="group-badge">群聊</span>' : ""}</span><span class="item-time">${esc(formatListTime(timestamp))}</span></span><span class="item-preview">${esc(messagePreview(conversation))}</span></span>${unread ? '<span class="item-unread-dot" aria-label="未读消息"></span>' : ""}</button>`;
  }

  function renderHome() {
    const conversations = sortedConversations();
    els.homeRecentList.innerHTML = conversations.length
      ? conversations.slice(0, 3).map(item => conversationItemMarkup(item, true)).join("")
      : '<div class="recent-empty">还没有会话。先去角色里认识一个人，<br>第一句会从这里开始。</div>';
    hydrateImages(els.homeRecentList);
    applyWallpaper();
    renderDailyGreeting();
  }

  function renderConversationList() {
    const conversations = sortedConversations();
    els.conversationList.innerHTML = conversations.length
      ? conversations.map(item => conversationItemMarkup(item)).join("")
      : emptyState("chat", "还没有会话", activeCharacters().length ? "从角色里选一个人开口，或者新建一场群聊。" : "先新建一个角色，再给这里留下第一句话。", activeCharacters().length ? "new-group" : "new-character", activeCharacters().length ? "新建群聊" : "新建角色");
    hydrateImages(els.conversationList);
  }

  function statusForCharacter(character) {
    const pool = state.settings.statusPresets.filter(status => status);
    if (!character || !pool.length) return "还没有状态预设";
    const now = Date.now();
    if (!character.currentStatus || !character.nextStatusAt || now >= character.nextStatusAt || !pool.includes(character.currentStatus)) {
      const candidates = pool.length > 1 ? pool.filter(status => status !== character.currentStatus) : pool;
      character.currentStatus = candidates[Math.floor(Math.random() * candidates.length)];
      character.statusUpdatedAt = now;
      character.nextStatusAt = now + (15 + Math.floor(Math.random() * 26)) * 60000;
      persist().catch(error => console.warn("角色状态保存失败", error));
    }
    return character.currentStatus;
  }

  function anniversaryText(character, now = Date.now()) {
    const match = String(character?.anniversaryDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (start.getFullYear() !== Number(match[1]) || start.getMonth() !== Number(match[2]) - 1 || start.getDate() !== Number(match[3])) return "";
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    if (days < 1) return "";
    return `我们已经${character.anniversaryType === "friend" ? "成为朋友" : "在一起"} ${days} 天`;
  }

  function renderCharacters() {
    const characters = activeCharacters().sort((a, b) => a.createdAt - b.createdAt);
    els.characterList.innerHTML = characters.length
      ? characters.map(character => `<article class="character-card">${avatarMarkup(character, "large")}<strong class="character-name">${esc(character.name)}</strong><p class="character-status">${esc(statusForCharacter(character))}</p>${anniversaryText(character) ? `<p class="character-anniversary">${esc(anniversaryText(character))}</p>` : ""}<div class="character-actions"><button class="character-chat" type="button" data-chat-character="${esc(character.id)}">进入聊天</button><button class="character-edit" type="button" data-edit-character="${esc(character.id)}">编辑</button></div></article>`).join("")
      : emptyState("heart", "这里还空着", "新建第一个角色，给ta名字、头像和想说的话。", "new-character", "新建第一个角色");
    hydrateImages(els.characterList);
  }

  function renderCardFilters() {
    const ownerBefore = els.cardOwnerFilter.value || "all";
    const groupBefore = els.cardGroupFilter.value || "all";
    const noun = libraryNoun();
    els.cardOwnerFilter.innerHTML = `<option value="all">全部${noun}</option><option value="shared">公用${noun}</option>` + activeCharacters().map(character => `<option value="${esc(character.id)}">${esc(character.name)}专属</option>`).join("");
    els.cardOwnerFilter.value = [...els.cardOwnerFilter.options].some(option => option.value === ownerBefore) ? ownerBefore : "all";
    const groups = [...new Set(activeLibraryCards().map(card => card.group || "默认"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    els.cardGroupFilter.innerHTML = '<option value="all">全部分组</option>' + groups.map(group => `<option value="${esc(group)}">${esc(group)}</option>`).join("");
    els.cardGroupFilter.value = groups.includes(groupBefore) ? groupBefore : "all";
  }

  function isCardEnabled(card) {
    return card.enabled !== false;
  }

  function cardCollapsePrefs() {
    if (!state.settings.cardCollapse || typeof state.settings.cardCollapse !== "object") state.settings.cardCollapse = { owners: [], groups: [] };
    if (!Array.isArray(state.settings.cardCollapse.owners)) state.settings.cardCollapse.owners = [];
    if (!Array.isArray(state.settings.cardCollapse.groups)) state.settings.cardCollapse.groups = [];
    return state.settings.cardCollapse;
  }

  function cardOwnerKey(card) {
    return card.characterId || "shared";
  }

  function cardGroupKey(owner, group) {
    return JSON.stringify([owner, group || "默认"]);
  }

  async function toggleCardCollapse(type, key) {
    const prefs = cardCollapsePrefs();
    const list = type === "owner" ? prefs.owners : prefs.groups;
    const index = list.indexOf(key);
    if (index >= 0) list.splice(index, 1);
    else list.push(key);
    await persist();
    renderCards();
  }

  async function toggleAllCardOwners() {
    const cards = filteredCards();
    const ownerIds = [...new Set(cards.map(cardOwnerKey))];
    if (!ownerIds.length) return;
    const prefs = cardCollapsePrefs();
    const allCollapsed = ownerIds.every(id => prefs.owners.includes(id));
    prefs.owners = allCollapsed
      ? prefs.owners.filter(id => !ownerIds.includes(id))
      : [...new Set([...prefs.owners, ...ownerIds])];
    await persist();
    renderCards();
  }

  async function changeCardsEnabled(cards, enabled) {
    if (!cards.length) {
      toast("这个范围里没有可切换的字卡");
      return;
    }
    for (const card of cards) card.enabled = enabled;
    await persist();
    renderAll();
    toast(`已${enabled ? "启用" : "禁用"} ${cards.length} 张${libraryNoun()}`);
  }

  function gateMarkup(type, key, cards, label) {
    const enabledCount = cards.filter(isCardEnabled).length;
    const allEnabled = cards.length > 0 && enabledCount === cards.length;
    const partial = enabledCount > 0 && enabledCount < cards.length;
    return `<label class="gate-control" title="启用或禁用，不会删除${libraryNoun()}"><input type="checkbox" data-card-gate="${type}" data-gate-key="${esc(key)}" data-partial="${partial}" aria-label="${esc(label)}" ${allEnabled ? "checked" : ""}><span class="gate-track" aria-hidden="true"></span><span class="gate-count">${enabledCount}/${cards.length}</span></label>`;
  }

  function cardLibraryItem(card, compact = false) {
    const enabled = isCardEnabled(card);
    const kind = card.kind || "card";
    const content = isImageLibrary(kind)
      ? `<button class="library-image-button" type="button" data-view-image="${esc(card.assetId)}" aria-label="放大${kind === "sticker" ? "表情包" : "图片"}"><img class="library-image" data-image-asset="${esc(card.assetId)}" alt="${esc(card.text || libraryNoun())}"></button><p class="card-media-name">${esc(card.text || "未命名")}</p>`
      : `<p class="card-text ${kind === "emoji" ? "emoji-card-text" : ""}" ${compact ? `data-expand-card-text="${esc(card.id)}" title="点一下展开或收起全文"` : ""}>${esc(card.text)}</p>`;
    const shared = !compact && card.characterId === null ? '<span class="soft-tag shared">公用</span>' : "";
    return `<article class="card-item ${isImageLibrary(kind) ? "media-card-item" : ""} ${enabled ? "" : "is-disabled"}">${content}<div class="card-meta"><div class="card-tags">${shared}${enabled ? "" : '<span class="soft-tag disabled-tag">已禁用</span>'}</div><div class="card-actions"><button type="button" data-toggle-card-enabled="${esc(card.id)}">${enabled ? compact ? "停用" : "禁用" : "启用"}</button><button type="button" data-edit-card="${esc(card.id)}">编辑</button><button type="button" data-delete-card="${esc(card.id)}">删除</button></div></div></article>`;
  }

  function filteredCards() {
    const keyword = els.cardSearch.value.trim().toLocaleLowerCase();
    const owner = els.cardOwnerFilter.value;
    const group = els.cardGroupFilter.value;
    return activeLibraryCards().filter(card => {
      if (owner === "shared" && card.characterId !== null) return false;
      if (owner !== "all" && owner !== "shared" && card.characterId !== owner) return false;
      if (group !== "all" && (card.group || "默认") !== group) return false;
      if (keyword && !`${card.title || ""} ${card.text} ${card.source || ""} ${card.group}`.toLocaleLowerCase().includes(keyword)) return false;
      return true;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function knowledgeLibraryItem(card) {
    const enabled = isCardEnabled(card);
    return `<article class="card-item knowledge-card ${enabled ? "" : "is-disabled"}"><h3>${esc(card.title)}</h3>${card.source ? `<p class="knowledge-card-source">出自：${esc(card.source)}</p>` : ""}<p class="knowledge-card-content">${esc(card.text)}</p><div class="card-meta"><div class="card-tags">${enabled ? '<span class="soft-tag shared">复习资料</span>' : '<span class="soft-tag disabled-tag">已禁用</span>'}</div><div class="card-actions"><button type="button" data-toggle-card-enabled="${esc(card.id)}">${enabled ? "停用" : "启用"}</button><button type="button" data-edit-card="${esc(card.id)}">编辑</button><button type="button" data-delete-card="${esc(card.id)}">删除</button></div></div></article>`;
  }

  function renderCards() {
    renderCardFilters();
    const noun = libraryNoun();
    const dictionary = libraryKind === "dictionary";
    const knowledge = libraryKind === "knowledge";
    const imageLibrary = isImageLibrary();
    const compact = !knowledge && state.settings.libraryCompact !== false;
    $("cardToolsBtn").hidden = knowledge;
    $("batchCardsBtn").hidden = knowledge;
    $("cardDensityBtn").hidden = knowledge;
    $("collapseAllCardsBtn").hidden = knowledge;
    els.cardOwnerFilter.closest(".filter-row").hidden = knowledge;
    els.cardList.classList.toggle("is-compact", compact);
    $("cardDensityBtn").textContent = compact ? "紧凑" : "完整";
    $("cardDensityBtn").title = compact ? "当前是紧凑列表，点一下切换完整卡片" : "当前是完整卡片，点一下切换紧凑列表";
    document.querySelectorAll("[data-library-kind]").forEach(button => {
      const active = button.dataset.libraryKind === libraryKind;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const titles = { card: "字卡仓库", dictionary: "词典仓库", emoji: "emoji 仓库", sticker: "表情包仓库", image: "图片仓库", knowledge: "知识库" };
    const descriptions = {
      card: "字卡按归属与分组整理；点分组旁的「＋ 批量」，就能一行一句直接添加。",
      dictionary: "词典遵循多字卡总闸，可混入符合条件的短字卡；每条回复独立判定，可拼进同一句话或逐卡连发，emoji 与媒体不会混入。",
      emoji: "emoji 会按每个会话的概率跟在文字或图片配文后面，不参与词典拼接。",
      sticker: "表情包可以单独发送，也可以带一句字卡配文；支持 PNG、JPG、WebP 和 GIF 动图。",
      image: "图片先于表情包判定，可以单独发送或带配文；原图随完整 JSON 备份一起导出。",
      knowledge: "保存标题、选填出处和正文；角色主动私聊时只发标题小卡片，点开后看完整内容。普通回复和群聊不会抽取。"
    };
    $("cardLibraryTitle").textContent = titles[libraryKind];
    $("newCardBtn").textContent = imageLibrary ? `添加${noun}` : `新建${noun}`;
    $("batchCardsBtn").textContent = imageLibrary ? "批量添加" : "批量导入";
    els.cardSearch.placeholder = knowledge ? "搜索知识标题、出处或正文" : `搜索${noun}内容或分组`;
    $("presetLibraryBtn").textContent = knowledge ? "复习提示语与其他预设" : "情绪／意图、角色状态与已读预设";
    $("libraryDescription").textContent = descriptions[libraryKind] + (knowledge ? "" : compact ? " 紧凑模式每组先显示 6 张，点正文可看全文。" : " 完整模式会展开所有卡片内容。");
    const keyword = els.cardSearch.value.trim().toLocaleLowerCase();
    const all = activeLibraryCards();
    const cards = filteredCards();
    if (knowledge) {
      els.cardCount.textContent = `显示 ${cards.length} 张 · 启用 ${all.filter(isCardEnabled).length}/${all.length} 张`;
      els.cardList.innerHTML = cards.length
        ? `<div class="knowledge-list">${cards.map(knowledgeLibraryItem).join("")}</div>`
        : emptyState("book", all.length ? "没有找到这些知识字卡" : "知识库还空着", all.length ? "换个标题或正文关键词试试。" : "把想复习的知识按标题和正文存下来，角色会在主动私聊时随机提醒你。", all.length ? "" : "new-knowledge", all.length ? "" : "新建第一张知识字卡");
      return;
    }
    const prefs = cardCollapsePrefs();
    const ownerIds = ["shared", ...activeCharacters().sort((a, b) => a.createdAt - b.createdAt).map(character => character.id)].filter(id => cards.some(card => cardOwnerKey(card) === id));
    const allOwnersCollapsed = ownerIds.length > 0 && ownerIds.every(id => prefs.owners.includes(id));
    $("collapseAllCardsBtn").textContent = allOwnersCollapsed ? "全部展开" : "全部折叠";
    $("collapseAllCardsBtn").disabled = !ownerIds.length;
    els.cardCount.textContent = `显示 ${cards.length} 张 · 启用 ${all.filter(isCardEnabled).length}/${all.length} 张`;
    if (!cards.length) {
      els.cardList.innerHTML = emptyState("book", all.length ? `没有找到这些${noun}` : `${dictionary ? "词典" : "字卡仓库"}还空着`, all.length ? "换个关键词或筛选条件试试。" : `可以先一条一条写，也可以把整理好的${noun}按行批量导入。`, all.length ? "" : "batch-cards", all.length ? "" : `批量导入${noun}`);
      return;
    }
    els.cardList.innerHTML = ownerIds.map(ownerId => {
      const ownerCards = cards.filter(card => cardOwnerKey(card) === ownerId);
      const allOwnerCards = all.filter(card => cardOwnerKey(card) === ownerId);
      const character = ownerId === "shared" ? null : characterById(ownerId);
      const ownerName = ownerId === "shared" ? `公用${noun}` : `${character?.name || "未知角色"}专属`;
      const ownerCollapsed = !keyword && prefs.owners.includes(ownerId);
      const groups = [...new Set(ownerCards.map(card => card.group || "默认"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
      return `<section class="card-owner-section"><div class="card-owner-head"><button class="collapse-button owner-collapse" type="button" data-collapse-type="owner" data-collapse-key="${esc(ownerId)}" aria-expanded="${!ownerCollapsed}"><span class="collapse-arrow">${ownerCollapsed ? "▸" : "▾"}</span><span>${esc(ownerName)}</span><span class="collapse-count">${ownerCards.length} 张</span></button>${gateMarkup("owner", ownerId, allOwnerCards, `${ownerName}全部启用或禁用`)}</div><div class="card-owner-body" ${ownerCollapsed ? "hidden" : ""}>${groups.map(groupName => {
        const groupCards = ownerCards.filter(card => (card.group || "默认") === groupName);
        const allGroupCards = allOwnerCards.filter(card => (card.group || "默认") === groupName);
        const key = cardGroupKey(ownerId, groupName);
        const groupCollapsed = !keyword && prefs.groups.includes(key);
        const listExpanded = !compact || Boolean(keyword) || compactOpenGroups.has(key);
        const visibleCards = listExpanded ? groupCards : groupCards.slice(0, 6);
        const moreButton = compact && !keyword && groupCards.length > 6
          ? `<button class="show-more-cards" type="button" data-toggle-group-list="${esc(key)}">${listExpanded ? "收起本组" : `展开其余 ${groupCards.length - 6} 张`}</button>`
          : "";
        return `<section class="card-group"><div class="card-group-head"><button class="collapse-button" type="button" data-collapse-type="group" data-collapse-key="${esc(key)}" aria-expanded="${!groupCollapsed}"><span class="collapse-arrow">${groupCollapsed ? "▸" : "▾"}</span><span>${esc(groupName)}</span><span class="collapse-count">${groupCards.length}</span></button><div class="group-head-actions"><button class="group-rename-button" type="button" data-rename-group="${esc(key)}">改名</button><button class="group-batch-button" type="button" data-batch-group="${esc(key)}" title="向${esc(groupName)}分组批量添加">＋ 批量</button>${gateMarkup("group", key, allGroupCards, `${ownerName}的${groupName}组启用或禁用`)}</div></div><div class="card-group-items${imageLibrary ? " media-grid" : ""}" ${groupCollapsed ? "hidden" : ""}>${visibleCards.map(card => cardLibraryItem(card, compact)).join("")}${moreButton}</div></section>`;
      }).join("")}</div></section>`;
    }).join("");
    els.cardList.querySelectorAll('input[data-partial="true"]').forEach(input => {
      input.indeterminate = true;
    });
    hydrateImages(els.cardList);
  }

  function socialPerson(id) {
    if (id === "me") return { name: state.settings.meName || "我", avatarId: state.settings.meAvatarId || "", color: "#c695ad" };
    const character = characterById(id);
    return character || { name: "角色", avatarId: "", color: colorFor(id) };
  }

  function socialName(id) {
    return socialPerson(id).name || "角色";
  }

  function activeMoments() {
    return state.moments.filter(moment => !moment.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
  }

  function momentMarkup(moment) {
    const person = socialPerson(moment.authorId);
    const liked = moment.likes.includes("me");
    const likes = moment.likes.length ? `${moment.likes.map(socialName).join("、")} 觉得很赞` : "还没有赞";
    const comments = moment.comments.map(comment => {
      const target = comment.replyTo ? moment.comments.find(item => item.id === comment.replyTo) : null;
      return `<div class="moment-comment"><strong>${esc(socialName(comment.authorId))}</strong>${target ? `<span> 回复 ${esc(socialName(target.authorId))}</span>` : ""}：${esc(comment.text)}${comment.authorId !== "me" ? `<button type="button" data-reply-comment="${esc(moment.id)}" data-comment-author="${esc(comment.id)}">回复</button>` : ""}</div>`;
    }).join("");
    return `<article class="moment-card" data-moment-id="${esc(moment.id)}"><header class="social-author">${avatarMarkup(person, "small")}<div><strong>${esc(person.name)}</strong><p>${esc(formatFullTime(moment.createdAt))}</p></div><button class="text-button muted" type="button" data-delete-moment="${esc(moment.id)}" aria-label="删除这条朋友圈">删除</button></header>${moment.text ? `<p class="moment-text">${esc(moment.text)}</p>` : ""}${moment.assetId ? `<button class="social-image" type="button" data-view-image="${esc(moment.assetId)}"><img data-image-asset="${esc(moment.assetId)}" alt="朋友圈图片"></button>` : ""}<div class="moment-actions"><button type="button" data-like-moment="${esc(moment.id)}" class="${liked ? "is-liked" : ""}">${liked ? "♥" : "♡"} 赞</button><span>${esc(likes)}</span></div><div class="moment-comments">${comments}<form class="moment-comment-form" data-comment-form="${esc(moment.id)}"><input data-comment-input="${esc(moment.id)}" maxlength="500" placeholder="写条评论…"><button class="small-button" type="submit">发送</button></form></div></article>`;
  }

  function renderMoments() {
    const moments = activeMoments();
    els.momentList.innerHTML = moments.length
      ? moments.map(momentMarkup).join("")
      : emptyState("chat", "朋友圈还空着", "写下第一条，或者等角色也来这里分享一点日常。", "new-moment", "发一条朋友圈");
    hydrateImages(els.momentList);
  }

  function chooseSocialImage(callback, kind) {
    socialImageCallback = callback;
    socialImageKind = kind;
    els.socialImageInput.value = "";
    els.socialImageInput.click();
  }

  function openMomentComposer() {
    openSheet("发一条朋友圈", `
      <form class="form-stack" id="momentForm">
        <label class="field"><span>想分享什么</span><textarea id="momentText" maxlength="4000" placeholder="今天发生了什么？"></textarea></label>
        <input type="hidden" id="momentAssetId">
        <div class="inline-buttons"><button class="small-button" id="momentImageBtn" type="button">加一张图片</button><button class="text-button muted" id="momentImageRemoveBtn" type="button">移除</button></div>
        <p class="data-note" id="momentImageNote">可以只发文字，也可以只发图片。</p>
        <div class="form-actions"><button class="small-button" id="cancelMomentBtn" type="button">取消</button><button class="small-button primary" type="submit">发出去</button></div>
      </form>`);
    $("momentImageBtn").addEventListener("click", () => chooseSocialImage(id => {
      $("momentAssetId").value = id;
      $("momentImageNote").textContent = "已经选好一张图片";
      modalTempAssets.add(id);
    }, "moment"));
    $("momentImageRemoveBtn").addEventListener("click", () => {
      $("momentAssetId").value = "";
      $("momentImageNote").textContent = "可以只发文字，也可以只发图片。";
    });
    $("cancelMomentBtn").addEventListener("click", closeSheet);
    $("momentForm").addEventListener("submit", async event => {
      event.preventDefault();
      const text = clampText($("momentText").value, 4000);
      const assetId = $("momentAssetId").value;
      if (!text && !assetId) {
        toast("写点什么或加一张图片");
        return;
      }
      const moment = addMoment("me", { text, assetId });
      modalTempAssets.delete(assetId);
      await persist();
      await closeSheet();
      renderAll();
      schedulePartnerReactions(moment.id);
      toast("朋友圈已发出");
    });
  }

  function addMoment(authorId, content) {
    const moment = {
      id: uid("moment"),
      authorId,
      text: String(content.text || ""),
      assetId: content.assetId || "",
      createdAt: Date.now(),
      likes: [],
      comments: [],
      deletedAt: null
    };
    state.moments.push(moment);
    if (authorId !== "me") markMomentUnread(moment.id);
    return moment;
  }

  async function toggleMomentLike(momentId, authorId) {
    const moment = state.moments.find(item => item.id === momentId && !item.deletedAt);
    if (!moment) return;
    const index = moment.likes.indexOf(authorId);
    const added = index < 0;
    if (added) moment.likes.push(authorId);
    else moment.likes.splice(index, 1);
    if (authorId !== "me" && added) markMomentUnread(moment.id);
    await persist();
    renderMoments();
    if (authorId === "me" && added && moment.authorId !== "me") scheduleReturnLike(moment.authorId);
  }

  async function addMomentComment(momentId, authorId, text, replyTo = null) {
    const moment = state.moments.find(item => item.id === momentId && !item.deletedAt);
    if (!moment || !String(text || "").trim()) return null;
    const comment = { id: uid("comment"), authorId, text: String(text).trim().slice(0, 500), replyTo, createdAt: Date.now() };
    moment.comments.push(comment);
    if (authorId !== "me") markMomentUnread(moment.id);
    await persist();
    renderMoments();
    if (authorId === "me" && moment.authorId !== "me") {
      if (replyTo) {
        const target = moment.comments.find(item => item.id === replyTo);
        if (target && target.authorId !== "me") scheduleReplyResponse(momentId, comment.id, target.id);
      } else scheduleCommentResponse(momentId);
    }
    return comment;
  }

  async function deleteMoment(id) {
    const moment = state.moments.find(item => item.id === id && !item.deletedAt);
    if (!moment) return;
    const approved = await confirmAction("删除这条朋友圈？", "它和下面的评论会先进入回收站，不会直接消失。", "移到回收站");
    if (!approved) return;
    moveToTrash("moment", moment, moment.text.slice(0, 60) || "一条图片朋友圈");
    await persist();
    renderAll();
    toast("朋友圈已放进回收站");
  }

  function openMomentById(id) {
    navigate("moments");
    requestAnimationFrame(() => {
      const card = els.momentList.querySelector(`[data-moment-id="${CSS.escape(id)}"]`);
      if (card) card.scrollIntoView({ block: "center" });
    });
  }

  function activeLetters() {
    return state.letters.filter(letter => !letter.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
  }

  function letterMarkup(letter) {
    const direction = letter.direction === "sent" ? `寄给 ${socialName(letter.characterId)}` : `${socialName(letter.characterId)} 寄来`;
    return `<article class="letter-card ${letter.read ? "" : "is-unread"}"><button class="letter-open" type="button" data-view-letter="${esc(letter.id)}"><span class="letter-meta">${esc(direction)} · ${esc(formatFullTime(letter.createdAt))}${letter.read ? "" : " · 未读"}</span><strong>${esc(letter.text.slice(0, 100) || "一封带图片的信")}</strong><span class="letter-kind">${letter.kind === "reply" ? "回信" : letter.kind === "proactive" ? "主动来信" : letter.direction === "sent" ? "寄出的信" : "来信"}${letter.assetId ? " · 含图片" : ""}</span></button><button class="text-button muted" type="button" data-delete-letter="${esc(letter.id)}">删除</button></article>`;
  }

  function renderLetters() {
    const before = els.letterCharacterFilter.value || "all";
    els.letterCharacterFilter.innerHTML = '<option value="all">全部角色</option>' + activeCharacters().map(character => `<option value="${esc(character.id)}">${esc(character.name)}</option>`).join("");
    els.letterCharacterFilter.value = [...els.letterCharacterFilter.options].some(option => option.value === before) ? before : "all";
    const direction = els.letterDirectionFilter.value;
    const characterId = els.letterCharacterFilter.value;
    const letters = activeLetters().filter(letter => (direction === "all" || letter.direction === direction) && (characterId === "all" || letter.characterId === characterId));
    els.letterList.innerHTML = letters.length
      ? letters.map(letterMarkup).join("")
      : emptyState("mail", "这个信箱还空着", activeCharacters().length ? "写一封信寄出去，回信会按概率和延迟来到这里。" : "先新建一个角色，才有可以寄信的人。", activeCharacters().length ? "new-letter" : "new-character", activeCharacters().length ? "写一封信" : "新建角色");
  }

  function addLetter(direction, characterId, content) {
    const letter = {
      id: uid("letter"),
      direction,
      characterId,
      kind: content.kind || (direction === "sent" ? "manual" : "proactive"),
      text: String(content.text || ""),
      assetId: content.assetId || "",
      replyTo: content.replyTo || "",
      createdAt: Date.now(),
      read: direction === "sent",
      deletedAt: null
    };
    state.letters.push(letter);
    return letter;
  }

  function openLetterComposer() {
    const characters = activeCharacters();
    if (!characters.length) {
      toast("先新建一个角色，才有可以寄信的人");
      return;
    }
    openSheet("写一封信", `
      <form class="form-stack" id="letterForm">
        <label class="field"><span>寄给谁</span><select id="letterCharacter">${characters.map(character => `<option value="${esc(character.id)}">${esc(character.name)}</option>`).join("")}</select></label>
        <label class="field"><span>信里的话</span><textarea id="letterText" maxlength="8000" placeholder="慢慢写，信会替你送到。"></textarea></label>
        <input type="hidden" id="letterAssetId">
        <div class="inline-buttons"><button class="small-button" id="letterImageBtn" type="button">附一张图片</button><button class="text-button muted" id="letterImageRemoveBtn" type="button">移除</button></div>
        <p class="data-note" id="letterImageNote">寄出后有80%概率收到回信，回信会在1～480分钟内到来。</p>
        <div class="form-actions"><button class="small-button" id="cancelLetterBtn" type="button">取消</button><button class="small-button primary" type="submit">寄出</button></div>
      </form>`);
    $("letterImageBtn").addEventListener("click", () => chooseSocialImage(id => {
      $("letterAssetId").value = id;
      $("letterImageNote").textContent = "已经附上一张图片";
      modalTempAssets.add(id);
    }, "letter"));
    $("letterImageRemoveBtn").addEventListener("click", () => {
      $("letterAssetId").value = "";
      $("letterImageNote").textContent = "寄出后有80%概率收到回信，回信会在1～480分钟内到来。";
    });
    $("cancelLetterBtn").addEventListener("click", closeSheet);
    $("letterForm").addEventListener("submit", async event => {
      event.preventDefault();
      const characterId = $("letterCharacter").value;
      const text = clampText($("letterText").value, 8000);
      const assetId = $("letterAssetId").value;
      if (!text && !assetId) {
        toast("写句话或附一张图片");
        return;
      }
      const letter = addLetter("sent", characterId, { text, assetId, kind: "manual" });
      modalTempAssets.delete(assetId);
      await persist();
      await closeSheet();
      renderAll();
      schedulePartnerReply(characterId, letter.id);
      toast("信已寄出");
    });
  }

  async function openLetterById(id) {
    const letter = state.letters.find(item => item.id === id && !item.deletedAt);
    if (!letter) return;
    if (!letter.read) {
      letter.read = true;
      await persist();
    }
    renderAll();
    openSheet(letter.kind === "reply" ? "一封回信" : letter.direction === "sent" ? "寄出的信" : "收到的信", `
      <div class="letter-detail"><p class="letter-meta">${esc(letter.direction === "sent" ? `寄给 ${socialName(letter.characterId)}` : `${socialName(letter.characterId)} 寄来`)} · ${esc(formatFullTime(letter.createdAt))}</p><p class="letter-body">${esc(letter.text)}</p>${letter.assetId ? `<button class="social-image" type="button" data-view-image="${esc(letter.assetId)}"><img data-image-asset="${esc(letter.assetId)}" alt="信件图片"></button>` : ""}${letter.replyTo ? `<p class="data-note">这是一封回信。</p>` : ""}</div>`);
    hydrateImages(els.sheetBody);
  }

  async function deleteLetter(id) {
    const letter = state.letters.find(item => item.id === id && !item.deletedAt);
    if (!letter) return;
    const approved = await confirmAction("删除这封信？", "它会先进入回收站，不会直接消失。", "移到回收站");
    if (!approved) return;
    moveToTrash("letter", letter, letter.text.slice(0, 60) || "一封图片信");
    await persist();
    await closeSheet();
    renderAll();
    toast("信件已放进回收站");
  }

  function composeSocialText(characterId, min, max, joinWithSpace = false) {
    const pool = cardsForCharacter(characterId);
    if (!pool.length) return "";
    const lower = Math.min(min, pool.length);
    const upper = Math.min(Math.max(lower, max), pool.length);
    const count = lower + Math.floor(Math.random() * (upper - lower + 1));
    const parts = [];
    for (let index = 0; index < count; index++) parts.push(pool[Math.floor(Math.random() * pool.length)].text);
    return joinWithSpace ? parts.join(" ") : ZikaUtils.joinCardTexts(parts);
  }

  function composeMomentContent(characterId) {
    const text = composeSocialText(characterId, 4, 15);
    if (!text) return null;
    const imagePool = state.messages.filter(message => message.senderId === characterId && message.assetId && !message.deletedAt);
    const assetId = imagePool.length && Math.random() * 100 < 15 ? imagePool[Math.floor(Math.random() * imagePool.length)].assetId : "";
    return { text, assetId };
  }

  function composeCommentText(characterId) {
    const pool = cardsForCharacter(characterId);
    if (!pool.length) return ["这个很可爱", "很好看", "我喜欢", "想多看两眼"][Math.floor(Math.random() * 4)];
    if (Math.random() * 100 < 80) return composeSocialText(characterId, 1, 5);
    return pool[Math.floor(Math.random() * pool.length)].text;
  }

  function addSocialSystemMessage(characterId, kind, targetId, text) {
    const conversation = state.conversations.find(item => !item.deletedAt && item.type === "private" && item.participantIds[0] === characterId);
    if (!conversation) return;
    conversation.updatedAt = Date.now();
    state.messages.push({
      id: uid("message"),
      conversationId: conversation.id,
      senderId: "system",
      senderName: "系统",
      text,
      momentId: kind === "moment" ? targetId : "",
      letterId: kind === "letter" ? targetId : "",
      assetId: "",
      createdAt: Date.now(),
      deletedAt: null
    });
    markConversationUnread(conversation.id);
  }

  function deliverProactiveMoment(characterId) {
    const content = composeMomentContent(characterId);
    if (!content) return false;
    const moment = addMoment(characterId, { ...content, kind: "proactive" });
    addSocialSystemMessage(characterId, "moment", moment.id, `${socialName(characterId)} 发了一条朋友圈 · 点开看`);
    return true;
  }

  function deliverCharacterLetter(characterId, kind, replyTo = "") {
    let text = composeSocialText(characterId, 20, 50, true);
    if (!text) return false;
    if (kind === "reply" && Math.random() < 0.5) {
      const responses = ["那就好", "嗯，我知道", "慢慢来，不着急", "记下了", "有你这句话就够了"];
      text = `${responses[Math.floor(Math.random() * responses.length)]}\n${text}`;
    }
    const letter = addLetter("received", characterId, { text, kind, replyTo });
    addSocialSystemMessage(characterId, "letter", letter.id, `${socialName(characterId)} ${kind === "reply" ? "回了你一封信" : "给你寄来了一封信"} · 点开看`);
    return true;
  }

  function queueReaction(kind, delayMs, details) {
    state.reactions.push({ id: uid("reaction"), kind, at: Date.now() + Math.max(0, delayMs), ...details });
    if (state.reactions.length > 50) state.reactions.splice(0, state.reactions.length - 50);
    persist().catch(error => console.warn("延迟互动保存失败", error));
    setTimeout(() => {
      flushSocialQueue().catch(error => console.warn("延迟互动投递失败", error));
    }, Math.max(0, delayMs));
  }

  function schedulePartnerReactions(momentId) {
    for (const character of activeCharacters()) {
      if (Math.random() * 100 < 70) queueReaction("like", (2 + Math.random() * 118) * 1000, { momentId, authorId: character.id });
      if (Math.random() * 100 < 55) queueReaction("comment", (5 + Math.random() * 115) * 1000, { momentId, authorId: character.id });
    }
  }

  function scheduleCommentResponse(momentId) {
    const moment = state.moments.find(item => item.id === momentId);
    if (!moment) return;
    const candidates = moment.authorId === "me" ? activeCharacters() : [characterById(moment.authorId)].filter(Boolean);
    if (!candidates.length) return;
    const author = candidates[Math.floor(Math.random() * candidates.length)];
    if (Math.random() * 100 < 70) queueReaction("comment", (1 + Math.random() * 59) * 1000, { momentId, authorId: author.id });
  }

  function scheduleReplyResponse(momentId, myReplyId, replyToCommentId) {
    const moment = state.moments.find(item => item.id === momentId);
    const target = moment?.comments.find(comment => comment.id === replyToCommentId);
    if (!target || target.authorId === "me") return;
    if (Math.random() * 100 < 60) queueReaction("reply", (1 + Math.random() * 59) * 1000, { momentId, commentId: myReplyId, replyToCommentId, authorId: target.authorId });
  }

  function scheduleReturnLike(characterId) {
    if (Math.random() * 100 < 35) queueReaction("returnlike", (2 + Math.random() * 118) * 1000, { authorId: characterId });
  }

  function schedulePartnerReply(characterId, letterId) {
    if (Math.random() * 100 < 80) queueReaction("letterReply", (1 + Math.random() * 479) * 60000, { characterId, letterId });
  }

  async function flushSocialQueue() {
    const now = Date.now();
    const due = state.reactions.filter(item => item.at <= now).sort((a, b) => a.at - b.at);
    if (!due.length) return false;
    const ids = new Set(due.map(item => item.id));
    state.reactions = state.reactions.filter(item => !ids.has(item.id));
    for (const item of due) {
      if (item.kind === "like") await toggleMomentLike(item.momentId, item.authorId);
      else if (item.kind === "comment") {
        const moment = state.moments.find(candidate => candidate.id === item.momentId && !candidate.deletedAt);
        const comment = await addMomentComment(item.momentId, item.authorId, composeCommentText(item.authorId));
        if (comment && moment?.authorId === "me") addSocialSystemMessage(item.authorId, "moment", item.momentId, `${socialName(item.authorId)} 评论了你的朋友圈 · 点开看`);
      } else if (item.kind === "reply") await addMomentComment(item.momentId, item.authorId, composeCommentText(item.authorId), item.commentId);
      else if (item.kind === "returnlike") {
        const moment = activeMoments().find(candidate => candidate.authorId === "me" && !candidate.likes.includes(item.authorId));
        if (moment) await toggleMomentLike(moment.id, item.authorId);
      } else if (item.kind === "letterReply") deliverCharacterLetter(item.characterId, "reply", item.letterId);
    }
    await persist();
    renderAll();
    return true;
  }

  function nextSocialDay() {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(8 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);
    return next.getTime();
  }

  async function socialTick() {
    if (!state) return;
    let dirty = await flushSocialQueue();
    const now = Date.now();
    for (const character of activeCharacters()) {
      const id = character.id;
      if (typeof state.settings.nextMomentAtBy[id] !== "number") {
        state.settings.nextMomentAtBy[id] = now + (120 + Math.random() * 480) * 1000;
        dirty = true;
      } else if (now >= state.settings.nextMomentAtBy[id]) {
        dirty = true;
        const today = state.moments.filter(moment => !moment.deletedAt && moment.authorId === id && localDayKey(new Date(moment.createdAt)) === localDayKey()).length;
        const delivered = today < 2 && Math.random() * 100 < 35 ? deliverProactiveMoment(id) : false;
        state.settings.nextMomentAtBy[id] = today + (delivered ? 1 : 0) >= 2 ? nextSocialDay() : now + (90 + Math.random() * 390) * 60000;
      }
      if (typeof state.settings.nextLetterAtBy[id] !== "number") {
        state.settings.nextLetterAtBy[id] = now + (1 + Math.random() * 59) * 60000;
        dirty = true;
      } else if (now >= state.settings.nextLetterAtBy[id]) {
        dirty = true;
        const today = state.letters.filter(letter => !letter.deletedAt && letter.characterId === id && letter.kind === "proactive" && localDayKey(new Date(letter.createdAt)) === localDayKey()).length;
        const delivered = today < 1 && Math.random() * 100 < 60 ? deliverCharacterLetter(id, "proactive") : false;
        state.settings.nextLetterAtBy[id] = today + (delivered ? 1 : 0) >= 1 ? nextSocialDay() : now + (1 + Math.random() * 59) * 60000;
      }
    }
    for (const conversation of activeConversations().filter(item => item.type === "private")) {
      const id = conversation.id;
      if (typeof state.settings.nextMessageAtBy[id] !== "number") {
        state.settings.nextMessageAtBy[id] = now + (5 + Math.random() * 15) * 60000;
        dirty = true;
      } else if (now >= state.settings.nextMessageAtBy[id]) {
        dirty = true;
        if (activeCall || replyTimers.has(id) || typingNames.has(id)) {
          state.settings.nextMessageAtBy[id] = now + (5 + Math.random() * 10) * 60000;
        } else {
          const settings = ZikaUtils.normalizeReplySettings(conversation.replySettings);
          if (Math.random() * 100 < settings.proactiveChance) scheduleReplies(conversation, "", { proactive: true });
          state.settings.nextMessageAtBy[id] = now + (60 + Math.random() * 120) * 60000;
        }
      }
    }
    if (dirty) {
      await persist();
      renderAll();
    }
  }

  function startSocialScheduler() {
    socialTick().catch(error => console.warn("社交调度初始化失败", error));
    setInterval(() => socialTick().catch(error => console.warn("社交调度失败", error)), 30000);
  }

  async function updateStorageInfo() {
    if (!navigator.storage) {
      els.storageUsage.textContent = "这个浏览器没有提供存储估算";
      return;
    }
    try {
      const [estimate, persisted] = await Promise.all([
        navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({}),
        navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)
      ]);
      const usage = Number(estimate.usage || 0) / 1024 / 1024;
      const quota = Number(estimate.quota || 0) / 1024 / 1024 / 1024;
      els.storageUsage.textContent = quota ? `本地约占用 ${usage.toFixed(2)}MB · 浏览器可用额度约 ${quota.toFixed(1)}GB` : `本地约占用 ${usage.toFixed(2)}MB`;
      els.storagePersistBtn.textContent = persisted ? "浏览器已允许持久保留" : "请求浏览器持久保留本地数据";
      els.storagePersistBtn.disabled = Boolean(persisted);
    } catch {
      els.storageUsage.textContent = "暂时无法估算本地占用";
    }
  }

  function renderMine() {
    const me = { name: state.settings.meName || "我", avatarId: state.settings.meAvatarId, color: "#c695ad" };
    els.profileName.textContent = me.name;
    els.profileAvatar.innerHTML = avatarMarkup(me, "large");
    hydrateImages(els.profileAvatar);
    const counts = [
      [activeCharacters().length, "角色"],
      [activeConversations().length, "会话"],
      [activeCards().length, "字卡"],
      [state.messages.filter(item => !item.deletedAt).length, "消息"]
    ];
    els.dataStats.innerHTML = counts.map(([value, label]) => `<div class="data-stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
    applyTheme();
    applyCustomFont();
    updateStorageInfo();
  }

  function renderNotificationDots() {
    const conversationIds = new Set(activeConversations().map(conversation => conversation.id));
    const momentIds = new Set(activeMoments().map(moment => moment.id));
    const counts = {
      chats: state.settings.unreadConversationIds.filter(id => conversationIds.has(id)).length,
      moments: state.settings.unreadMomentIds.filter(id => momentIds.has(id)).length,
      letters: activeLetters().filter(letter => !letter.read).length
    };
    document.querySelectorAll("[data-notification]").forEach(dot => {
      const count = counts[dot.dataset.notification] || 0;
      dot.hidden = !count;
      dot.setAttribute("aria-label", `${count} 条未读动静`);
    });
  }

  function markConversationUnread(conversationId) {
    if (activeConversationId === conversationId && !els.conversationView.hidden) return;
    if (!state.settings.unreadConversationIds.includes(conversationId)) state.settings.unreadConversationIds.push(conversationId);
    renderNotificationDots();
  }

  function markConversationRead(conversationId) {
    const before = state.settings.unreadConversationIds.length;
    state.settings.unreadConversationIds = state.settings.unreadConversationIds.filter(id => id !== conversationId);
    if (state.settings.unreadConversationIds.length !== before) persist().catch(error => console.warn("未读状态保存失败", error));
    renderNotificationDots();
  }

  function markMomentUnread(momentId) {
    if (currentView === "moments" && els.conversationView.hidden) return;
    if (!state.settings.unreadMomentIds.includes(momentId)) state.settings.unreadMomentIds.push(momentId);
    renderNotificationDots();
  }

  function clearMomentUnread() {
    if (!state.settings.unreadMomentIds.length) return;
    state.settings.unreadMomentIds = [];
    persist().catch(error => console.warn("朋友圈未读状态保存失败", error));
    renderNotificationDots();
  }

  function renderAll() {
    renderHome();
    renderConversationList();
    renderCharacters();
    renderCards();
    renderMoments();
    renderLetters();
    renderMine();
    if (activeConversationId && !els.conversationView.hidden) renderConversation();
    renderNotificationDots();
  }

  async function persist() {
    await ZikaDB.saveState(state);
  }

  function chooseAvatar(callback) {
    avatarCallback = callback;
    els.avatarInput.value = "";
    els.avatarInput.click();
  }

  function moveToTrash(kind, target, label) {
    const deletedAt = Date.now();
    target.deletedAt = deletedAt;
    state.trash.push({
      id: uid("trash"),
      kind,
      targetId: target.id,
      label,
      deletedAt
    });
  }

  function openCharacterForm(characterId = null) {
    const existing = characterId ? characterById(characterId) : null;
    const character = existing || {
      name: "",
      avatarId: "",
      status: "",
      usePublicCards: true,
      anniversaryDate: "",
      anniversaryType: "partner",
      videoLocations: [],
      videoOutfits: [],
      color: avatarColors[state.characters.length % avatarColors.length]
    };
    openSheet(existing ? "编辑角色" : "新建角色", `
      <form class="form-stack" id="characterForm">
        <div class="avatar-editor">
          <span id="characterAvatarPreview"></span>
          <div class="avatar-editor-copy">
            <div class="inline-buttons">
              <button class="small-button" id="pickCharacterAvatarBtn" type="button">更换头像</button>
              <button class="text-button muted" id="removeCharacterAvatarBtn" type="button">移除</button>
            </div>
            <p>自动居中裁成方形，图片会跟着完整备份一起走。</p>
          </div>
        </div>
        <input type="hidden" id="characterAvatarId" value="${esc(character.avatarId)}">
        <label class="field"><span>名字</span><input id="characterName" maxlength="20" required value="${esc(character.name)}" placeholder="ta叫什么名字"></label>
        <p class="data-note">名字下方的状态会从预设池自动随机切换，不需要手动选择。</p>
        <label class="toggle-field"><input id="characterUsePublicCards" type="checkbox" ${character.usePublicCards === false ? "" : "checked"}><span><strong>使用公用字卡</strong><small>关闭后，这个角色只使用自己的专属字卡；公用词典、emoji、表情包和图片不受影响。</small></span></label>
        <div class="field-grid">
          <label class="field"><span>纪念日（选填）</span><input id="characterAnniversaryDate" type="date" value="${esc(character.anniversaryDate || "")}"></label>
          <label class="field"><span>关系文案</span><select id="characterAnniversaryType"><option value="partner" ${character.anniversaryType === "friend" ? "" : "selected"}>我们已经在一起…天</option><option value="friend" ${character.anniversaryType === "friend" ? "selected" : ""}>我们已经成为朋友…天</option></select></label>
        </div>
        <p class="data-note">填写日期后显示在角色卡片上，开始当天记为第 1 天；留空则不显示。</p>
        <label class="field"><span>视频地点预设（选填）</span><textarea id="characterVideoLocations" maxlength="1200" placeholder="一行一个，例如：&#10;图书馆靠窗的位置&#10;家里的沙发">${esc((character.videoLocations || []).join("\n"))}</textarea><small>每次视频通话开始时随机挑选一个，并在这通电话里固定。</small></label>
        <label class="field"><span>视频穿着预设（选填）</span><textarea id="characterVideoOutfits" maxlength="1200" placeholder="一行一个，例如：&#10;宽松的白衬衫&#10;深色家居服">${esc((character.videoOutfits || []).join("\n"))}</textarea><small>表情会从「情绪／意图」预设中抽取，每隔 20～40 秒更换。</small></label>
        <label class="field"><span>默认头像颜色</span><input id="characterColor" type="color" value="${esc(safeColor(character.color, colorFor(character.name)))}"><small>有头像时显示图片，没有头像时用这个颜色托底。</small></label>
        <div class="form-actions ${existing ? "three" : ""}">
          ${existing ? '<button class="small-button danger" id="deleteCharacterFromFormBtn" type="button">删除</button>' : ""}
          <button class="small-button" id="cancelCharacterBtn" type="button">取消</button>
          <button class="small-button primary" id="saveCharacterBtn" type="submit">保存角色</button>
        </div>
      </form>`);

    const preview = () => {
      const current = {
        name: $("characterName").value || "角色",
        avatarId: $("characterAvatarId").value,
        color: $("characterColor").value
      };
      $("characterAvatarPreview").innerHTML = avatarMarkup(current, "large");
      hydrateImages($("characterAvatarPreview"));
    };
    preview();
    $("characterName").addEventListener("input", preview);
    $("characterColor").addEventListener("input", preview);
    $("pickCharacterAvatarBtn").addEventListener("click", () => {
      chooseAvatar(id => {
        $("characterAvatarId").value = id;
        modalTempAssets.add(id);
        preview();
      });
    });
    $("removeCharacterAvatarBtn").addEventListener("click", () => {
      $("characterAvatarId").value = "";
      preview();
    });
    $("cancelCharacterBtn").addEventListener("click", closeSheet);
    if (existing) {
      $("deleteCharacterFromFormBtn").addEventListener("click", async () => {
        await closeSheet();
        await deleteCharacter(existing.id);
      });
    }
    $("characterForm").addEventListener("submit", async event => {
      event.preventDefault();
      const name = clampText($("characterName").value, 20);
      if (!name) {
        toast("先给角色一个名字");
        return;
      }
      const duplicate = activeCharacters().some(item => item.id !== existing?.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (duplicate) {
        toast("已经有同名角色了，群聊@会分不清楚");
        return;
      }
      $("saveCharacterBtn").disabled = true;
      const avatarId = $("characterAvatarId").value;
      const anniversaryDate = $("characterAnniversaryDate").value;
      const anniversaryType = $("characterAnniversaryType").value === "friend" ? "friend" : "partner";
      const videoLocations = ZikaUtils.parsePlainCardLines($("characterVideoLocations").value, 80);
      const videoOutfits = ZikaUtils.parsePlainCardLines($("characterVideoOutfits").value, 80);
      const now = Date.now();
      if (existing) {
        Object.assign(existing, {
          name,
          avatarId,
          usePublicCards: $("characterUsePublicCards").checked,
          anniversaryDate,
          anniversaryType,
          videoLocations,
          videoOutfits,
          color: $("characterColor").value,
          updatedAt: now
        });
        for (const message of state.messages) {
          if (message.senderId === existing.id) message.senderName = name;
        }
      } else {
        state.characters.push({
          id: uid("character"),
          name,
          avatarId,
          usePublicCards: $("characterUsePublicCards").checked,
          anniversaryDate,
          anniversaryType,
          videoLocations,
          videoOutfits,
          color: $("characterColor").value,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        });
      }
      modalTempAssets.delete(avatarId);
      await persist();
      await closeSheet();
      renderAll();
      toast(existing ? "角色已经更新" : `${name} 住进小手机了`);
    });
  }

  function openProfileForm() {
    const me = {
      name: state.settings.meName || "我",
      avatarId: state.settings.meAvatarId || "",
      color: "#c695ad"
    };
    openSheet("我的资料", `
      <form class="form-stack" id="profileForm">
        <div class="avatar-editor">
          <span id="profileAvatarPreview"></span>
          <div class="avatar-editor-copy">
            <div class="inline-buttons">
              <button class="small-button" id="pickProfileAvatarBtn" type="button">更换头像</button>
              <button class="text-button muted" id="removeProfileAvatarBtn" type="button">移除</button>
            </div>
            <p>这个头像会出现在你发出的每一条消息旁边。</p>
          </div>
        </div>
        <input type="hidden" id="profileAvatarId" value="${esc(me.avatarId)}">
        <label class="field"><span>我的称呼</span><input id="profileNameInput" maxlength="20" required value="${esc(me.name)}"></label>
        <div class="form-actions">
          <button class="small-button" id="cancelProfileBtn" type="button">取消</button>
          <button class="small-button primary" id="saveProfileBtn" type="submit">保存资料</button>
        </div>
      </form>`);
    const preview = () => {
      $("profileAvatarPreview").innerHTML = avatarMarkup({
        name: $("profileNameInput").value || "我",
        avatarId: $("profileAvatarId").value,
        color: me.color
      }, "large");
      hydrateImages($("profileAvatarPreview"));
    };
    preview();
    $("profileNameInput").addEventListener("input", preview);
    $("pickProfileAvatarBtn").addEventListener("click", () => {
      chooseAvatar(id => {
        $("profileAvatarId").value = id;
        modalTempAssets.add(id);
        preview();
      });
    });
    $("removeProfileAvatarBtn").addEventListener("click", () => {
      $("profileAvatarId").value = "";
      preview();
    });
    $("cancelProfileBtn").addEventListener("click", closeSheet);
    $("profileForm").addEventListener("submit", async event => {
      event.preventDefault();
      const name = clampText($("profileNameInput").value, 20);
      if (!name) {
        toast("称呼不能空着");
        return;
      }
      $("saveProfileBtn").disabled = true;
      state.settings.meName = name;
      state.settings.meAvatarId = $("profileAvatarId").value;
      modalTempAssets.delete(state.settings.meAvatarId);
      await persist();
      await closeSheet();
      renderAll();
      toast("你的资料已经更新");
    });
  }

  function openGroupForm(conversationId = null) {
    const existing = conversationId ? conversationById(conversationId) : null;
    const characters = activeCharacters();
    if (characters.length < 2) {
      toast("至少要有两名角色，才能建群聊");
      return;
    }
    const selected = new Set(existing?.participantIds || []);
    openSheet(existing ? "编辑群聊" : "新建群聊", `
      <form class="form-stack" id="groupForm">
        <label class="field"><span>群聊名字</span><input id="groupTitle" maxlength="30" value="${esc(existing?.title || "")}" placeholder="不填就用成员名字"></label>
        <div class="field"><span>选择至少两名成员</span><div class="character-picker">${characters.map(character => `<label class="character-option"><input type="checkbox" name="members" value="${esc(character.id)}" ${selected.has(character.id) ? "checked" : ""}><span>${avatarMarkup(character, "tiny")}<span class="item-title">${esc(character.name)}</span></span></label>`).join("")}</div></div>
        <div class="form-actions">
          <button class="small-button" id="cancelGroupBtn" type="button">取消</button>
          <button class="small-button primary" id="saveGroupBtn" type="submit">${existing ? "保存群聊" : "建好并进入"}</button>
        </div>
      </form>`);
    hydrateImages($("groupForm"));
    $("cancelGroupBtn").addEventListener("click", closeSheet);
    $("groupForm").addEventListener("submit", async event => {
      event.preventDefault();
      const members = [...$("groupForm").querySelectorAll('input[name="members"]:checked')].map(input => input.value);
      if (members.length < 2) {
        toast("再选一名成员，至少两名才能成群");
        return;
      }
      const fallbackTitle = members.slice(0, 3).map(id => characterById(id)?.name).filter(Boolean).join("、") + (members.length > 3 ? "…" : "");
      const title = clampText($("groupTitle").value, 30) || fallbackTitle;
      const now = Date.now();
      let conversation = existing;
      if (conversation) {
        conversation.title = title;
        conversation.participantIds = members;
        conversation.updatedAt = now;
      } else {
        conversation = {
          id: uid("conversation"),
          type: "group",
          title,
          participantIds: members,
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        };
        state.conversations.push(conversation);
      }
      await persist();
      await closeSheet();
      renderAll();
      openConversation(conversation.id);
    });
  }

  function cardOwnerOptions(selected, kind = libraryKind) {
    const noun = ({ card: "字卡", dictionary: "词条", emoji: "emoji", sticker: "表情包", image: "图片" })[kind] || "字卡";
    return `<option value="shared">公用${noun}</option>` + activeCharacters().map(character => `<option value="${esc(character.id)}">${esc(character.name)}专属</option>`).join("") + `<option value="__selected__" hidden selected></option>`;
  }

  function openImageCardForm(cardId = null, target = null) {
    const existing = cardId ? state.cards.find(item => item.id === cardId && !item.deletedAt) : null;
    const kind = existing?.kind || libraryKind;
    const noun = kind === "sticker" ? "表情包" : "图片";
    const fixed = Boolean(target);
    const selectedOwner = existing?.characterId || target?.owner || "shared";
    const selectedGroup = existing?.group || target?.group || "默认";
    const fixedOwner = fixed && target.owner !== "shared" ? characterById(target.owner) : null;
    const targetName = fixed ? `${target.owner === "shared" ? `公用${noun}` : `${fixedOwner?.name || "未知角色"}专属`} · ${target.group}` : "";
    pendingLibraryImages = [];
    openSheet(existing ? `编辑${noun}` : fixed ? `批量添加${noun}` : `添加${noun}`, `
      <form class="form-stack" id="imageCardForm">
        ${fixed ? `<p class="import-summary"><strong>${esc(targetName)}</strong><br>选中的图片会一起放进这个分组。</p>` : `
          <label class="field"><span>归属</span><select id="imageCardOwner">${cardOwnerOptions(selectedOwner, kind)}</select></label>
          <label class="field"><span>分组</span><input id="imageCardGroup" maxlength="20" value="${esc(selectedGroup)}" placeholder="默认"></label>`}
        <label class="field"><span>备注名（可空）</span><input id="imageCardName" maxlength="80" value="${esc(existing?.text || "")}" placeholder="单张时显示这个名字，多张默认用文件名"></label>
        <button class="small-button" id="imageCardPickBtn" type="button">选择${noun}</button>
        <p class="data-note" id="imageCardFileNote">${existing ? "当前已有一张，重新选择可以替换；不选则保留原图。" : "可以一次选多张，最多 30 张；支持 PNG、JPG、WebP 和 GIF 动图。"}</p>
        <div class="form-actions">
          <button class="small-button" id="cancelImageCardBtn" type="button">取消</button>
          <button class="small-button primary" id="saveImageCardBtn" type="submit">保存到仓库</button>
        </div>
      </form>`);
    const owner = $("imageCardOwner");
    if (owner) {
      owner.querySelector('option[value="__selected__"]').remove();
      owner.value = selectedOwner;
    }
    $("imageCardPickBtn").addEventListener("click", () => {
      els.libraryImageInput.value = "";
      els.libraryImageInput.click();
    });
    $("cancelImageCardBtn").addEventListener("click", closeSheet);
    $("imageCardForm").addEventListener("submit", async event => {
      event.preventDefault();
      const characterId = fixed ? (target.owner === "shared" ? null : target.owner) : owner.value === "shared" ? null : owner.value;
      const group = fixed ? target.group : clampText($("imageCardGroup").value, 20) || "默认";
      const customName = clampText($("imageCardName").value, 80);
      if (characterId && !activeCharacters().some(item => item.id === characterId)) {
        toast("这个角色已经不在当前名册里了");
        return;
      }
      if (!existing && !pendingLibraryImages.length) {
        toast(`先选择至少一张${noun}`);
        return;
      }
      $("saveImageCardBtn").disabled = true;
      const now = Date.now();
      try {
        if (existing) {
          let assetId = existing.assetId;
          if (pendingLibraryImages.length) {
            assetId = await saveImage(pendingLibraryImages[0], kind);
            modalTempAssets.add(assetId);
          }
          Object.assign(existing, { text: customName || existing.text, characterId, group, assetId, updatedAt: now });
        } else {
          for (const file of pendingLibraryImages) {
            const assetId = await saveImage(file, kind);
            modalTempAssets.add(assetId);
            const fallbackName = String(file.name || noun).replace(/\.[^.]+$/, "").slice(0, 80);
            state.cards.push({
              id: uid(kind),
              kind,
              text: customName && pendingLibraryImages.length === 1 ? customName : fallbackName,
              characterId,
              group,
              assetId,
              enabled: true,
              createdAt: now,
              updatedAt: now,
              deletedAt: null
            });
          }
        }
        await persist();
        await closeSheet();
        renderAll();
        toast(existing ? `${noun}已更新` : `已把 ${pendingLibraryImages.length} 张${noun}收进仓库`);
      } catch (error) {
        $("saveImageCardBtn").disabled = false;
        toast(`保存失败：${error.message}`, 3600);
      }
    });
  }

  function openKnowledgeCardForm(cardId = null) {
    const existing = cardId ? state.cards.find(item => item.id === cardId && item.kind === "knowledge" && !item.deletedAt) : null;
    const card = existing || { title: "", text: "", source: "" };
    openSheet(existing ? "编辑知识字卡" : "新建知识字卡", `
      <form class="form-stack" id="knowledgeCardForm">
        <label class="field"><span>知识标题</span><input id="knowledgeCardTitle" maxlength="80" required value="${esc(card.title)}" placeholder="例如：英语不规则动词"></label>
        <label class="field"><span>出自何处（选填）</span><input id="knowledgeCardSource" maxlength="120" value="${esc(card.source || "")}" placeholder="例如：《魔法史》第三章"></label>
        <label class="field"><span>知识正文</span><textarea id="knowledgeCardText" maxlength="4000" required placeholder="写下想复习的概念、笔记或题目">${esc(card.text)}</textarea></label>
        <p class="data-note">推送时只显示复习提示语和标题小卡片，点开后才看完整正文。知识库由所有私聊角色共用，不进入普通字卡、词典或群聊回复池。</p>
        <div class="form-actions"><button class="small-button" id="cancelKnowledgeCardBtn" type="button">取消</button><button class="small-button primary" id="saveKnowledgeCardBtn" type="submit">保存知识字卡</button></div>
      </form>`);
    $("cancelKnowledgeCardBtn").addEventListener("click", closeSheet);
    $("knowledgeCardForm").addEventListener("submit", async event => {
      event.preventDefault();
      const title = clampText($("knowledgeCardTitle").value, 80);
      const source = clampText($("knowledgeCardSource").value, 120);
      const text = clampText($("knowledgeCardText").value, 4000);
      if (!title || !text) {
        toast("知识标题和正文都要写上");
        return;
      }
      const duplicate = activeCards("knowledge").some(item => item.id !== existing?.id && item.title === title && item.text === text);
      if (duplicate) {
        toast("这张知识字卡已经存在了");
        return;
      }
      $("saveKnowledgeCardBtn").disabled = true;
      const now = Date.now();
      if (existing) Object.assign(existing, { title, source, text, updatedAt: now });
      else state.cards.push({ id: uid("knowledge"), kind: "knowledge", title, source, text, characterId: null, group: "知识", enabled: true, createdAt: now, updatedAt: now, deletedAt: null });
      await persist();
      await closeSheet();
      renderAll();
      toast(existing ? "知识字卡已更新" : "知识字卡已收进知识库");
    });
  }

  function openCardForm(cardId = null, draft = null) {
    const existing = cardId ? state.cards.find(item => item.id === cardId && !item.deletedAt) : null;
    const requestedKind = existing?.kind || draft?.kind || libraryKind;
    if (requestedKind === "knowledge") {
      openKnowledgeCardForm(cardId);
      return;
    }
    if (isImageLibrary(requestedKind)) {
      openImageCardForm(cardId);
      return;
    }
    const kind = requestedKind;
    const noun = kind === "dictionary" ? "词条" : kind === "emoji" ? "emoji" : "字卡";
    const maxLength = kind === "dictionary" ? 60 : kind === "emoji" ? 24 : 4000;
    const card = existing || draft || { text: "", characterId: null, group: "默认", kind };
    const selectedOwner = card.characterId || "shared";
    openSheet(existing ? `编辑${noun}` : `新建${noun}`, `
      <form class="form-stack" id="cardForm">
        <label class="field"><span>归属</span><select id="cardOwner">${cardOwnerOptions(selectedOwner, kind)}</select><small>公用${noun}会进入所有角色的回复池，专属${noun}只给当前角色。</small></label>
        <label class="field"><span>分组</span><input id="cardGroup" maxlength="20" value="${esc(card.group || "默认")}" placeholder="默认"></label>
        <label class="field"><span>${noun}内容</span><textarea id="cardText" maxlength="${maxLength}" required placeholder="${kind === "dictionary" ? "一个词语或短句" : kind === "emoji" ? "一个或几个 emoji，例如 🥺🥺" : "一句ta会说的话"}">${esc(card.text)}</textarea></label>
        <div class="form-actions">
          <button class="small-button" id="cancelCardBtn" type="button">取消</button>
          <button class="small-button primary" id="saveCardBtn" type="submit">保存${noun}</button>
        </div>
      </form>`);
    const owner = $("cardOwner");
    owner.querySelector('option[value="__selected__"]').remove();
    owner.value = selectedOwner;
    $("cancelCardBtn").addEventListener("click", closeSheet);
    $("cardForm").addEventListener("submit", async event => {
      event.preventDefault();
      const text = clampText($("cardText").value, maxLength);
      const characterId = owner.value === "shared" ? null : owner.value;
      const group = clampText($("cardGroup").value, 20) || "默认";
      if (!text) {
        toast(`${noun}内容不能空着`);
        return;
      }
      if (kind === "emoji" && !ZikaUtils.isEmojiText(text)) {
        toast("这里只收 emoji，可以一个或几个组合，不要写普通文字");
        return;
      }
      if (characterId && !activeCharacters().some(item => item.id === characterId)) {
        toast("这个角色已经不在当前名册里了");
        return;
      }
      const duplicate = activeCards(kind).some(item => item.id !== existing?.id && item.characterId === characterId && item.group === group && item.text === text);
      if (duplicate) {
        toast(`同一归属和分组里已经有这条${noun}了`);
        return;
      }
      $("saveCardBtn").disabled = true;
      const now = Date.now();
      if (existing) Object.assign(existing, { text, characterId, group, kind, updatedAt: now });
      else state.cards.push({ id: uid(kind === "dictionary" ? "dictionary" : "card"), kind, text, characterId, group, createdAt: now, updatedAt: now, deletedAt: null });
      await persist();
      await closeSheet();
      renderAll();
      toast(existing ? `${noun}已更新` : `${noun}已收进仓库`);
    });
  }

  function openBatchCards(target = null) {
    if (isImageLibrary()) {
      openImageCardForm(null, target);
      return;
    }
    const kind = libraryKind;
    const noun = kind === "dictionary" ? "词条" : kind === "emoji" ? "emoji" : "字卡";
    const maxLength = kind === "dictionary" ? 60 : kind === "emoji" ? 24 : 4000;
    const fixed = Boolean(target);
    const fixedOwner = fixed && target.owner !== "shared" ? characterById(target.owner) : null;
    const targetName = fixed ? `${fixed ? (target.owner === "shared" ? `公用${noun}` : `${fixedOwner?.name || "未知角色"}专属`) : ""} · ${target.group}` : "";
    if (!fixed && !activeCharacters().length) {
      toast(`可以先导入公用${noun}，角色以后再补`);
    }
    openSheet(fixed ? `批量添加到「${target.group}」` : `批量导入${noun}`, `
      <form class="form-stack" id="batchCardsForm">
        ${fixed ? `<p class="import-summary"><strong>${esc(targetName)}</strong><br>一行一句，保存后直接进入这个分组，不用再写【分组】。</p>` : `
          <label class="field"><span>放进哪里</span><select id="batchCardOwner">${cardOwnerOptions("shared")}</select></label>
          <label class="field"><span>未标分组时的默认分组</span><input id="batchCardGroup" maxlength="20" value="默认"></label>`}
        <label class="field"><span>${fixed ? `一行一条${noun}` : `一行一张${noun}，【】里写分组`}</span><textarea id="batchCardText" placeholder="${fixed ? `第一条${noun}&#10;第二条${noun}&#10;第三条${noun}` : "【早安】&#10;第一句&#10;第二句&#10;【晚安】这一句会直接进晚安组&#10;【闲聊】&#10;后面的句子进闲聊组"}"></textarea><small>${fixed ? `空行和重复内容会自动跳过，每条最多 ${maxLength} 字，一次最多 2000 条。` : `【分组】单独一行会管到下一个分组标题，也可以写成【分组】${noun}。没有标注的句子使用上面的默认分组；同归属同分组会查重，一次最多 2000 张。`}</small></label>
        <button class="small-button" id="pickTextFileBtn" type="button">从 TXT 文件读入</button>
        <div class="form-actions">
          <button class="small-button" id="cancelBatchBtn" type="button">取消</button>
          <button class="small-button primary" id="saveBatchBtn" type="submit">${fixed ? "添加到这个分组" : "开始导入"}</button>
        </div>
      </form>`);
    const owner = $("batchCardOwner");
    if (owner) {
      owner.querySelector('option[value="__selected__"]').remove();
      owner.value = "shared";
    }
    $("cancelBatchBtn").addEventListener("click", closeSheet);
    $("pickTextFileBtn").addEventListener("click", () => {
      els.textImportInput.value = "";
      els.textImportInput.click();
    });
    $("batchCardsForm").addEventListener("submit", async event => {
      event.preventDefault();
      const input = $("batchCardText").value;
      const fallbackGroup = fixed ? target.group : clampText($("batchCardGroup").value, 20) || "默认";
      let entries = fixed
        ? ZikaUtils.parsePlainCardLines(input, maxLength).map(text => ({ group: fallbackGroup, text }))
        : ZikaUtils.parseCardLines(input, fallbackGroup).map(entry => ({ ...entry, text: entry.text.slice(0, maxLength) }));
      if (kind === "emoji") entries = entries.filter(entry => ZikaUtils.isEmojiText(entry.text));
      if (!entries.length) {
        toast(fixed ? "先写至少一条内容" : `没有读到${noun}内容，分组标题后面也要写上句子`);
        return;
      }
      if (entries.length > 2000) {
        toast("一次最多导入 2000 张，分两批吧");
        return;
      }
      const characterId = fixed ? (target.owner === "shared" ? null : target.owner) : owner.value === "shared" ? null : owner.value;
      if (characterId && !activeCharacters().some(item => item.id === characterId)) {
        toast("这个角色已经不在当前名册里了");
        return;
      }
      const existingKeys = new Set(activeCards(kind).map(card => `${card.characterId || "shared"}\n${card.group}\n${card.text}`));
      const seen = new Set();
      const now = Date.now();
      let added = 0;
      let skipped = 0;
      for (const entry of entries) {
        const key = `${characterId || "shared"}\n${entry.group}\n${entry.text}`;
        if (existingKeys.has(key) || seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);
        state.cards.push({ id: uid(kind === "dictionary" ? "dictionary" : "card"), kind, text: entry.text, characterId, group: entry.group, createdAt: now, updatedAt: now, deletedAt: null });
        added++;
      }
      if (!added) {
        toast("这些内容已经在当前归属和分组里了");
        return;
      }
      $("saveBatchBtn").disabled = true;
      await persist();
      await closeSheet();
      renderAll();
      toast(`添加完成：新增 ${added} 张，跳过 ${skipped} 张`, 3200);
    });
  }

  function openPresetLibrary() {
    const section = (key, title, copy) => `<section class="preset-section"><div><h3>${title}</h3><p>${copy}</p></div><div class="preset-list">${state.settings[key].map((preset, index) => `<span class="preset-chip">${esc(preset)}<button type="button" data-preset-kind="${key}" data-preset-index="${index}" aria-label="删除预设${esc(preset)}">×</button></span>`).join("") || '<span class="list-caption">还没有预设</span>'}</div><form class="preset-add" id="${key}Form"><input id="${key}Input" maxlength="60" placeholder="写一条新预设" required><button class="small-button primary" type="submit">添加</button></form></section>`;
    openSheet("小注、状态与推送预设", `<div class="form-stack">${section("notePresets", "情绪／意图", "角色发言时按概率随机抽一条，跟在这条发言下面。")}${section("statusPresets", "角色状态", "每个角色各自随机抽取并定期更换；删掉当前项后，下次会自动换一条。")}${section("readPresets", "已读不回字卡", "抽中已读不回时，对方会从这里随机显示一条；历史回执不受修改影响。")}${section("knowledgePresets", "知识复习提示语", "角色推送知识字卡时随机附上一句，例如「想让你复习这个」。")}</div>`);
    const bindAdd = (key, label) => {
      $(`${key}Form`).addEventListener("submit", async event => {
        event.preventDefault();
        const value = clampText($(`${key}Input`).value, 60);
        if (!value) return;
        if (state.settings[key].some(preset => preset.toLocaleLowerCase() === value.toLocaleLowerCase())) {
          toast(`这条${label}预设已经存在了`);
          return;
        }
        if (state.settings[key].length >= 40) {
          toast("每类最多保留 40 条预设，先删掉不常用的吧");
          return;
        }
        state.settings[key].push(value);
        await persist();
        openPresetLibrary();
        toast(`已添加${label}预设`);
      });
    };
    bindAdd("notePresets", "小注");
    bindAdd("statusPresets", "状态");
    bindAdd("readPresets", "已读不回");
    bindAdd("knowledgePresets", "复习提示语");
    els.sheetBody.querySelectorAll("[data-preset-kind]").forEach(button => {
      button.addEventListener("click", async () => {
        const key = button.dataset.presetKind;
        const index = Number(button.dataset.presetIndex);
        if (!["notePresets", "statusPresets", "readPresets", "knowledgePresets"].includes(key) || !state.settings[key][index]) return;
        state.settings[key].splice(index, 1);
        await persist();
        openPresetLibrary();
        toast("预设已删除，历史消息不受影响");
      });
    });
  }

  function openSoundSettings() {
    const rows = [
      ["in", "私聊收消息"],
      ["out", "私聊发消息"],
      ["groupIn", "群聊收消息"],
      ["groupOut", "群聊发消息"],
      ["ring", "通话铃声"]
    ];
    const sounds = state.settings.sfx;
    openSheet("消息与来电音效", `<div class="form-stack"><p class="data-note">点一下音效名称就会试听并保存。全部使用本地合成声音，不上传音频，也不需要联网。</p><label class="field"><span>音量 <output id="sfxVolumeValue">${sounds.volume}%</output></span><input id="sfxVolume" type="range" min="0" max="100" step="5" value="${sounds.volume}"></label>${rows.map(([key, label]) => {
      const options = key === "ring" ? ZikaSFX.ringSounds : ZikaSFX.messageSounds;
      return `<section class="preset-section"><h3>${label}</h3><div class="preset-list sound-options">${options.map(id => `<button class="sound-option ${sounds[key] === id ? "is-active" : ""}" type="button" data-sfx-key="${key}" data-sfx-id="${id}">${esc(ZikaSFX.labels[id])}</button>`).join("")}</div></section>`;
    }).join("")}</div>`);
    $("sfxVolume").addEventListener("input", event => {
      $("sfxVolumeValue").textContent = `${event.target.value}%`;
    });
    $("sfxVolume").addEventListener("change", async event => {
      state.settings.sfx.volume = Number(event.target.value);
      await persist();
    });
    els.sheetBody.querySelectorAll("[data-sfx-key]").forEach(button => {
      button.addEventListener("click", async () => {
        const key = button.dataset.sfxKey;
        const id = button.dataset.sfxId;
        state.settings.sfx[key] = id;
        if (key === "ring") ZikaSFX.stopRing();
        else playSound(key);
        if (key === "ring") ZikaSFX.play(id, state.settings.sfx.volume);
        await persist();
        els.sheetBody.querySelectorAll(`[data-sfx-key="${key}"]`).forEach(option => option.classList.toggle("is-active", option.dataset.sfxId === id));
      });
    });
  }

  function openRenameGroup(encodedKey) {
    const [owner, oldName] = JSON.parse(encodedKey);
    const cards = state.cards.filter(card => (card.kind || "card") === libraryKind && cardOwnerKey(card) === owner && (card.group || "默认") === oldName);
    if (!cards.length) {
      toast("这个分组已经不在了");
      return;
    }
    const ownerName = owner === "shared" ? `公用${libraryNoun()}` : `${characterById(owner)?.name || "未知角色"}专属`;
    openSheet("重命名分组", `<form class="form-stack" id="renameGroupForm"><p class="import-summary"><strong>${esc(ownerName)} · ${esc(oldName)}</strong><br>共 ${cards.filter(card => !card.deletedAt).length} 张${libraryNoun()}，只改分组名，不改内容。</p><label class="field"><span>新的分组名</span><input id="renameGroupName" maxlength="20" value="${esc(oldName)}" required></label><p class="data-note" id="renameGroupHint">如果新名字已经存在，两组会合并。</p><div class="form-actions"><button class="small-button" id="cancelRenameGroupBtn" type="button">取消</button><button class="small-button primary" type="submit">保存分组名</button></div></form>`);
    $("cancelRenameGroupBtn").addEventListener("click", closeSheet);
    $("renameGroupForm").addEventListener("submit", async event => {
      event.preventDefault();
      const newName = clampText($("renameGroupName").value, 20);
      if (!newName) return;
      if (newName === oldName) {
        await closeSheet();
        return;
      }
      const now = Date.now();
      for (const card of cards) {
        card.group = newName;
        card.updatedAt = now;
      }
      const prefs = cardCollapsePrefs();
      const oldKey = cardGroupKey(owner, oldName);
      const newKey = cardGroupKey(owner, newName);
      const index = prefs.groups.indexOf(oldKey);
      if (index >= 0) prefs.groups.splice(index, 1, newKey);
      if (compactOpenGroups.delete(oldKey)) compactOpenGroups.add(newKey);
      await persist();
      await closeSheet();
      renderAll();
      toast(`已把「${oldName}」改名为「${newName}」`);
    });
  }

  function openCardTools() {
    const noun = libraryNoun();
    openSheet("移动与导出", `
      <div class="form-stack">
        <p class="data-note">${isImageLibrary() ? "批量移动从当前筛选结果里勾选；图片本体请通过「我的 → 导出完整备份」保存。" : "批量移动从当前筛选结果里勾选；TXT导出可以单独选择一名角色和分组。"}</p>
        <button class="setting-button" id="openBatchMoveBtn" type="button">批量移动${noun}</button>
        <button class="setting-button" id="openBatchDeleteBtn" type="button">批量删除${noun}</button>
        ${isImageLibrary() ? "" : '<button class="setting-button" id="openCardExportBtn" type="button">按角色／分组导出TXT</button>'}
      </div>`);
    $("openBatchMoveBtn").addEventListener("click", openBatchMove);
    $("openBatchDeleteBtn").addEventListener("click", openBatchDelete);
    if (!isImageLibrary()) $("openCardExportBtn").addEventListener("click", openCardExport);
  }

  function openBatchMove() {
    const candidates = filteredCards();
    if (!candidates.length) {
      toast("当前筛选结果里没有可移动的字卡");
      return;
    }
    const currentOwner = els.cardOwnerFilter.value;
    const selectedOwner = currentOwner === "all" ? "shared" : currentOwner;
    const currentGroup = els.cardGroupFilter.value;
    openSheet("批量移动字卡", `
      <form class="form-stack" id="batchMoveForm">
        <p class="data-note">当前筛选共有 ${candidates.length} 张。勾选后选择新归属和分组；会造成重复或已经在原位的字卡会跳过，不会自动删除。</p>
        <div class="move-card-list">${candidates.map(card => {
          const ownerName = card.characterId === null ? "公用" : `${characterById(card.characterId)?.name || "未知角色"}专属`;
          return `<label class="move-card-option"><input type="checkbox" name="moveCards" value="${esc(card.id)}"><span><small>${esc(ownerName)} · ${esc(card.group || "默认")}</small>${esc(card.text)}</span></label>`;
        }).join("")}</div>
        <label class="field"><span>移动到</span><select id="batchMoveOwner">${cardOwnerOptions(selectedOwner)}</select></label>
        <label class="field"><span>新分组</span><input id="batchMoveGroup" maxlength="20" value="${currentGroup === "all" ? "" : esc(currentGroup)}" placeholder="例如：闲聊" required></label>
        <div class="form-actions">
          <button class="small-button" id="cancelBatchMoveBtn" type="button">取消</button>
          <button class="small-button primary" id="saveBatchMoveBtn" type="submit">移动所选字卡</button>
        </div>
      </form>`);
    const owner = $("batchMoveOwner");
    owner.querySelector('option[value="__selected__"]').remove();
    owner.value = selectedOwner;
    $("cancelBatchMoveBtn").addEventListener("click", closeSheet);
    $("batchMoveForm").addEventListener("submit", async event => {
      event.preventDefault();
      const selectedIds = new Set([...$("batchMoveForm").querySelectorAll('input[name="moveCards"]:checked')].map(input => input.value));
      if (!selectedIds.size) {
        toast("先勾选至少一张字卡");
        return;
      }
      const characterId = owner.value === "shared" ? null : owner.value;
      const group = clampText($("batchMoveGroup").value, 20);
      if (!group) {
        toast("新分组不能空着");
        return;
      }
      if (characterId && !activeCharacters().some(item => item.id === characterId)) {
        toast("这个角色已经不在当前名册里了");
        return;
      }
      const occupied = new Set(activeLibraryCards().filter(card => !selectedIds.has(card.id) && card.characterId === characterId && (card.group || "默认") === group).map(card => isImageLibrary(card.kind || "card") ? card.assetId : card.text));
      let moved = 0;
      let skipped = 0;
      const now = Date.now();
      for (const card of candidates) {
        if (!selectedIds.has(card.id)) continue;
        const identity = isImageLibrary(card.kind || "card") ? card.assetId : card.text;
        if ((card.characterId === characterId && (card.group || "默认") === group) || occupied.has(identity)) {
          skipped++;
          continue;
        }
        card.characterId = characterId;
        card.group = group;
        card.updatedAt = now;
        occupied.add(identity);
        moved++;
      }
      if (!moved) {
        toast("所选字卡已经在原位，或目标分组里已有相同内容");
        return;
      }
      $("saveBatchMoveBtn").disabled = true;
      await persist();
      await closeSheet();
      renderAll();
      toast(`已移动 ${moved} 张${skipped ? `，跳过 ${skipped} 张` : ""}`, 3200);
    });
  }

  function openBatchDelete() {
    const candidates = filteredCards();
    if (!candidates.length) {
      toast("当前筛选结果里没有可删除的字卡");
      return;
    }
    const groups = [...new Set(candidates.map(card => cardGroupKey(cardOwnerKey(card), card.group || "默认")))].map(key => {
      const [owner, group] = JSON.parse(key);
      return { key, owner, group, count: candidates.filter(card => cardOwnerKey(card) === owner && (card.group || "默认") === group).length };
    });
    openSheet("批量删除字卡", `
      <form class="form-stack" id="batchDeleteForm">
        <p class="data-note">可以按分组整组删除，也可以从当前筛选的 ${candidates.length} 张里逐张勾选。删除后都会进入回收站。</p>
        <div class="delete-group-list">${groups.map(item => {
          const ownerName = item.owner === "shared" ? "公用" : `${characterById(item.owner)?.name || "未知角色"}专属`;
          return `<button class="small-button" type="button" data-batch-delete-group="${esc(item.key)}">整组删除：${esc(ownerName)} · ${esc(item.group)}（${item.count}）</button>`;
        }).join("")}</div>
        <button class="small-button" id="selectAllDeleteBtn" type="button">全选当前筛选</button>
        <div class="move-card-list">${candidates.map(card => {
          const ownerName = card.characterId === null ? "公用" : `${characterById(card.characterId)?.name || "未知角色"}专属`;
          return `<label class="move-card-option"><input type="checkbox" name="deleteCards" value="${esc(card.id)}"><span><small>${esc(ownerName)} · ${esc(card.group || "默认")}</small>${esc(card.text)}</span></label>`;
        }).join("")}</div>
        <div class="form-actions">
          <button class="small-button" id="cancelBatchDeleteBtn" type="button">取消</button>
          <button class="small-button danger" type="submit">删除所选字卡</button>
        </div>
      </form>`);
    els.sheetBody.querySelectorAll("[data-batch-delete-group]").forEach(button => {
      button.addEventListener("click", async () => {
        const [owner, group] = JSON.parse(button.dataset.batchDeleteGroup);
        const selected = candidates.filter(card => cardOwnerKey(card) === owner && (card.group || "默认") === group);
        const approved = await confirmAction(`整组删除「${group}」的 ${selected.length} 张字卡？`, "这个分组在当前筛选里的字卡会一起进入回收站，之后可以逐张恢复。", "整组移到回收站");
        if (!approved) return;
        await closeSheet();
        await moveCardsToTrash(selected);
        toast(`已把「${group}」的 ${selected.length} 张字卡放进回收站`, 3200);
      });
    });
    $("selectAllDeleteBtn").addEventListener("click", () => {
      const boxes = [...$("batchDeleteForm").querySelectorAll('input[name="deleteCards"]')];
      const shouldCheck = boxes.some(box => !box.checked);
      for (const box of boxes) box.checked = shouldCheck;
      $("selectAllDeleteBtn").textContent = shouldCheck ? "取消全选" : "全选当前筛选";
    });
    $("cancelBatchDeleteBtn").addEventListener("click", closeSheet);
    $("batchDeleteForm").addEventListener("submit", async event => {
      event.preventDefault();
      const selectedIds = new Set([...$("batchDeleteForm").querySelectorAll('input[name="deleteCards"]:checked')].map(input => input.value));
      if (!selectedIds.size) {
        toast("先勾选至少一张字卡");
        return;
      }
      const selected = candidates.filter(card => selectedIds.has(card.id));
      const approved = await confirmAction(`删除这 ${selected.length} 张字卡？`, "它们会一起进入回收站，之后可以逐张恢复。永久删除仍需另外确认。", "移到回收站");
      if (!approved) return;
      await closeSheet();
      await moveCardsToTrash(selected);
      toast(`已把 ${selected.length} 张字卡放进回收站`, 3200);
    });
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob(["\ufeff", text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.replace(/[\\/:*?"<>|]/g, "_");
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function openCardExport() {
    const currentOwner = els.cardOwnerFilter.value;
    const selectedOwner = currentOwner === "all" ? "shared" : currentOwner;
    openSheet("导出字卡TXT", `
      <form class="form-stack" id="cardExportForm">
        <p class="data-note">每次导出一名角色的专属卡或公用卡。选择全部分组时，会按【分组】写进同一个TXT，之后可以重新导入。TXT会保留正文和分组，可以重新导入。</p>
        <label class="field"><span>字卡归属</span><select id="exportCardOwner">${cardOwnerOptions(selectedOwner)}</select></label>
        <label class="field"><span>分组</span><select id="exportCardGroup"></select></label>
        <div class="form-actions">
          <button class="small-button" id="cancelCardExportBtn" type="button">取消</button>
          <button class="small-button primary" type="submit">导出TXT</button>
        </div>
      </form>`);
    const owner = $("exportCardOwner");
    owner.querySelector('option[value="__selected__"]').remove();
    owner.value = selectedOwner;
    const groupSelect = $("exportCardGroup");
    const updateGroups = () => {
      const characterId = owner.value === "shared" ? null : owner.value;
      const groups = [...new Set(activeLibraryCards().filter(card => card.characterId === characterId).map(card => card.group || "默认"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
      groupSelect.innerHTML = '<option value="all">全部分组</option>' + groups.map(group => `<option value="${esc(group)}">${esc(group)}</option>`).join("");
    };
    updateGroups();
    owner.addEventListener("change", updateGroups);
    $("cancelCardExportBtn").addEventListener("click", closeSheet);
    $("cardExportForm").addEventListener("submit", event => {
      event.preventDefault();
      const characterId = owner.value === "shared" ? null : owner.value;
      const group = groupSelect.value;
      const cards = activeLibraryCards().filter(card => card.characterId === characterId && (group === "all" || (card.group || "默认") === group)).sort((a, b) => a.createdAt - b.createdAt);
      if (!cards.length) {
        toast("这个范围里没有可导出的字卡");
        return;
      }
      const ownerName = characterId === null ? "公用字卡" : `${characterById(characterId)?.name || "角色"}专属`;
      downloadTextFile(`${ownerName}_${group === "all" ? "全部分组" : group}_${dateStamp()}.txt`, ZikaUtils.cardsToTxt(cards));
      toast(`已导出 ${cards.length} 张字卡`);
    });
  }

  async function deleteCharacter(id) {
    const character = characterById(id);
    if (!character || character.deletedAt) return;
    const approved = await confirmAction("把角色移到回收站？", `${character.name} 会暂时离开名册和私聊，专属字卡、图片和聊天记录都会保留。恢复后一起回来。`, "移到回收站");
    if (!approved) return;
    moveToTrash("character", character, character.name);
    for (const conversation of state.conversations) {
      if (conversation.participantIds.includes(id)) cancelReplyJob(conversation.id);
    }
    if (activeConversationId) {
      const current = conversationById(activeConversationId);
      if (current?.type === "private" && current.participantIds.includes(id)) closeConversation();
    }
    await persist();
    renderAll();
    toast("角色已在回收站，记录没有丢");
  }

  async function deleteConversation(id) {
    const conversation = conversationById(id);
    if (!conversation || conversation.deletedAt) return;
    const approved = await confirmAction("把会话移到回收站？", `「${conversationTitle(conversation)}」的消息会一起保留，恢复会话后还能接着看。`, "移到回收站");
    if (!approved) return;
    moveToTrash("conversation", conversation, conversationTitle(conversation));
    cancelReplyJob(id);
    if (activeConversationId === id) closeConversation();
    await persist();
    renderAll();
    toast("会话已放进回收站");
  }

  async function moveCardsToTrash(cards) {
    for (const card of cards) {
      if (!card.deletedAt) moveToTrash("card", card, (card.title || card.text).slice(0, 60));
    }
    await persist();
    renderAll();
  }

  async function deleteCard(id) {
    const card = state.cards.find(item => item.id === id && !item.deletedAt);
    if (!card) return;
    const noun = ({ dictionary: "词条", emoji: "emoji", sticker: "表情包", image: "图片", knowledge: "知识字卡" })[card.kind] || "字卡";
    const approved = await confirmAction(`删除这张${noun}？`, "它会先进入回收站，不会直接消失。", "移到回收站");
    if (!approved) return;
    await moveCardsToTrash([card]);
    toast(`${noun}已放进回收站`);
  }

  function saveMessageToCard(id) {
    const message = state.messages.find(item => item.id === id && item.senderId === "me" && !item.deletedAt && item.text);
    if (!message) return;
    const conversation = conversationById(message.conversationId);
    const character = privateCharacter(conversation);
    openCardForm(null, {
      kind: "card",
      text: message.text,
      characterId: character?.id || null,
      group: "默认"
    });
  }

  async function deleteMessage(id) {
    const message = state.messages.find(item => item.id === id && !item.deletedAt);
    if (!message) return;
    const approved = await confirmAction("删除这条消息？", "仍然可以从回收站恢复，图片也暂时保留。", "移到回收站");
    if (!approved) return;
    moveToTrash("message", message, `${message.senderName || "我"}的一条消息`);
    await persist();
    renderAll();
    toast("消息已放进回收站");
  }

  async function clearConversationMessages(conversationId) {
    const conversation = conversationById(conversationId);
    if (!conversation || conversation.deletedAt) return;
    const messages = state.messages.filter(item => item.conversationId === conversationId && !item.deletedAt);
    if (!messages.length) {
      toast("这个会话里已经没有可清空的记录了");
      return;
    }
    const approved = await confirmAction("一键清空这个会话的记录？", `${messages.length} 条消息会整批移入回收站，会话和角色都保留。以后想找回时，可以整批恢复。`, "清空记录");
    if (!approved) return;
    const deletedAt = Date.now();
    const messageIds = [];
    for (const message of messages) {
      message.deletedAt = deletedAt;
      messageIds.push(message.id);
    }
    state.trash.push({
      id: uid("trash"),
      kind: "messageBatch",
      targetId: conversationId,
      messageIds,
      label: `${conversationTitle(conversation)}的 ${messageIds.length} 条消息`,
      deletedAt
    });
    cancelReplyJob(conversationId);
    await persist();
    renderAll();
    toast(`已清空 ${messageIds.length} 条消息，可在回收站整批恢复`, 3200);
  }

  function trashTarget(entry) {
    if (entry.kind === "messageBatch") {
      const ids = new Set(entry.messageIds || []);
      return state.messages.some(item => ids.has(item.id)) ? { id: entry.targetId } : null;
    }
    const collections = {
      character: state.characters,
      conversation: state.conversations,
      card: state.cards,
      moment: state.moments,
      letter: state.letters,
      message: state.messages
    };
    return collections[entry.kind]?.find(item => item.id === entry.targetId) || null;
  }

  function openTrash() {
    const entries = [...state.trash].sort((a, b) => b.deletedAt - a.deletedAt);
    openSheet("回收站", entries.length
      ? `<div class="trash-toolbar"><span>共 ${entries.length} 项</span><button class="small-button danger" id="emptyTrashBtn" type="button">一键清空回收站</button></div><p class="data-note" style="margin-bottom:12px">这里不会自动清空。单条永久删除或一键清空前都会再次确认，并自动留下快照。</p><div class="trash-list">${entries.map(entry => `<article class="trash-item"><strong>${esc(kindLabels[entry.kind] || "记录")} · ${esc(entry.label || "未命名")}</strong><p>移入时间：${esc(formatFullTime(entry.deletedAt))}${trashTarget(entry) ? "" : " · 原记录已不存在"}</p><div class="trash-actions"><button class="small-button danger" type="button" data-purge-trash="${esc(entry.id)}">永久删除</button><button class="small-button primary" type="button" data-restore-trash="${esc(entry.id)}" ${trashTarget(entry) ? "" : "disabled"}>恢复</button></div></article>`).join("")}</div>`
      : emptyState("clock", "回收站是空的", "误删的角色、会话、字卡和消息会先来到这里。"));
    if (entries.length) $("emptyTrashBtn").addEventListener("click", emptyTrash);
  }

  async function restoreTrash(id) {
    const entry = state.trash.find(item => item.id === id);
    if (!entry) return;
    const target = trashTarget(entry);
    if (!target) {
      toast("原记录已经不在了，可以试试恢复更早的快照");
      return;
    }
    if (entry.kind === "messageBatch") {
      const ids = new Set(entry.messageIds || []);
      for (const message of state.messages) {
        if (ids.has(message.id)) message.deletedAt = null;
      }
    } else {
      target.deletedAt = null;
    }
    state.trash = state.trash.filter(item => item.id !== id);
    await persist();
    renderAll();
    openTrash();
    toast(`${kindLabels[entry.kind] || "记录"}已经恢复`);
  }

  async function cleanupUnusedAssets() {
    const used = new Set([state.settings.meAvatarId, state.settings.wallpaperId, state.settings.fontAssetId]);
    for (const character of state.characters) used.add(character.avatarId);
    for (const card of state.cards) used.add(card.assetId);
    for (const message of state.messages) used.add(message.assetId);
    for (const moment of state.moments) used.add(moment.assetId);
    for (const letter of state.letters) used.add(letter.assetId);
    used.delete("");
    used.delete(undefined);
    const assets = await ZikaDB.getAllAssets();
    for (const asset of assets) {
      if (used.has(asset.id)) continue;
      const url = assetUrls.get(asset.id);
      if (url) URL.revokeObjectURL(url);
      assetUrls.delete(asset.id);
      await ZikaDB.deleteAsset(asset.id);
    }
  }

  function permanentlyDeleteTrashEntry(entry) {
    const target = trashTarget(entry);
    const removedTargets = new Set(entry.kind === "messageBatch" ? (entry.messageIds || []) : [entry.targetId]);
    if (entry.kind === "messageBatch") {
      state.messages = state.messages.filter(item => !removedTargets.has(item.id));
    } else if (target && entry.kind === "character") {
      const privateIds = state.conversations.filter(item => item.type === "private" && item.participantIds.includes(target.id)).map(item => item.id);
      for (const conversationId of privateIds) {
        removedTargets.add(conversationId);
        cancelReplyJob(conversationId);
        for (const message of state.messages) if (message.conversationId === conversationId) removedTargets.add(message.id);
      }
      for (const card of state.cards) if (card.characterId === target.id) removedTargets.add(card.id);
      state.conversations = state.conversations.filter(item => !privateIds.includes(item.id));
      state.messages = state.messages.filter(item => !privateIds.includes(item.conversationId));
      state.calls = state.calls.filter(item => !privateIds.includes(item.conversationId));
      state.cards = state.cards.filter(item => item.characterId !== target.id);
      for (const moment of state.moments) if (moment.authorId === target.id) removedTargets.add(moment.id);
      for (const letter of state.letters) if (letter.characterId === target.id) removedTargets.add(letter.id);
      state.moments = state.moments.filter(item => item.authorId !== target.id);
      state.letters = state.letters.filter(item => item.characterId !== target.id);
      state.reactions = state.reactions.filter(item => item.authorId !== target.id && item.characterId !== target.id);
      for (const conversation of state.conversations) {
        if (conversation.type === "group") conversation.participantIds = conversation.participantIds.filter(memberId => memberId !== target.id);
      }
      state.characters = state.characters.filter(item => item.id !== target.id);
    } else if (target && entry.kind === "conversation") {
      cancelReplyJob(target.id);
      for (const message of state.messages) if (message.conversationId === target.id) removedTargets.add(message.id);
      state.messages = state.messages.filter(item => item.conversationId !== target.id);
      state.calls = state.calls.filter(item => item.conversationId !== target.id);
      state.conversations = state.conversations.filter(item => item.id !== target.id);
    } else if (target && entry.kind === "card") {
      state.cards = state.cards.filter(item => item.id !== target.id);
    } else if (target && entry.kind === "moment") {
      state.moments = state.moments.filter(item => item.id !== target.id);
      state.reactions = state.reactions.filter(item => item.momentId !== target.id);
    } else if (target && entry.kind === "letter") {
      state.letters = state.letters.filter(item => item.id !== target.id);
      state.reactions = state.reactions.filter(item => item.letterId !== target.id);
    } else if (target && entry.kind === "message") {
      state.messages = state.messages.filter(item => item.id !== target.id);
    }
    state.trash = state.trash.filter(item => item.id !== entry.id && !removedTargets.has(item.targetId));
  }

  async function finishTrashPurge(message) {
    if (activeConversationId && !conversationById(activeConversationId)) closeConversation();
    await persist();
    await cleanupUnusedAssets();
    renderAll();
    openTrash();
    toast(message);
  }

  async function purgeTrash(id) {
    const entry = state.trash.find(item => item.id === id);
    if (!entry) return;
    const approved = await confirmAction("永久删除这份记录？", `这次会真正删除${kindLabels[entry.kind] || "记录"}「${entry.label}」。操作前会自动留快照，但永久删除本身不能直接从回收站撤回。`, "永久删除", true);
    if (!approved) return;
    await ZikaDB.createSnapshot(state, "永久删除前");
    permanentlyDeleteTrashEntry(entry);
    await finishTrashPurge("已永久删除，删除前的快照仍在");
  }

  async function emptyTrash() {
    if (!state.trash.length) return;
    const count = state.trash.length;
    const approved = await confirmAction("一键清空回收站？", `回收站里的 ${count} 项记录都会被永久删除，角色、会话、字卡和消息无法再从回收站恢复。操作前会自动留一份完整快照。`, "永久清空", true);
    if (!approved) return;
    await ZikaDB.createSnapshot(state, "清空回收站前");
    const entries = [...state.trash];
    for (const entry of entries) permanentlyDeleteTrashEntry(entry);
    state.trash = [];
    await finishTrashPurge(`已清空回收站的 ${count} 项记录，清空前的快照仍在`);
  }

  async function openSnapshots() {
    openSheet("本地快照", '<p class="data-note">正在读取快照…</p>');
    const snapshots = await ZikaDB.listSnapshots();
    if (els.modalLayer.hidden || els.sheetTitle.textContent !== "本地快照") return;
    els.sheetBody.innerHTML = snapshots.length
      ? `<p class="data-note" style="margin-bottom:12px">导入、清空和永久删除前会自动留下。最多保留最近 10 份；它们仍在这个浏览器里，不能代替导出文件。</p><div class="snapshot-list">${snapshots.map(item => `<article class="snapshot-item"><strong>${esc(item.reason)}</strong><p>${esc(formatFullTime(item.createdAt))} · ${item.characters} 名角色 · ${item.conversations} 个会话 · ${item.cards} 张字卡 · ${item.calls || 0} 次通话 · ${item.moments} 条朋友圈 · ${item.letters} 封信 · ${item.assets} 个本地资产</p><div class="snapshot-actions"><button class="small-button primary" type="button" data-restore-snapshot="${esc(item.id)}">恢复到这一刻</button></div></article>`).join("")}</div>`
      : emptyState("clock", "还没有本地快照", "第一次导入、清空或永久删除前，会自动留下一份。");
  }

  function resetRuntimeAfterReplace() {
    clearAllReplyJobs();
    discardActiveCall();
    clearAssetURLs();
    appliedFontAssetId = null;
    activeConversationId = null;
    els.conversationView.hidden = true;
    els.mainNav.hidden = false;
    currentView = "home";
  }

  async function restoreSnapshotById(id) {
    const snapshot = await ZikaDB.getSnapshot(id);
    if (!snapshot) {
      toast("这份快照已经不在了");
      return;
    }
    const approved = await confirmAction("恢复到这份快照？", `当前页面会回到 ${formatFullTime(snapshot.createdAt)}。恢复前会先给现在再留一份快照。`, "恢复");
    if (!approved) return;
    await ZikaDB.createSnapshot(state, "恢复快照前");
    state = await ZikaDB.restoreSnapshot(id);
    resetRuntimeAfterReplace();
    await closeSheet();
    navigate("home");
    renderAll();
    toast("已经回到所选快照");
  }

  async function exportBackup() {
    const button = $("exportBtn");
    button.disabled = true;
    try {
      const assets = await ZikaDB.getAllAssets();
      const packedAssets = [];
      for (const asset of assets) {
        packedAssets.push({
          id: asset.id,
          kind: asset.kind || "image",
          name: asset.name,
          type: asset.type,
          width: asset.width,
          height: asset.height,
          createdAt: asset.createdAt,
          dataUrl: await blobToDataURL(asset.blob)
        });
      }
      const backup = {
        kind: "zika-phone-backup",
        version: 1,
        exportedAt: Date.now(),
        state: structuredClone(state),
        assets: packedAssets
      };
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `字卡小手机_${dateStamp()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`完整备份已导出，含 ${packedAssets.length} 个本地资产`, 3200);
    } catch (error) {
      toast(`导出失败：${error.message}`, 3600);
    } finally {
      button.disabled = false;
    }
  }

  function validateBackup(data) {
    if (!data || data.kind !== "zika-phone-backup" || data.version !== 1) throw new Error("这不是字卡小手机的 v1 完整备份");
    if (!data.state || typeof data.state !== "object") throw new Error("备份里缺少主体数据");
    data.state = ZikaDB.normalizeState(data.state);
    for (const key of ["moments", "letters", "reactions"]) {
      if (data.state[key] === undefined) data.state[key] = [];
    }
    for (const key of ["characters", "conversations", "messages", "calls", "cards", "moments", "letters", "reactions", "trash"]) {
      if (!Array.isArray(data.state[key])) throw new Error(`备份里的 ${key} 格式不完整`);
      for (const item of data.state[key]) {
        if (!item || typeof item.id !== "string" || !item.id) throw new Error(`备份里的 ${key} 有缺失 ID`);
      }
    }
    if (!Array.isArray(data.assets)) throw new Error("备份里缺少本地资产列表");
    for (const asset of data.assets) {
      const imageAsset = asset?.dataUrl?.startsWith("data:image/");
      const fontAsset = /^data:(font\/|application\/(octet-stream|x-font|font))/.test(asset?.dataUrl || "");
      if (!asset || typeof asset.id !== "string" || typeof asset.dataUrl !== "string" || (!imageAsset && !fontAsset)) throw new Error("备份里有无法识别的图片或字体");
    }
    return data;
  }

  function openImportDialog(data) {
    pendingImport = data;
    const counts = ["characters", "conversations", "cards", "messages"].map(key => data.state[key].length);
    openSheet("导入完整备份", `
      <div class="import-summary">
        备份时间：<strong>${esc(data.exportedAt ? formatFullTime(data.exportedAt) : "未知")}</strong><br>
        角色 <strong>${counts[0]}</strong> · 会话 <strong>${counts[1]}</strong> · 字卡 <strong>${counts[2]}</strong> · 消息 <strong>${counts[3]}</strong> · 本地资产 <strong>${data.assets.length}</strong>
      </div>
      <p class="import-warning">合并导入：保留本机现有内容，同 ID 记录以本机版本为准。<br>全量恢复：用备份替换当前小手机，操作前会自动给现在留快照。</p>
      <div class="form-actions" style="margin-top:16px">
        <button class="small-button" id="mergeImportBtn" type="button">合并导入</button>
        <button class="small-button danger" id="replaceImportBtn" type="button">全量恢复</button>
      </div>`);
    $("mergeImportBtn").addEventListener("click", () => performImport("merge"));
    $("replaceImportBtn").addEventListener("click", async () => {
      const approved = await confirmAction("用备份替换当前小手机？", "当前角色、聊天和设置会被备份版本替换。现在这份会先自动留快照，但换设备前仍建议另外导出。", "全量恢复", true);
      if (approved) await performImport("replace");
    });
  }

  async function unpackAssets(assets) {
    const result = [];
    for (const asset of assets) {
      const blob = await dataURLToBlob(asset.dataUrl);
      result.push({
        id: asset.id,
        kind: asset.kind || "image",
        blob,
        name: asset.name || "本地资产",
        type: blob.type || asset.type,
        width: asset.width || 0,
        height: asset.height || 0,
        createdAt: asset.createdAt || Date.now()
      });
    }
    return result;
  }

  async function performImport(mode) {
    if (!pendingImport) return;
    const data = pendingImport;
    $("mergeImportBtn").disabled = true;
    $("replaceImportBtn").disabled = true;
    try {
      validateBackup(data);
      await ZikaDB.createSnapshot(state, mode === "replace" ? "全量恢复前" : "合并导入前");
      const assets = await unpackAssets(data.assets);
      if (mode === "replace") {
        state = await ZikaDB.replaceAll(data.state, assets);
        resetRuntimeAfterReplace();
      } else {
        const existingAssets = new Set((await ZikaDB.getAllAssets()).map(asset => asset.id));
        for (const asset of assets) {
          if (!existingAssets.has(asset.id)) await ZikaDB.putAsset(asset);
        }
        const summary = {};
        for (const key of ["characters", "conversations", "messages", "calls", "cards", "moments", "letters", "reactions", "trash"]) {
          const ids = new Set(state[key].map(item => item.id));
          let added = 0;
          let skipped = 0;
          for (const item of data.state[key]) {
            if (ids.has(item.id)) {
              skipped++;
              continue;
            }
            state[key].push(structuredClone(item));
            ids.add(item.id);
            added++;
          }
          summary[key] = { added, skipped };
        }
        await persist();
        toast(`合并完成：新增 ${summary.characters.added} 名角色、${summary.cards.added} 张字卡、${summary.messages.added} 条消息`, 3600);
      }
      await closeSheet();
      navigate("home");
      renderAll();
      if (mode === "replace") toast("完整备份已经恢复", 3200);
    } catch (error) {
      $("mergeImportBtn").disabled = false;
      $("replaceImportBtn").disabled = false;
      toast(`导入失败：${error.message}`, 4000);
    }
  }

  async function clearAll() {
    const first = await confirmAction("清空当前小手机？", "角色、聊天、字卡、图片、字体和设置都会从当前数据里移除。清空前会自动留一份本地快照。", "继续", true);
    if (!first) return;
    const second = await confirmAction("再确认一次", "这一步会清空当前浏览器里的小手机数据。清空前会自动留下本地快照，确定继续吗？", "清空并留快照", true);
    if (!second) return;
    await ZikaDB.createSnapshot(state, "清空前");
    state = await ZikaDB.replaceAll(ZikaDB.blankState(), []);
    resetRuntimeAfterReplace();
    await closeSheet();
    navigate("home");
    renderAll();
    toast("已经清空，清空前的记录仍在本地快照里", 3400);
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) {
      toast("这个浏览器没有开放持久存储请求，请照常导出备份");
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      toast(granted ? "浏览器已同意持久保留，仍请定期导出" : "浏览器这次没有同意，完整备份仍然可用", 3400);
      updateStorageInfo();
    } catch {
      toast("暂时无法请求，导出备份不受影响");
    }
  }

  function navigate(view) {
    if (!["home", "chats", "characters", "cards", "moments", "letters", "mine"].includes(view)) return;
    if (!els.conversationView.hidden) closeConversation();
    currentView = view;
    if (view === "moments") clearMomentUnread();
    document.querySelectorAll(".view[data-view]").forEach(section => {
      section.classList.toggle("is-active", section.dataset.view === view);
    });
    els.mainNav.querySelectorAll("[data-nav]").forEach(button => {
      const selected = button.dataset.nav === view;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-current", selected ? "page" : "false");
    });
    if (view === "home") renderHome();
    else if (view === "chats") renderConversationList();
    else if (view === "characters") renderCharacters();
    else if (view === "cards") renderCards();
    else if (view === "moments") renderMoments();
    else if (view === "letters") renderLetters();
    else if (view === "mine") renderMine();
    renderNotificationDots();
  }

  async function openCharacterChat(characterId) {
    const character = activeCharacters().find(item => item.id === characterId);
    if (!character) return;
    let conversation = state.conversations.find(item => !item.deletedAt && item.type === "private" && item.participantIds.length === 1 && item.participantIds[0] === characterId);
    if (!conversation) {
      const now = Date.now();
      conversation = {
        id: uid("conversation"),
        type: "private",
        title: character.name,
        participantIds: [characterId],
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      };
      state.conversations.push(conversation);
      await persist();
    }
    openConversation(conversation.id);
  }

  function setPendingQuote(message = null) {
    pendingQuote = message ? {
      id: message.id,
      text: String(message.text || "").slice(0, 160),
      senderName: message.senderName || characterById(message.senderId)?.name || "对方"
    } : null;
    $("composerQuote").hidden = !pendingQuote;
    $("composerQuoteText").textContent = pendingQuote ? `引用 ${pendingQuote.senderName}：${pendingQuote.text}` : "";
    if (pendingQuote) els.messageInput.focus();
  }

  function openConversation(id) {
    const conversation = activeConversations().find(item => item.id === id);
    if (!conversation) {
      toast("这个会话当前不在消息列表里");
      return;
    }
    activeConversationId = id;
    markConversationRead(id);
    setPendingQuote();
    els.mainNav.hidden = true;
    els.conversationView.hidden = false;
    renderConversation();
    scrollMessagesToBottom();
  }

  function closeConversation() {
    activeConversationId = null;
    setPendingQuote();
    els.conversationView.hidden = true;
    els.mainNav.hidden = false;
    els.messageInput.value = "";
    els.messageInput.style.height = "auto";
    els.typingIndicator.hidden = true;
    renderHome();
    renderConversationList();
  }

  function updateComposerHint() {
    const conversation = conversationById(activeConversationId);
    if (composerBusy) {
      els.composerHint.textContent = "正在把图片收进小手机…";
      return;
    }
    if (!conversation) {
      els.composerHint.textContent = "";
      return;
    }
    els.composerHint.textContent = conversation.type === "group"
      ? "@角色名 可指定回应 · 回复只来自你的字卡"
      : `${privateCharacter(conversation)?.usePublicCards === false ? "仅角色专属卡" : "公用卡 + 角色专属卡"} · 不使用 AI 生成`;
  }

  function setComposerBusy(value) {
    composerBusy = value;
    els.sendMessageBtn.disabled = value;
    els.chatImageBtn.disabled = value;
    els.talkBtn.disabled = value;
    updateComposerHint();
  }

  function renderConversation() {
    const conversation = conversationById(activeConversationId);
    if (!conversation || conversation.deletedAt) {
      closeConversation();
      return;
    }
    els.conversationTitle.textContent = conversationTitle(conversation);
    const canCall = conversation.type === "private";
    $("voiceCallBtn").hidden = !canCall;
    $("videoCallBtn").hidden = !canCall;
    if (conversation.type === "group") {
      const members = conversation.participantIds.map(characterById).filter(item => item && !item.deletedAt);
      els.conversationAvatar.innerHTML = groupAvatarMarkup("small");
      els.conversationSubtitle.textContent = `${members.length} 名成员 · ${members.map(item => item.name).join("、") || "暂无可用成员"}`;
    } else {
      const character = privateCharacter(conversation);
      els.conversationAvatar.innerHTML = avatarMarkup(character, "small");
      els.conversationSubtitle.textContent = statusForCharacter(character);
    }
    hydrateImages(els.conversationAvatar);
    updateComposerHint();
    renderMessages();
    renderTyping();
  }

  function quizMarkup(message) {
    const quiz = message.quiz;
    const responder = characterById(quiz.responderId);
    const status = quiz.answer
      ? `${esc(responder?.name || "对方")}选了「${esc(quiz.answer)}」`
      : "等待对方作答…";
    return `<div class="quiz-card ${quiz.answer ? "is-answered" : ""}"><div class="quiz-heading"><span>问卷</span><small>${quiz.answer ? "已作答" : "待作答"}</small></div><p class="quiz-question">${esc(message.text)}</p><div class="quiz-options">${quiz.options.map(option => `<span class="quiz-option ${quiz.answer === option ? "is-picked" : ""}">${esc(option)}${quiz.answer === option ? '<span aria-hidden="true"> ✓</span>' : ""}</span>`).join("")}</div><p class="quiz-status">${status}</p></div>`;
  }

  function knowledgeMessageText(message) {
    if (message.knowledgeText) return message.text;
    const marker = `\n《${message.knowledgeTitle}》\n`;
    const markerIndex = String(message.text || "").indexOf(marker);
    return markerIndex >= 0 ? message.text.slice(0, markerIndex) : message.text;
  }

  function openKnowledgeMessage(messageId) {
    const message = state.messages.find(item => item.id === messageId && !item.deletedAt);
    if (!message?.knowledgeId) return;
    const card = state.cards.find(item => item.id === message.knowledgeId);
    const title = card?.title || message.knowledgeTitle || "知识字卡";
    const text = message.knowledgeText || card?.text || "";
    const source = message.knowledgeSource || card?.source || "";
    if (!text) {
      toast("这张知识字卡的正文已经找不到了");
      return;
    }
    openSheet(title, `<article class="knowledge-detail"><span class="soft-tag shared">知识库</span><h3>${esc(title)}</h3>${source ? `<p class="knowledge-detail-source">出自：${esc(source)}</p>` : ""}<p class="knowledge-detail-text">${esc(text)}</p></article>`);
  }

  function messageMarkup(message, conversation, showTime) {
    if (message.senderId === "system") {
      const action = message.momentId ? `data-open-moment="${esc(message.momentId)}"` : message.letterId ? `data-open-letter="${esc(message.letterId)}"` : "";
      return `${showTime ? `<div class="message-time">${esc(formatMessageDivider(message.createdAt))}</div>` : ""}<div class="system-message"><button type="button" ${action}>${esc(message.text)}</button></div>`;
    }
    const mine = message.senderId === "me";
    const character = mine ? null : characterById(message.senderId);
    const person = mine
      ? { name: state.settings.meName || "我", avatarId: state.settings.meAvatarId, color: "#c695ad" }
      : character || { name: message.senderName || "角色", avatarId: "", color: colorFor(message.senderName) };
    const sender = conversation.type === "group" && !mine ? `<span class="message-sender">${esc(character?.name || message.senderName || "角色")}</span>` : "";
    const image = message.assetId ? `<div class="message-bubble image-only"><button class="message-image-button" type="button" data-view-image="${esc(message.assetId)}" aria-label="放大${message.mediaKind === "sticker" ? "表情包" : "图片"}"><img class="message-image" data-image-asset="${esc(message.assetId)}" alt="${message.mediaKind === "sticker" ? "聊天表情包" : "聊天图片"}"></button></div>` : "";
    const quote = message.quoteText ? `<div class="message-quote">${esc(message.quoteText)}</div>` : "";
    const quiz = message.quiz ? quizMarkup(message) : "";
    const knowledgeCard = message.knowledgeId ? `<button class="knowledge-message-card" type="button" data-open-knowledge="${esc(message.id)}"><span>知识字卡</span><strong>《${esc(message.knowledgeTitle || "未命名")}》</strong>${message.knowledgeSource ? `<small>出自：${esc(message.knowledgeSource)}</small>` : ""}<span class="knowledge-message-open">点开复习 ›</span></button>` : "";
    const allowedReplyTags = ["多字卡回复", "词典拼词", "词典拼句", "词典", "词典逐卡连发"];
    const rawReplyTags = Array.isArray(message.replyTags) ? message.replyTags : message.source === "dictionary" ? ["词典"] : [];
    const replyTags = mine ? [] : [...new Set(rawReplyTags.filter(tag => allowedReplyTags.includes(tag)))];
    const sourceTags = replyTags.length ? `<div class="message-source-tags">${replyTags.map(tag => `<span class="message-source-tag">${esc(tag)}</span>`).join("")}</div>` : "";
    const text = message.special === "read"
      ? `<div class="message-bubble read-receipt">${esc(message.text || "已读不回")}</div>`
      : message.knowledgeId ? `<div class="message-bubble knowledge-message-bubble">${quote}${esc(knowledgeMessageText(message))}${knowledgeCard}</div>`
      : message.text && !message.quiz ? `<div class="message-bubble ${message.assetId ? "message-caption" : ""}">${quote}${esc(message.text)}${sourceTags}</div>` : "";
    const note = message.note ? `<div class="message-note">${esc(message.note)}</div>` : "";
    const saveAction = mine && message.text && !message.quiz ? `<button class="message-action" type="button" data-save-message="${esc(message.id)}" aria-label="把这条消息收进字卡" title="收进字卡">＋</button>` : "";
    const quoteAction = !mine && message.text && !message.quiz && message.special !== "read" ? `<button class="message-action quote-message-action" type="button" data-quote-message="${esc(message.id)}" title="引用这句字卡">引用</button>` : "";
    return `${showTime ? `<div class="message-time">${esc(formatMessageDivider(message.createdAt))}</div>` : ""}<div class="message-row ${mine ? "mine" : ""}" data-message-id="${esc(message.id)}">${avatarMarkup(person, "tiny")}<div class="message-body"><div class="message-content">${sender}${quiz}${image}${text}${note}</div><div class="message-actions">${quoteAction}${saveAction}<button class="message-action" type="button" data-delete-message="${esc(message.id)}" aria-label="删除这条消息" title="删除这条消息">…</button></div></div></div>`;
  }

  function renderMessages() {
    const conversation = conversationById(activeConversationId);
    if (!conversation) return;
    const messages = state.messages.filter(item => item.conversationId === conversation.id && !item.deletedAt).sort((a, b) => a.createdAt - b.createdAt);
    let previous = null;
    els.messageList.innerHTML = messages.length
      ? messages.map(message => {
        const showTime = !previous || message.createdAt - previous.createdAt > 5 * 60 * 1000 || !sameDay(new Date(message.createdAt), new Date(previous.createdAt));
        const html = messageMarkup(message, conversation, showTime);
        previous = message;
        return html;
      }).join("")
      : `<div class="empty-state" style="margin-top:38px"><span class="empty-icon"><span class="icon icon-chat" aria-hidden="true"></span></span><strong>第一句还没出现</strong><p>你发一句话，角色就会从你为他启用的字卡里挑话回应。</p></div>`;
    hydrateImages(els.messageList);
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    requestAnimationFrame(() => {
      if (!els.conversationView.hidden) els.messageScroll.scrollTop = els.messageScroll.scrollHeight;
    });
  }

  function renderTyping() {
    const conversation = conversationById(activeConversationId);
    const typers = typingNames.get(activeConversationId);
    const count = typers?.size || 0;
    els.typingIndicator.hidden = !count;
    if (!conversation) return;
    if (conversation.type === "group") {
      const members = conversation.participantIds.map(characterById).filter(item => item && !item.deletedAt);
      const subtitle = count ? `当前有 ${count} 人正在输入…` : `${members.length} 名成员 · ${members.map(item => item.name).join("、") || "暂无可用成员"}`;
      els.conversationSubtitle.textContent = subtitle;
      if (count) els.typingText.textContent = subtitle;
    } else {
      const character = privateCharacter(conversation);
      els.conversationSubtitle.textContent = statusForCharacter(character);
      if (count) {
        const settings = ZikaUtils.normalizeReplySettings(conversation.replySettings);
        els.typingText.textContent = `${[...typers.values()][0]} ${settings.typingText}`;
      }
    }
    if (count) scrollMessagesToBottom();
  }

  function callStatusLabel(status, direction = "out") {
    if (status === "rejected") return direction === "in" ? "我拒绝了" : "对方拒绝";
    return ({ calling: "呼叫中", ringing: "等待接听", connected: "通话中", completed: "已完成", busy: "对方忙线", cancelled: "已取消", missed: "未接听", partnerEnded: "对方已挂断", interrupted: "通话中断" })[status] || "已结束";
  }

  function addCallSystemMessage(conversation, text, createdAt = Date.now()) {
    if (!conversation) return;
    state.messages.push({
      id: uid("message"),
      conversationId: conversation.id,
      senderId: "system",
      text,
      createdAt,
      deletedAt: null
    });
    conversation.updatedAt = createdAt;
    markConversationUnread(conversation.id);
  }

  function pickPreset(values, fallback = "") {
    const pool = Array.isArray(values) ? values.map(value => String(value || "").trim()).filter(Boolean) : [];
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : fallback;
  }

  function renderCallScene() {
    const video = activeCall?.kind === "video";
    els.callScene.hidden = !video;
    if (!video) return;
    els.callExpression.textContent = activeCall.expression || "平静";
    els.callLocation.textContent = activeCall.location || "未设置";
    els.callOutfit.textContent = activeCall.outfit || "未设置";
  }

  function updateCallExpression(now = Date.now()) {
    if (!activeCall || activeCall.kind !== "video") return;
    const pool = state.settings.notePresets.map(item => String(item || "").trim()).filter(Boolean);
    const candidates = pool.length > 1 ? pool.filter(item => item !== activeCall.expression) : pool;
    activeCall.expression = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : "平静";
    activeCall.nextExpressionAt = now + (20 + Math.floor(Math.random() * 21)) * 1000;
    els.callExpression.textContent = activeCall.expression;
  }

  function clearCallViewPosition() {
    for (const property of ["left", "top", "right", "bottom"]) els.callView.style.removeProperty(property);
  }

  function applyCallMiniPosition() {
    if (!activeCall?.minimized || !activeCall.miniPosition) return;
    const bounds = els.callView.parentElement.getBoundingClientRect();
    const rect = els.callView.getBoundingClientRect();
    const left = Math.max(8, Math.min(bounds.width - rect.width - 8, activeCall.miniPosition.left));
    const top = Math.max(8, Math.min(bounds.height - rect.height - 8, activeCall.miniPosition.top));
    activeCall.miniPosition = { left, top };
    els.callView.style.left = `${left}px`;
    els.callView.style.top = `${top}px`;
    els.callView.style.right = "auto";
    els.callView.style.bottom = "auto";
  }

  function setCallMinimized(minimized) {
    if (!activeCall) return;
    activeCall.minimized = Boolean(minimized);
    els.callView.classList.toggle("is-minimized", activeCall.minimized);
    els.callView.setAttribute("aria-label", activeCall.minimized ? "已最小化的模拟通话，可拖动位置" : "模拟通话");
    if (activeCall.minimized) requestAnimationFrame(applyCallMiniPosition);
    else clearCallViewPosition();
  }

  function beginCallDrag(event) {
    if (!activeCall?.minimized || event.button !== 0) return;
    const bounds = els.callView.parentElement.getBoundingClientRect();
    const rect = els.callView.getBoundingClientRect();
    callDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left - bounds.left,
      top: rect.top - bounds.top,
      moved: false
    };
    els.callExpandBtn.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveCallDrag(event) {
    if (!callDrag || callDrag.pointerId !== event.pointerId || !activeCall?.minimized) return;
    const dx = event.clientX - callDrag.startX;
    const dy = event.clientY - callDrag.startY;
    if (!callDrag.moved && Math.hypot(dx, dy) < 5) return;
    callDrag.moved = true;
    els.callView.classList.add("is-dragging");
    activeCall.miniPosition = { left: callDrag.left + dx, top: callDrag.top + dy };
    applyCallMiniPosition();
  }

  function endCallDrag(event) {
    if (!callDrag || callDrag.pointerId !== event.pointerId) return;
    if (callDrag.moved) {
      suppressCallExpandClick = true;
      setTimeout(() => { suppressCallExpandClick = false; }, 0);
    }
    callDrag = null;
    els.callView.classList.remove("is-dragging");
    if (els.callExpandBtn.hasPointerCapture(event.pointerId)) els.callExpandBtn.releasePointerCapture(event.pointerId);
  }

  function updateCallDuration() {
    if (!activeCall?.connectedAt) return;
    const now = Date.now();
    els.callDuration.textContent = formatDuration((now - activeCall.connectedAt) / 1000);
    if (activeCall.nextExpressionAt && now >= activeCall.nextExpressionAt) updateCallExpression(now);
    if (activeCall.nextHangupCheckAt && now >= activeCall.nextHangupCheckAt) {
      activeCall.nextHangupCheckAt = now + 60000;
      const conversation = conversationById(activeCall.conversationId);
      const settings = ZikaUtils.normalizeReplySettings(conversation?.replySettings);
      if (Math.random() * 100 < settings.callAutoHangupChance) {
        finishCall("partnerEnded");
        return;
      }
    }
  }

  function discardActiveCall() {
    if (activeCall) {
      clearTimeout(activeCall.timer);
      clearInterval(activeCall.interval);
    }
    activeCall = null;
    callDrag = null;
    ZikaSFX.stopRing();
    els.callView.hidden = true;
    els.callView.classList.remove("is-minimized", "is-dragging");
    els.callScene.hidden = true;
    clearCallViewPosition();
  }

  async function finishCall(status) {
    if (!activeCall) return;
    const call = activeCall;
    clearTimeout(call.timer);
    clearInterval(call.interval);
    ZikaSFX.stopRing();
    const record = state.calls.find(item => item.id === call.id);
    const endedAt = Date.now();
    const duration = call.connectedAt ? Math.max(0, Math.floor((endedAt - call.connectedAt) / 1000)) : 0;
    if (record) {
      record.status = status;
      record.endedAt = endedAt;
      record.duration = duration;
    }
    const conversation = conversationById(call.conversationId);
    const label = call.kind === "video" ? "视频通话" : "语音通话";
    addCallSystemMessage(conversation, `${label} · ${callStatusLabel(status, call.direction)}${call.connectedAt ? ` · ${formatDuration(duration)}` : ""}`, endedAt);
    activeCall = null;
    callDrag = null;
    els.callView.hidden = true;
    els.callView.classList.remove("is-minimized", "is-dragging");
    els.callScene.hidden = true;
    clearCallViewPosition();
    $("callIncomingActions").hidden = true;
    $("callHangupBtn").hidden = false;
    await persist();
    renderAll();
  }

  async function connectActiveCall(id) {
    if (!activeCall || activeCall.id !== id || !["calling", "ringing"].includes(activeCall.status)) return;
    clearTimeout(activeCall.timer);
    const record = state.calls.find(item => item.id === id);
    activeCall.status = "connected";
    activeCall.connectedAt = Date.now();
    activeCall.nextHangupCheckAt = activeCall.connectedAt + 180000;
    if (record) {
      record.status = "connected";
      record.connectedAt = activeCall.connectedAt;
    }
    ZikaSFX.stopRing();
    $("callIncomingActions").hidden = true;
    $("callHangupBtn").hidden = false;
    $("callHangupBtn").textContent = "挂断";
    els.callStatus.textContent = "正在通话…";
    updateCallDuration();
    activeCall.interval = setInterval(updateCallDuration, 1000);
    await persist();
  }

  async function resolveOutgoingCall(id) {
    if (!activeCall || activeCall.id !== id || activeCall.status !== "calling") return;
    const roll = Math.random() * 100;
    if (roll >= 70) await finishCall(roll < 85 ? "busy" : "rejected");
    else await connectActiveCall(id);
  }

  async function answerIncomingCall() {
    if (!activeCall || activeCall.direction !== "in" || activeCall.status !== "ringing") return;
    await connectActiveCall(activeCall.id);
  }

  function endActiveCallByUser() {
    if (!activeCall) return;
    const status = activeCall.connectedAt ? "completed" : activeCall.direction === "in" ? "rejected" : "cancelled";
    return finishCall(status);
  }

  async function beginCall(kind, direction, conversationId) {
    const conversation = conversationById(conversationId);
    if (!conversation || conversation.deletedAt) return false;
    if (conversation.type !== "private") {
      if (direction === "out") toast("群聊不支持通话，请到角色私聊里拨打");
      return false;
    }
    if (activeCall) {
      if (direction === "out") toast("已经有一场通话了");
      return false;
    }
    const participants = conversation.participantIds.map(characterById).filter(character => character && !character.deletedAt);
    if (!participants.length) {
      if (direction === "out") toast("这个会话里还没有能接听的角色");
      return false;
    }
    const incoming = direction === "in";
    const now = Date.now();
    const record = {
      id: uid("call"),
      conversationId: conversation.id,
      title: conversationTitle(conversation),
      participantIds: participants.map(character => character.id),
      kind: kind === "video" ? "video" : "voice",
      direction: incoming ? "in" : "out",
      status: incoming ? "ringing" : "calling",
      createdAt: now,
      connectedAt: 0,
      endedAt: 0,
      duration: 0,
      deletedAt: null
    };
    state.calls.push(record);
    const character = participants[0];
    activeCall = {
      id: record.id,
      conversationId: conversation.id,
      kind: record.kind,
      direction: record.direction,
      status: record.status,
      connectedAt: 0,
      timer: 0,
      interval: 0,
      nextHangupCheckAt: 0,
      minimized: false,
      miniPosition: null,
      location: pickPreset(character.videoLocations, "未设置"),
      outfit: pickPreset(character.videoOutfits, "未设置"),
      expression: pickPreset(state.settings.notePresets, "平静"),
      nextExpressionAt: now + (20 + Math.floor(Math.random() * 21)) * 1000
    };
    const label = record.kind === "video" ? "视频通话" : "语音通话";
    addCallSystemMessage(conversation, incoming ? `${conversationTitle(conversation)} 发来${label}` : `我发起了${label}`, now);
    if (!els.imageViewer.hidden) closeImageViewer();
    els.callView.classList.toggle("is-video", record.kind === "video");
    els.callView.classList.remove("is-minimized", "is-dragging");
    clearCallViewPosition();
    els.callView.setAttribute("aria-label", "模拟通话");
    els.callKind.textContent = label;
    els.callName.textContent = conversationTitle(conversation);
    els.callAvatar.innerHTML = conversationAvatarMarkup(conversation, "call-avatar");
    els.callStatus.textContent = incoming ? "等待你接听…" : "正在呼叫…";
    els.callDuration.textContent = "00:00";
    els.callSelfView.hidden = record.kind !== "video";
    els.callSelfView.innerHTML = avatarMarkup({ name: state.settings.meName || "我", avatarId: state.settings.meAvatarId, color: "#c695ad" }, "call-self-avatar");
    renderCallScene();
    $("callIncomingActions").hidden = !incoming;
    $("callHangupBtn").hidden = incoming;
    $("callHangupBtn").textContent = "取消";
    els.callView.hidden = false;
    hydrateImages(els.callView);
    playSound("ring", true);
    await persist();
    renderAll();
    if (!activeCall || activeCall.id !== record.id) return false;
    activeCall.timer = incoming
      ? setTimeout(() => finishCall("missed"), 30000)
      : setTimeout(() => resolveOutgoingCall(record.id), 1800 + Math.floor(Math.random() * 1500));
    return true;
  }

  async function startCall(kind) {
    return beginCall(kind, "out", activeConversationId);
  }

  async function startIncomingCall(conversationId, kind = "voice") {
    return beginCall(kind, "in", conversationId);
  }

  async function callSchedulerTick() {
    if (callSchedulerBusy || !state) return;
    callSchedulerBusy = true;
    try {
      const now = Date.now();
      let dirty = false;
      for (const conversation of activeConversations().filter(item => item.type === "private")) {
        const next = state.settings.nextCallAtBy[conversation.id];
        if (typeof next !== "number") {
          state.settings.nextCallAtBy[conversation.id] = now + (3 + Math.random() * 12) * 60000;
          dirty = true;
          continue;
        }
        if (now < next) continue;
        const settings = ZikaUtils.normalizeReplySettings(conversation.replySettings);
        let delivered = false;
        if (!activeCall && Math.random() * 100 < settings.callIncomingChance) {
          delivered = await startIncomingCall(conversation.id, Math.random() < 0.25 ? "video" : "voice");
        }
        const delay = delivered ? 30 + Math.random() * 90 : activeCall ? 5 + Math.random() * 5 : 10 + Math.random() * 20;
        state.settings.nextCallAtBy[conversation.id] = now + delay * 60000;
        dirty = true;
      }
      if (dirty) await persist();
    } finally {
      callSchedulerBusy = false;
    }
  }

  function startCallScheduler() {
    callSchedulerTick().catch(error => console.warn("来电调度初始化失败", error));
    setInterval(() => callSchedulerTick().catch(error => console.warn("来电调度失败", error)), 60000);
  }

  function callRecordDuration(record) {
    if (record.status === "connected" && activeCall?.id === record.id) return Math.max(0, Math.floor((Date.now() - record.connectedAt) / 1000));
    return Number(record.duration) || 0;
  }

  function callStatsByCharacter(records) {
    const stats = new Map();
    for (const record of records) {
      const conversation = conversationById(record.conversationId);
      const characterId = record.participantIds?.[0] || privateCharacter(conversation)?.id || "";
      const key = characterId || record.conversationId;
      if (!stats.has(key)) stats.set(key, { name: characterById(characterId)?.name || record.title || "未知角色", total: 0, connected: 0, duration: 0 });
      const item = stats.get(key);
      item.total += 1;
      if (record.connectedAt) {
        item.connected += 1;
        item.duration += callRecordDuration(record);
      }
    }
    return [...stats.values()].sort((a, b) => b.duration - a.duration || a.name.localeCompare(b.name, "zh-CN"));
  }

  function openCallStats(conversationId = null) {
    const records = state.calls.filter(record => !record.deletedAt && (!conversationId || record.conversationId === conversationId)).sort((a, b) => b.createdAt - a.createdAt);
    const connected = records.filter(record => record.connectedAt);
    const duration = connected.reduce((sum, record) => sum + callRecordDuration(record), 0);
    const voice = records.filter(record => record.kind === "voice").length;
    const video = records.filter(record => record.kind === "video").length;
    const characterStats = callStatsByCharacter(records);
    const title = conversationId ? `${conversationTitle(conversationById(conversationId))} · 通话` : "通话记录与统计";
    const characterMarkup = characterStats.length ? `<section class="call-character-stats"><h3>分角色时长</h3>${characterStats.map(item => `<article class="call-character-stat"><div><strong>${esc(item.name)}</strong><small>接通 ${item.connected} 次 · 共 ${item.total} 次</small></div><span>${esc(formatDuration(item.duration))}</span></article>`).join("")}</section>` : "";
    openSheet(title, `<div class="form-stack"><div class="call-stats-grid"><div class="data-stat"><strong>${records.length}</strong><span>总计</span></div><div class="data-stat"><strong>${connected.length}</strong><span>接通</span></div><div class="data-stat"><strong>${esc(formatDuration(duration))}</strong><span>累计时长</span></div></div><p class="data-note">语音 ${voice} 次 · 视频 ${video} 次。时长按接通到挂断计算，未接通不计时。</p>${characterMarkup}<div class="call-history">${records.length ? records.slice(0, 50).map(record => `<article class="call-history-item"><div><strong>${esc(record.direction === "in" ? "来电" : "去电")} · ${esc(record.kind === "video" ? "视频通话" : "语音通话")} · ${esc(callStatusLabel(record.status, record.direction))}</strong><p>${esc(record.title || conversationTitle(conversationById(record.conversationId)))}</p><small>${esc(formatFullTime(record.createdAt))}</small></div><span>${record.connectedAt ? esc(formatDuration(callRecordDuration(record))) : "—"}</span></article>`).join("") : emptyState("phone", "还没有通话记录", "在角色私聊顶部选择语音或视频，就能打出第一通电话。")}</div>${records.length > 50 ? '<p class="list-caption">这里显示最近 50 条，完整记录仍保存在备份里。</p>' : ""}</div>`);
  }

  async function clearLegacyCallHistory() {
    if (state.settings.callHistoryReset20261119 === true) return;
    state.calls = [];
    state.settings.nextCallAtBy = {};
    state.settings.callHistoryReset20261119 = true;
    await persist();
  }

  async function recoverInterruptedCalls() {
    let changed = false;
    for (const record of state.calls) {
      if (!["calling", "ringing", "connected"].includes(record.status)) continue;
      record.status = "interrupted";
      record.endedAt = Date.now();
      record.duration = record.connectedAt ? Math.max(0, Math.floor((record.endedAt - record.connectedAt) / 1000)) : 0;
      changed = true;
    }
    if (changed) await persist();
  }

  function cancelReplyJob(conversationId, includeQuizzes = true) {
    const timers = replyTimers.get(conversationId) || [];
    for (const timer of timers) clearTimeout(timer);
    replyTimers.delete(conversationId);
    if (includeQuizzes) {
      for (const [messageId, timer] of quizTimers) {
        const message = state.messages.find(item => item.id === messageId);
        if (!message || message.conversationId === conversationId) {
          clearTimeout(timer);
          quizTimers.delete(messageId);
        }
      }
    }
    typingNames.delete(conversationId);
    if (activeConversationId === conversationId) renderTyping();
  }

  function clearAllReplyJobs() {
    for (const id of [...replyTimers.keys()]) cancelReplyJob(id);
    for (const timer of quizTimers.values()) clearTimeout(timer);
    quizTimers.clear();
    typingNames.clear();
  }

  function pickReplyCards(character, settings) {
    const pool = cardsForCharacter(character.id);
    if (!pool.length) return { character, cards: [] };
    const recent = recentCards.get(character.id) || [];
    let available = recent.length >= pool.length ? [...pool] : pool.filter(card => !recent.includes(card.id));
    if (!available.length) available = [...pool];
    const count = settings.countMin + Math.floor(Math.random() * (settings.countMax - settings.countMin + 1));
    const picked = [];
    while (picked.length < count && available.length) {
      const index = Math.floor(Math.random() * available.length);
      const [card] = available.splice(index, 1);
      picked.push(card);
      if (!available.length && picked.length < count) available = pool.filter(card => !picked.includes(card));
    }
    const nextRecent = [...recent, ...picked.map(card => card.id)].slice(-8);
    recentCards.set(character.id, nextRecent);
    return { character, cards: picked };
  }

  function scheduleReadReceipt(conversation, text) {
    let candidates = conversation.participantIds.map(characterById).filter(character => character && !character.deletedAt);
    const lowered = String(text || "").toLocaleLowerCase();
    const mentioned = candidates.filter(character => lowered.includes(`@${character.name.toLocaleLowerCase()}`));
    if (mentioned.length) candidates = mentioned;
    if (!candidates.length) return;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const presets = state.settings.readPresets.map(preset => String(preset || "").trim()).filter(Boolean);
    const receipt = presets.length ? presets[Math.floor(Math.random() * presets.length)] : "已读不回";
    const timer = setTimeout(async () => {
      const current = conversationById(conversation.id);
      const character = characterById(chosen.id);
      if (!current || current.deletedAt || !character || character.deletedAt) return;
      state.messages.push({
        id: uid("message"),
        conversationId: current.id,
        senderId: character.id,
        senderName: character.name,
        text: receipt,
        special: "read",
        source: "readReceipt",
        createdAt: Date.now(),
        deletedAt: null
      });
      current.updatedAt = Date.now();
      markConversationUnread(current.id);
      await persist();
      replyTimers.delete(conversation.id);
      renderAll();
    }, 1000 + Math.floor(Math.random() * 3000));
    replyTimers.set(conversation.id, [timer]);
  }

  function scheduleReplies(conversation, text, options = {}) {
    if (!conversation || conversation.deletedAt) return false;
    const proactive = options.proactive === true;
    const groupMember = Boolean(options.responderId);
    if (!groupMember) cancelReplyJob(conversation.id, false);
    const settings = ZikaUtils.normalizeReplySettings(conversation.replySettings);
    if (!proactive && conversation.type !== "group" && Math.random() * 100 < settings.ignoreChance) {
      scheduleReadReceipt(conversation, text);
      return true;
    }
    let candidates = conversation.participantIds.map(characterById).filter(character => character && !character.deletedAt);
    const lowered = String(text || "").toLocaleLowerCase();
    const mentioned = candidates.filter(character => lowered.includes(`@${character.name.toLocaleLowerCase()}`));
    if (conversation.type === "group" && !groupMember) {
      let scheduled = false;
      for (const character of candidates) {
        const mustReply = mentioned.some(item => item.id === character.id);
        if (!mustReply && Math.random() * 100 >= settings.groupReplyChance) continue;
        scheduled = scheduleReplies(conversation, text, { responderId: character.id }) || scheduled;
      }
      if (!scheduled) {
        typingNames.delete(conversation.id);
        replyTimers.delete(conversation.id);
        renderTyping();
      }
      return scheduled;
    }
    if (groupMember) candidates = candidates.filter(character => character.id === options.responderId);
    else if (mentioned.length) candidates = mentioned;
    if (!candidates.length) return false;
    const randomCount = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    const knowledgePool = proactive && conversation.type === "private" && !groupMember ? knowledgeCards() : [];
    const useKnowledge = knowledgePool.length > 0 && Math.random() * 100 < settings.knowledgeChance;
    let chosen;
    const outgoing = [];
    const withEmoji = (character, text) => {
      if (!text) return "";
      const pool = emojiCardsForCharacter(character.id);
      if (!pool.length || Math.random() * 100 >= settings.emojiChance) return text;
      return `${text} ${pool[Math.floor(Math.random() * pool.length)].text}`;
    };
    const drawText = character => {
      const combine = settings.mergeCards && Math.random() * 100 < settings.multiChance;
      const drawSettings = combine
        ? { ...settings, countMin: settings.multiMin, countMax: settings.multiMax }
        : { ...settings, countMin: 1, countMax: 1 };
      const reply = pickReplyCards(character, drawSettings);
      const multi = combine && reply.cards.length > 1;
      const text = multi
        ? ZikaUtils.composeReplyText(reply.cards.map(card => card.text), settings)
        : reply.cards[0]?.text || "";
      return { text: withEmoji(character, text), multi };
    };
    const drawDictionary = (character, pool) => {
      const entries = ZikaUtils.pickDictionaryEntries(pool, settings.dictionaryMin, settings.dictionaryMax);
      const single = settings.dictionarySingle && (!settings.dictionaryMulti || Math.random() >= 0.2);
      if (single) {
        const dictionaryTag = entries.every(text => text.length > 4) ? "词典拼句" : "词典拼词";
        return [{
          text: withEmoji(character, ZikaUtils.joinCardTexts(entries)),
          source: "dictionary",
          replyTags: [dictionaryTag, ...(entries.length > 1 ? ["多字卡回复"] : [])]
        }];
      }
      return entries.map(text => ({
        text: withEmoji(character, text),
        source: "dictionary",
        replyTags: ["词典", "词典逐卡连发"]
      }));
    };
    if (useKnowledge) {
      chosen = candidates[0];
      const card = knowledgePool[Math.floor(Math.random() * knowledgePool.length)];
      const presets = state.settings.knowledgePresets.map(preset => String(preset || "").trim()).filter(Boolean);
      const preset = presets.length ? presets[Math.floor(Math.random() * presets.length)] : "想让你复习这个";
      outgoing.push({ text: formatKnowledgePush(card, preset), source: "knowledge", knowledgeId: card.id, knowledgeTitle: card.title, knowledgeText: card.text, knowledgeSource: card.source || "" });
    } else {
      const available = candidates.map(character => ({
        character,
        main: cardsForCharacter(character.id),
        dictionary: dictionaryPoolForCharacter(character, settings),
        stickers: mediaCardsForCharacter("sticker", character.id),
        images: mediaCardsForCharacter("image", character.id)
      })).filter(item => item.main.length || item.dictionary.length || item.stickers.length || item.images.length);
      if (!available.length) {
        const shouldWarn = !proactive && (!groupMember || mentioned.some(item => item.id === options.responderId));
        if (shouldWarn && mentioned.length) toast(`${groupMember ? candidates[0].name : mentioned[0].name} 还没有可用内容，先去仓库加一些吧`, 3200);
        else if (shouldWarn) toast("这些角色还没有可用内容，先去仓库加一些吧", 3200);
        return false;
      }
      const selected = available[Math.floor(Math.random() * available.length)];
      chosen = selected.character;
      const messageCount = randomCount(settings.countMin, settings.countMax);
      for (let index = 0; index < messageCount; index++) {
        if (selected.dictionary.length && Math.random() * 100 < settings.dictionaryChance) {
          outgoing.push(...drawDictionary(chosen, selected.dictionary));
          continue;
        }
        let kind = selected.images.length && Math.random() * 100 < settings.imageChance
          ? "image"
          : selected.stickers.length && Math.random() * 100 < settings.stickerChance ? "sticker" : "text";
        if (kind === "text" && !selected.main.length && selected.dictionary.length) {
          outgoing.push(...drawDictionary(chosen, selected.dictionary));
          continue;
        }
        if (kind === "text" && !selected.main.length) {
          if (selected.images.length) kind = "image";
          else if (selected.stickers.length) kind = "sticker";
          else continue;
        }
        if (kind === "image" || kind === "sticker") {
          const pool = kind === "image" ? selected.images : selected.stickers;
          const card = pool[Math.floor(Math.random() * pool.length)];
          const caption = settings.mediaCaption ? drawText(chosen) : { text: "", multi: false };
          outgoing.push({ text: caption.text, assetId: card.assetId, mediaKind: kind, source: kind, replyTags: caption.multi ? ["多字卡回复"] : [] });
        } else {
          const reply = drawText(chosen);
          if (reply.text) outgoing.push({ text: reply.text, source: "cards", replyTags: reply.multi ? ["多字卡回复"] : [] });
        }
      }
    }
    if (!outgoing.length) return false;
    const quoteCandidates = state.messages.filter(message => message.conversationId === conversation.id && message.senderId === "me" && !message.deletedAt && !message.quiz && message.text).sort((a, b) => a.createdAt - b.createdAt).slice(-10);
    const quoted = !proactive && quoteCandidates.length && Math.random() * 100 < settings.quoteChance
      ? quoteCandidates[Math.floor(Math.random() * quoteCandidates.length)]
      : null;
    const notePool = state.settings.notePresets.filter(note => note);
    if (!typingNames.has(conversation.id)) typingNames.set(conversation.id, new Map());
    typingNames.get(conversation.id).set(chosen.id, chosen.name);
    renderTyping();
    const timers = replyTimers.get(conversation.id) || [];
    let finalDelay = 0;
    let elapsed = 0;
    outgoing.forEach((card, index) => {
      const min = index === 0 ? settings.delayMin : settings.gapMin;
      const max = index === 0 ? settings.delayMax : settings.gapMax;
      elapsed += randomCount(min, max) * 1000;
      const delay = elapsed;
      finalDelay = delay;
      const timer = setTimeout(async () => {
        const current = conversationById(conversation.id);
        const currentCharacter = characterById(chosen.id);
        if (!current || current.deletedAt || !currentCharacter || currentCharacter.deletedAt) return;
        state.messages.push({
          id: uid("message"),
          conversationId: current.id,
          senderId: currentCharacter.id,
          senderName: currentCharacter.name,
          text: card.text || "",
          source: card.source || (card.dictionary ? "dictionary" : "cards"),
          replyTags: Array.isArray(card.replyTags) ? card.replyTags : [],
          knowledgeId: card.knowledgeId || "",
          knowledgeTitle: card.knowledgeTitle || "",
          knowledgeText: card.knowledgeText || "",
          knowledgeSource: card.knowledgeSource || "",
          proactive,
          mediaKind: card.mediaKind || "",
          note: notePool.length && Math.random() * 100 < settings.noteChance ? notePool[Math.floor(Math.random() * notePool.length)] : "",
          quoteMessageId: index === 0 && quoted ? quoted.id : "",
          quoteText: index === 0 && quoted ? quoted.text.slice(0, 160) : "",
          assetId: card.assetId || "",
          createdAt: Date.now(),
          deletedAt: null
        });
        current.updatedAt = Date.now();
        markConversationUnread(current.id);
        playConversationSound(current, "in");
        await persist();
        renderAll();
      }, delay);
      timers.push(timer);
    });
    const finishTimer = setTimeout(() => {
      const typers = typingNames.get(conversation.id);
      typers?.delete(chosen.id);
      if (!typers?.size) {
        typingNames.delete(conversation.id);
        replyTimers.delete(conversation.id);
      }
      if (activeConversationId === conversation.id) renderTyping();
    }, finalDelay + 500);
    timers.push(finishTimer);
    replyTimers.set(conversation.id, timers);
    return true;
  }

  async function sendCurrentMessage(assetId = "") {
    const conversation = conversationById(activeConversationId);
    if (!conversation || conversation.deletedAt || composerBusy) return;
    const text = clampText(els.messageInput.value, 4000);
    if (!text && !assetId) return;
    const message = {
      id: uid("message"),
      conversationId: conversation.id,
      senderId: "me",
      senderName: state.settings.meName || "我",
      text,
      assetId,
      quoteMessageId: pendingQuote?.id || "",
      quoteText: pendingQuote?.text || "",
      createdAt: Date.now(),
      deletedAt: null
    };
    state.messages.push(message);
    conversation.updatedAt = message.createdAt;
    els.messageInput.value = "";
    els.messageInput.style.height = "auto";
    setPendingQuote();
    await persist();
    renderAll();
    playConversationSound(conversation, "out");
    scheduleReplies(conversation, text);
  }

  function openComposerMenu() {
    if (composerBusy) return;
    openSheet("发点什么", `
      <div class="form-stack">
        <button class="setting-button" id="chooseChatImageBtn" type="button">发送图片</button>
        <button class="setting-button" id="createQuizBtn" type="button">出一份问卷</button>
        <p class="data-note">问卷由你写问题和2～6个选项，对方会在回复延迟后随机选一项。</p>
      </div>`);
    $("chooseChatImageBtn").addEventListener("click", async () => {
      await closeSheet();
      els.chatImageInput.value = "";
      els.chatImageInput.click();
    });
    $("createQuizBtn").addEventListener("click", openQuizForm);
  }

  function openQuizForm() {
    const conversation = conversationById(activeConversationId);
    if (!conversation || conversation.deletedAt) return;
    const candidates = conversation.participantIds.map(characterById).filter(character => character && !character.deletedAt);
    if (!candidates.length) {
      toast("这个会话里还没有能作答的角色");
      return;
    }
    const privatePerson = privateCharacter(conversation);
    openSheet("出一份问卷", `
      <form class="form-stack" id="quizForm">
        <label class="field"><span>问题</span><textarea id="quizQuestion" maxlength="500" required placeholder="你想问ta什么？"></textarea></label>
        <label class="field"><span>选项</span><textarea id="quizOptions" maxlength="606" required placeholder="一行一个选项，例如：&#10;想出去散步&#10;在家看电影&#10;先睡一觉"></textarea><small>一行一个，2～6项；重复选项会自动合并。</small></label>
        ${conversation.type === "group" ? `<label class="field"><span>谁来作答</span><select id="quizResponder"><option value="">随机一名成员</option>${candidates.map(character => `<option value="${esc(character.id)}">${esc(character.name)}</option>`).join("")}</select></label>` : `<p class="data-note">由 ${esc(privatePerson?.name || "对方")} 作答。</p>`}
        <div class="form-actions">
          <button class="small-button" id="cancelQuizBtn" type="button">取消</button>
          <button class="small-button primary" type="submit">发出问卷</button>
        </div>
      </form>`);
    $("cancelQuizBtn").addEventListener("click", closeSheet);
    $("quizForm").addEventListener("submit", async event => {
      event.preventDefault();
      const question = clampText($("quizQuestion").value, 500);
      const options = ZikaUtils.parseQuizOptions($("quizOptions").value);
      if (!question) {
        toast("先写上问题");
        return;
      }
      if (options.length < 2) {
        toast("至少写两个不同的选项");
        return;
      }
      const now = Date.now();
      const message = {
        id: uid("message"),
        conversationId: conversation.id,
        senderId: "me",
        senderName: state.settings.meName || "我",
        text: question,
        quiz: {
          options,
          responderId: conversation.type === "private" ? privatePerson.id : $("quizResponder").value,
          answer: "",
          answeredAt: null
        },
        assetId: "",
        createdAt: now,
        deletedAt: null
      };
      state.messages.push(message);
      conversation.updatedAt = now;
      await persist();
      await closeSheet();
      renderAll();
      scheduleQuizAnswer(message.id);
    });
  }

  function scheduleQuizAnswer(messageId) {
    const message = state.messages.find(item => item.id === messageId && !item.deletedAt);
    const conversation = message && conversationById(message.conversationId);
    if (!message?.quiz || message.quiz.answer || !conversation || conversation.deletedAt) return;
    const candidates = conversation.participantIds.map(characterById).filter(character => character && !character.deletedAt);
    const responder = candidates.find(character => character.id === message.quiz.responderId) || candidates[Math.floor(Math.random() * candidates.length)];
    if (!responder) return;
    const settings = ZikaUtils.normalizeReplySettings(conversation.replySettings);
    const delay = (settings.delayMin + Math.floor(Math.random() * (settings.delayMax - settings.delayMin + 1))) * 1000;
    const timer = setTimeout(async () => {
      quizTimers.delete(messageId);
      const current = state.messages.find(item => item.id === messageId && !item.deletedAt);
      const currentResponder = characterById(responder.id);
      if (!current?.quiz || current.quiz.answer || !currentResponder || currentResponder.deletedAt) return;
      current.quiz.responderId = responder.id;
      current.quiz.answer = current.quiz.options[Math.floor(Math.random() * current.quiz.options.length)];
      current.quiz.answeredAt = Date.now();
      const currentConversation = conversationById(current.conversationId);
      if (currentConversation) {
        currentConversation.updatedAt = Date.now();
        markConversationUnread(currentConversation.id);
      }
      await persist();
      renderAll();
    }, delay);
    quizTimers.set(messageId, timer);
  }

  function requestReply() {
    const conversation = conversationById(activeConversationId);
    if (!conversation || conversation.deletedAt || composerBusy) return;
    scheduleReplies(conversation, "");
  }

  function openReplySettings(conversationId) {
    const conversation = conversationById(conversationId);
    if (!conversation || conversation.deletedAt) return;
    const settings = ZikaUtils.normalizeReplySettings(conversation.replySettings);
    const isPrivate = conversation.type === "private";
    openSheet(isPrivate ? "回复与通话手感" : "回复手感", `
      <form class="form-stack" id="replySettingsForm">
        <p class="data-note">这套规则只用于「${esc(conversationTitle(conversation))}」。${isPrivate ? "发送消息、点击说话和主动私聊都会使用它。" : "发送消息和点击说话按钮都会使用它。"}</p>
        <div class="field-grid">
          <label class="field"><span>首条最短延迟（秒）</span><input id="replyDelayMin" type="number" min="0" max="300" step="1" value="${settings.delayMin}" required></label>
          <label class="field"><span>首条最长延迟（秒）</span><input id="replyDelayMax" type="number" min="0" max="300" step="1" value="${settings.delayMax}" required></label>
          <label class="field"><span>后续最短间隔（秒）</span><input id="replyGapMin" type="number" min="0" max="300" step="1" value="${settings.gapMin}" required></label>
          <label class="field"><span>后续最长间隔（秒）</span><input id="replyGapMax" type="number" min="0" max="300" step="1" value="${settings.gapMax}" required></label>
          <label class="field"><span>最少回复条数</span><input id="replyCountMin" type="number" min="1" max="10" step="1" value="${settings.countMin}" required></label>
          <label class="field"><span>最多回复条数</span><input id="replyCountMax" type="number" min="1" max="10" step="1" value="${settings.countMax}" required></label>
          ${isPrivate ? `<label class="field"><span>已读不回概率（%）</span><input id="replyIgnoreChance" type="number" min="0" max="100" step="1" value="${settings.ignoreChance}" required></label>` : `<label class="field"><span>每名成员回复概率（%）</span><input id="replyGroupReplyChance" type="number" min="0" max="100" step="1" value="${settings.groupReplyChance}" required><small>每名成员独立判定；@角色名必回。</small></label>`}
          <label class="field"><span>引用回复概率（%）</span><input id="replyQuoteChance" type="number" min="0" max="100" step="1" value="${settings.quoteChance}" required></label>
          <label class="field"><span>情绪／意图小注概率（%）</span><input id="replyNoteChance" type="number" min="0" max="100" step="1" value="${settings.noteChance}" required></label>
        </div>
        <label class="toggle-field"><input id="replyMergeCards" type="checkbox" ${settings.mergeCards ? "checked" : ""}><span><strong>多字卡回复</strong><small>开启后，每条回复按下面的概率抽多张字卡并拼成一条；它也是词典回复的总开关。</small></span></label>
        <div class="field-grid">
          <label class="field"><span>多字卡概率（%）</span><input id="replyMultiChance" type="number" min="0" max="100" step="1" value="${settings.multiChance}" required></label>
          <label class="field"><span>按标点拆句概率（%）</span><input id="replySplitChance" type="number" min="0" max="100" step="1" value="${settings.splitChance}" required></label>
          <label class="field"><span>每次最少字卡</span><input id="replyMultiMin" type="number" min="1" max="10" step="1" value="${settings.multiMin}" required></label>
          <label class="field"><span>每次最多字卡</span><input id="replyMultiMax" type="number" min="1" max="10" step="1" value="${settings.multiMax}" required></label>
        </div>
        <label class="toggle-field"><input id="replySplitCards" type="checkbox" ${settings.splitCards ? "checked" : ""}><span><strong>按自然标点拆开长字卡</strong><small>只在句号、逗号、分号、省略号和换行等边界拆句，保持各句原有顺序，不从词语中间切断。</small></span></label>
        <label class="toggle-field"><input id="replyRandomPunctuation" type="checkbox" ${settings.randomPunctuation ? "checked" : ""}><span><strong>随机拼接符号</strong><small>没有句尾标点的片段之间随机使用逗号、省略号、波浪号或空格；已有标点会保留，不重复叠加。</small></span></label>
        <div class="field-grid">
          <label class="field"><span>词典触发概率（%）</span><input id="replyDictionaryChance" type="number" min="0" max="100" step="1" value="${settings.dictionaryChance}" required></label>
          <span></span>
          <label class="field"><span>词典最少抽取</span><input id="replyDictionaryMin" type="number" min="1" max="10" step="1" value="${settings.dictionaryMin}" required></label>
          <label class="field"><span>词典最多抽取</span><input id="replyDictionaryMax" type="number" min="1" max="10" step="1" value="${settings.dictionaryMax}" required></label>
        </div>
        <label class="toggle-field"><input id="replyDictionaryMixShort" type="checkbox" ${settings.dictionaryMixShort ? "checked" : ""}><span><strong>词典混入短字卡</strong><small>按 mochi 的规则，混入 2～26 字且至少两个汉字的启用字卡；emoji、图片和其他媒体不会混入。关闭多字卡回复时，词典也停用。</small></span></label>
        <label class="toggle-field"><input id="replyDictionarySingle" type="checkbox" ${settings.dictionarySingle ? "checked" : ""}><span><strong>词典单气泡拼字</strong><small>把抽中的词条拼进同一条消息，显示「词典拼词」或「词典拼句」。</small></span></label>
        <label class="toggle-field"><input id="replyDictionaryMulti" type="checkbox" ${settings.dictionaryMulti ? "checked" : ""}><span><strong>词典逐卡连发</strong><small>每张词条单独发一条，显示「词典」与「词典逐卡连发」。两种形态都开启时，80% 单气泡、20% 逐卡连发。</small></span></label>
        <div class="field-grid">
          <label class="field"><span>emoji 后缀概率（%）</span><input id="replyEmojiChance" type="number" min="0" max="100" step="1" value="${settings.emojiChance}" required></label>
          <label class="field"><span>表情包概率（%）</span><input id="replyStickerChance" type="number" min="0" max="100" step="1" value="${settings.stickerChance}" required></label>
          <label class="field"><span>图片概率（%）</span><input id="replyImageChance" type="number" min="0" max="100" step="1" value="${settings.imageChance}" required></label>
          <span></span>
        </div>
        <label class="toggle-field"><input id="replyMediaCaption" type="checkbox" ${settings.mediaCaption ? "checked" : ""}><span><strong>图片与表情包可以带配文</strong><small>开启后从当前角色的字卡里抽一句作为配文；关闭时只发图片或表情包。图片概率先于表情包判定。</small></span></label>
        ${isPrivate ? `<div class="field-grid"><label class="field"><span>主动消息概率（%）</span><input id="replyProactiveChance" type="number" min="0" max="100" step="1" value="${settings.proactiveChance}" required></label>
        <label class="field"><span>知识推送概率（%）</span><input id="replyKnowledgeChance" type="number" min="0" max="100" step="1" value="${settings.knowledgeChance}" required></label></div>
        <p class="data-note">私聊角色每隔 60～180 分钟判定一次，默认 35% 概率主动开口；0% 关闭。主动开口后再按知识推送概率决定发普通主动消息还是复习一张知识字卡，默认 20%，0% 关闭。主动消息不会引用旧话，正在回复或通话时会稍后再试。</p>
        <div class="field-grid">
          <label class="field"><span>主动来电概率（%）</span><input id="replyCallIncomingChance" type="number" min="0" max="100" step="1" value="${settings.callIncomingChance}" required></label>
          <label class="field"><span>对方主动挂断概率（%）</span><input id="replyCallAutoHangupChance" type="number" min="0" max="100" step="1" value="${settings.callAutoHangupChance}" required></label>
        </div>
        <p class="data-note">来电按私聊独立调度，语音与视频都可能出现；0% 关闭主动来电。接通满 3 分钟后，每分钟按挂断概率判定一次，0% 表示对方不会主动挂断。</p>` : ""}
        <p class="data-note">每条回复独立判定是否触发词典，词条不重复；只使用当前角色可用的公用与专属词条。普通单字卡不显示来源，实际拼入至少两张字卡时才显示「多字卡回复」。两种词典形态都关闭时，词典不参与回复。</p>
        <label class="field"><span>正在输入的文案</span><input id="replyTypingText" maxlength="30" value="${esc(settings.typingText)}" placeholder="正在输入…"><small>引用从近十条文字消息中挑选；小注从预设库随机抽取，概率为0%即关闭。</small></label>
        <div class="form-actions">
          <button class="small-button" id="cancelReplySettingsBtn" type="button">取消</button>
          <button class="small-button primary" type="submit">保存这套手感</button>
        </div>
      </form>`);
    $("cancelReplySettingsBtn").addEventListener("click", closeSheet);
    $("replySettingsForm").addEventListener("submit", async event => {
      event.preventDefault();
      conversation.replySettings = ZikaUtils.normalizeReplySettings({
        delayMin: $("replyDelayMin").value,
        delayMax: $("replyDelayMax").value,
        gapMin: $("replyGapMin").value,
        gapMax: $("replyGapMax").value,
        countMin: $("replyCountMin").value,
        countMax: $("replyCountMax").value,
        ignoreChance: isPrivate ? $("replyIgnoreChance").value : settings.ignoreChance,
        groupReplyChance: isPrivate ? settings.groupReplyChance : $("replyGroupReplyChance").value,
        quoteChance: $("replyQuoteChance").value,
        noteChance: $("replyNoteChance").value,
        mergeCards: $("replyMergeCards").checked,
        multiChance: $("replyMultiChance").value,
        multiMin: $("replyMultiMin").value,
        multiMax: $("replyMultiMax").value,
        splitCards: $("replySplitCards").checked,
        splitChance: $("replySplitChance").value,
        randomPunctuation: $("replyRandomPunctuation").checked,
        dictionaryChance: $("replyDictionaryChance").value,
        dictionaryMin: $("replyDictionaryMin").value,
        dictionaryMax: $("replyDictionaryMax").value,
        dictionaryMixShort: $("replyDictionaryMixShort").checked,
        dictionarySingle: $("replyDictionarySingle").checked,
        dictionaryMulti: $("replyDictionaryMulti").checked,
        emojiChance: $("replyEmojiChance").value,
        stickerChance: $("replyStickerChance").value,
        imageChance: $("replyImageChance").value,
        mediaCaption: $("replyMediaCaption").checked,
        proactiveChance: isPrivate ? $("replyProactiveChance").value : settings.proactiveChance,
        knowledgeChance: isPrivate ? $("replyKnowledgeChance").value : settings.knowledgeChance,
        callIncomingChance: isPrivate ? $("replyCallIncomingChance").value : settings.callIncomingChance,
        callAutoHangupChance: isPrivate ? $("replyCallAutoHangupChance").value : settings.callAutoHangupChance,
        typingText: $("replyTypingText").value
      });
      cancelReplyJob(conversation.id);
      await persist();
      await closeSheet();
      renderAll();
      toast("这个会话的回复手感已经保存");
    });
  }

  function openConversationMenu() {
    const conversation = conversationById(activeConversationId);
    if (!conversation) return;
    const character = privateCharacter(conversation);
    openSheet("会话设置", `
      <div class="import-summary"><strong>${esc(conversationTitle(conversation))}</strong><br>${conversation.type === "group" ? `${conversation.participantIds.length} 名成员` : "私聊"} · ${state.messages.filter(item => item.conversationId === conversation.id && !item.deletedAt).length} 条消息</div>
      <div class="form-stack" style="margin-top:14px">
        ${conversation.type === "group" ? '<button class="setting-button" id="editGroupFromMenuBtn" type="button">编辑群名和成员</button>' : '<button class="setting-button" id="editCharacterFromMenuBtn" type="button">编辑这个角色</button>'}
        <button class="setting-button" id="replySettingsBtn" type="button">${conversation.type === "group" ? "回复手感：延迟、连句与词典" : "回复与通话：主动消息、来电与挂断"}</button>
        ${conversation.type === "private" ? '<button class="setting-button" id="callHistoryBtn" type="button">这个会话的通话记录与统计</button>' : ""}
        <button class="setting-button" id="clearConversationMessagesBtn" type="button">一键清空这个会话的聊天记录</button>
        <button class="danger-button" id="deleteConversationFromMenuBtn" type="button">把这个会话放进回收站</button>
      </div>`);
    if (conversation.type === "group") $("editGroupFromMenuBtn").addEventListener("click", () => openGroupForm(conversation.id));
    else $("editCharacterFromMenuBtn").addEventListener("click", () => openCharacterForm(character.id));
    $("replySettingsBtn").addEventListener("click", () => openReplySettings(conversation.id));
    if (conversation.type === "private") $("callHistoryBtn").addEventListener("click", () => openCallStats(conversation.id));
    $("clearConversationMessagesBtn").addEventListener("click", async () => {
      await closeSheet();
      await clearConversationMessages(conversation.id);
    });
    $("deleteConversationFromMenuBtn").addEventListener("click", async () => {
      await closeSheet();
      await deleteConversation(conversation.id);
    });
  }

  async function openImage(assetId) {
    const url = await getAssetURL(assetId);
    if (!url) {
      toast("没有找到这张图片，可以检查备份或快照");
      return;
    }
    els.viewerImage.src = url;
    els.imageViewer.hidden = false;
  }

  function closeImageViewer() {
    els.imageViewer.hidden = true;
    els.viewerImage.removeAttribute("src");
  }

  function autoResizeComposer() {
    els.messageInput.style.height = "auto";
    els.messageInput.style.height = `${Math.min(112, els.messageInput.scrollHeight)}px`;
  }

  function bindEvents() {
    document.addEventListener("click", async event => {
      const target = event.target;
      const nav = target.closest("[data-nav]");
      if (nav) {
        navigate(nav.dataset.nav);
        return;
      }
      const action = target.closest("[data-action]");
      if (action) {
        if (action.dataset.action === "new-character") openCharacterForm();
        else if (action.dataset.action === "new-group") openGroupForm();
        else if (action.dataset.action === "batch-cards") openBatchCards();
        else if (action.dataset.action === "new-knowledge") openKnowledgeCardForm();
        else if (action.dataset.action === "new-moment") openMomentComposer();
        else if (action.dataset.action === "new-letter") openLetterComposer();
        return;
      }
      const conversationButton = target.closest("[data-conversation-id]");
      if (conversationButton) {
        openConversation(conversationButton.dataset.conversationId);
        return;
      }
      const chatCharacter = target.closest("[data-chat-character]");
      if (chatCharacter) {
        await openCharacterChat(chatCharacter.dataset.chatCharacter);
        return;
      }
      const editCharacter = target.closest("[data-edit-character]");
      if (editCharacter) {
        openCharacterForm(editCharacter.dataset.editCharacter);
        return;
      }
      const renameGroupButton = target.closest("[data-rename-group]");
      if (renameGroupButton) {
        openRenameGroup(renameGroupButton.dataset.renameGroup);
        return;
      }
      const batchGroupButton = target.closest("[data-batch-group]");
      if (batchGroupButton) {
        const [owner, group] = JSON.parse(batchGroupButton.dataset.batchGroup);
        openBatchCards({ owner, group });
        return;
      }
      const collapseButton = target.closest("[data-collapse-type]");
      if (collapseButton) {
        await toggleCardCollapse(collapseButton.dataset.collapseType, collapseButton.dataset.collapseKey);
        return;
      }
      const groupListButton = target.closest("[data-toggle-group-list]");
      if (groupListButton) {
        const key = groupListButton.dataset.toggleGroupList;
        if (compactOpenGroups.has(key)) compactOpenGroups.delete(key);
        else compactOpenGroups.add(key);
        renderCards();
        return;
      }
      const cardText = target.closest("[data-expand-card-text]");
      if (cardText) {
        cardText.classList.toggle("is-expanded");
        return;
      }
      const toggleCardButton = target.closest("[data-toggle-card-enabled]");
      if (toggleCardButton) {
        const card = state.cards.find(item => item.id === toggleCardButton.dataset.toggleCardEnabled && !item.deletedAt);
        if (card) await changeCardsEnabled([card], !isCardEnabled(card));
        return;
      }
      const editCard = target.closest("[data-edit-card]");
      if (editCard) {
        openCardForm(editCard.dataset.editCard);
        return;
      }
      const deleteCardButton = target.closest("[data-delete-card]");
      if (deleteCardButton) {
        await deleteCard(deleteCardButton.dataset.deleteCard);
        return;
      }
      const restoreTrashButton = target.closest("[data-restore-trash]");
      if (restoreTrashButton) {
        await restoreTrash(restoreTrashButton.dataset.restoreTrash);
        return;
      }
      const purgeTrashButton = target.closest("[data-purge-trash]");
      if (purgeTrashButton) {
        await purgeTrash(purgeTrashButton.dataset.purgeTrash);
        return;
      }
      const restoreSnapshotButton = target.closest("[data-restore-snapshot]");
      if (restoreSnapshotButton) {
        await restoreSnapshotById(restoreSnapshotButton.dataset.restoreSnapshot);
        return;
      }
      const quoteMessageButton = target.closest("[data-quote-message]");
      if (quoteMessageButton) {
        const message = state.messages.find(item => item.id === quoteMessageButton.dataset.quoteMessage && !item.deletedAt);
        if (message) setPendingQuote(message);
        return;
      }
      const saveMessageButton = target.closest("[data-save-message]");
      if (saveMessageButton) {
        saveMessageToCard(saveMessageButton.dataset.saveMessage);
        return;
      }
      const deleteMessageButton = target.closest("[data-delete-message]");
      if (deleteMessageButton) {
        await deleteMessage(deleteMessageButton.dataset.deleteMessage);
        return;
      }
      const likeMomentButton = target.closest("[data-like-moment]");
      if (likeMomentButton) {
        await toggleMomentLike(likeMomentButton.dataset.likeMoment, "me");
        return;
      }
      const replyCommentButton = target.closest("[data-reply-comment]");
      if (replyCommentButton) {
        const input = els.momentList.querySelector(`[data-comment-input="${CSS.escape(replyCommentButton.dataset.replyComment)}"]`);
        if (input) {
          input.dataset.replyTo = replyCommentButton.dataset.commentAuthor;
          input.placeholder = "回复这条评论…";
          input.focus();
        }
        return;
      }
      const deleteMomentButton = target.closest("[data-delete-moment]");
      if (deleteMomentButton) {
        await deleteMoment(deleteMomentButton.dataset.deleteMoment);
        return;
      }
      const openKnowledgeButton = target.closest("[data-open-knowledge]");
      if (openKnowledgeButton) {
        openKnowledgeMessage(openKnowledgeButton.dataset.openKnowledge);
        return;
      }
      const openMomentButton = target.closest("[data-open-moment]");
      if (openMomentButton) {
        openMomentById(openMomentButton.dataset.openMoment);
        return;
      }
      const openLetterButton = target.closest("[data-open-letter]");
      if (openLetterButton) {
        openLetterById(openLetterButton.dataset.openLetter);
        return;
      }
      const deleteLetterButton = target.closest("[data-delete-letter]");
      if (deleteLetterButton) {
        await deleteLetter(deleteLetterButton.dataset.deleteLetter);
        return;
      }
      const viewLetterButton = target.closest("[data-view-letter]");
      if (viewLetterButton) {
        openLetterById(viewLetterButton.dataset.viewLetter);
        return;
      }
      const imageButton = target.closest("[data-view-image]");
      if (imageButton) await openImage(imageButton.dataset.viewImage);
    });

    document.addEventListener("submit", async event => {
      const form = event.target.closest("[data-comment-form]");
      if (!form) return;
      event.preventDefault();
      const momentId = form.dataset.commentForm;
      const input = form.querySelector("[data-comment-input]");
      const text = clampText(input.value, 500);
      if (!text) {
        toast("先写一句评论");
        return;
      }
      const replyTo = input.dataset.replyTo || null;
      input.value = "";
      delete input.dataset.replyTo;
      await addMomentComment(momentId, "me", text, replyTo);
    });

    $("newCharacterBtn").addEventListener("click", () => openCharacterForm());
    $("newGroupBtn").addEventListener("click", () => openGroupForm());
    $("newMomentBtn").addEventListener("click", openMomentComposer);
    $("newLetterBtn").addEventListener("click", openLetterComposer);
    els.letterDirectionFilter.addEventListener("change", renderLetters);
    els.letterCharacterFilter.addEventListener("change", renderLetters);
    $("newCardBtn").addEventListener("click", () => openCardForm());
    $("batchCardsBtn").addEventListener("click", openBatchCards);
    $("cardToolsBtn").addEventListener("click", openCardTools);
    $("presetLibraryBtn").addEventListener("click", openPresetLibrary);
    $("cardDensityBtn").addEventListener("click", async () => {
      state.settings.libraryCompact = state.settings.libraryCompact === false;
      compactOpenGroups.clear();
      await persist();
      renderCards();
    });
    $("collapseAllCardsBtn").addEventListener("click", toggleAllCardOwners);
    $("soundSettingsBtn").addEventListener("click", openSoundSettings);
    document.querySelectorAll("[data-library-kind]").forEach(button => {
      button.addEventListener("click", () => {
        libraryKind = ["card", "dictionary", "emoji", "sticker", "image", "knowledge"].includes(button.dataset.libraryKind) ? button.dataset.libraryKind : "card";
        renderCards();
      });
    });
    $("editProfileBtn").addEventListener("click", openProfileForm);
    $("homeTrashBtn").addEventListener("click", openTrash);
    $("trashBtn").addEventListener("click", openTrash);
    $("snapshotsBtn").addEventListener("click", openSnapshots);
    $("exportBtn").addEventListener("click", exportBackup);
    $("importBtn").addEventListener("click", () => {
      els.importInput.value = "";
      els.importInput.click();
    });
    $("clearAllBtn").addEventListener("click", clearAll);
    els.storagePersistBtn.addEventListener("click", requestPersistentStorage);
    $("homeWallpaperBtn").addEventListener("click", () => {
      els.wallpaperInput.value = "";
      els.wallpaperInput.click();
    });
    $("changeFontBtn").addEventListener("click", () => {
      els.fontInput.value = "";
      els.fontInput.click();
    });
    $("resetFontBtn").addEventListener("click", async () => {
      const previousId = state.settings.fontAssetId;
      if (!previousId) {
        toast("现在就是系统默认字体");
        return;
      }
      state.settings.fontAssetId = "";
      state.settings.fontName = "";
      await persist();
      await applyCustomFont();
      const url = assetUrls.get(previousId);
      if (url) URL.revokeObjectURL(url);
      assetUrls.delete(previousId);
      await ZikaDB.deleteAsset(previousId);
      toast("已经恢复系统默认字体");
    });
    $("changeWallpaperBtn").addEventListener("click", () => {
      els.wallpaperInput.value = "";
      els.wallpaperInput.click();
    });
    $("resetWallpaperBtn").addEventListener("click", async () => {
      if (!state.settings.wallpaperId) {
        toast("现在就是默认壁纸");
        return;
      }
      state.settings.wallpaperId = "";
      await persist();
      applyWallpaper();
      toast("已经恢复默认壁纸");
    });
    document.querySelectorAll("[data-theme-value]").forEach(button => {
      button.addEventListener("click", async () => {
        state.settings.theme = button.dataset.themeValue;
        await persist();
        applyTheme();
      });
    });
    document.querySelectorAll("[data-bubble-value]").forEach(button => {
      button.addEventListener("click", async () => {
        state.settings.bubbleStyle = button.dataset.bubbleValue;
        await persist();
        applyTheme();
      });
    });
    $("customBubbleCss").addEventListener("input", event => {
      state.settings.customBubbleCss = event.target.value;
      if (state.settings.bubbleStyle === "custom") $("customBubbleStyle").textContent = state.settings.customBubbleCss;
    });
    $("saveCustomBubbleCssBtn").addEventListener("click", async () => {
      state.settings.bubbleStyle = "custom";
      state.settings.customBubbleCss = $("customBubbleCss").value;
      await persist();
      applyTheme();
      toast("气泡 CSS 已保存，去消息里看看效果吧");
    });

    document.addEventListener("change", async event => {
      const gate = event.target.closest("[data-card-gate]");
      if (!gate) return;
      const type = gate.dataset.cardGate;
      const key = gate.dataset.gateKey;
      let cards = [];
      if (type === "owner") {
        cards = activeLibraryCards().filter(card => cardOwnerKey(card) === key);
      } else {
        const [owner, group] = JSON.parse(key);
        cards = activeLibraryCards().filter(card => cardOwnerKey(card) === owner && (card.group || "默认") === group);
      }
      await changeCardsEnabled(cards, gate.checked);
    });

    els.cardSearch.addEventListener("input", renderCards);
    els.cardOwnerFilter.addEventListener("change", renderCards);
    els.cardGroupFilter.addEventListener("change", renderCards);
    $("backFromChatBtn").addEventListener("click", () => {
      closeConversation();
      navigate("chats");
    });
    $("conversationMenuBtn").addEventListener("click", openConversationMenu);
    $("voiceCallBtn").addEventListener("click", () => startCall("voice"));
    $("videoCallBtn").addEventListener("click", () => startCall("video"));
    $("callHangupBtn").addEventListener("click", endActiveCallByUser);
    $("callMinimizeBtn").addEventListener("click", () => setCallMinimized(true));
    $("callExpandBtn").addEventListener("click", () => {
      if (!suppressCallExpandClick) setCallMinimized(false);
    });
    $("callExpandBtn").addEventListener("pointerdown", beginCallDrag);
    $("callExpandBtn").addEventListener("pointermove", moveCallDrag);
    $("callExpandBtn").addEventListener("pointerup", endCallDrag);
    $("callExpandBtn").addEventListener("pointercancel", endCallDrag);
    window.addEventListener("resize", applyCallMiniPosition);
    $("answerCallBtn").addEventListener("click", answerIncomingCall);
    $("rejectCallBtn").addEventListener("click", () => finishCall("rejected"));
    $("callStatsBtn").addEventListener("click", () => openCallStats());
    els.composerForm.addEventListener("submit", event => {
      event.preventDefault();
      sendCurrentMessage();
    });
    els.talkBtn.addEventListener("click", requestReply);
    $("clearQuoteBtn").addEventListener("click", () => setPendingQuote());
    els.messageInput.addEventListener("input", autoResizeComposer);
    els.messageInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendCurrentMessage();
      }
    });
    els.chatImageBtn.addEventListener("click", openComposerMenu);

    els.avatarInput.addEventListener("change", async () => {
      const file = els.avatarInput.files[0];
      const callback = avatarCallback;
      avatarCallback = null;
      if (!file) return;
      try {
        const id = await saveImage(file, "avatar");
        if (callback) callback(id);
        else await ZikaDB.deleteAsset(id);
      } catch (error) {
        toast(error.message, 3400);
      } finally {
        els.avatarInput.value = "";
      }
    });

    els.wallpaperInput.addEventListener("change", async () => {
      const file = els.wallpaperInput.files[0];
      if (!file) return;
      try {
        const id = await saveImage(file, "wallpaper");
        state.settings.wallpaperId = id;
        await persist();
        applyWallpaper();
        toast("桌面壁纸已经换好");
      } catch (error) {
        toast(error.message, 3400);
      } finally {
        els.wallpaperInput.value = "";
      }
    });

    els.fontInput.addEventListener("change", async () => {
      const file = els.fontInput.files[0];
      if (!file) return;
      const previousId = state.settings.fontAssetId;
      const previousName = state.settings.fontName;
      let newId = "";
      let saved = false;
      try {
        newId = await saveFont(file);
        state.settings.fontAssetId = newId;
        state.settings.fontName = String(file.name || "已上传字体").slice(0, 120);
        if (!await applyCustomFont()) throw new Error("字体文件无法读取，请确认文件没有损坏");
        await persist();
        saved = true;
      } catch (error) {
        state.settings.fontAssetId = previousId;
        state.settings.fontName = previousName;
        await applyCustomFont();
        if (newId) await ZikaDB.deleteAsset(newId);
        toast(`字体没有换上：${error.message}`, 3600);
      } finally {
        els.fontInput.value = "";
      }
      if (!saved) return;
      if (previousId && previousId !== newId) {
        const url = assetUrls.get(previousId);
        if (url) URL.revokeObjectURL(url);
        assetUrls.delete(previousId);
        await ZikaDB.deleteAsset(previousId);
      }
      toast("字体已经换好，并会随完整备份一起保存");
    });

    els.chatImageInput.addEventListener("change", async () => {
      const file = els.chatImageInput.files[0];
      if (!file) return;
      setComposerBusy(true);
      try {
        const id = await saveImage(file, "chat");
        setComposerBusy(false);
        await sendCurrentMessage(id);
      } catch (error) {
        toast(`图片没有发出去：${error.message}`, 3600);
      } finally {
        setComposerBusy(false);
        els.chatImageInput.value = "";
      }
    });

    els.socialImageInput.addEventListener("change", async () => {
      const file = els.socialImageInput.files[0];
      const callback = socialImageCallback;
      socialImageCallback = null;
      if (!file) return;
      try {
        const id = await saveImage(file, socialImageKind);
        if (callback) callback(id);
        else await ZikaDB.deleteAsset(id);
      } catch (error) {
        toast(error.message, 3400);
      } finally {
        els.socialImageInput.value = "";
      }
    });

    els.libraryImageInput.addEventListener("change", () => {
      const files = [...els.libraryImageInput.files];
      pendingLibraryImages = files.slice(0, 30);
      const note = $("imageCardFileNote");
      if (note) {
        const names = pendingLibraryImages.slice(0, 3).map(file => file.name).join("、");
        note.textContent = pendingLibraryImages.length
          ? `已选 ${pendingLibraryImages.length} 张：${names}${pendingLibraryImages.length > 3 ? "…" : ""}`
          : "还没有选择图片";
      }
      if (files.length > 30) toast("一次最多添加 30 张，已先选前 30 张");
      els.libraryImageInput.value = "";
    });

    els.importInput.addEventListener("change", async () => {
      const file = els.importInput.files[0];
      if (!file) return;
      try {
        if (file.size > 150 * 1024 * 1024) throw new Error("备份超过 150MB，请先联系哥哥处理大文件");
        const data = validateBackup(JSON.parse(await file.text()));
        openImportDialog(data);
      } catch (error) {
        toast(`备份读取失败：${error.message}`, 4000);
      } finally {
        els.importInput.value = "";
      }
    });

    els.textImportInput.addEventListener("change", async () => {
      const file = els.textImportInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const textarea = $("batchCardText");
        if (!textarea) throw new Error("批量导入窗口已经关闭了");
        textarea.value = text;
        toast(`已读入 ${file.name}，检查后再开始导入`);
      } catch (error) {
        toast(error.message, 3400);
      } finally {
        els.textImportInput.value = "";
      }
    });

    $("closeSheetBtn").addEventListener("click", closeSheet);
    $("modalBackdrop").addEventListener("click", closeSheet);
    els.confirmCancelBtn.addEventListener("click", () => settleConfirm(false));
    els.confirmOkBtn.addEventListener("click", () => settleConfirm(true));
    $("closeViewerBtn").addEventListener("click", closeImageViewer);
    els.imageViewer.addEventListener("click", event => {
      if (event.target === els.imageViewer) closeImageViewer();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!els.confirmLayer.hidden) settleConfirm(false);
      else if (!els.callView.hidden) endActiveCallByUser();
      else if (!els.imageViewer.hidden) closeImageViewer();
      else if (!els.modalLayer.hidden) closeSheet();
      else if (!els.conversationView.hidden) closeConversation();
    });
    document.addEventListener("visibilitychange", updateClock);
  }

  async function init() {
    bindEvents();
    updateClock();
    setInterval(updateClock, 30000);
    setInterval(() => {
      if (!state) return;
      renderCharacters();
      if (activeConversationId && !els.conversationView.hidden) renderConversation();
    }, 60000);
    try {
      state = await ZikaDB.init();
      await clearLegacyCallHistory();
      await recoverInterruptedCalls();
      renderAll();
      navigate("home");
      startSocialScheduler();
      startCallScheduler();
      els.loadingScreen.hidden = true;
    } catch (error) {
      els.loadingScreen.innerHTML = `<span class="loading-logo"><span class="icon icon-phone" aria-hidden="true"></span></span><strong>小手机暂时没有打开</strong><span>${esc(error.message || "本地数据库初始化失败")}</span><button class="small-button primary" id="reloadAppBtn" type="button">重新打开</button>`;
      $("reloadAppBtn").addEventListener("click", () => location.reload());
    }
  }

  init();
})();
