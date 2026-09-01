import type { Adapters } from "./household";

/**
 * Effect adapters.
 *
 * Production adapters (RingChimeVoiceAdapter, SnsNotifyAdapter, snapshot
 * download via the Ring media endpoint) implement the same interface and are
 * selected by configuration. The demo adapters journal every action with a
 * clear Simulated marker; nothing in the pipeline knows the difference,
 * which is exactly the point: the engine under demo is the production engine.
 *
 * Week 1 gate note (see TECHNICAL_DESIGN.md): the Ring chime audio playback
 * endpoint (POST /v1/devices/{id}/media/audio/playback, Chime Controls
 * capability) is the primary voice path. Its accepted formats are being
 * verified; the Echo announcement and companion device adapters are the
 * documented fallbacks, and the adapter seam is where they plug in.
 */

export interface JournalEntry {
  at: string;
  action: string;
  detail: string;
  simulated: boolean;
}

export class DemoAdapters implements Adapters {
  readonly journal: JournalEntry[] = [];

  private log(action: string, detail: string, at: string): string {
    this.journal.push({ at, action, detail, simulated: true });
    return detail;
  }

  async playVoice(incidentId: string, at: string): Promise<string> {
    return this.log(
      "PLAY_VOICE",
      `Simulated: played the family voice message at the door for ${incidentId}`,
      at,
    );
  }

  async fetchSnapshot(incidentId: string, at: string): Promise<string> {
    return this.log(
      "FETCH_SNAPSHOT",
      `Simulated: requested a doorway snapshot for ${incidentId}`,
      at,
    );
  }

  async notifyCaregiver(incidentId: string, at: string): Promise<string> {
    return this.log(
      "NOTIFY_CAREGIVER",
      `Simulated: sent push and SMS to the caregiver for ${incidentId}`,
      at,
    );
  }

  async escalate(incidentId: string, at: string): Promise<string> {
    return this.log(
      "ESCALATE",
      `Simulated: alerted escalation contacts for ${incidentId}`,
      at,
    );
  }
}
