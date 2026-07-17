import { createDefaultSessionRewards, DEFAULT_PASSIVE_DOWNTIME, DEFAULT_SESSION_PROGRESS, FLAGS, MODULE_ID, SETTINGS } from "./constants.js";
import { DowntimeService } from "./downtime-service.js";
import { downtimeItemData } from "./downtime-item-service.js";
import { RewardService } from "./reward-service.js";
import { getSystemAdapter } from "./system-adapter.js";
import { round } from "./utils.js";

export function isoWeekKey(value = new Date()) {
  const date = new Date(value);
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - start) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function monthKey(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function playerCharacters() {
  const preferred = new Set(["pc", "character", "player-character"]);
  const strict = game.actors.contents.filter(actor => preferred.has(actor.type));
  return (strict.length ? strict : game.actors.contents.filter(actor => actor.type !== "npc" && actor.hasPlayerOwner))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));
}

export function actorLevel(actor) {
  const adapted = Number(getSystemAdapter().getActorProgressSources(actor)?.level);
  if (Number.isFinite(adapted) && adapted > 0) return Math.min(20, Math.floor(adapted));
  const classes = actor.items?.filter(item => item.type === "class") ?? [];
  const total = classes.reduce((sum, item) => sum + Number(item.system?.levels ?? item.system?.level ?? 0), 0);
  return Math.min(20, Math.max(1, total || 1));
}

export function normalizeSessionRewards(raw) {
  const defaults = createDefaultSessionRewards(getSystemAdapter().getDefaultGoldItemUuid());
  const saved = new Map((Array.isArray(raw?.levels) ? raw.levels : []).map(row => [Number(row.level), row]));
  return {
    schemaVersion: 1,
    levels: defaults.levels.map(fallback => {
      const row = saved.get(fallback.level) ?? fallback;
      return {
        level: fallback.level,
        items: (Array.isArray(row.items) ? row.items : [])
          .map(item => ({ uuid: String(item.uuid ?? "").trim(), quantity: Math.max(0, Number(item.quantity) || 0) }))
          .filter(item => item.uuid)
      };
    })
  };
}

export function sessionRewards() {
  return normalizeSessionRewards(game.settings.get(MODULE_ID, SETTINGS.SESSION_REWARDS));
}

export function passiveDowntimeConfig() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.PASSIVE_DOWNTIME) ?? {};
  return {
    enabled: stored.enabled !== false,
    period: stored.period === "week" ? "week" : "month",
    rate: Math.max(0, Number(stored.rate ?? DEFAULT_PASSIVE_DOWNTIME.rate) || 0),
    capMultiplier: Math.max(0, Number(stored.capMultiplier ?? DEFAULT_PASSIVE_DOWNTIME.capMultiplier) || 0)
  };
}

export function rewardForLevel(level) {
  const config = sessionRewards();
  return config.levels.find(row => row.level === Number(level)) ?? config.levels[0];
}

function selectedReward(reward, columns) {
  if (!Array.isArray(columns)) return reward;
  const selected = new Set(columns.map(Number));
  return { ...reward, items: (reward.items ?? []).map((item, index) => ({ ...item, columnIndex: index })).filter(item => selected.has(item.columnIndex)) };
}

export async function sessionRewardDetails(reward, multiplier = 1) {
  const items = [];
  let gold = 0;
  let downtime = 0;
  for (const [index, entry] of (reward.items ?? []).entries()) {
    const document = await fromUuid(entry.uuid).catch(() => null);
    const baseQuantity = Math.max(0, Number(entry.quantity) || 0);
    const quantity = getSystemAdapter().isGoldItem(document) ? round(baseQuantity * multiplier, 6) : baseQuantity;
    const downtimeConfig = downtimeItemData(document);
    if (getSystemAdapter().isGoldItem(document)) gold += quantity;
    if (downtimeConfig) downtime += quantity * downtimeConfig.amount;
    items.push({ uuid: entry.uuid, quantity, name: document?.name ?? entry.uuid, img: document?.img ?? "icons/svg/mystery-man.svg", columnIndex: Number(entry.columnIndex ?? index) });
  }
  return { items, gold: round(gold, 6), downtime: round(downtime, 6) };
}

export function sessionProgress(actor) {
  return foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_SESSION_PROGRESS),
    actor.getFlag(MODULE_ID, FLAGS.SESSION_PROGRESS) ?? {},
    { inplace: false, recursive: true }
  );
}

async function setProgress(actor, progress) {
  await actor.setFlag(MODULE_ID, FLAGS.SESSION_PROGRESS, progress);
}

async function historyJournal() {
  const uuid = game.settings.get(MODULE_ID, SETTINGS.SESSION_HISTORY_JOURNAL);
  const existing = uuid ? await fromUuid(uuid).catch(() => null) : null;
  if (existing) return existing;
  const journal = await JournalEntry.create({
    name: game.i18n.localize("DOWNTIME_MANAGER.Session.HistoryName"),
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  });
  await game.settings.set(MODULE_ID, SETTINGS.SESSION_HISTORY_JOURNAL, journal.uuid);
  return journal;
}

async function createHistoryPage(record, settlement = false) {
  const journal = await historyJournal();
  const rows = (settlement ? record.recipients : record.participants).map(entry =>
    `<li><strong>${foundry.utils.escapeHTML(entry.actorName)}</strong>: ${settlement ? entry.amount : `${entry.downtime} ${game.i18n.localize("DOWNTIME_MANAGER.Session.Downtime")}, ${entry.gold} ${game.i18n.localize("DOWNTIME_MANAGER.Currency.GP")}`}</li>`
  ).join("");
  const content = `<h2>${foundry.utils.escapeHTML(record.title)}</h2>${record.summary ? `<p>${foundry.utils.escapeHTML(record.summary)}</p>` : ""}<ul>${rows}</ul>`;
  const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: record.title, type: "text", text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML } }]);
  return page;
}

export class SessionService {
  static busy = false;

  static async validate(active, actorUuids, multiplier, rewardColumns) {
    const historyEnabled = game.settings.get(MODULE_ID, SETTINGS.SESSION_HISTORY_ENABLED);
    if (!actorUuids.length || (historyEnabled && !active?.title)) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.Required"));
    if (active.status === "awarded") throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.AlreadyAwarded"));
    if (![1, 1.5, 2].includes(multiplier)) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.InvalidMultiplier"));
    const actors = [];
    for (const uuid of actorUuids) {
      const actor = await fromUuid(uuid).catch(() => null);
      if (!actor || actor.documentName !== "Actor") throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.ActorMissing"));
      const reward = selectedReward(rewardForLevel(actorLevel(actor)), rewardColumns);
      await RewardService.validateItems(reward.items);
      actors.push({ actor, reward });
    }
    return actors;
  }

  static async award({ active, actorUuids, multiplier, rewardColumns, awardMilestones = true }) {
    if (this.busy) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.Busy"));
    this.busy = true;
    let lockId = null;
    try {
      const selected = new Set(actorUuids);
      const validated = await this.validate(active, actorUuids, multiplier, rewardColumns);
      lockId = foundry.utils.randomID();
      await game.settings.set(MODULE_ID, SETTINGS.ACTIVE_SESSION, { ...active, status: "awarding", lockId });
      const locked = game.settings.get(MODULE_ID, SETTINGS.ACTIVE_SESSION) ?? {};
      if (locked.lockId !== lockId) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.Busy"));
      const byUuid = new Map(validated.map(entry => [entry.actor.uuid, entry]));
      const week = isoWeekKey();
      const passiveConfig = passiveDowntimeConfig();
      const periodKey = passiveConfig.period === "week" ? isoWeekKey() : monthKey();
      const participants = [];
      const passiveRecipients = [];

      for (const actor of playerCharacters()) {
        const reward = byUuid.get(actor.uuid)?.reward ?? selectedReward(rewardForLevel(actorLevel(actor)), rewardColumns);
        const progress = sessionProgress(actor);
        if (selected.has(actor.uuid)) {
          const details = await sessionRewardDetails(reward, multiplier);
          await RewardService.grantItems(actor, details.items);
          const milestone = awardMilestones && progress.lastMilestoneWeek !== week ? 1 : 0;
          await setProgress(actor, { ...progress, milestones: Number(progress.milestones) + milestone, sessionsPlayed: Number(progress.sessionsPlayed) + 1, lastMilestoneWeek: milestone ? week : progress.lastMilestoneWeek });
          participants.push({ actorUuid: actor.uuid, actorName: actor.name, gold: details.gold, downtime: details.downtime, rewards: details.items, milestone });
        } else {
          const details = await sessionRewardDetails(reward);
          const current = Number(progress.passiveDowntime?.[periodKey] ?? 0);
          const amount = passiveConfig.enabled
            ? Math.max(0, Math.min(details.downtime * passiveConfig.rate, details.downtime * passiveConfig.capMultiplier - current))
            : 0;
          const passiveDowntime = { ...progress.passiveDowntime, [periodKey]: round(current + amount, 6) };
          await setProgress(actor, { ...progress, passiveDowntime });
          passiveRecipients.push({ actorUuid: actor.uuid, actorName: actor.name, awarded: amount });
        }
      }

      const record = { title: active.title, summary: active.summary, id: active.id, week, periodKey, passivePeriod: passiveConfig.period, multiplier, participants, passiveRecipients, awardedAt: Date.now() };
      const historyEnabled = game.settings.get(MODULE_ID, SETTINGS.SESSION_HISTORY_ENABLED);
      const page = historyEnabled ? await createHistoryPage(record) : null;
      await game.settings.set(MODULE_ID, SETTINGS.ACTIVE_SESSION, { ...active, status: "awarded", awardedAt: record.awardedAt, historyPageUuid: page?.uuid ?? null });
      return record;
    } catch (error) {
      const current = game.settings.get(MODULE_ID, SETTINGS.ACTIVE_SESSION) ?? {};
      if (lockId && current.status === "awarding" && current.lockId === lockId) {
        await game.settings.set(MODULE_ID, SETTINGS.ACTIVE_SESSION, { ...current, status: "draft", lockId: null });
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }

  static async settle(month) {
    if (this.busy) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.Busy"));
    this.busy = true;
    try {
      const recipients = [];
      for (const actor of playerCharacters()) {
        const progress = sessionProgress(actor);
        const amount = round(Number(progress.passiveDowntime?.[month] ?? 0), 6);
        if (amount <= 0) continue;
        await DowntimeService.add(actor, amount);
        await setProgress(actor, { ...progress, passiveDowntime: { ...progress.passiveDowntime, [month]: 0 } });
        recipients.push({ actorUuid: actor.uuid, actorName: actor.name, amount });
      }
      const record = { title: game.i18n.format("DOWNTIME_MANAGER.Session.SettlementFor", { month }), month, recipients, settledAt: Date.now() };
      if (game.settings.get(MODULE_ID, SETTINGS.SESSION_HISTORY_ENABLED)) await createHistoryPage(record, true);
      return record;
    } finally {
      this.busy = false;
    }
  }

  static async grantDirectDowntime(actorUuids, amount, { allCharacters = false } = {}) {
    if (!game.user.isGM) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.GMOnly"));
    const value = round(Number(amount), 6);
    if (!Number.isFinite(value) || value <= 0) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Dashboard.Errors.InvalidDowntime"));
    const recipients = [];
    for (const uuid of [...new Set(actorUuids)]) {
      const actor = await fromUuid(uuid).catch(() => null);
      if (!actor || actor.documentName !== "Actor") throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Session.Errors.ActorMissing"));
      await DowntimeService.add(actor, value);
      recipients.push({ actorUuid: actor.uuid, actorName: actor.name, downtime: value, gold: 0 });
    }
    if (game.settings.get(MODULE_ID, SETTINGS.SESSION_HISTORY_ENABLED) && recipients.length) {
      await createHistoryPage({
        title: game.i18n.localize("DOWNTIME_MANAGER.Dashboard.DirectDowntimeHistory"),
        summary: game.i18n.format("DOWNTIME_MANAGER.Dashboard.DirectDowntimeSummary", { amount: value, count: recipients.length }),
        participants: recipients
      }).catch(error => console.warn(`${MODULE_ID} | Direct downtime history entry failed`, error));
    }
    if (allCharacters && recipients.length) {
      await game.settings.set(MODULE_ID, SETTINGS.LAST_DIRECT_DOWNTIME_ALL, {
        timestamp: Date.now(),
        amount: value,
        count: recipients.length,
        userId: game.user.id,
        userName: game.user.name
      });
    }
    return { amount: value, recipients };
  }

  static async openHistory() { (await historyJournal()).sheet.render(true); }
}
