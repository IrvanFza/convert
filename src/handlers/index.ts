import { stripHandler, type FormatHandler, type HandlerDefinition } from "../FormatHandler.ts";

const HANDLERS = {
  epub: [],
  pandoc: [],
  typst: [],
  pptxRenderer: [],
  svgTrace: [],
  canvasToBlob: [],
  svgToBlob: [],
  meyda: [],
  htmlEmbed: [],
  mediabunny: [],
  pdfjs: [],
  ImageMagick: [],
  curani: [],
  bunburrows: [],
  rgba: [],
  comicsZipPacker: ["./comics.ts", "comicsZipPackerHandler"],
  comicsZipUnpacker: ["./comics.ts", "comicsZipUnpackerHandler"],
  comicsTarUnpacker: ["./comics.ts", "comicsTarUnpackerHandler"],
  FFmpeg: [],
  renameZip: ["./rename.ts", "renameZipHandler"],
  renameTar: ["./rename.ts", "renameTarHandler"],
  renameRar: ["./rename.ts", "renameRarHandler"],
  rename7z: ["./rename.ts", "rename7zHandler"],
  renameTxt: ["./rename.ts", "renameTxtHandler"],
  renameJson: ["./rename.ts", "renameJsonHandler"],
  envelope: [],
  htmlToSvg: [],
  qoiFu: [],
  sppd: [],
  threejs: [],
  sqlite: [],
  vtf: [],
  mcMap: [],
  sevenZip: [],
  config: [],
  als: [],
  qoaFu: [],
  pyTurtle: [],
  fromJson: ["./json.ts", "fromJsonHandler"],
  toJson: ["./json.ts", "toJsonHandler"],
  nbt: [],
  peToZip: [],
  flpToJson: [],
  flo: [],
  cgbiToPng: [],
  batToExe: [],
  turbowarp: [],
  textEncoding: [],
  jsonToC: [],
  libopenmpt: [],
  midiCodec: ["./midi.ts", "midiCodecHandler"],
  midiSynth: ["./midi.ts", "midiSynthHandler"],
  lzh: ["./lzh.ts", "lzhHandler"],
  lzh2: ["./lzh.ts", "lzh2Handler"],
  wad: [],
  txtToInfiniteCraft: ["./infiniteCraft.ts", "txtToInfiniteCraftHandler"],
  infiniteCraftToJson: ["./infiniteCraft.ts", "infiniteCraftToJsonHandler"],
  espeakng: [],
  exeToBat: [],
  bsor: [],
  font: [],
  icns: [],
  mcSchematic: [],
  bson: [],
  aseprite: [],
  har: [],
  n64rom: [],
  vexFlow: [],
  toon: [],
  rpgmvp: [],
  ota: [],
  terrariaWld: [],
  opusMagnumMain: ["./opusMagnum.ts", "opusMagnumMainHandler"],
  opusMagnumTTM: ["./opusMagnum.ts", "opusMagnumTTMHandler"],
  opusMagnumITM: ["./opusMagnum.ts", "opusMagnumITMHandler"],
  aperturePicture: [],
  xcf: [],
  pdfparse: [],
  minecraftLang: [],
  celariaMap: [],
  cybergrind: [],
  textToSource: [],
  wabt: [],
  chessjs: [],
  fenToJson: [],
  piskel: [],
  xcursor: [],
  shToElf: [],
  textToPdf: [],
  css: [],
  bbmodel: [],
  kra: [],
  krz: [],
  brarchive: [],
  wasiRunner: [],
  clangWasi: [],
  mcModpack: [],
  azw3: [],
  wavebreak: [],
} as const;

export type HandlerName = keyof typeof HANDLERS;

type HandlerModule = Partial<
  Record<
    Exclude<
      (typeof HANDLERS)[keyof typeof HANDLERS],
      readonly []
    >[1] | "default",
    new () => FormatHandler
  >
>;

const modules = import.meta.glob<HandlerModule>("./*.ts");

const singletons = new Map<HandlerName, FormatHandler>();

export async function getHandler(name: HandlerName) {
  let handler = singletons.get(name);
  if (handler) return handler;

  const handlerEntry = HANDLERS[name];
  if (!handlerEntry) throw new Error(`Handler ${name} was not found!`);

  const [modulePath = `./${name}.ts`, exportName = "default"] = handlerEntry;

  const module = modules[modulePath];
  const HandlerClass = (await module())[exportName];
  if (!HandlerClass) throw new Error(`Handler ${handlerEntry[0]} did not have an export ${handlerEntry[1]}!`);

  handler = new HandlerClass();
  singletons.set(name, handler);
  return handler;
}

export async function initDefinitions(cache: HandlerDefinition[]) {
  for (const handlerName of Object.keys(HANDLERS) as HandlerName[]) {
    if (cache.some(h => h.name === handlerName)) continue;

    console.warn(`Cache miss for handler "${handlerName}"`);

    try {
      const handler = await getHandler(handlerName);
      if (handler.name !== handlerName)
        throw new Error(`Handler ${handlerName} reported ${handler.name} as their name?`);
      await handler.init();
      cache.push(stripHandler(handler));
      console.log(`Updated handler cache for handler "${handlerName}".`);
    } catch (error) {
      console.error(`Error while initializing ${handlerName}:`, error);
      continue;
    }
  }
}
