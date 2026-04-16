// src/lib/species-utils.js
//
// Shared helpers for species data used across landing pages,
// species pages, and genera index.

/**
 * Slugify a string for use in URLs.
 * "Small Tortoiseshell" → "small-tortoiseshell"
 * "Aglais urticae" → "aglais-urticae"
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Map from set key to landing page URL path.
 */
export const SET_TO_URL = {
  beetles: '/beetles',
  butterflies_moths: '/butterflies-and-moths',
  spiders: '/spiders',
  backyard_basics: '/backyard-bugs',
  bugs_101: '/beginners',
  all_bugs: '/expert',
  tiny_terrors: '/tiny-terrors',
  eye_candy: '/eye-candy',
};

/**
 * Build a complete species map from observations data.
 * Returns a Map<scientificName, { slug, commonName, genus, family, order,
 *   genusCommon, familyCommon, orderCommon, bestPhoto, attribution, inatUrl }>
 *
 * Handles slug collisions (2 known: milkweed-bug, green-huntsman-spider)
 * by appending the scientific name.
 */
export function buildSpeciesMap(observations) {
  // First pass: collect all species and detect slug collisions
  const speciesBySlug = new Map(); // slug → [scientificName, ...]
  const speciesData = new Map();

  for (const obs of observations) {
    const sp = obs.taxon?.species;
    if (!sp) continue;

    // Track best photo (highest num_agreements)
    const existing = speciesData.get(sp);
    if (!existing || obs.num_agreements > existing.bestPhoto.num_agreements) {
      speciesData.set(sp, {
        commonName: obs.taxon.common_name || '',
        genus: obs.taxon.genus || '',
        family: obs.taxon.family || '',
        order: obs.taxon.order || '',
        genusCommon: obs.taxon.genus_common || '',
        familyCommon: obs.taxon.family_common || '',
        orderCommon: obs.taxon.order_common || '',
        bestPhoto: {
          url: obs.photo_url,
          attribution: obs.attribution,
          inatUrl: obs.inat_url,
          num_agreements: obs.num_agreements,
        },
      });
    }

    // Track slug usage for collision detection
    if (!existing) {
      const baseSlug = obs.taxon.common_name
        ? slugify(obs.taxon.common_name)
        : slugify(sp);
      const arr = speciesBySlug.get(baseSlug) || [];
      arr.push(sp);
      speciesBySlug.set(baseSlug, arr);
    }
  }

  // Second pass: assign final slugs, disambiguating collisions
  const collisionSlugs = new Set();
  for (const [slug, names] of speciesBySlug) {
    if (names.length > 1) collisionSlugs.add(slug);
  }

  const result = new Map();
  for (const [sp, data] of speciesData) {
    const baseSlug = data.commonName ? slugify(data.commonName) : slugify(sp);
    const slug = collisionSlugs.has(baseSlug)
      ? `${baseSlug}-${slugify(sp)}`
      : baseSlug;

    result.set(sp, { slug, ...data });
  }

  return result;
}

/**
 * Build genus data from observations for the genera index.
 * Returns an array of { genus, genusCommon, order, orderCommon,
 *   speciesCount, representativePhoto, speciesList }
 * sorted alphabetically by genus name.
 */
export function buildGeneraData(observations) {
  const genera = new Map();

  for (const obs of observations) {
    const genus = obs.taxon?.genus;
    if (!genus) continue;

    if (!genera.has(genus)) {
      genera.set(genus, {
        genus,
        genusCommon: obs.taxon.genus_common || '',
        order: obs.taxon.order || '',
        orderCommon: obs.taxon.order_common || '',
        representativePhoto: obs.photo_url,
        species: new Set(),
      });
    }

    const g = genera.get(genus);
    if (obs.taxon.species) g.species.add(obs.taxon.species);
  }

  return Array.from(genera.values())
    .map(g => ({
      genus: g.genus,
      genusCommon: g.genusCommon,
      order: g.order,
      orderCommon: g.orderCommon,
      speciesCount: g.species.size,
      representativePhoto: g.representativePhoto,
      speciesList: Array.from(g.species).sort(),
    }))
    .sort((a, b) => a.genus.localeCompare(b.genus));
}

/**
 * Get species belonging to a given set.
 * Returns array of { species (scientific name), commonName, slug }
 * sorted alphabetically by common name (or scientific name if no common name).
 */
export function getSpeciesForSet(setData, observations, speciesMap) {
  const seen = new Set();
  const result = [];

  for (const id of setData.observation_ids) {
    const obs = observations[id];
    const sp = obs?.taxon?.species;
    if (!sp || seen.has(sp)) continue;
    seen.add(sp);

    const data = speciesMap.get(sp);
    if (data) {
      result.push({
        species: sp,
        commonName: data.commonName,
        slug: data.slug,
      });
    }
  }

  return result.sort((a, b) => {
    const nameA = a.commonName || a.species;
    const nameB = b.commonName || b.species;
    return nameA.localeCompare(nameB);
  });
}
