// Qué tan completo está el perfil del talento: misma regla en la ficha y en el editor.
import type { Rates, Talent } from './talents';

export type ProfileFacts = {
  photo: boolean; cv: boolean; headline: boolean; email: boolean; phone: boolean; doc: boolean; location: boolean;
  linkedin: boolean; summary: boolean; availability: boolean; equipment: boolean; rates: boolean | null;
  tech: boolean; soft: boolean; experience: boolean; education: boolean; languages: boolean;
};

/** Claves i18n (talents.cp.*) de cada criterio, en el orden en que se sugieren. */
export const PROFILE_ITEMS = ['headline', 'email', 'phone', 'doc', 'location', 'availability', 'equipment', 'rates', 'summary', 'linkedin',
  'tech', 'soft', 'experience', 'education', 'languages', 'cv', 'photo'] as const satisfies readonly (keyof ProfileFacts)[];

/** `rates: null` = el usuario no ve tarifas: el criterio no cuenta. */
export function completeness(f: ProfileFacts) {
  const items = PROFILE_ITEMS.filter((k) => f[k] !== null);
  const missing = items.filter((k) => !f[k]);
  return { pct: Math.round(((items.length - missing.length) / items.length) * 100), missing };
}

export const hasRates = (r?: Rates) => !!r && [r.payrollMin, r.payrollMax, r.rxhMin, r.rxhMax].some((v) => v !== undefined && v !== null && String(v) !== '');

export function talentFacts(x: Talent): ProfileFacts {
  return {
    photo: !!x.photoId, cv: !!x.cvId || x.files.some((f) => f.category.startsWith('CV')), headline: !!x.headline, email: !!x.email, phone: !!x.phone,
    doc: !!x.docNumber, location: !!(x.countryId || x.city), linkedin: !!x.linkedinUrl, summary: !!x.summary?.trim(),
    availability: !!x.availabilityId, equipment: x.hasEquipment !== undefined && x.hasEquipment !== null,
    rates: x.canSeeRates ? hasRates(x.rates) : null,
    tech: x.techSkills.length > 0, soft: x.softSkills.length > 0, experience: x.experiences.length > 0,
    education: x.educations.length > 0, languages: x.languages.length > 0,
  };
}
