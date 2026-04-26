import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Hello",
    });
    console.log("Success:", res.text);
  } catch (e: any) {
    if (e.status) console.error("Error Status:", e.status);
    console.error("Error Message:", e.message);
  }
}
test();
