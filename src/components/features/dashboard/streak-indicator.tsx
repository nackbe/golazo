interface StreakData {
  current_result_streak: number;
  current_exact_streak: number;
  current_negative_streak: number;
}

export function StreakIndicator({ streak }: { streak?: StreakData | null }) {
  if (!streak) return null;

  if (streak.current_negative_streak >= 3) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium" title={`${streak.current_negative_streak} fallos seguidos`}>
        💀 {streak.current_negative_streak}
      </span>
    );
  }

  if (streak.current_exact_streak >= 2) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium" title={`${streak.current_exact_streak} exactos seguidos`}>
        🎯 {streak.current_exact_streak}
      </span>
    );
  }

  if (streak.current_result_streak >= 3) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium" title={`${streak.current_result_streak} aciertos seguidos`}>
        🔥 {streak.current_result_streak}
      </span>
    );
  }

  return null;
}
