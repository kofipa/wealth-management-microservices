const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

/**
 * Returns a prioritised list of recommendation objects based on the user's net worth breakdown.
 * Each object has: { id, icon, title, nudge, color, bg }
 * The same list is used by both the Dashboard carousel and the Services screen,
 * ensuring the two are always in sync.
 */
export const buildRecommendations = (data) => {
  const totalAssets = parseFloat(data?.totalAssets ?? 0);
  const totalLiabilities = parseFloat(data?.totalLiabilities ?? 0);
  const netWorth = totalAssets - totalLiabilities;
  const hasProperty = (data?.assetsByType?.property ?? 0) > 0;
  const hasInvestments = (data?.assetsByType?.investment ?? 0) > 0;
  const hasShortTermDebt = (data?.liabilitiesByType?.short_term ?? 0) > 0;
  const isLowAssets = totalAssets < 5000;
  const isHighDebt = totalLiabilities > 0 && (totalLiabilities > totalAssets * 0.5 || netWorth < 0);

  const recs = [];

  // Credit score — only relevant for users with low assets or a genuinely poor debt ratio
  if (isLowAssets || isHighDebt) {
    recs.push({
      id: 'credit-score', icon: '⭐', title: 'Check Your Credit Score',
      nudge: 'See your score for free and find ways to improve it',
      color: '#0891b2', bg: '#ecfeff',
    });
  }

  // Debt management — only when liabilities are a real burden relative to assets
  if (isHighDebt) {
    recs.push({
      id: 'loans', icon: '🧾', title: 'Debt Management',
      nudge: totalLiabilities > totalAssets
        ? `Your liabilities exceed your assets — explore debt consolidation`
        : 'Consolidate or reduce your debts with expert help',
      color: '#dc2626', bg: '#fef2f2',
    });
  }

  if (totalAssets > 10000 || hasProperty) {
    recs.push({
      id: 'will-creation', icon: '📜', title: 'Will Creation',
      nudge: `Protect your ${fmt(totalAssets)} estate for your loved ones`,
      color: '#7c3aed', bg: '#f5f3ff',
    });
  }

  recs.push({
    id: 'pension-planning', icon: '🏦', title: 'Pension Planning',
    nudge: 'Consolidate old pots and plan for retirement',
    color: '#d97706', bg: '#fffbeb',
  });

  recs.push({
    id: 'life-insurance', icon: '🛡️', title: 'Life Insurance',
    nudge: "Protect your family's financial future",
    color: '#16a34a', bg: '#f0fdf4',
  });

  if (totalAssets > 5000 || hasInvestments) {
    recs.push({
      id: 'investment-advice', icon: '📈', title: 'Investment Advice',
      nudge: 'Get expert guidance to grow your wealth',
      color: '#ea580c', bg: '#fff7ed',
    });
  }

  if (hasProperty) {
    recs.push({
      id: 'mortgages', icon: '🏠', title: 'Mortgages',
      nudge: 'Check if you could get a better deal',
      color: '#2563eb', bg: '#eff6ff',
    });
  }

  recs.push({
    id: 'income-protection', icon: '🔒', title: 'Income Protection',
    nudge: 'Cover yourself if you cannot work',
    color: '#6d28d9', bg: '#f5f3ff',
  });

  recs.push({
    id: 'tax-advisory', icon: '📋', title: 'Tax Advisory',
    nudge: 'Optimise your tax position with a professional',
    color: '#dc2626', bg: '#fef2f2',
  });

  // Personal loans only for users without property and not already in debt distress
  if (!hasProperty && !isHighDebt) {
    recs.push({
      id: 'loans', icon: '💳', title: 'Personal Loans',
      nudge: 'Compare competitive personal loan rates',
      color: '#0891b2', bg: '#ecfeff',
    });
  }

  return recs;
};

/**
 * Returns up to `limit` unique service IDs in recommendation priority order.
 * Used by ServicesScreen to pick which cards to highlight.
 */
export const getRecommendedServiceIds = (data, limit = 3) => {
  const recs = buildRecommendations(data);
  const seen = new Set();
  const ids = [];
  for (const r of recs) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      ids.push(r.id);
    }
    if (ids.length === limit) break;
  }
  return ids;
};
