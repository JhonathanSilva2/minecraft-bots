import { stateManager } from "../brain/stateManager.js";

export default function followCommand(bot, username) {
  stateManager.setState("follow", bot, { username });
}
