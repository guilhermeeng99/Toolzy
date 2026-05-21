import { describe, expect, it } from "vitest";
import { audioOutputName, buildAudioArgs } from "./command";

describe("buildAudioArgs", () => {
  it("extracts mp3 audio with libmp3lame and -vn", () => {
    expect(buildAudioArgs("in.mp4", "out.mp3", "mp3")).toEqual([
      "-i",
      "in.mp4",
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "2",
      "out.mp3",
    ]);
  });

  it("uses native aac for m4a", () => {
    expect(buildAudioArgs("in.mov", "out.m4a", "m4a")).toContain("aac");
  });

  it("uses pcm for wav", () => {
    expect(buildAudioArgs("in.webm", "out.wav", "wav")).toContain("pcm_s16le");
  });
});

describe("audioOutputName", () => {
  it("swaps the extension", () => {
    expect(audioOutputName("clip.mp4", "mp3")).toBe("clip.mp3");
  });

  it("falls back to 'audio' for an empty base", () => {
    expect(audioOutputName("", "wav")).toBe("audio.wav");
  });
});
