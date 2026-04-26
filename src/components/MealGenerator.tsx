import React, { useReducer, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChefHat, Timer, Zap, Search, Utensils, Info, Check, AlertCircle, Plus } from 'lucide-react';
import { RecipeFilterState, MealPlan, PantryItem } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

// Global ai removed to prevent startup crash. Use local ai from geminiKey.


type Action = 
  | { type: 'SET_APPLIANCES', payload: string[] }
  | { type: 'SET_MAX_PREP_TIME', payload: number }
  | { type: 'SET_CUISINE', payload: string }
  | { type: 'SET_DIETARY', payload: string }
  | { type: 'SET_BATCH_DAYS', payload: number };

const initialState: RecipeFilterState = {
  appliances: [],
  maxPrepTime: 30,
  cuisine: 'Any',
  dietaryPreference: 'No Preference',
  batchDays: 1,
};

function recipeReducer(state: RecipeFilterState, action: Action): RecipeFilterState {
  switch (action.type) {
    case 'SET_APPLIANCES': return { ...state, appliances: action.payload };
    case 'SET_MAX_PREP_TIME': return { ...state, maxPrepTime: action.payload };
    case 'SET_CUISINE': return { ...state, cuisine: action.payload };
    case 'SET_DIETARY': return { ...state, dietaryPreference: action.payload };
    case 'SET_BATCH_DAYS': return { ...state, batchDays: action.payload };
    default: return state;
  }
}

const APPLIANCES = ['Airfryer', 'Microwave', 'Oven', 'Stovetop', 'Slow Cooker', 'Rice Cooker', 'Ninja Soup Maker'];
const CUISINES = ['Any', 'Italian', 'Mexican', 'Asian', 'Mediterranean', 'Indian', 'American'];
const DIETARY = ['No Preference', 'Vegetarian', 'Vegan', 'Keto', 'Paleo', 'Gluten-Free'];

export const MealGenerator = ({ pantryItems }: { pantryItems: PantryItem[] }) => {
  const [state, dispatch] = useReducer(recipeReducer, initialState);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MealPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateMeal = async () => {
    setLoading(true);
    setError(null);
    try {
      const availableItems = pantryItems
        .filter(item => item.remainingPercentage > 0)
        .map(item => item.name)
        .join(', ');

      const prompt = `Generate a meal plan based on these pantry items: ${availableItems}. 
      Filter by:
      - Appliances: ${state.appliances.join(', ') || 'Any'}
      - Max Prep Time: ${state.maxPrepTime} mins
      - Cuisine: ${state.cuisine}
      - Dietary: ${state.dietaryPreference}
      - Batch for: ${state.batchDays} days`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recipeTitle: { type: Type.STRING },
              prepTimeMinutes: { type: Type.NUMBER },
              instructions: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Array of instruction steps. Use Celsius for all temperatures."
              },
              ingredientsUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingIngredientsToBuy: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "Maximum 3 items that would complete the recipe but are missing from pantry."
              }
            },
            required: ['recipeTitle', 'prepTimeMinutes', 'instructions', 'ingredientsUsed', 'missingIngredientsToBuy']
          }
        }
      });

      const mealPlan = JSON.parse(response.text);
      setResult(mealPlan);
    } catch (err: any) {
      console.error(err);
      setError("Failed to generate meal plan. Try adjusting your filters.");
    } finally {
      setLoading(false);
    }
  };

  const toggleAppliance = (app: string) => {
    const next = state.appliances.includes(app)
      ? state.appliances.filter(a => a !== app)
      : [...state.appliances, app];
    dispatch({ type: 'SET_APPLIANCES', payload: next });
  };

  return (
    <div className="space-y-6">
      <div className="bg-bg-card rounded-3xl border border-border-dark p-6 shadow-2xl overflow-hidden relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-accent-green/10 rounded-xl text-accent-green">
            <ChefHat size={24} />
          </div>
          <h2 className="text-xl font-black text-white">Dynamic Meal Generator</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Appliances */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Available Appliances</label>
            <div className="flex flex-wrap gap-2">
              {APPLIANCES.map(app => (
                <button
                  key={app}
                  onClick={() => toggleAppliance(app)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black transition-all border ${
                    state.appliances.includes(app)
                      ? 'bg-accent-green border-accent-green text-bg-main'
                      : 'bg-white/5 border-white/10 text-text-muted hover:border-white/20'
                  }`}
                >
                  {app}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
             {/* Prep Time */}
             <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Max Prep Time</label>
                <span className="text-xs font-bold text-accent-green">{state.maxPrepTime} mins</span>
              </div>
              <input 
                type="range" min="10" max="120" step="5"
                value={state.maxPrepTime}
                onChange={e => dispatch({ type: 'SET_MAX_PREP_TIME', payload: parseInt(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent-green"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               {/* Cuisine */}
               <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Cuisine</label>
                <select 
                  value={state.cuisine}
                  onChange={e => dispatch({ type: 'SET_CUISINE', payload: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-accent-green"
                >
                  {CUISINES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Dietary */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Dietary Preference</label>
                <select 
                  value={state.dietaryPreference}
                  onChange={e => dispatch({ type: 'SET_DIETARY', payload: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-accent-green"
                >
                  {DIETARY.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={generateMeal}
          disabled={loading}
          className="w-full mt-8 py-4 bg-accent-green hover:bg-opacity-90 disabled:opacity-50 text-bg-main font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-accent-green/10"
        >
          {loading ? <Zap size={20} className="animate-spin" /> : <Zap size={20} />}
          {loading ? 'Consulting Chef Gemini...' : 'Generate Magic Recipe'}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold"
          >
            <AlertCircle size={16} />
            {error}
          </motion.div>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-8 shadow-2xl space-y-8"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-white mb-2">{result.recipeTitle}</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-accent-green text-xs font-black uppercase tracking-widest">
                    <Timer size={14} /> {result.prepTimeMinutes} mins
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white/40">
                  <Utensils size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ingredients Used</span>
                </div>
                <ul className="space-y-2">
                  {result.ingredientsUsed.map((ing, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs font-bold text-white bg-white/5 p-3 rounded-xl border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                      {ing}
                    </li>
                  ))}
                </ul>

                {result.missingIngredientsToBuy.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center gap-2 text-orange-400">
                      <Search size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Missing (Add to List)</span>
                    </div>
                    <ul className="space-y-2">
                      {result.missingIngredientsToBuy.map((ing, i) => (
                        <li key={i} className="flex items-center gap-3 text-xs font-bold text-orange-400 bg-orange-400/5 p-3 rounded-xl border border-orange-400/10">
                          <Plus size={14} />
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white/40">
                  <Info size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Instructions</span>
                </div>
                <div className="space-y-4">
                  {result.instructions.map((step, i) => (
                    <div key={i} className="flex gap-4">
                      <span className="text-accent-green font-black text-xs pt-1">{i + 1}.</span>
                      <p className="text-sm font-medium text-white/80 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
