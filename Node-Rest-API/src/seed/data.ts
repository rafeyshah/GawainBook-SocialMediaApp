// Demo content for GawainBook. Everything here is clearly sample data:
// sample accounts use the reserved ".invalid" email domain and say so in
// their bio, and all discussion text was written for this demo. Books are
// public domain (decision D5); covers are generated, so no image rights.

export const SAMPLE_EMAIL_DOMAIN = "sample.gawainbook.invalid";
export const SAMPLE_BIO = "Sample reader · demo account";

export interface SeedBook {
  slug: string;
  title: string;
  author: string;
  publishedYear: number;
  coverColor: string;
  description: string;
  chapters: string[]; // index 0 = chapter 1
}

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `Chapter ${i + 1}`);

export const BOOKS: SeedBook[] = [
  {
    slug: "pride-and-prejudice",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    publishedYear: 1813,
    coverColor: "#7a3e48",
    description:
      "Elizabeth Bennet is clever, quick to judge and in no hurry to marry. When the proud Mr Darcy arrives in the neighbourhood, first impressions set off one of literature's best-loved romances.",
    chapters: numbered(61),
  },
  {
    slug: "the-wonderful-wizard-of-oz",
    title: "The Wonderful Wizard of Oz",
    author: "L. Frank Baum",
    publishedYear: 1900,
    coverColor: "#2f7553",
    description:
      "A cyclone carries Dorothy from grey Kansas to the colourful Land of Oz, where she sets off along the yellow brick road with three unlikely friends to find the Wizard who might send her home.",
    chapters: [
      "The Cyclone",
      "The Council with the Munchkins",
      "How Dorothy Saved the Scarecrow",
      "The Road Through the Forest",
      "The Rescue of the Tin Woodman",
      "The Cowardly Lion",
      "The Journey to the Great Oz",
      "The Deadly Poppy Field",
      "The Queen of the Field Mice",
      "The Guardian of the Gate",
      "The Wonderful City of Oz",
      "The Search for the Wicked Witch",
      "The Rescue",
      "The Winged Monkeys",
      "The Discovery of Oz, the Terrible",
      "The Magic Art of the Great Humbug",
      "How the Balloon Was Launched",
      "Away to the South",
      "Attacked by the Fighting Trees",
      "The Dainty China Country",
      "The Lion Becomes the King of Beasts",
      "The Country of the Quadlings",
      "Glinda The Good Witch Grants Dorothy's Wish",
      "Home Again",
    ],
  },
  {
    slug: "persuasion",
    title: "Persuasion",
    author: "Jane Austen",
    publishedYear: 1817,
    coverColor: "#3d5a80",
    description:
      "Eight years after being persuaded to break off her engagement, Anne Elliot meets Captain Wentworth again. A quiet, grown-up love story about second chances.",
    chapters: numbered(24),
  },
];

export const SOURCE_NOTE =
  "Public domain in the EU and US. The exact edition and source file must be verified before any text is processed (decision D5).";

export interface SeedUser {
  username: string;
  city?: string;
  // bookSlug → [shelf, chapter]
  reading: Record<string, ["want" | "reading" | "finished", number]>;
}

export const SAMPLE_USERS: SeedUser[] = [
  { username: "elinor_reads", city: "Bath", reading: { "pride-and-prejudice": ["reading", 15], "the-wonderful-wizard-of-oz": ["want", 0] } },
  { username: "darcy_fan", city: "Derbyshire", reading: { "pride-and-prejudice": ["finished", 61], "the-wonderful-wizard-of-oz": ["finished", 24] } },
  { username: "marianne_b", city: "Devon", reading: { "pride-and-prejudice": ["reading", 3] } },
  { username: "lizzy_books", city: "Hertfordshire", reading: { "pride-and-prejudice": ["reading", 22], "persuasion": ["want", 0] } },
  { username: "tinwoodsman", city: "Kansas City", reading: { "the-wonderful-wizard-of-oz": ["reading", 12] } },
  { username: "dorothy_g", city: "Kansas", reading: { "the-wonderful-wizard-of-oz": ["finished", 24], "pride-and-prejudice": ["reading", 6] } },
  { username: "anne_elliot", city: "Lyme", reading: { "persuasion": ["reading", 5] } },
];

// Real accounts passed with --member get this reading state, so a signed-in
// reader sees unlocked AND locked discussions.
export const MEMBER_READING: SeedUser["reading"] = {
  "pride-and-prejudice": ["reading", 12],
  "the-wonderful-wizard-of-oz": ["reading", 6],
  "persuasion": ["want", 0],
};

export interface SeedComment {
  author: string;
  body: string;
}

export interface SeedThread {
  chapter: number;
  author: string;
  title: string;
  body: string;
  hoursAgo: number;
  comments: SeedComment[];
}

export interface SeedCircle {
  inviteCode: string; // fixed, so re-running the seed finds the same circle
  name: string;
  description: string;
  book: string;
  visibility: "public" | "private";
  schedule: string;
  owner: string;
  members: string[]; // besides the owner
  moderators?: string[];
  includeRealMembers: boolean;
  threads: SeedThread[];
}

export const CIRCLES: SeedCircle[] = [
  {
    inviteCode: "sample-netherfield",
    name: "The Netherfield Circle",
    description: "A friendly first read of Pride and Prejudice. Go at your own pace; discussions unlock chapter by chapter.",
    book: "pride-and-prejudice",
    visibility: "public",
    schedule: "About 5 chapters a week · check-in on Sundays",
    owner: "elinor_reads",
    members: ["darcy_fan", "marianne_b", "lizzy_books", "dorothy_g"],
    moderators: ["darcy_fan"],
    includeRealMembers: true,
    threads: [
      {
        chapter: 1,
        author: "elinor_reads",
        title: "That opening line",
        body: "We're barely a page in and the narrator is already teasing everyone. What did you make of Mr and Mrs Bennet's first conversation?",
        hoursAgo: 140,
        comments: [
          { author: "marianne_b", body: "Mr Bennet is so dry. I laughed out loud at how little he gives her." },
          { author: "darcy_fan", body: "Re-reading this, I notice how much the first chapter tells you about the whole family in one scene." },
        ],
      },
      {
        chapter: 3,
        author: "marianne_b",
        title: "The assembly at Meryton",
        body: "First ball, first impressions. Was anyone else on Elizabeth's side immediately?",
        hoursAgo: 120,
        comments: [
          { author: "elinor_reads", body: "Completely. Overhearing yourself described like that would sting." },
          { author: "dorothy_g", body: "I liked how she turned it into a funny story for her friends instead of sulking." },
        ],
      },
      {
        chapter: 6,
        author: "elinor_reads",
        title: "Charlotte's practical view of marriage",
        body: "Charlotte says happiness in marriage is 'entirely a matter of chance'. Practical, or a bit sad?",
        hoursAgo: 96,
        comments: [
          { author: "lizzy_books", body: "Both! It makes sense for her situation, but I'm glad Elizabeth pushes back." },
          { author: "dorothy_g", body: "I'm only just here and this is already my favourite conversation." },
        ],
      },
      {
        chapter: 10,
        author: "darcy_fan",
        title: "Letter-writing at Netherfield",
        body: "The drawing-room scene where everyone comments on Darcy's letter. Small moment, lots of character. Thoughts?",
        hoursAgo: 70,
        comments: [{ author: "elinor_reads", body: "Caroline trying so hard to get his attention is painful to watch." }],
      },
      {
        chapter: 13,
        author: "elinor_reads",
        title: "Enter Mr Collins",
        body: "His letter alone had me grinning. Who else is bracing themselves for his visit?",
        hoursAgo: 30,
        comments: [{ author: "lizzy_books", body: "Every sentence is a little more pompous than the last." }],
      },
      {
        chapter: 18,
        author: "lizzy_books",
        title: "The Netherfield ball",
        body: "So much happens at this ball, from awkward dances to embarrassing relatives. Which moment made you cringe most?",
        hoursAgo: 20,
        comments: [{ author: "darcy_fan", body: "Mrs Bennet talking loudly at supper. I had to put the book down for a minute." }],
      },
      {
        chapter: 34,
        author: "darcy_fan",
        title: "A turning point",
        body: "This chapter changes everything between the two of them. How did you feel about how it went?",
        hoursAgo: 12,
        comments: [],
      },
      {
        chapter: 61,
        author: "darcy_fan",
        title: "Final thoughts on the ending",
        body: "For everyone who's finished: did the ending work for you, and who was your favourite character overall?",
        hoursAgo: 6,
        comments: [],
      },
    ],
  },
  {
    inviteCode: "sample-pemberley",
    name: "Pemberley Book Club",
    description: "A small private club reading Pride and Prejudice slowly, two chapters a week.",
    book: "pride-and-prejudice",
    visibility: "private",
    schedule: "2 chapters a week · Wednesday evenings",
    owner: "lizzy_books",
    members: ["elinor_reads"],
    includeRealMembers: true,
    threads: [
      {
        chapter: 2,
        author: "lizzy_books",
        title: "Mr Bennet's sense of humour",
        body: "He clearly enjoys winding everyone up. Charming, or a bit unkind?",
        hoursAgo: 100,
        comments: [{ author: "elinor_reads", body: "Charming to read, but I wouldn't want him as my dad." }],
      },
      {
        chapter: 7,
        author: "elinor_reads",
        title: "Three miles through the mud",
        body: "Elizabeth walking to Netherfield to see Jane is such a great character moment.",
        hoursAgo: 50,
        comments: [{ author: "lizzy_books", body: "And everyone at Netherfield judging her muddy petticoat!" }],
      },
      {
        chapter: 20,
        author: "lizzy_books",
        title: "A proposal at Longbourn",
        body: "We've reached it! How did you react to how this proposal went?",
        hoursAgo: 8,
        comments: [],
      },
    ],
  },
  {
    inviteCode: "sample-yellow-brick",
    name: "Yellow Brick Readers",
    description: "Reading The Wonderful Wizard of Oz together, with snacks optional and spoilers locked.",
    book: "the-wonderful-wizard-of-oz",
    visibility: "public",
    schedule: "3 chapters a week · Friday chat",
    owner: "tinwoodsman",
    members: ["dorothy_g", "darcy_fan"],
    includeRealMembers: true,
    threads: [
      {
        chapter: 1,
        author: "tinwoodsman",
        title: "Everything in Kansas is grey",
        body: "Baum describes Kansas as completely grey. Why do you think he starts there?",
        hoursAgo: 130,
        comments: [
          { author: "dorothy_g", body: "So the colour of Oz hits harder when we get there." },
          { author: "darcy_fan", body: "Even Aunt Em and Uncle Henry are grey. Bleak but beautiful writing." },
        ],
      },
      {
        chapter: 3,
        author: "dorothy_g",
        title: "Meeting the Scarecrow",
        body: "He's convinced he has no brains, but he's already the one asking the clever questions.",
        hoursAgo: 90,
        comments: [{ author: "tinwoodsman", body: "Classic. The thing he wants most is the thing he already has." }],
      },
      {
        chapter: 5,
        author: "tinwoodsman",
        title: "A heart made of tin",
        body: "The Tin Woodman's backstory is darker than I remembered. Did it surprise you?",
        hoursAgo: 60,
        comments: [{ author: "dorothy_g", body: "Very! It's a sad story told in such a matter-of-fact way." }],
      },
      {
        chapter: 6,
        author: "dorothy_g",
        title: "The Cowardly Lion",
        body: "Is the Lion really a coward, or just someone who's scared and keeps going anyway?",
        hoursAgo: 36,
        comments: [{ author: "tinwoodsman", body: "The second one. Being afraid and still acting is the definition of courage." }],
      },
      {
        chapter: 11,
        author: "tinwoodsman",
        title: "Arriving at the Emerald City",
        body: "The green spectacles! What did you think of the city once they finally got there?",
        hoursAgo: 14,
        comments: [{ author: "dorothy_g", body: "I loved every detail of the gate and the Guardian." }],
      },
      {
        chapter: 15,
        author: "dorothy_g",
        title: "Meeting the Wizard, properly",
        body: "Big reveal chapter. How did you feel when you found out the truth?",
        hoursAgo: 9,
        comments: [],
      },
      {
        chapter: 24,
        author: "dorothy_g",
        title: "Home again",
        body: "For those who've finished: was the ending what you expected?",
        hoursAgo: 4,
        comments: [],
      },
    ],
  },
  {
    inviteCode: "sample-persuasion",
    name: "Persuasion Slow Read",
    description: "One chapter a day of Austen's last completed novel. New readers welcome.",
    book: "persuasion",
    visibility: "public",
    schedule: "1 chapter a day",
    owner: "anne_elliot",
    members: ["lizzy_books"],
    includeRealMembers: false,
    threads: [
      {
        chapter: 1,
        author: "anne_elliot",
        title: "Sir Walter and the baronetage",
        body: "Opening with a man reading about himself in a book of the nobility. Austen does not like Sir Walter much!",
        hoursAgo: 48,
        comments: [],
      },
    ],
  },
];

// A few feed posts so the Feed tab isn't empty.
export const POSTS: { author: string; desc: string; hoursAgo: number }[] = [
  { author: "elinor_reads", desc: "Started a Pride and Prejudice circle this week. Discussions unlock as you read, so no spoilers! 📚", hoursAgo: 150 },
  { author: "tinwoodsman", desc: "Re-reading Oz as an adult: the chapter titles alone are a joy. 'The Queen of the Field Mice'!", hoursAgo: 80 },
  { author: "darcy_fan", desc: "Finished Pride and Prejudice again. It gets better every time.", hoursAgo: 26 },
];

// Real accounts passed with --member follow these sample readers.
export const FOLLOWS_FOR_MEMBERS = ["elinor_reads", "tinwoodsman", "darcy_fan"];
