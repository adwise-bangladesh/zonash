// ---------- Deterministic social-proof reviews for /step landing ----------
// A pool of generic reviews with a social source. For each product slug we
// deterministically pick a subset so the same product always shows the same
// reviews across visits and devices.

export type ReviewSource = "facebook" | "messenger" | "whatsapp" | "tiktok" | "instagram";

export type FakeReview = {
  name: string;
  city: string;
  stars: number;
  text: string;
  source: ReviewSource;
  days: number;
};

export const REVIEW_POOL: FakeReview[] = [
  { name: "Rahim Uddin", city: "Dhaka", stars: 5, text: "Product ta hate paisi, quality onek valo. Cash on delivery te easy holo.", source: "facebook", days: 2 },
  { name: "Sadia Akter", city: "Chattogram", stars: 5, text: "Packaging neat, exactly picture er moto. Highly recommended!", source: "instagram", days: 4 },
  { name: "Tanvir Hasan", city: "Sylhet", stars: 4, text: "Good product, delivery was 2 days. Support team was helpful.", source: "messenger", days: 7 },
  { name: "Nusrat Jahan", city: "Khulna", stars: 5, text: "Onek shundor lagse. Price er tulonai quality osadharon.", source: "facebook", days: 3 },
  { name: "Imran Hossain", city: "Rajshahi", stars: 5, text: "Fast delivery and genuine product. Will order again inshaAllah.", source: "whatsapp", days: 5 },
  { name: "Mitu Rahman", city: "Dhaka", stars: 5, text: "Bou er jonno nisilam, khub khushi hoye gese. Thanks Zonash!", source: "facebook", days: 1 },
  { name: "Arif Chowdhury", city: "Cumilla", stars: 4, text: "Overall satisfied. Item description er sathe 100% match.", source: "messenger", days: 6 },
  { name: "Shirin Sultana", city: "Barishal", stars: 5, text: "Really loved the finish. Amar friend ra o order dise ekhon.", source: "instagram", days: 9 },
  { name: "Kamrul Islam", city: "Rangpur", stars: 5, text: "Value for money. Delivery man was polite, COD process shohoj.", source: "whatsapp", days: 4 },
  { name: "Fahmida Nabila", city: "Dhaka", stars: 5, text: "Just wow! Gift dilam mommy ke, uni khub pochondo korchen.", source: "tiktok", days: 2 },
  { name: "Sabbir Ahmed", city: "Narayanganj", stars: 5, text: "Product genuine, seller trustworthy. 10/10 experience.", source: "facebook", days: 8 },
  { name: "Runa Laila", city: "Mymensingh", stars: 4, text: "Delivery slightly late but product perfect. Overall bhalo laglo.", source: "messenger", days: 10 },
  { name: "Jahid Hasan", city: "Bogura", stars: 5, text: "Ekdom original jinis. Amazon er cheye bhalo experience.", source: "whatsapp", days: 3 },
  { name: "Rezaul Karim", city: "Gazipur", stars: 5, text: "Order kore 24 ghontar moddhe hate paisi. Impressive!", source: "facebook", days: 1 },
  { name: "Tania Sharmin", city: "Dhaka", stars: 5, text: "Instagram ads e dekhesilam. Real product, quality legit.", source: "instagram", days: 5 },
  { name: "Mahmud Alam", city: "Feni", stars: 4, text: "Nice packaging, product ok. Support khub friendly chilo.", source: "messenger", days: 11 },
  { name: "Sumaiya Islam", city: "Chattogram", stars: 5, text: "Sob theke boro kotha — jinis ta original. Thank you brand!", source: "facebook", days: 6 },
  { name: "Rakib Uddin", city: "Tangail", stars: 5, text: "Value onek beshi payment er tulonai. Definitely repeat customer.", source: "whatsapp", days: 4 },
  { name: "Ayesha Siddika", city: "Dhaka", stars: 5, text: "Tiktok e dekhe order dilam, honestly khub e valo lagse.", source: "tiktok", days: 2 },
  { name: "Habib Rahman", city: "Jessore", stars: 5, text: "Delivery timely, product superb. Recommended to my whole family.", source: "facebook", days: 7 },
  { name: "Nadia Afrin", city: "Dhaka", stars: 5, text: "Photo r sathe hubohu mile geche. Onek khushi ami.", source: "instagram", days: 3 },
  { name: "Shakil Ahmed", city: "Narsingdi", stars: 4, text: "Product bhalo, price o okay. Genuine seller er kase order dilam.", source: "messenger", days: 8 },
  { name: "Farzana Yasmin", city: "Chattogram", stars: 5, text: "Bou khub khushi. Ei rokom quality Bangladesh e rare.", source: "whatsapp", days: 5 },
  { name: "Mostafizur Rahman", city: "Dhaka", stars: 5, text: "Support responded within 10 minutes. COD very smooth.", source: "facebook", days: 2 },
  { name: "Rupa Khatun", city: "Kishoreganj", stars: 5, text: "Ma ke gift dilam, uni onek proud. Ashite kotha bola shohoj.", source: "messenger", days: 9 },
  { name: "Ibrahim Khalil", city: "Sylhet", stars: 5, text: "Trusted brand, next order er jonno wait korchi.", source: "facebook", days: 4 },
  { name: "Marzia Akter", city: "Dhaka", stars: 5, text: "Really beautiful product. Insta reel e dekhesilam.", source: "instagram", days: 3 },
  { name: "Ashraf Ali", city: "Chandpur", stars: 4, text: "Good product overall. Slight box damage chilo but item safe.", source: "whatsapp", days: 6 },
  { name: "Nazmul Hoque", city: "Dhaka", stars: 5, text: "Genuine 100%. Fake er tension nai ei brand er sathe.", source: "facebook", days: 1 },
  { name: "Salma Begum", city: "Barishal", stars: 5, text: "Buri ma-e o pochondo korchen. Thanks for the fast service.", source: "messenger", days: 10 },
  { name: "Ridoy Sarker", city: "Rajshahi", stars: 5, text: "Tiktok video real, jinis exact same delivery paisi.", source: "tiktok", days: 5 },
  { name: "Farhana Islam", city: "Dhaka", stars: 5, text: "Ei brand er quality e amake surprise diyese, worth every taka.", source: "instagram", days: 2 },
  { name: "Tanjina Rahman", city: "Cox's Bazar", stars: 4, text: "Bhalo item, delivery 3 din. Support khub caring chilo.", source: "whatsapp", days: 8 },
  { name: "Faridul Islam", city: "Dinajpur", stars: 5, text: "Rural area teo delivery correct time e paisi. Kudos!", source: "facebook", days: 4 },
  { name: "Rima Akter", city: "Dhaka", stars: 5, text: "Bhai amake bolse original ki na. Yes 100% original.", source: "messenger", days: 3 },
  { name: "Sohel Rana", city: "Pabna", stars: 5, text: "Family er sobai khushi. Photo pathaite bollam friends re o.", source: "whatsapp", days: 6 },
  { name: "Munni Khatun", city: "Dhaka", stars: 5, text: "Insta te scroll kore paisilam, no regrets at all.", source: "instagram", days: 2 },
  { name: "Zahidul Alam", city: "Noakhali", stars: 5, text: "Cash on delivery mane confidence. Thanks Zonash team.", source: "facebook", days: 7 },
  { name: "Sharmin Sultana", city: "Dhaka", stars: 4, text: "Onek shundor pack korchen. Uphaar hisebe dilam bou ke.", source: "messenger", days: 5 },
  { name: "Nayeem Hasan", city: "Bogura", stars: 5, text: "Tiktok ads e boishesh trust hoyese, real product paisi.", source: "tiktok", days: 3 },
];

export const SOURCE_META: Record<ReviewSource, { label: string; color: string; bg: string; icon: string }> = {
  facebook:  { label: "Facebook",  color: "#1877F2", bg: "#1877F215", icon: "M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5h1.65V4.6c-.29-.04-1.27-.13-2.42-.13-2.4 0-4.05 1.47-4.05 4.16v2.27H7.5V14h2.73v8h3.27z" },
  messenger: { label: "Messenger", color: "#0084FF", bg: "#0084FF15", icon: "M12 2C6.48 2 2 6.14 2 11.25c0 2.88 1.42 5.44 3.66 7.15V22l3.34-1.84c.9.25 1.85.39 2.83.39C17.52 20.55 22 16.4 22 11.3 22 6.14 17.52 2 12 2zm1.06 12.32l-2.53-2.7-4.94 2.7 5.44-5.77 2.6 2.7 4.88-2.7-5.45 5.77z" },
  whatsapp:  { label: "WhatsApp",  color: "#25D366", bg: "#25D36615", icon: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487 2.981 1.287 2.981.858 3.518.804.537-.055 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.38 5.06L2 22l5.06-1.32A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" },
  tiktok:    { label: "TikTok",    color: "#000000", bg: "#00000010", icon: "M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.68a8.16 8.16 0 0 0 4.77 1.52V6.75a4.85 4.85 0 0 1-1.84-.06z" },
  instagram: { label: "Instagram", color: "#E4405F", bg: "#E4405F15", icon: "M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 2.16c-3.14 0-3.51.01-4.75.07-.99.05-1.53.21-1.89.35-.47.18-.81.4-1.16.76-.36.36-.58.69-.76 1.16-.14.36-.3.9-.35 1.89-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05.99.21 1.53.35 1.89.18.47.4.81.76 1.16.36.36.69.58 1.16.76.36.14.9.3 1.89.35 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c.99-.05 1.53-.21 1.89-.35.47-.18.81-.4 1.16-.76.36-.36.58-.69.76-1.16.14-.36.3-.9.35-1.89.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-.99-.21-1.53-.35-1.89a3.11 3.11 0 0 0-.76-1.16 3.11 3.11 0 0 0-1.16-.76c-.36-.14-.9-.3-1.89-.35-1.24-.06-1.61-.07-4.75-.07zm0 3.68a3.96 3.96 0 1 1 0 7.92 3.96 3.96 0 0 1 0-7.92zm0 2.16a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm5.04-2.4a.96.96 0 1 1-1.92 0 .96.96 0 0 1 1.92 0z" },
};

function hashSlug(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic count between 340 – 2800 per slug (for social-proof label). */
export function fakeReviewCount(slug: string): number {
  return 340 + (hashSlug(slug) % 2461);
}

/** Deterministic subset of REVIEW_POOL for a given slug (Fisher-Yates + seeded LCG). */
export function pickReviewsForSlug(slug: string, count = 20): FakeReview[] {
  const seed = hashSlug(slug);
  const indices = REVIEW_POOL.map((_, i) => i);
  let state = seed || 1;
  for (let i = indices.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count).map((i) => REVIEW_POOL[i]);
}
