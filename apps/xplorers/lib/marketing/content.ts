export const NAV = [
  { href: "/whats-on", label: "What's On" },
  { href: "/kids", label: "Kids" },
  { href: "/families", label: "Families & Adults" },
  { href: "/schools", label: "Schools" },
  { href: "/birthdays", label: "Birthdays" },
  { href: "/the-place", label: "The Place" },
] as const;

export const BOARD = [
  {
    time: "9:30 AM",
    title: "Science Wing",
    spec: "School group · Booked · 30 students",
    spots: "Private",
    tone: "muted",
  },
  {
    time: "2:00 PM",
    title: "Think Like a Scientist",
    spec: "Age 5–12 · 90 min · Drop-off · $68",
    spots: "4 spots left",
    tone: "action",
  },
  {
    time: "4:00 PM",
    title: "Cardboard Creations",
    spec: "Age 6+ · 90 min · Machines that move",
    spots: "Full — join waitlist",
    tone: "muted",
  },
  {
    time: "5:00 PM",
    title: "Kids Club",
    spec: "Age 6+ · Freestyle build · $35/hr",
    spots: "Drop in",
    tone: "ink",
  },
  {
    time: "7:00 PM",
    title: "Crafting Club",
    spec: "Adults · Mini woodwork · Drink included · $58",
    spots: "2 spots left",
    tone: "action",
  },
] as const;

export type BoardTone = (typeof BOARD)[number]["tone"];

export const METHOD_CHAIN = [
  { word: "Curious", oops: false },
  { word: "Try", oops: false },
  { word: "Make", oops: false },
  { word: "Oops", oops: true, note: "the important bit" },
  { word: "Try again", oops: false },
  { word: "Aha", oops: false },
  { word: "Share", oops: false },
] as const;

export const BENCHES = [
  { id: "Bench 01", work: "Kids Club · box kite" },
  { id: "Bench 02", work: "Crafting Club · finger joints" },
  { id: "Outdoor", work: "Soap tray · curing" },
] as const;

export const ROUTES = [
  {
    href: "/kids",
    title: "Kids",
    body: "Science, making, camps and after-school.",
    cta: "Explore kids",
    tone: "paper",
    photo: "[ Line drawing — cardboard\nmachine, spark ink · 1:1 ]",
    photoMobile: "[ Line\ndrawing ]",
    aria: "Placeholder: line illustration of a cardboard machine in blue ink",
  },
  {
    href: "/families",
    title: "Families & Adults",
    body: "Workshops, crafting, making, community.",
    cta: "Explore adults",
    tone: "blush",
    photo: "[ Photo — adult hands sanding\nwood, close crop · 1:1 ]",
    photoMobile: "[ Hands\nsanding ]",
    aria: "Placeholder: photo of adult hands sanding a small wooden object",
  },
  {
    href: "/schools",
    title: "Schools & Companies",
    body: "Custom workshops and team experiences.",
    cta: "Work with us",
    tone: "blueprint",
    photo: "[ Photo — thirty students,\nlong benches, tools out · 1:1 ]",
    photoMobile: "[ School\ngroup ]",
    aria: "Placeholder: photo of a school group at long worktables",
  },
] as const;
