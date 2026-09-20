import { exit } from "node:process";
import { ConvertPathNode, FileFormat, HandlerDefinition } from "../src/FormatHandler";
import { TraversionGraph } from "../src/TraversionGraph";
import { join } from "node:path";

const CACHE_FILE = join(process.cwd(), "dist/cache.json");

if (Bun.argv.length < 5) {
  console.log(
    "Usage: bun run scripts/traverse-path.ts <max-paths> <ext-from>[#<mime-from>] <ext-to>[#<mime-to>]",
  );
  console.log("ex. bun run scripts/traverse-path.ts 10 mp3 ogg#audio/ogg");
  exit(1);
}

const handlers: HandlerDefinition[] = await Bun.file(CACHE_FILE).json();
const traversionGraph = new TraversionGraph();
traversionGraph.init(handlers);

const nodes: ConvertPathNode[] = handlers.flatMap((handler) => {
  if (!handler.supportedFormats) throw new Error(`${handler.name} has no formats`);
  return handler.supportedFormats?.map((format) => ({ format, handler }));
});

function findNode(text: string, filterKey: keyof FileFormat) {
  const [ext, mime] = text.split("#");

  const found = nodes.find(
    (node) =>
      ext === node.format.extension &&
      (mime ? mime === node.format.mime : true) &&
      node.format[filterKey],
  );
  if (!found) throw new Error(`could not find file format ${text}`);

  console.log(
    `${text} is: ${found.format.mime} "${found.format.name}" (format ${found.format.format}, extension ${found.format.extension})`,
  );
  console.log(
    `Which is supported by: ${nodes
      .filter(
        (node) =>
          node.format.mime === found.format.mime &&
          node.format.format === found.format.format &&
          node.format[filterKey],
      )
      .map((node) => node.handler.name)
      .join(", ")}`,
  );

  return found;
}

const from = findNode(Bun.argv[3], "from");
const to = findNode(Bun.argv[4], "to");

const search = traversionGraph.searchPath(from, to, true);
for (let i = 0; i < Number(Bun.argv[2]); i++) {
  const { done, value: path } = await search.next();
  if (done) break;

  traversionGraph.addDeadEndPath(path);
}

exit(0);
