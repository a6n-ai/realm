import { postMetaEvent, type SendMetaEventArgs } from "@foundry/meta-pixel";
import { runInBackground } from "@/lib/runtime/background";
import { metaPixel } from "@/lib/services/meta-pixel/config";

/**
 * Fire-and-forget Conversions API send through the Settings → Meta Pixel connection. Never throws;
 * no-ops until a pixel ID and readable token are saved. Workers cancel an un-awaited promise when
 * the response ends, so it runs through runInBackground (waitUntil there, detached on Node).
 */
export function sendMetaEvent(args: SendMetaEventArgs): void {
  runInBackground(async () => {
    await postMetaEvent(await metaPixel.connection(), args);
  }, "meta capi");
}

/**
 * Same as sendMetaEvent but awaits the Graph POST. Use for Purchase on claim/settle so Workers
 * cannot end the isolate before Meta receives the event.
 */
export async function sendMetaEventAwait(args: SendMetaEventArgs): Promise<void> {
  await postMetaEvent(await metaPixel.connection(), args);
}
