/* ============================================
   SVK Works — Used Parts shared helpers
   Used by used-parts.html, used-part.html, admin-used-parts.html
   ============================================ */

const SVK_CONDITIONS = {
  open_box_new: { label: 'Open Box — New', color: '#22c55e' },
  good:         { label: 'Good',            color: '#3b82f6' },
  fair:         { label: 'Fair',             color: '#eab308' },
  untested:     { label: 'Untested',         color: '#f97316' },
  junk:         { label: 'Junk / For Parts', color: '#ef4444' },
};
const SVK_CONDITION_ORDER = ['open_box_new', 'good', 'fair', 'untested', 'junk'];

function svkConditionInfo(condition) {
  return SVK_CONDITIONS[condition] || { label: condition || 'Unknown', color: '#888888' };
}

function svkConditionBadge(condition, extraStyle) {
  const c = svkConditionInfo(condition);
  return `<span class="badge" style="background:${c.color}1a;color:${c.color};border-color:${c.color}4d;${extraStyle || ''}">${c.label}</span>`;
}

function svkFormatPartPrice(price) {
  return '$' + Number(price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
