// lib/news/blend.js — mixing news cards into the feed timeline on the device
// (web + mobile). Same rule as the backend's modules/news/blend.js, which
// serves /feed/timeline:
//   • few posts (cold start) → alternate post / card, then the rest of the cards
//   • otherwise → one card after every `every` posts
//   • cards keep their rank order; only where cards end up side by side
//     (after the posts run out) is a different kind pulled forward, so two
//     of the same kind don't sit next to each other when it can be avoided
//   • never a card first when posts exist
// → [{ type: 'post', post } | card]

export function blendTimeline(posts, cards, { every = 4, coldStartBelow = 5 } = {}) {
  const out = [];
  const queue = [...cards];

  if (posts.length < coldStartBelow) {
    for (const post of posts) {
      out.push({ type: "post", post });
      if (queue.length) out.push(queue.shift());
    }
    // Remaining cards are adjacent: vary the kind where possible.
    while (queue.length) {
      const prev = out.at(-1);
      const i = queue.findIndex((c) => c.type !== prev?.type);
      out.push(queue.splice(i >= 0 ? i : 0, 1)[0]);
    }
    return out;
  }

  let since = 0;
  for (const post of posts) {
    out.push({ type: "post", post });
    if (++since >= every && queue.length) {
      out.push(queue.shift());
      since = 0;
    }
  }
  return out;
}

/** Cards needed to cover `postCount` posts (cold start shows a full page of news). */
export const cardsNeeded = (postCount, { every = 4, coldStartBelow = 5, coldStartCards = 10 } = {}) =>
  postCount < coldStartBelow ? coldStartCards : Math.ceil(postCount / every);
