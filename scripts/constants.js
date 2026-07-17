export const MODULE_ID = "downtime-manager";

export const FLAGS = Object.freeze({
  STATION: "station",
  PROJECTS: "projects",
  RECIPE: "recipe",
  DOWNTIME: "downtime",
  REPUTATION: "reputation",
  STATION_VALUES: "stationValues",
  PROJECT_FOLDER: "projectFolder",
  SESSION_PROGRESS: "sessionProgress",
  DOWNTIME_ITEM: "downtimeItem"
});

export const SETTINGS = Object.freeze({
  RECIPE_BASE_ITEM_UUID: "recipeBaseItemUuid",
  DEFAULT_COST_ITEM_UUID: "defaultCostItemUuid",
  ACTIVE_SESSION: "activeSession",
  SESSION_REWARDS: "sessionRewards",
  SESSION_HISTORY_JOURNAL: "sessionHistoryJournal",
  SESSION_HISTORY_ENABLED: "sessionHistoryEnabled",
  PASSIVE_DOWNTIME: "passiveDowntimeConfig",
  LAST_DIRECT_DOWNTIME_ALL: "lastDirectDowntimeAll"
});

const sessionGold = level => {
  if (level <= 3) return 100;
  if (level <= 6) return 500;
  if (level <= 9) return 1000;
  if (level <= 12) return 1500;
  if (level <= 15) return 5000;
  if (level <= 18) return 10000;
  return 20000;
};

export function createDefaultSessionRewards(goldItemUuid = "") {
  return {
    schemaVersion: 1,
    levels: Array.from({ length: 20 }, (_, index) => {
      const level = index + 1;
      return {
        level,
        items: goldItemUuid ? [{ uuid: goldItemUuid, quantity: sessionGold(level) }] : []
      };
    })
  };
}

export const DEFAULT_SESSION_PROGRESS = Object.freeze({
  milestones: 0,
  sessionsPlayed: 0,
  lastMilestoneWeek: null,
  passiveDowntime: {}
});

export const DEFAULT_PASSIVE_DOWNTIME = Object.freeze({
  enabled: true,
  period: "month",
  rate: 0.1,
  capMultiplier: 4
});

export const COIN_IDENTIFIERS = Object.freeze(["pp", "gp", "sp", "cp"]);
export const COIN_VALUE_CP = Object.freeze({pp: 1000, gp: 100, sp: 10, cp: 1});

export const CHECK_DEFINITIONS = [
  {
    type: "ability",
    key: "strength",
    label: "DOWNTIME_MANAGER.Checks.Ability.Strength"
  },
  {
    type: "ability",
    key: "dexterity",
    label: "DOWNTIME_MANAGER.Checks.Ability.Dexterity"
  },
  {
    type: "ability",
    key: "constitution",
    label: "DOWNTIME_MANAGER.Checks.Ability.Constitution"
  },
  {
    type: "ability",
    key: "intelligence",
    label: "DOWNTIME_MANAGER.Checks.Ability.Intelligence"
  },
  {
    type: "ability",
    key: "wisdom",
    label: "DOWNTIME_MANAGER.Checks.Ability.Wisdom"
  },
  {
    type: "ability",
    key: "charisma",
    label: "DOWNTIME_MANAGER.Checks.Ability.Charisma"
  },

  {
    type: "skill",
    key: "acrobatics",
    label: "DOWNTIME_MANAGER.Checks.Skill.Acrobatics"
  },
  {
    type: "skill",
    key: "animalHandling",
    label: "DOWNTIME_MANAGER.Checks.Skill.AnimalHandling"
  },
  {
    type: "skill",
    key: "arcana",
    label: "DOWNTIME_MANAGER.Checks.Skill.Arcana"
  },
  {
    type: "skill",
    key: "athletics",
    label: "DOWNTIME_MANAGER.Checks.Skill.Athletics"
  },
  {
    type: "skill",
    key: "deception",
    label: "DOWNTIME_MANAGER.Checks.Skill.Deception"
  },
  {
    type: "skill",
    key: "history",
    label: "DOWNTIME_MANAGER.Checks.Skill.History"
  },
  {
    type: "skill",
    key: "insight",
    label: "DOWNTIME_MANAGER.Checks.Skill.Insight"
  },
  {
    type: "skill",
    key: "intimidation",
    label: "DOWNTIME_MANAGER.Checks.Skill.Intimidation"
  },
  {
    type: "skill",
    key: "investigation",
    label: "DOWNTIME_MANAGER.Checks.Skill.Investigation"
  },
  {
    type: "skill",
    key: "medicine",
    label: "DOWNTIME_MANAGER.Checks.Skill.Medicine"
  },
  {
    type: "skill",
    key: "nature",
    label: "DOWNTIME_MANAGER.Checks.Skill.Nature"
  },
  {
    type: "skill",
    key: "perception",
    label: "DOWNTIME_MANAGER.Checks.Skill.Perception"
  },
  {
    type: "skill",
    key: "performance",
    label: "DOWNTIME_MANAGER.Checks.Skill.Performance"
  },
  {
    type: "skill",
    key: "persuasion",
    label: "DOWNTIME_MANAGER.Checks.Skill.Persuasion"
  },
  {
    type: "skill",
    key: "religion",
    label: "DOWNTIME_MANAGER.Checks.Skill.Religion"
  },
  {
    type: "skill",
    key: "sleightOfHand",
    label: "DOWNTIME_MANAGER.Checks.Skill.SleightOfHand"
  },
  {
    type: "skill",
    key: "stealth",
    label: "DOWNTIME_MANAGER.Checks.Skill.Stealth"
  },
  {
    type: "skill",
    key: "survival",
    label: "DOWNTIME_MANAGER.Checks.Skill.Survival"
  }
];

export const DEFAULT_STATION_CONFIG = Object.freeze({
  enabled: true,
  displayName: "",
  description: "",
  allowedChecks: CHECK_DEFINITIONS.map(({ type, key }) => ({ type, key })),
  baseProgress: 1,
  requiresRoll: true,
  rollInterval: 1,
  progressSources: {
    level: { enabled: false, multiplier: 1 },
    proficiency: { enabled: false, multiplier: 1 },
    checkProficiency: { enabled: false, multiplier: 1 }
  },
  evaluationMode: "total",
  requiredTool: null,
  recipes: [],
  modifiers: [],
  rollTable: [
    { id: "default-natural-1", enabled: true, minimum: 1, maximum: 1, label: "Fehlschlag", addition: 0, multiplier: 1, rewardAddition: 0, rewardMultiplier: 1, actorValueChange: -1, natural1: true, natural20: false },
    { id: "default-1-5", minimum: 1, maximum: 5, label: "Pfusch!", addition: 0, multiplier: 1, rewardAddition: 1, rewardMultiplier: 1, actorValueChange: 0, natural1: false, natural20: false },
    { id: "default-6-10", minimum: 6, maximum: 10, label: "Mäßig.", addition: 0, multiplier: 1, rewardAddition: 5, rewardMultiplier: 1, actorValueChange: 0, natural1: false, natural20: false },
    { id: "default-11-15", minimum: 11, maximum: 15, label: "Routine.", addition: 0, multiplier: 1, rewardAddition: 10, rewardMultiplier: 1, actorValueChange: 1, natural1: false, natural20: false },
    { id: "default-16-20", minimum: 16, maximum: 20, label: "Gelungen!", addition: 0, multiplier: 1, rewardAddition: 20, rewardMultiplier: 1, actorValueChange: 2, natural1: false, natural20: false },
    { id: "default-21-25", minimum: 21, maximum: 25, label: "Erfolgreich!", addition: 0, multiplier: 1, rewardAddition: 30, rewardMultiplier: 1, actorValueChange: 3, natural1: false, natural20: false },
    { id: "default-26-30", minimum: 26, maximum: 30, label: "Außerordentlich!", addition: 0, multiplier: 1, rewardAddition: 40, rewardMultiplier: 1, actorValueChange: 4, natural1: false, natural20: false },
    { id: "default-31-plus", minimum: 31, maximum: null, label: "Meisterlich!", addition: 0, multiplier: 1, rewardAddition: 50, rewardMultiplier: 1, actorValueChange: 5, natural1: false, natural20: false },
    { id: "default-natural-20", enabled: true, minimum: 20, maximum: 20, label: "Legendär!", addition: 0, multiplier: 1, rewardAddition: 100, rewardMultiplier: 1, actorValueChange: 5, natural1: false, natural20: true }
  ],
  actorValue: {
    enabled: false,
    key: "station-value",
    label: "",
    defaultValue: 0,
    minimum: null,
    maximum: null,
    completionChange: 0,
    tiers: [
      { id: "default-value-tier", minimum: 0, maximum: null, addition: 0, multiplier: 1 }
    ]
  }
});

export const DEFAULT_PROJECT_CONFIG = Object.freeze({
  enabled: true,
  description: "",
  requiredProgress: 1,
  repeatable: true,
  completionCheck: { enabled: false, dc: 10, retryDowntime: 1 },
  allowedChecks: [],
  requiredTools: [],
  completionCosts: [],
  rewards: [],
  rollTable: [],
  conditions: []
});

export const PROJECT_TEMPLATES = Object.freeze([
  { id: "crafting", nameKey: "DOWNTIME_MANAGER.Project.Templates.Crafting.Name", descriptionKey: "DOWNTIME_MANAGER.Project.Templates.Crafting.Description", img: "icons/tools/smithing/hammer-sledge-steel-grey.webp", config: { requiredProgress: 10, repeatable: true } },
  { id: "research", nameKey: "DOWNTIME_MANAGER.Project.Templates.Research.Name", descriptionKey: "DOWNTIME_MANAGER.Project.Templates.Research.Description", img: "icons/sundries/books/book-open-purple.webp", config: { requiredProgress: 20, repeatable: false, completionCheck: { enabled: true, dc: 15, retryDowntime: 1 } } },
  { id: "work", nameKey: "DOWNTIME_MANAGER.Project.Templates.Work.Name", descriptionKey: "DOWNTIME_MANAGER.Project.Templates.Work.Description", img: "icons/skills/trades/construction-carpentry-hammer.webp", config: { requiredProgress: 5, repeatable: true, rollTable: DEFAULT_STATION_CONFIG.rollTable.map(row => ({ ...row })) } },
  { id: "training", nameKey: "DOWNTIME_MANAGER.Project.Templates.Training.Name", descriptionKey: "DOWNTIME_MANAGER.Project.Templates.Training.Description", img: "icons/skills/melee/swords-triple-orange.webp", config: { requiredProgress: 30, repeatable: false, completionCheck: { enabled: true, dc: 15, retryDowntime: 2 } } },
  { id: "recovery", nameKey: "DOWNTIME_MANAGER.Project.Templates.Recovery.Name", descriptionKey: "DOWNTIME_MANAGER.Project.Templates.Recovery.Description", img: "icons/magic/life/heart-cross-strong-flame-green.webp", config: { requiredProgress: 5, repeatable: true } }
]);
