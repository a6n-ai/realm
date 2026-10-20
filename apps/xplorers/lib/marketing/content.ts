export const NAV = [
  { href: "/classes", label: "Classes" },
  { href: "/whats-on", label: "What's on" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/the-place", label: "Our little space" },
  { href: "/contact", label: "Find us" },
] as const;

export const CONTACT = {
  email: "hello@xplorers.life",
  address: "Upper Bukit Timah Old Fire Station · #01-10/11 · Singapore 588207",
  short: "Old Bukit Timah Fire Station, Singapore",
  maps: "https://www.google.com/maps/search/?api=1&query=Upper+Bukit+Timah+Old+Fire+Station+Singapore+588207",
  facebook: "https://www.facebook.com/Sci.Xplorers.life",
  instagram: "https://www.instagram.com/science_xplorers/",
} as const;

export type ProgrammeKey = "explore" | "scientist" | "sensory" | "private" | "bake" | "wood" | "camps";
export const QUOTES: { quote: string; who: string; programme?: ProgrammeKey }[] = [
  { programme: "explore", quote: "The sessions are very fun. The projects are all very interesting.", who: "Kaedi, 8" },
  {
    programme: "private",
    quote: "I like making lip balm with Auntie Jonn. Now I can make so many to give to my friends.",
    who: "Noelle, 3",
  },
  { quote: "Auntie Jonn is kind and gentle. There are lots of fun experiments!", who: "EmRu, 6" },
];
