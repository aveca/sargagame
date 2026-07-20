// Display fonts, self-hosted & offline-cached by Remotion at render time.
// Bangers = the classic comic-book display face. Anton = heavy grotesque for titles.
import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";

export const bangers = loadBangers().fontFamily;
export const anton = loadAnton().fontFamily;
