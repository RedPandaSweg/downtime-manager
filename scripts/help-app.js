const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SECTIONS = [
  ["QuickStart", "fa-solid fa-rocket", 6],
  ["Downtime", "fa-solid fa-hourglass-half", 4],
  ["Stations", "fa-solid fa-screwdriver-wrench", 6],
  ["Projects", "fa-solid fa-scroll", 9],
  ["Templates", "fa-solid fa-wand-magic-sparkles", 6],
  ["Progress", "fa-solid fa-bars-progress", 6],
  ["Checks", "fa-solid fa-dice-d20", 5],
  ["Completion", "fa-solid fa-flag-checkered", 5],
  ["Dashboard", "fa-solid fa-table-columns", 6],
  ["Sessions", "fa-solid fa-campground", 7],
  ["Passive", "fa-solid fa-calendar", 5],
  ["DowntimeItems", "fa-solid fa-ticket", 6],
  ["Settings", "fa-solid fa-gears", 7],
  ["Systems", "fa-solid fa-plug", 4],
  ["Troubleshooting", "fa-solid fa-life-ring", 6]
];

export class HelpApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "downtime-manager-help",
    classes: ["downtime-manager", "downtime-help"],
    position: { width: 760, height: 820 },
    window: { title: "DOWNTIME_MANAGER.Help.Title", resizable: true },
    actions: {
      scrollToSection: HelpApp.#scrollToSection
    }
  };

  static PARTS = {
    main: { template: "modules/downtime-manager/templates/help.hbs" }
  };

  static #scrollToSection(event, target) {
    event.preventDefault();
    const key = String(target.dataset.section ?? "");
    const section = this.element.querySelector(`#help-${CSS.escape(key)}`);
    if (!section) return;
    section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      introduction: game.i18n.localize("DOWNTIME_MANAGER.Help.Introduction"),
      sections: SECTIONS.map(([key, icon, count], index) => ({
        key: key.toLowerCase(),
        icon,
        open: index === 0,
        title: game.i18n.localize(`DOWNTIME_MANAGER.Help.${key}.Title`),
        text: game.i18n.localize(`DOWNTIME_MANAGER.Help.${key}.Text`),
        points: Array.from({ length: count }, (_, point) =>
          game.i18n.localize(`DOWNTIME_MANAGER.Help.${key}.Point${point + 1}`)
        )
      }))
    };
  }
}
