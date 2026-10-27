// /wallet/send/<token>[/<to>]?to=&amount= — the app's deep-link shape
// (Navigation.js parseDeepLink "send"), also what Receive's payment links use.
// Normalises into /wallet/send?token=&to=&amount=.
import { redirect } from "next/navigation";

export default async function SendDeepLink({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams({ token });
  if (sp.to) q.set("to", sp.to);
  if (sp.amount) q.set("amount", sp.amount);
  redirect(`/wallet/send?${q}`);
}
