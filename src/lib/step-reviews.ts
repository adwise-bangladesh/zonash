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

import type { ComponentType, SVGProps } from "react";
import { SiFacebook, SiMessenger, SiWhatsapp, SiTiktok, SiInstagram } from "react-icons/si";

export const SOURCE_META: Record<
  ReviewSource,
  { label: string; color: string; bg: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }
> = {
  facebook:  { label: "Facebook",  color: "#1877F2", bg: "#1877F215", Icon: SiFacebook },
  messenger: { label: "Messenger", color: "#0084FF", bg: "#0084FF15", Icon: SiMessenger },
  whatsapp:  { label: "WhatsApp",  color: "#25D366", bg: "#25D36615", Icon: SiWhatsapp },
  tiktok:    { label: "TikTok",    color: "#000000", bg: "#00000010", Icon: SiTiktok },
  instagram: { label: "Instagram", color: "#E4405F", bg: "#E4405F15", Icon: SiInstagram },
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
