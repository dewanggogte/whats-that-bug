import observationsJson from '../public/data/observations.json';
import taxonomyJson from '../public/data/taxonomy.json';

export type Observation = {
  id: number;
  photo_url?: string;
  attribution?: string;
  location?: string;
  inat_url?: string;
  taxon: {
    id?: number;
    species?: string;
    common_name?: string;
    genus?: string;
    family?: string;
    order?: string;
    order_common?: string;
  };
};

export type Taxonomy = {
  order: Record<string, number[]>;
  family: Record<string, number[]>;
  genus: Record<string, number[]>;
};

export const observations = observationsJson as Observation[];
export const taxonomy = taxonomyJson as Taxonomy;
