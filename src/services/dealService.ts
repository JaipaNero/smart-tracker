import { GoogleGenAI, Type } from "@google/genai";
import { PantryItem, PantryAisle } from "../types";

const apiKey = typeof process !== 'undefined' && process.env ? (process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY)?.trim() : undefined;
// Remove global ai to prevent crash. Will be provided via props/params.


export interface DealMatch {
  productName: string;
  genericName: string;
  price: number;
  originalPrice?: number;
  dealDescription: string;
  store: 'Dirk' | 'Lidl';
  expiryDate?: string;
  aisle?: PantryAisle;
}

export const huntDeals = async (pantryItems: PantryItem[]): Promise<DealMatch[]> => {
  // 1. Identify low stock items (remaining <= 25%)
  const lowStockItems = pantryItems.filter(i => (i.remainingPercentage || 0) <= 25);
  if (lowStockItems.length === 0) return [];

  const genericNames = [...new Set(lowStockItems.map(i => i.genericName || i.name))];

  const stores = [
    { name: 'Dirk', url: 'https://www.dirk.nl/aanbiedingen' },
    { name: 'Lidl', url: 'https://www.lidl.nl/c/aanbiedingen/a10008785' }
  ];

  const allDeals: DealMatch[] = [];

  for (const store of stores) {
    try {
      // 2. Fetch cleaned HTML via proxy
      const response = await fetch('/api/proxy/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: store.url })
      });
      const { content } = await response.json();

      if (!content) continue;

      // 3. Ask Gemini to find deals matching our generic names
      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { text: `The following text is from ${store.name}'s deals website. 
              Find any products that match or are equivalent to these generic shopping items: ${genericNames.join(', ')}.
              
              Return valid JSON matching the schema.` },
              { text: content }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productName: { type: Type.STRING, description: "Full formal product name from the deal." },
                genericName: { type: Type.STRING, description: "Which item from my search list this matches." },
                price: { type: Type.NUMBER },
                originalPrice: { type: Type.NUMBER },
                dealDescription: { type: Type.STRING, description: "Details like '2 for 1' or '30% off'." },
                expiryDate: { type: Type.STRING },
                aisle: { type: Type.STRING }
              },
              required: ['productName', 'genericName', 'price', 'dealDescription']
            }
          }
        }
      });

      const storeDeals = JSON.parse(aiResponse.text!);
      allDeals.push(...storeDeals.map((d: any) => ({ ...d, store: store.name as any })));
    } catch (error) {
      console.error(`Failed to hunt deals at ${store.name}:`, error);
    }
  }

  return allDeals;
};
