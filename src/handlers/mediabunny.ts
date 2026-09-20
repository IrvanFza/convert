import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Category } from "src/CommonFormats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import normalizeMimeType from "src/normalizeMimeType.ts";
import * as mb from "mediabunny";
import { registerFlacEncoder } from "@mediabunny/flac-encoder";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

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

const anyOrNone = async <T>(items: T[], fn: (item: T) => Promise<boolean>) =>
  !items.length || (await Promise.all(items.map((item) => fn(item)))).some(Boolean);

class mediabunnyHandler implements FormatHandler {
  public name: string = "mediabunny";
  public supportedFormats: FileFormat[] = [];
  public ready: boolean = false;
  public offload: boolean = true;

  async init() {
    if (!(await mb.canEncodeAudio("flac"))) {
      registerFlacEncoder();
    }
    if (!(await mb.canEncodeAudio("mp3"))) {
      registerMp3Encoder();
    }
    if (!(await mb.canEncodeAudio("aac"))) {
      registerAacEncoder();
    }

    for (const [name, { input, output }] of FORMATS) {
      const videoCodecs = output.getSupportedVideoCodecs();
      const audioCodecs = output.getSupportedAudioCodecs();

      const canDecodeVideo = await anyOrNone(videoCodecs, mb.canDecodeVideo);
      const canEncodeVideo = await anyOrNone(videoCodecs, mb.canEncodeVideo);
      const canDecodeAudio = await anyOrNone(audioCodecs, mb.canDecodeAudio);
      const canEncodeAudio = await anyOrNone(audioCodecs, mb.canEncodeAudio);
      let category;
      let from, to;
      const tracks = output.getSupportedTrackCounts();
      if (tracks.video.max > 0) {
        category = Category.VIDEO;
        from = canDecodeAudio && canDecodeVideo;
        to = canEncodeAudio && canEncodeVideo;
      } else {
        category = Category.AUDIO;
        from = canDecodeAudio;
        to = canEncodeAudio;
      }

      this.supportedFormats.push({
        name: input.name,
        format: name,
        extension: name,
        mime: normalizeMimeType(input.mimeType),
        from,
        to,
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
