import * as fs from "fs";
import * as path from "path";
import * as handlebars from "handlebars";
import * as puppeteer from "puppeteer";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";

export type ContentType =
  | "Motivational Quote"
  | "Exam Tips"
  | "Math in Real Life"
  | "Quizzes";

export type MultipleChoice = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
};

const contentColorMap: Record<ContentType, string> = {
  "Motivational Quote": "#B4A9EF",
  "Exam Tips": "#ADEBD1",
  "Math in Real Life": "#E1BBB7",
  Quizzes: "#F1B4A1",
};

function generateHtmlFilename(type: ContentType): string {
  return `${type}-${uuidv4()}.html`;
}

async function generateHtml(
  type: ContentType,
  quote: string | MultipleChoice,
  filename: string
): Promise<void> {
  const isQuiz = type === "Quizzes";
  const templatePath = path.resolve(
    "",
    !isQuiz ? "./templates/post.html" : "./templates/quiz.html"
  );
  const templateSource = fs.readFileSync(templatePath, "utf-8");
  const template = handlebars.compile(templateSource);

  const logoPath = path.resolve("", "./assets/logo.png");
  const commonConfig = {
    backgroundColor: contentColorMap[type],
    logoPath,
  };

  const templateConfig = isQuiz
    ? { ...(quote as MultipleChoice), ...commonConfig }
    : { quote, ...commonConfig };
  const html = template(templateConfig);

  const writeFile = util.promisify(fs.writeFile);
  const htmlOutputPath = path.resolve("", "posts", "html", filename);
  await writeFile(htmlOutputPath, html);
}

async function generatePngFromHtml(htmlFilename: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(
    "file://" + path.resolve("", "posts", "html", htmlFilename)
  );
  const outputPath = path.resolve(
    "",
    "posts",
    "png",
    htmlFilename.replace(".html", ".png")
  );
  await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
}

async function cleanupHtml() {
  const htmlFilesPath = path.resolve("", "posts", "html");
  const files = fs.readdirSync(htmlFilesPath);
  for (const file of files) {
    fs.unlinkSync(path.join(htmlFilesPath, file));
  }
  console.log("html files cleaned up");
}

const motivationalQuotes = [
  `Life is not about waiting for the storm to pass, it's about learning to dance in the rain.
 
 - Vivian Greene`,
  `The only way to do great work is to love what you do.

   - Steve Jobs`,
  //     `Believe you can and you're halfway there.

  //  - Theodore Roosevelt`,
  //     `Everything is hard before it is easy.

  //  - Johann Wolfgang von Goethe`,
  //     `Success is not final, failure is not fatal: it is the courage to continue that counts.

  //  - Winston Churchill`,
  //     `The future belongs to those who believe in the beauty of their dreams.

  //  - Eleanor Roosevelt`,
  //     `Don't watch the clock; do what it does. Keep going.

  //  - Sam Levenson`,
  //     `Your time is limited, don't waste it living someone else's life.

  //  - Steve Jobs`,
  //     `The only impossible journey is the one you never begin.

  //  - Tony Robbins`,
  //     `You don't have to be great to start, but you have to start to be great.

  //  - Zig Ziglar`
];

const examTips = [
  "Start studying at least two weeks before the test. Break big topics into smaller chunks and tackle one each day. This makes the work feel less scary and helps you remember better.",
  "Use colorful notes to organize different topics. Your brain remembers colors well, so try using blue for definitions, green for examples, and pink for important formulas.",
  // "Test yourself with practice questions. Don't just read your notes! When you try to answer questions, you learn what you know and what you need to work on.",
  // "Get enough sleep the week before your exam, not just the night before. A tired brain doesn't learn well. Try to sleep 8 hours each night.",
  // "Make a study checklist. Write down everything you need to know and check off topics as you learn them. This helps you track your progress and feels great!",
  // "Teach the material to someone else - a friend, parent, or even your pet! If you can explain it clearly, you probably understand it well.",
  // "Take short breaks every 30 minutes. Stand up, stretch, or walk around. Your brain needs rest to stay sharp. Just keep breaks to 5 minutes!",
  // "Create memory tricks like rhymes or silly sentences to remember facts. For example: 'Please Excuse My Dear Aunt Sally' for math order of operations.",
  // "Find a quiet study space without distractions. Turn off your phone notifications. Your brain learns better when it can focus on one thing.",
  // "Make quick review cards with a question on one side and the answer on the other. These are great for quick practice during short breaks in your day."
];

const quizzes = [
  // Number Theory
  `What is 2.75 expressed as a fraction in its simplest form?
 
 A) 11/4
 B) 7/2
 C) 275/100
 D) 5/2`,

  //   // Consumer Arithmetic
  //   `If a shirt costs $40 and is on sale for 25% off, what is the final price?

  //  A) $30
  //  B) $35
  //  C) $25
  //  D) $15`,

  //   // Measurement
  //   `A rectangular garden has length 8m and width 6m. What is its area?

  //  A) 14m²
  //  B) 28m²
  //  C) 48m²
  //  D) 56m²`,

  //   // Statistics
  //   `What is the mean of the numbers: 3, 7, 8, 12, 15?

  //  A) 7
  //  B) 8
  //  C) 9
  //  D) 10`,

  //   // Algebra
  //   `Solve for x: 3x + 5 = 20

  //  A) x = 5
  //  B) x = 6
  //  C) x = 7
  //  D) x = 8`,
];

const generateImagesForSources = async (
  sources: string[],
  type: ContentType
) => {
  for (const quote of sources) {
    const filename = generateHtmlFilename(type);
    await generateHtml(type, quote, filename);
    console.log(`${filename} generated`);
    await generatePngFromHtml(filename);
    console.log(`${filename.replace(".html", ".png")} generated`);
  }
};

export const generateMarketingContent = async (sourceMaterial: {
  [K in ContentType]: string[];
}) => {
  console.log(`Generating images`);
  for (const key in sourceMaterial){
    const sources = sourceMaterial[key as keyof typeof sourceMaterial]
    if(sources.length > 0){
        await generateImagesForSources(sources, key as ContentType);
    }
  }

  await cleanupHtml();
};
