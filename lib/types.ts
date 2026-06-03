export interface Module {
  number: number;
  key: string;
  label: string;
  shortLabel: string;
  content: string;
}

export type AppState = 'idle' | 'loading' | 'results' | 'error';

export interface AnalysisResponse {
  modules: Module[];
}

export const MODULE_META = [
  { number: 1, key: 'ofp', label: 'OFP Core Summary', shortLabel: 'OFP', emoji: '✈', color: '#1B2B5E', bgClass: 'bg-module-ofp', textClass: 'text-module-ofp', borderClass: 'border-module-ofp' },
  { number: 2, key: 'weather', label: 'Weather Briefing', shortLabel: 'WX', emoji: '🌤', color: '#0EA5E9', bgClass: 'bg-module-wx', textClass: 'text-module-wx', borderClass: 'border-module-wx' },
  { number: 3, key: 'notams', label: 'NOTAMs', shortLabel: 'NOTAM', emoji: '⚠', color: '#D97706', bgClass: 'bg-module-notam', textClass: 'text-module-notam', borderClass: 'border-module-notam' },
  { number: 4, key: 'windshear', label: 'Windshear Analysis', shortLabel: 'WS', emoji: '💨', color: '#FC642D', bgClass: 'bg-module-ws', textClass: 'text-module-ws', borderClass: 'border-module-ws' },
  { number: 5, key: 'edto', label: 'EDTO Breakdown', shortLabel: 'EDTO', emoji: '🌐', color: '#00A699', bgClass: 'bg-module-edto', textClass: 'text-module-edto', borderClass: 'border-module-edto' },
  { number: 6, key: 'fuel', label: 'Fuel vs MDF', shortLabel: 'FUEL', emoji: '⛽', color: '#FF5A5F', bgClass: 'bg-module-fuel', textClass: 'text-module-fuel', borderClass: 'border-module-fuel' },
] as const;
