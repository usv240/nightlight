import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { RingClient } from "./ring";

/**
 * The voice path, and what happens when it fails.
 *
 * Nightlight's entire promise is that an unusual 3am doorway event is
 * answered by a familiar voice before anyone is woken. If that voice does
 * not actually play, the promise is not merely unmet, it is dangerous: the
 * incident state machine advances to WATCHING and waits to see whether the
 * voice settled things, so a silent failure means nothing happened at the
 * door AND nobody was told. The person is out, and the house is quiet.
 *
 * So the voice is a chain, not a call. Paths are tried in order, every
 * attempt is recorded, and if every path fails the caller is told so that it
 * can wake the caregiver immediately rather than waiting for a calm that was
 * never attempted. Degrading to "wake someone" is always safe. Degrading to
 * silence never is.
 *
 * Order, and why:
 *  1. Ring chime, family recording. The real thing: a voice the person
 *     knows, on the device already at the door.
 *  2. Ring chime, Polly synthesis. Used when the family has not recorded a
 *     message yet, which is every household on its first night, and when the
 *     recording is missing or unreadable. A calm synthesized sentence at the
 *     door is worth far more than nothing, and it means the system protects
 *     a family before they have finished setting it up.
 *  3. Nothing. Reported as failure so the caller escalates.
 */

export interface VoiceAttempt {
  path: string;
  ok: boolean;
  detail: string;
}

export interface VoiceResult {
  ok: boolean;
  /** Which path actually produced sound, if any. */
  path: string | null;
  attempts: VoiceAttempt[];
}

export interface VoicePath {
  readonly name: string;
  play(incidentId: string, at: string): Promise<string>;
}

/** Path 1: the family's own recording, played on the Ring device. */
export class RingRecordedVoice implements VoicePath {
  readonly name = "ring-chime-family-recording";

  constructor(
    private readonly ring: RingClient,
    private readonly deviceId: string,
    private readonly audioRef: string,
  ) {}

  async play(incidentId: string): Promise<string> {
    await this.ring.playChimeAudio(this.deviceId, this.audioRef);
    return `Played the family recording at the door for ${incidentId}`;
  }
}

/**
 * Path 2: Amazon Polly synthesis, played on the Ring device.
 *
 * The synthesized line is deliberately fixed and boring. It is not generated
 * by a language model, because a sentence spoken to a disoriented person at
 * 3am is not a place for novelty, and because the detection path never
 * touches a model in this system. The voice is warm, short, and identical
 * every time, which is what makes it recognisable on the tenth night.
 */
export class PollySynthesizedVoice implements VoicePath {
  readonly name = "ring-chime-polly-synthesis";

  static readonly LINE =
    "It is night time. Everything is alright. Please come back inside and go back to bed.";

  constructor(
    private readonly ring: RingClient,
    private readonly deviceId: string,
    private readonly bucket: string,
    private readonly opts: {
      voiceId?: string;
      polly?: PollyClient;
      s3?: S3Client;
      line?: string;
    } = {},
  ) {}

  async play(incidentId: string): Promise<string> {
    const polly = this.opts.polly ?? new PollyClient({});
    const s3 = this.opts.s3 ?? new S3Client({});
    const line = this.opts.line ?? PollySynthesizedVoice.LINE;

    const speech = await polly.send(
      new SynthesizeSpeechCommand({
        Text: line,
        // Neural, not generative: generative refuses the speech marks the
        // rest of our tooling relies on, and neural is the calmer read.
        Engine: "neural",
        VoiceId: (this.opts.voiceId ?? "Joanna") as never,
        OutputFormat: "mp3",
      }),
    );
    if (!speech.AudioStream) {
      throw new Error("Polly returned no audio stream");
    }
    const bytes = await speech.AudioStream.transformToByteArray();

    // Deterministic key: the same household and line always resolve to the
    // same object, so repeated nights do not accumulate S3 clutter.
    const key = `voice/${this.deviceId}/nightlight-prompt.mp3`;
    await s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: "audio/mpeg",
      }),
    );

    await this.ring.playChimeAudio(this.deviceId, `s3://${this.bucket}/${key}`);
    return `Played a Polly-synthesized prompt at the door for ${incidentId} (no family recording available)`;
  }
}

/**
 * Tries each path in order and reports what happened.
 *
 * Never throws. A voice chain that throws would propagate into effect
 * dispatch, and the effect has already been claimed exactly-once by then, so
 * the throw would lose the incident entirely. Returning a result forces the
 * caller to decide, which is the decision we want visible in the code.
 */
export class VoiceChain {
  constructor(private readonly paths: VoicePath[]) {}

  get pathNames(): string[] {
    return this.paths.map((p) => p.name);
  }

  async play(incidentId: string, at: string): Promise<VoiceResult> {
    const attempts: VoiceAttempt[] = [];
    for (const path of this.paths) {
      try {
        const detail = await path.play(incidentId, at);
        attempts.push({ path: path.name, ok: true, detail });
        return { ok: true, path: path.name, attempts };
      } catch (err) {
        attempts.push({
          path: path.name,
          ok: false,
          detail: (err as Error).message,
        });
      }
    }
    return { ok: false, path: null, attempts };
  }
}
