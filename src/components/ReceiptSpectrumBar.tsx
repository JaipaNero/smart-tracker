import React from 'react';
import { NutritionTag, ReceiptItem } from '../types';

interface Props {
  items: ReceiptItem[];
  compact?: boolean;
}

export const ReceiptSpectrumBar: React.FC<Props> = ({ items, compact = false }) => {
  const stats: Record<NutritionTag, number> = items.reduce((acc, item) => {
    const tag = (item.nutritionTag || 'Balance') as NutritionTag;
    acc[tag] = (acc[tag] || 0) + item.totalPrice;
    return acc;
  }, { Essential: 0, Balance: 0, Indulgence: 0 } as Record<NutritionTag, number>);

  const total = (stats.Essential || 0) + (stats.Balance || 0) + (stats.Indulgence || 0);

  if (total === 0) return null;

  const getPercentage = (val: number) => (val / total) * 100;

  return (
    <div className={`space-y-1.5 ${compact ? '' : 'mt-4'}`}>
      {!compact && (
        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-text-muted">
          <span>Mindful Spectrum</span>
          <span>{items.length} items</span>
        </div>
      )}
      <div className={`flex w-full overflow-hidden rounded-full bg-white/5 border border-white/5 ${compact ? 'h-1.5' : 'h-3 shadow-inner shadow-black/20'}`}>
        <div 
          className="h-full bg-accent-green transition-all duration-1000" 
          style={{ width: `${getPercentage(stats['Essential'] || 0)}%` }} 
          title={`Essential: ${getPercentage(stats['Essential'] || 0).toFixed(0)}%`}
        />
        <div 
          className="h-full bg-[#3B82F6] transition-all duration-1000" 
          style={{ width: `${getPercentage(stats['Balance'] || 0)}%` }} 
          title={`Balance: ${getPercentage(stats['Balance'] || 0).toFixed(0)}%`}
        />
        <div 
          className="h-full bg-purple-500 transition-all duration-1000" 
          style={{ width: `${getPercentage(stats['Indulgence'] || 0)}%` }} 
          title={`Indulgence: ${getPercentage(stats['Indulgence'] || 0).toFixed(0)}%`}
        />
      </div>
      {!compact && (
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
             <span className="text-[10px] font-bold text-text-muted capitalize">Essential</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
             <span className="text-[10px] font-bold text-text-muted capitalize">Balance</span>
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
             <span className="text-[10px] font-bold text-text-muted capitalize">Indulgence</span>
          </div>
        </div>
      )}
    </div>
  );
};
