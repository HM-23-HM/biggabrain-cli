export function parseJsonString(input: string) {
  // First, find the actual JSON content between the backticks
  const jsonMatch = input.match(/```json\n([\s\S]*?)```/);

  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error("No valid JSON content found between backticks");
  }
  
  try {
    // Parse the matched content (jsonMatch[1] contains the actual JSON string)
    const parsedJson = JSON.parse(jsonMatch[1]);
    return parsedJson;
  } catch (error) {
    console.error("Error parsing JSON: " + error, true);
    throw new Error("Invalid JSON string");
  }
}

export function stripJsonMarkers(content: string): string {
  return content.replace(/```json/g, "").replace(/```/g, "");
}

export function parseOrReturnString(input: string): object | string {
    try {
        const parsedJson = parseJsonString(input);
        return parsedJson;
    } catch (error) {
        return input;
    }
}