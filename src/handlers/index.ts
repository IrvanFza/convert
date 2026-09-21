import { stripHandler, type FormatHandler, type HandlerDefinition } from "../FormatHandler.ts";

const HANDLER_NAMES = [
  "epub",
  "pandoc",
  "typst",
  "pptxRenderer",
  "svgTrace",
  "canvasToBlob",
  "svgToBlob",
  "meyda",
  "htmlEmbed",
  "mediabunny",
  "pdfjs",
  "ImageMagick",
  "curani",
  "bunburrows",
  "rgba",
  // todo
  // "comics",
  // "comics",
  // "comics",
  "FFmpeg",
  // "rename",
  // "rename",
  // "rename",
  // "rename",
  // "rename",
  // "rename",
  "envelope",
  "htmlToSvg",
  "qoiFu",
  "sppd",
  "threejs",
  "sqlite",
  "vtf",
  "mcMap",
  "sevenZip",
  "config",
  "als",
  "qoaFu",
  "pyTurtle",
  // "json",
  // "json",
  "nbt",
  "peToZip",
  "flpToJson",
  "flo",
  "cgbiToPng",
  "batToExe",
  "turbowarp",
  "textEncoding",
  "jsonToC",
  "libopenmpt",
  // "midi",
  // "midi",
  // "lzh",
  // "lzh",
  "wad",
  // "infiniteCraft",
  // "infiniteCraft",
  "espeakng",
  "exeToBat",
  "bsor",
  "font",
  "icns",
  "mcSchematic",
  "bson",
  "aseprite",
  "har",
  "n64rom",
  "vexFlow",
  "toon",
  "rpgmvp",
  "ota",
  "terrariaWld",
  // "opusMagnum",
  // "opusMagnum",
  // "opusMagnum",
  "aperturePicture",
  "xcf",
  "pdfparse",
  "minecraftLang",
  "celariaMap",
  "cybergrind",
  "textToSource",
  "wabt",
  "chessjs",
  "fenToJson",
  "piskel",
  "xcursor",
  "shToElf",
  "textToPdf",
  "css",
  "bbmodel",
  "kra",
  "krz",
  "brarchive",
  "wasiRunner",
  "clangWasi",
  "mcModpack",
  "azw3",
  "wavebreak"
] as const;

export type HandlerName = (typeof HANDLER_NAMES)[number];

type HandlerModule = {
  default: new () => FormatHandler;
};

const modules = import.meta.glob<HandlerModule>("./*.ts");

const singletons = new Map<HandlerName, FormatHandler>();

export async function getHandler(name: HandlerName) {
  let handler = singletons.get(name);
  if (handler) return handler;
  const module = modules[`./${name}.ts`];
  const HandlerClass = (await module()).default;
  handler = new HandlerClass();
  singletons.set(name, handler);
  return handler;
}

export async function initDefinitions(cache: HandlerDefinition[]) {
  for (const handlerName of HANDLER_NAMES) {
    if (cache.some(h => h.name === handlerName)) continue;

    console.warn(`Cache miss for handler "${handlerName}"`);

    try {
      const handler = await getHandler(handlerName);
      await handler.init();
      cache.push(stripHandler(handler));
      console.log(`Updated handler cache for handler "${handlerName}".`);
    } catch (error) {
      console.error(`Error while initializing ${handlerName}:`, error);
      continue;
    }
  }
}
