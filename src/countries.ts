// Countries for the phone number's country-code picker: [ISO code, name, dial code].
export type Country = { code: string; name: string; dial: string };

const LIST: [string, string, string][] = [
  ['SO', 'Somalia', '252'], ['US', 'United States', '1'], ['CA', 'Canada', '1'], ['KE', 'Kenya', '254'],
  ['ET', 'Ethiopia', '251'], ['DJ', 'Djibouti', '253'], ['ER', 'Eritrea', '291'], ['UG', 'Uganda', '256'],
  ['TZ', 'Tanzania', '255'], ['SD', 'Sudan', '249'], ['SS', 'South Sudan', '211'], ['RW', 'Rwanda', '250'],
  ['EG', 'Egypt', '20'], ['YE', 'Yemen', '967'], ['SA', 'Saudi Arabia', '966'], ['AE', 'United Arab Emirates', '971'],
  ['QA', 'Qatar', '974'], ['KW', 'Kuwait', '965'], ['OM', 'Oman', '968'], ['BH', 'Bahrain', '973'],
  ['JO', 'Jordan', '962'], ['LB', 'Lebanon', '961'], ['IQ', 'Iraq', '964'], ['TR', 'Türkiye', '90'],
  ['LY', 'Libya', '218'], ['MA', 'Morocco', '212'], ['DZ', 'Algeria', '213'], ['TN', 'Tunisia', '216'],
  ['NG', 'Nigeria', '234'], ['GH', 'Ghana', '233'], ['ZA', 'South Africa', '27'], ['ZM', 'Zambia', '260'],
  ['GB', 'United Kingdom', '44'], ['IE', 'Ireland', '353'], ['DE', 'Germany', '49'], ['FR', 'France', '33'],
  ['NL', 'Netherlands', '31'], ['BE', 'Belgium', '32'], ['CH', 'Switzerland', '41'], ['AT', 'Austria', '43'],
  ['SE', 'Sweden', '46'], ['NO', 'Norway', '47'], ['DK', 'Denmark', '45'], ['FI', 'Finland', '358'],
  ['IT', 'Italy', '39'], ['ES', 'Spain', '34'], ['AU', 'Australia', '61'], ['NZ', 'New Zealand', '64'],
  ['IN', 'India', '91'], ['PK', 'Pakistan', '92'], ['CN', 'China', '86'], ['JP', 'Japan', '81'],
  ['MY', 'Malaysia', '60'], ['SG', 'Singapore', '65'], ['MX', 'Mexico', '52'], ['BR', 'Brazil', '55'],
];

export const COUNTRIES: Country[] = LIST.map(([code, name, dial]) => ({ code, name, dial }));

// A country's flag, from its two-letter code.
export const flag = (code: string) => [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');

// The number as it is sent: a plus, the country code, then the number without a leading zero.
export const joinPhone = (dial: string, national: string) => {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${dial}${digits}` : '';
};
