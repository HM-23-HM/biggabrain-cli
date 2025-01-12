import * as fs from "fs";
import * as handlebars from "handlebars";
import katex from "katex";
import * as path from "path";
import * as puppeteer from "puppeteer";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";
import { Qans } from "./chain";
import {
  extractQuestionAndSolution,
  wrapTextOutsideTex,
  wrapTextWithSmall,
  wrapWithLargeInTexTags
} from "./parse";

export type ContentType =
  | "Motivational Quote"
  | "Exam Tips"
  | "Worked Example"
  | "Quizzes";

export type MultipleChoice = {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
};

const contentTemplateMap: Record<ContentType, string> = {
  "Motivational Quote": "quote",
  "Exam Tips": "quote",
  "Worked Example": "workedExample",
  Quizzes: "quiz",
};

const contentColorMap: Record<ContentType, string> = {
  "Motivational Quote": "#B4A9EF",
  "Exam Tips": "#ADEBD1",
  "Worked Example": "#2D3142",
  Quizzes: "#F1B4A1",
};

function generateHtmlFilename(type: ContentType, workedExample?: WorkedExampleContent): string {
  return type === 'Worked Example' ? `${type}-${workedExample?.questionId ?? ""}-${uuidv4()}.html` : `${type}-${uuidv4()}.html` ;
}

async function generateHtml(
  type: ContentType,
  quote: string | MultipleChoice | WorkedExampleContent,
  filename: string
): Promise<void> {
  const templatePath = path.resolve(
    "",
    `./templates/${contentTemplateMap[type]}.html`
  );
  const templateSource = fs.readFileSync(templatePath, "utf-8");
  const template = handlebars.compile(templateSource);

  const logoPath = path.resolve("", "./assets/logo.svg");
  const commonConfig = {
    backgroundColor: contentColorMap[type],
    logoPath,
  };

  let templateConfig: any = { quote, ...commonConfig };

  switch(type){
    case 'Worked Example':
      const _temp = quote as WorkedExampleContent;
      templateConfig = {
        quote: _temp.content,
        questionId: _temp.questionId,
        ...commonConfig
      }
      break;
    case 'Quizzes':
      templateConfig = { ...(quote as MultipleChoice), ...commonConfig };
      break;
  }

  const html = template(templateConfig);

  const writeFile = util.promisify(fs.writeFile);
  const htmlOutputPath = path.resolve("", "posts", "html", filename);
  await writeFile(htmlOutputPath, html);
}

async function generatePngFromHtml(htmlFilename: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve("", "posts", "html", htmlFilename));
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
  sources: (string | WorkedExampleContent)[],
  type: ContentType
) => {
  for (const quote of sources) {
    const filename = type === 'Worked Example' ? generateHtmlFilename(type, quote as WorkedExampleContent) : generateHtmlFilename(type)
    await generateHtml(type, quote, filename);
    await generatePngFromHtml(filename);
  }
};

export const generateMarketingContent = async (sourceMaterial: {
  [K in ContentType]: (string | WorkedExampleContent)[];
}) => {
  console.log(`Generating images`);
  for (const key in sourceMaterial) {
    const sources = sourceMaterial[key as keyof typeof sourceMaterial];
    if (sources.length > 0) {
      await generateImagesForSources(sources, key as ContentType);
    }
  }

  // await cleanupHtml();
};

export function parseKatex(source: string): string {
  return source.replace(/\[tex\](.*?)\[\/tex\]/g, (match, p1) => {
    try {
      return katex.renderToString(p1, {
        throwOnError: false,
      });
    } catch (error) {
      console.error("KaTeX rendering error:", error);
      return match;
    }
  });
}

export function getRandomLetter() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const randomIndex = Math.floor(Math.random() * alphabet.length);
  return alphabet[randomIndex];
}

export function addquestionId(qans: Qans) {
  return { ...qans, questionId: getRandomLetter() };
}

const formatContent = (content: string) =>
  parseKatex(
    wrapTextWithSmall(wrapWithLargeInTexTags(wrapTextOutsideTex(content)))
  );

export type WorkedExampleContent = { questionId: string; content: string };

export function generateWorkedExamples(): WorkedExampleContent[] {
  const questionsPath = path.join("inbound", "questions", "index.json");
  const file = fs.readFileSync(questionsPath, "utf-8");
  const parsed: { content: string; questionId: string }[] = [];
  const questions = (JSON.parse(file) as Qans[]).map(addquestionId);
  questions.forEach((obj) => {
    parsed.push(...extractQuestionAndSolution(obj));
  });
  const formatted = parsed.map((item) => ({
    questionId: item.questionId,
    content: formatContent(item.content),
  }));
  return formatted;
}
