import { stateManager } from "./stateManager.js";
import idle from "./states/idle.js";
import follow from "./states/follow.js";

export const brain = {
  initialize(bot) {
    stateManager.register("idle", idle);
    stateManager.register("follow", follow);
    stateManager.setState("idle", bot);
  }
};
