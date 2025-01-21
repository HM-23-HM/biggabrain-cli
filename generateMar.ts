

import { sendPrompt } from "./src/utils/chain";
import { ContentType, generateMarketingContent, generateWorkedExamples, WorkedExampleContent } from "./src/utils/marketing";
import { getJsArray } from "./src/utils/parse";

const contentToPromptMap: { [K in ContentType]: string } = {
    Quizzes: "",
  "Exam Tips": "",
  "Motivational Quote": "",
  "Worked Example": "",
  // Quizzes: promptsConfig.marketing.quizzes,
  // "Exam Tips": promptsConfig.marketing.examPrepTips,
  // "Motivational Quote": promptsConfig.marketing.motivation,
};

const main = async () => {
  console.log("Generating source material")
  const sourceMaterial: { [K in ContentType]: (string | WorkedExampleContent)[] } = {
    Quizzes: [],
    "Exam Tips": [],
    "Motivational Quote": [],
    "Worked Example": [],
  };

  for (const key in sourceMaterial) {
    const prompt = contentToPromptMap[key as keyof typeof sourceMaterial];
    if (prompt) {
      const response = await sendPrompt(prompt);
      sourceMaterial[key as keyof typeof sourceMaterial].push(...getJsArray(response));
    }
  }

  const workedExamples = generateWorkedExamples();
  console.log("Worked examples generated");
  sourceMaterial["Worked Example"].push(...workedExamples)

  console.log("Source material generated")
  await generateMarketingContent(sourceMaterial)
  console.log("Marketing content generated")

};

main();
