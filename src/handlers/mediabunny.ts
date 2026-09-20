import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Category } from "src/CommonFormats.ts";
import * as mb from "mediabunny";
import type { ConvertContext } from "src/ui/ProgressStore.ts";

const FORMATS = new Map<string, { input: mb.InputFormat; output: mb.OutputFormat }>([
  ["mp4", { input: mb.MP4, output: new mb.Mp4OutputFormat() }],
  ["mov", { input: mb.QTFF, output: new mb.MovOutputFormat() }],
  ["mkv", { input: mb.MATROSKA, output: new mb.MkvOutputFormat() }],
  ["webm", { input: mb.WEBM, output: new mb.WebMOutputFormat() }],
  ["wav", { input: mb.WAVE, output: new mb.WavOutputFormat() }],
  ["ogg", { input: mb.OGG, output: new mb.OggOutputFormat() }],
  ["flac", { input: mb.FLAC, output: new mb.FlacOutputFormat() }],
  ["mp3", { input: mb.MP3, output: new mb.Mp3OutputFormat() }],
  ["aac", { input: mb.ADTS, output: new mb.AdtsOutputFormat() }],
  ["ts", { input: mb.MPEG_TS, output: new mb.MpegTsOutputFormat() }],
  // needs segmenting bs
  // ["m3u8", { input: mb.HLS, output: new mb.HlsOutputFormat({ segmentFormat: new mb.MpegTsOutputFormat() }) }],
]);

class mediabunnyHandler implements FormatHandler {
  public name: string = "mediabunny";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    for (const [name, { input, output }] of FORMATS) {
      const tracks = output.getSupportedTrackCounts();
      const category = [];
      if (tracks.audio.max > 0) category.push(Category.AUDIO);
      if (tracks.video.max > 0) category.push(Category.VIDEO);
      if (category.length === 0) throw new Error(`${name} had no categories`);

      this.supportedFormats.push({
        name: input.name,
        format: name,
        extension: name,
        mime: input.mimeType,
        from: true,
        to: true,
        internal: name,
        category,
        lossless: false,
      });
    }
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
    _args?: string[],
    ctx?: ConvertContext,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    const mbInputFormat = FORMATS.get(inputFormat.internal)?.input;
    if (!mbInputFormat) throw new Error(`could not get format: ${inputFormat.internal}`);
    const mbOutputFormat = FORMATS.get(outputFormat.internal)?.output;
    if (!mbOutputFormat) throw new Error(`could not get format: ${outputFormat.internal}`);

    for (const [i, inputFile] of inputFiles.entries()) {
      ctx?.log(`Processing ${inputFile.name}...`);
      const source = new mb.BufferSource(inputFile.bytes);
      const input = new mb.Input({
        formats: [mbInputFormat],
        source,
      });
      const output = new mb.Output({
        format: mbOutputFormat,
        target: new mb.BufferTarget(),
      });
      const conversion = await mb.Conversion.init({ input, output });

      conversion.onProgress = (progress, seconds) => {
        ctx?.progress(
          `Transcoding... (${seconds.toFixed(1)}s processed)`,
          (i + progress) / inputFiles.length,
        );
      };

      await conversion.execute({
        pauseSignal: ctx?.signal,
      });

      ctx?.throwIfAborted();

      if (conversion.state !== "done" || !output.target.buffer)
        throw new Error("conversion isnt done after completing");

      const name = inputFile.name.replace(/\.[^.]+$/, "") + `.${outputFormat.extension}`;

      outputFiles.push({ name, bytes: new Uint8Array(output.target.buffer) });
    }

    return outputFiles;
  }
}

export default mediabunnyHandler;
