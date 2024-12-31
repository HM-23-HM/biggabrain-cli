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

const generateImagesForSources = async (
  sources: string[],
  type: ContentType
) => {
  for (const quote of sources) {
    const filename = generateHtmlFilename(type);
    await generateHtml(type, quote, filename);
    await generatePngFromHtml(filename);
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
