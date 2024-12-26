import { HumanMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import fs from "fs";
import { promptsConfig } from "./fs";

const visionModel = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-flash",
  maxOutputTokens: 2048,
});

export const getQuestionFromImage = async (imagePath: string) => {
  const image = fs.readFileSync(imagePath).toString("base64");
  console.log("image loaded")
  const input = [
    new HumanMessage({
      content: [
        {
          type: "text",
          text: promptsConfig.imageToText,
        },
        {
          type: "image_url",
          image_url: `data:image/png;base64,${image}`,
        },
      ],
    }),
  ];

  const { content } = await visionModel.invoke(input);
  console.log(content);
  return content;
};
