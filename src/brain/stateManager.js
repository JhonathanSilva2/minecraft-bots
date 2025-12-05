export const stateManager = {
  states: {},
  active: null,

  register(name, module) {
    this.states[name] = module;
  },

  setState(name, bot, data = {}) {
    if (this.active?.exit) this.active.exit(bot);
    this.active = this.states[name];
    if (this.active?.enter) this.active.enter(bot, data);
  },

  update(bot) {
    if (this.active?.update) this.active.update(bot);
  }
};
