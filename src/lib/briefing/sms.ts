/**
 * Delivery note: AnimeBirthday briefs are sent via local macOS iMessage
 * (same pattern as sold-out tracker), not Twilio.
 * See scripts/send-briefing-imessage.mjs + LaunchAgent on the mule.
 */

export function smsConfigured(): boolean {
  return false;
}

export async function sendSms(_body: string): Promise<{ sid: string }> {
  throw new Error(
    "Twilio removed — use scripts/send-briefing-imessage.mjs on the mule Mac",
  );
}
