import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// H.264 + good quality for social. Lower CRF = better quality / bigger file.
Config.setCrf(18);
