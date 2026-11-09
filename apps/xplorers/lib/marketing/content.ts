export const NAV = [
  { href: "/classes", label: "Classes" },
  { href: "/whats-on", label: "What's on" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/founder", label: "Meet the educator" },
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

/** The founder, in their own words from the xplorers.life About page. */
export const FOUNDER = {
  name: "Jonnansical",
  short: "Jonn",
  role: "Child-Centred Learning Mentor",
  photo: "/studio/founder-jonn.jpg",
  story: [
    "Having seen and experienced life differently since young, I believe every child has their own way of learning and deserves to be understood, supported and encouraged to grow at their own pace.",
    "My journey began almost three decades ago as a recreational and competitive figure skating coach. Life had other plans, leading me to homeschool my child with autism (2e, twice exceptional) and support children with diverse learning needs and their families.",
  ],
  credential: "Specialist Diploma in teaching children with special needs",
  calling: [
    "What began as a personal journey became a calling: to help as many children as possible discover their strengths, build confidence and thrive in their own ways.",
    "With a Specialist Diploma in teaching children with special needs, I embrace each child's unique abilities and interests.",
  ],
  connection: [
    "Every child learns differently. I begin by building trust, understanding their interests and creating a space where they feel comfortable exploring, belonging and discovering what they can do.",
    "The goal isn't for children to depend on me. It's to help them develop the confidence and skills to keep growing independently.",
  ],
  /** The Blue Morpho life cycle the founder uses for the studio's five values. */
  growth: [
    { word: "Connect", src: "/studio/morpho-egg.webp", alt: "Blue Morpho eggs on a green leaf" },
    { word: "Explore", src: "/studio/morpho-caterpillar.webp", alt: "Blue Morpho caterpillar" },
    { word: "Belong", src: "/studio/morpho-chrysalis.webp", alt: "Green Blue Morpho chrysalis" },
    { word: "Create", src: "/studio/morpho-emerging.webp", alt: "Blue Morpho emerging from its chrysalis" },
    { word: "Grow", src: "/studio/morpho-butterfly.webp", alt: "Adult Blue Morpho butterfly with blue wings" },
  ],
  approach: [
    { title: "Observe", body: "Interests, pace, strengths, preferences and sensory needs, without expecting a child to fit a fixed class." },
    { title: "Spark", body: "STEAM, sensory play and creative making to spark curiosity and thoughtfully introduce new challenges." },
    { title: "Nurture", body: "Confidence, social connections, independence and practical life skills, working closely with families." },
  ],
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
