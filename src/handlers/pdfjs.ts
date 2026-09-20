import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

type CanvasAndContext = {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
};

class WorkerCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height)),
    );
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create PDF rendering context");
    return { canvas, context };
  }

  reset({ canvas }: CanvasAndContext, width: number, height: number) {
    canvas.width = Math.max(1, Math.floor(width));
    canvas.height = Math.max(1, Math.floor(height));
  }

  destroy({ canvas }: CanvasAndContext) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

class pdfjsHandler implements FormatHandler {
  public name: string = "pdfjs";

  public supportedFormats: FileFormat[] = [
    CommonFormats.PDF.builder("pdf").allowFrom(),
    CommonFormats.PNG.supported("png", false, true),
    CommonFormats.JPEG.supported("jpeg", false, true),
  ];

  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];

    for (const inputFile of inputFiles) {
      const loadingTask = getDocument({
        data: new Uint8Array(inputFile.bytes),
        CanvasFactory: WorkerCanvasFactory,
        standardFontDataUrl: new URL(
          `${import.meta.env.BASE_URL}js/pdfjs/standard_fonts/`,
          globalThis.location.href,
        ).href,
        cMapUrl: new URL(`${import.meta.env.BASE_URL}js/pdfjs/cmaps/`, globalThis.location.href)
          .href,
        cMapPacked: true,
        useWorkerFetch: true,
        wasmUrl: new URL(`${import.meta.env.BASE_URL}js/pdfjs/wasm/`, globalThis.location.href)
          .href,
        disableFontFace: true,
        useSystemFonts: false,
      });
      try {
        const pdf = await loadingTask.promise;
        const baseName = inputFile.name.split(".").slice(0, -1).join(".");
        const factory = new WorkerCanvasFactory();

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const target = factory.create(viewport.width, viewport.height);
          try {
            await page.render({
              canvas: null,
              // PDF.js accepts an OffscreenCanvas context, but its types only list DOM contexts.
              canvasContext: target.context as unknown as CanvasRenderingContext2D,
              viewport,
              background: "rgb(255,255,255)",
            }).promise;
            const blob = await target.canvas.convertToBlob({
              type: outputFormat.mime,
            });
            outputFiles.push({
              bytes: new Uint8Array(await blob.arrayBuffer()),
              name: `${baseName}_${pageNumber - 1}.${outputFormat.extension}`,
            });
          } finally {
            factory.destroy(target);
            page.cleanup();
          }
        }
      } finally {
        await loadingTask.destroy();
      }
    }

    return outputFiles;
  }
}

export default pdfjsHandler;
