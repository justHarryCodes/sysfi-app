// lib/people.js — profile cards (backend api/v1/people). Shared by web and
// mobile (metro maps @/lib).
//   { id, username, displayName, avatarUrl, sharedTribes: [...], canMessage }
// canMessage: "yes" | "request" | "no_keys" | "not_accepting" | "blocked" | "self" | "off"
import { api } from "@/lib/api";

export const getPerson = (id) => api.get(`/people/${encodeURIComponent(id)}`);

/** Can the Message button start (or open) a conversation? */
export const canStartMessage = (canMessage) => canMessage === "yes" || canMessage === "request";

/** Why the Message button is off, in the card's words (null when it's on or hidden). */
export const messageBlockedReason = (canMessage) =>
  ({
    no_keys: "They haven’t turned on messages yet.",
    not_accepting: "They aren’t accepting message requests.",
    blocked: "You can’t message this person.",
  })[canMessage] ?? null;
