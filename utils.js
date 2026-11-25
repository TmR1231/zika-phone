"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ZikaUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseCardLines(input, fallbackGroup = "默认") {
    const fallback = String(fallbackGroup || "默认").trim().slice(0, 20) || "默认";
    let currentGroup = fallback;
    const entries = [];
    for (const rawLine of String(input || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^【([^【】]+)】(.*)$/);
      if (!match) {
        entries.push({ group: currentGroup, text: line.slice(0, 4000) });
        continue;
      }
      const group = match[1].trim().slice(0, 20);
      if (group) currentGroup = group;
      const text = match[2].trim();
      if (text) entries.push({ group: currentGroup, text: text.slice(0, 4000) });
    }
    return entries;
  }

  function selectDailyCard(cards, saved, dateKey, random = Math.random) {
    if (saved && saved.date === dateKey && typeof saved.text === "string" && saved.text) return saved;
    if (!Array.isArray(cards) || !cards.length) return null;
    const index = Math.min(cards.length - 1, Math.floor(random() * cards.length));
    const card = cards[index];
    return { date: dateKey, cardId: card.id, text: card.text };
  }

  function normalizeReplySettings(value) {
    const input = value && typeof value === "object" ? value : {};
    const number = (candidate, fallback, min, max) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
    };
    let delayMin = number(input.delayMin, 1, 0, 300);
    let delayMax = number(input.delayMax, 40, 0, 300);
    let gapMin = number(input.gapMin, 1, 0, 300);
    let gapMax = number(input.gapMax, 3, 0, 300);
    let countMin = number(input.countMin, 1, 1, 10);
    let countMax = number(input.countMax, 2, 1, 10);
    let multiMin = number(input.multiMin, 2, 1, 10);
    let multiMax = number(input.multiMax, 5, 1, 10);
    let dictionaryMin = number(input.dictionaryMin, 2, 1, 10);
    let dictionaryMax = number(input.dictionaryMax, 5, 1, 10);
    if (delayMin > delayMax) [delayMin, delayMax] = [delayMax, delayMin];
    if (gapMin > gapMax) [gapMin, gapMax] = [gapMax, gapMin];
    if (countMin > countMax) [countMin, countMax] = [countMax, countMin];
    if (multiMin > multiMax) [multiMin, multiMax] = [multiMax, multiMin];
    if (dictionaryMin > dictionaryMax) [dictionaryMin, dictionaryMax] = [dictionaryMax, dictionaryMin];
    return {
      delayMin,
      delayMax,
      gapMin,
      gapMax,
      countMin,
      countMax,
      ignoreChance: number(input.ignoreChance, 20, 0, 100),
      groupReplyChance: number(input.groupReplyChance, 45, 0, 100),
      quoteChance: number(input.quoteChance, 30, 0, 100),
      noteChance: number(input.noteChance, 35, 0, 100),
      mergeCards: input.mergeCards === undefined ? true : input.mergeCards === true,
      multiChance: number(input.multiChance, 50, 0, 100),
      multiMin,
      multiMax,
      splitCards: input.splitCards === undefined ? true : input.splitCards === true,
      splitChance: number(input.splitChance, 65, 0, 100),
      randomPunctuation: input.randomPunctuation === undefined ? true : input.randomPunctuation === true,
      dictionaryChance: number(input.dictionaryChance, 25, 0, 100),
      dictionaryMin,
      dictionaryMax,
      dictionaryMixShort: input.dictionaryMixShort === undefined ? true : input.dictionaryMixShort === true,
      dictionarySingle: input.dictionarySingle === undefined ? true : input.dictionarySingle === true,
      dictionaryMulti: input.dictionaryMulti === undefined ? true : input.dictionaryMulti === true,
      emojiChance: number(input.emojiChance, 15, 0, 100),
      stickerChance: number(input.stickerChance, 10, 0, 100),
      imageChance: number(input.imageChance, 5, 0, 100),
      mediaCaption: input.mediaCaption === undefined ? true : input.mediaCaption === true,
      proactiveChance: number(input.proactiveChance, 35, 0, 100),
      knowledgeChance: number(input.knowledgeChance, 20, 0, 100),
      callIncomingChance: number(input.callIncomingChance, 15, 0, 100),
      callAutoHangupChance: number(input.callAutoHangupChance, 2, 0, 100),
      typingText: String(input.typingText || "正在输入…").trim().slice(0, 30) || "正在输入…"
    };
  }

  function joinCardTexts(texts, random = Math.random) {
    const separators = ["，", "……", "～", " "];
    return texts.map(text => String(text || "").trim()).filter(Boolean).reduce((result, text) => {
      if (!result) return text;
      const separator = /[。！？!?…～~]$/.test(result) ? " " : separators[Math.floor(random() * separators.length)];
      return result + separator + text;
    }, "");
  }

  function splitReplyText(text) {
    const value = String(text || "").trim();
    if (!value) return [];
    return (value.match(/[^。！？!?；;，,\r\n…]+(?:[…]+|[。！？!?；;，,]+|\r?\n+|$)/g) || [value])
      .map(part => part.trim())
      .filter(Boolean);
  }

  function composeReplyText(texts, options = {}, random = Math.random) {
    const splitCards = options.splitCards !== false;
    const splitChance = Math.max(0, Math.min(100, Number(options.splitChance ?? 65)));
    const randomPunctuation = options.randomPunctuation !== false;
    const separators = ["，", "……", "～", " "];
    const parts = [];
    for (const value of texts || []) {
      const text = String(value || "").trim();
      if (!text) continue;
      const shouldSplit = splitCards && random() * 100 < splitChance;
      parts.push(...(shouldSplit ? splitReplyText(text) : [text]));
    }
    return parts.reduce((result, part) => {
      if (!result) return part;
      if (/[，,；;：:]$/.test(result)) return result + part;
      if (/[。！？!?…～~]$/.test(result)) return `${result} ${part}`;
      const separator = randomPunctuation ? separators[Math.floor(random() * separators.length)] : " ";
      return result + separator + part;
    }, "");
  }

  function cardsToTxt(cards) {
    const groups = new Map();
    for (const card of cards) {
      const group = String(card.group || "默认");
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(String(card.text || ""));
    }
    return [...groups.entries()].map(([group, texts]) => `【${group}】\n${texts.join("\n")}`).join("\n\n");
  }

  function parseQuizOptions(input) {
    const seen = new Set();
    const options = [];
    for (const line of String(input || "").split(/\r?\n/)) {
      const text = line.trim().slice(0, 100);
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      options.push(text);
      if (options.length === 6) break;
    }
    return options;
  }

  function parsePlainCardLines(input, maxLength = 4000) {
    const seen = new Set();
    const entries = [];
    for (const line of String(input || "").split(/\r?\n/)) {
      const text = line.trim().slice(0, maxLength);
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      entries.push(text);
    }
    return entries;
  }

  function parseDictionaryLines(input) {
    const seen = new Set();
    const entries = [];
    for (const line of String(input || "").split(/\r?\n/)) {
      const text = line.trim().slice(0, 60);
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      entries.push(text);
      if (entries.length === 500) break;
    }
    return entries;
  }

  function isEmojiText(value) {
    const text = String(value || "").trim();
    if (!text || text.length > 24) return false;
    if (/^[#*0-9]\uFE0F?\u20E3$/.test(text)) return true;
    if (/[a-zA-Z0-9\u4e00-\u9fff]/.test(text)) return false;
    return /\p{Extended_Pictographic}/u.test(text);
  }

  function shortDictionaryTexts(cards) {
    const seen = new Set();
    const texts = [];
    for (const card of cards || []) {
      const text = String(card && card.text || "").trim();
      if (text.length < 2 || text.length > 26 || text.includes("|||") || text.startsWith("data:")) continue;
      if (/[\uD800-\uDBFF]/.test(text)) continue;
      if ((text.match(/[\u4e00-\u9fff]/g) || []).length < 2) continue;
      const key = text.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      texts.push(text);
    }
    return texts;
  }

  function pickDictionaryEntries(entries, min = 2, max = 5, random = Math.random) {
    const pool = [...new Set(entries.map(entry => String(entry || "").trim()).filter(Boolean))];
    if (!pool.length) return [];
    for (let index = pool.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [pool[index], pool[other]] = [pool[other], pool[index]];
    }
    const lower = Math.max(1, Math.min(10, Math.round(min)));
    const upper = Math.max(lower, Math.min(10, Math.round(max)));
    const want = Math.min(pool.length, lower + Math.floor(random() * (upper - lower + 1)));
    return pool.slice(0, want);
  }

  return { parseCardLines, parsePlainCardLines, selectDailyCard, normalizeReplySettings, joinCardTexts, splitReplyText, composeReplyText, cardsToTxt, parseQuizOptions, parseDictionaryLines, isEmojiText, shortDictionaryTexts, pickDictionaryEntries };
});
