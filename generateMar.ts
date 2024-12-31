

import { sendPrompt } from "./src/utils/chain";
import { promptsConfig } from "./src/utils/fs";
import { ContentType, generateMarketingContent } from "./src/utils/marketing";
import { getJsArray } from "./src/utils/parse";

const contentToPromptMap: { [K in ContentType]: string } = {
  //   Quizzes: "",
  // "Exam Tips": "",
  // "Motivational Quote": "",
  "Math in Real Life": "",
  Quizzes: promptsConfig.marketing.quizzes,
  "Exam Tips": promptsConfig.marketing.examPrepTips,
  "Motivational Quote": promptsConfig.marketing.motivation,
};

const main = async () => {
  const sourceMaterial: { [K in ContentType]: string[] } = {
    Quizzes: [],
    "Exam Tips": [],
    "Motivational Quote": [],
    "Math in Real Life": [],
  };

  for (const key in sourceMaterial) {
    const prompt = contentToPromptMap[key as keyof typeof sourceMaterial];
    if (prompt) {
      const response = await sendPrompt(prompt);
      sourceMaterial[key as keyof typeof sourceMaterial].push(...getJsArray(response));
    }
  }

  console.log("Source material generated")
  await generateMarketingContent(sourceMaterial)
  console.log("Marketing content generated")
};

main();
