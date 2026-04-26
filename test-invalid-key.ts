import { GoogleGenAI } from "@google/genai";
async function test() {
  const ai = new GoogleGenAI({ apiKey: "AI Studio Free Tier" });
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hello",
    });
    console.log("Success:", res.text);
  } catch (e: any) {
    console.error("Error Name:", e.name);
    console.error("Error Message:", e.message);
  }
}
test();
