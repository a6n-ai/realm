export const NAV = [
  { href: "/#programmes", label: "Programmes" },
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
export type ProgrammeWhen = "wd" | "we" | "both";

export type Programme = {
  key: ProgrammeKey;
  when: ProgrammeWhen;
  tag: string;
  title: string;
  short: string;
  schedule: string;
  detail: string;
  description: string;
  price: string;
  ctaLabel?: string;
};

export const PROGRAMMES: Programme[] = [
  {
    key: "explore",
    when: "wd",
    tag: "Weekdays",
    title: "After-School Explore & Play",
    short: "Explore & Play",
    schedule: "Mon, Tue, Thu & Fri · 2–6pm",
    detail: "Recommended ages 3–7 · Small groups of 4–6 · Max. 6 participants",
    description:
      "Our in-house, weekly themed discovery curriculum invites children to explore science, making and creative play.",
    price: "From S$68 / child",
  },
  {
    key: "scientist",
    when: "wd",
    tag: "Weekdays",
    title: "Think Like a Scientist",
    short: "Think Like a Scientist",
    schedule: "1st & 3rd Wed · 4:30–6pm",
    detail: "Recommended primary ages 7–12",
    description: "Observe, wonder, test and discover. Excludes June and December; food sessions may finish at 6:30pm.",
    price: "S$68 / child · 90 minutes",
  },
  {
    key: "sensory",
    when: "both",
    tag: "Weekdays & weekends",
    title: "Sensory Play",
    short: "Sensory Play",
    schedule: "Sunday · 9:30–11:30am · Other times by arrangement",
    detail: "Explore at your own pace",
    description: "Explore textures and water as you build, play and get wet! Bring a change of clothes and a towel.",
    price: "From S$68 / child",
  },
  {
    key: "private",
    when: "both",
    tag: "Weekdays & weekends",
    title: "Private & Semi-Private Sessions",
    short: "Private sessions",
    schedule: "Mon–Sat · Starts from 9am · By arrangement",
    detail: "One project per child",
    description:
      "Choose a start time of 9am, 9:30am, 10am or 10:30am for a 90-minute session shaped around your interests.",
    price: "S$160 for 1 · S$180 for 2",
  },
  {
    key: "bake",
    when: "we",
    tag: "Weekends",
    title: "Bake, Cook & Discover!",
    short: "Bake, Cook & Discover!",
    schedule: "Every Saturday · From 1:30pm",
    detail: "Small groups of 4–6 · Max. 6 participants",
    description:
      "Hands-on kitchen fun for curious children. Practise measuring, discover food science and build confidence making something yummy.",
    price: "S$98 / child · 2 hours",
  },
  {
    key: "wood",
    when: "we",
    tag: "Weekends",
    title: "Make a Toy / Woodwork Club",
    short: "Woodwork Club",
    schedule: "Fri–Sun · 6–9pm (extensions available)",
    detail: "Usually 6–8 participants",
    description: "Explore the tools. Learn the skills. Create something of your own.",
    price: "S$48 taster · S$78 for 2 hours",
  },
  {
    key: "camps",
    when: "both",
    tag: "Weekdays & weekends",
    title: "Camps for Fun",
    short: "Camps for Fun",
    schedule: "School holidays & weekends",
    detail: "Dates and times announced separately",
    description: "More time to experiment, make, explore and enjoy new experiences together.",
    price: "Enquire for dates & pricing",
    ctaLabel: "Enquire",
  },
];

export function programmesFor(keys: ProgrammeKey[]) {
  return PROGRAMMES.filter((p) => keys.includes(p.key));
}

/** A cell is a programme slot, or a plain note. `key` on a note lets the legend dim it. */
export type WeekCell = { programme: ProgrammeKey; time: string; title: string } | { note: string; key?: ProgrammeKey };

const BY_ARRANGEMENT: WeekCell = { note: "✦ By arrangement", key: "private" };
const EXPLORE: WeekCell = { programme: "explore", time: "From 2pm", title: "Explore & Play" };
const WOOD: WeekCell = { programme: "wood", time: "6–9pm", title: "Woodwork Club" };

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const WEEK: { slot: string; cells: WeekCell[] }[] = [
  {
    slot: "9am–12pm",
    cells: [
      BY_ARRANGEMENT,
      BY_ARRANGEMENT,
      BY_ARRANGEMENT,
      BY_ARRANGEMENT,
      BY_ARRANGEMENT,
      BY_ARRANGEMENT,
      { programme: "sensory", time: "9:30–11:30am", title: "Sensory Play" },
    ],
  },
  {
    slot: "1:30–4:30pm",
    cells: [
      EXPLORE,
      EXPLORE,
      BY_ARRANGEMENT,
      EXPLORE,
      EXPLORE,
      { programme: "bake", time: "Every Saturday from 1:30pm", title: "Bake, Cook & Discover!" },
      BY_ARRANGEMENT,
    ],
  },
  {
    slot: "4:30–6pm",
    cells: [
      EXPLORE,
      EXPLORE,
      { programme: "scientist", time: "Weeks 1 & 3", title: "Think Like a Scientist" },
      EXPLORE,
      EXPLORE,
      BY_ARRANGEMENT,
      BY_ARRANGEMENT,
    ],
  },
  {
    slot: "6–9pm",
    cells: [
      { note: "Extension until 8pm" },
      { note: "Extension until 8pm" },
      { note: "Food sessions may finish at 6:30pm" },
      { note: "Extension on request" },
      WOOD,
      WOOD,
      WOOD,
    ],
  },
];

export const PRICES = {
  caption: "Per child · S$10 extra per visit on Friday–Sunday",
  columns: ["Duration", "Mon–Thu", "Fri–Sun"],
  rows: [
    ["90 minutes", "S$68", "S$78"],
    ["2 hours", "S$88", "S$98"],
    ["3 hours", "S$128", "S$138"],
    ["4 hours", "S$158", "S$168"],
    ["5 hours", "S$178", "S$188"],
  ],
};

export const QUOTES: { quote: string; who: string; programme?: ProgrammeKey }[] = [
  { programme: "explore", quote: "The sessions are very fun. The projects are all very interesting.", who: "Kaedi, 8" },
  {
    programme: "private",
    quote: "I like making lip balm with Auntie Jonn. Now I can make so many to give to my friends.",
    who: "Noelle, 3",
  },
  { quote: "Auntie Jonn is kind and gentle. There are lots of fun experiments!", who: "EmRu, 6" },
];
