import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { Category } from "src/CommonFormats.ts";
import type { ConvertContext } from "src/ui/ProgressStore.ts";
import normalizeMimeType from "src/normalizeMimeType.ts";
import * as mb from "mediabunny";
import { registerFlacEncoder } from "@mediabunny/flac-encoder";
import { registerMp3Encoder } from "@mediabunny/mp3-encoder";
import { registerAacEncoder } from "@mediabunny/aac-encoder";

const FORMATS = new Map<string, [name: string, input: mb.InputFormat, output: mb.OutputFormat]>([
  ["mp4", ["MPEG-4 Part 14", mb.MP4, new mb.Mp4OutputFormat()]],
  ["mov", ["QuickTime / MOV", mb.QTFF, new mb.MovOutputFormat()]],
  ["mkv", ["Matroska / WebM", mb.MATROSKA, new mb.MkvOutputFormat()]],
  ["webm", ["Matroska / WebM / webm", mb.WEBM, new mb.WebMOutputFormat()]],
  ["wav", ["Waveform Audio File Format", mb.WAVE, new mb.WavOutputFormat()]],
  ["ogg", ["Ogg Audio", mb.OGG, new mb.OggOutputFormat()]],
  ["flac", ["Free Lossless Audio Codec", mb.FLAC, new mb.FlacOutputFormat()]],
  ["mp3", ["MP3 Audio", mb.MP3, new mb.Mp3OutputFormat()]],
  ["aac", ["raw ADTS AAC (Advanced Audio Coding)", mb.ADTS, new mb.AdtsOutputFormat()]],
  ["ts", ["MPEG-TS (MPEG-2 Transport Stream)", mb.MPEG_TS, new mb.MpegTsOutputFormat()]],
  // needs segmenting bs
  // ["m3u8", ["HTTP Live Streaming", mb.HLS, new mb.HlsOutputFormat({ segmentFormat: new mb.MpegTsOutputFormat() })]],
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

    for (const [format, [name, input, output]] of FORMATS) {
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
        name,
        format,
        extension: format,
        mime: normalizeMimeType(input.mimeType),
        from,
        to,
        internal: format,
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
    const mbInputFormat = FORMATS.get(inputFormat.internal)?.[1];
    if (!mbInputFormat) throw new Error(`could not get format: ${inputFormat.internal}`);
    const mbOutputFormat = FORMATS.get(outputFormat.internal)?.[2];
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
