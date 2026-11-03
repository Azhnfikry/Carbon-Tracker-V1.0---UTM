// Brand settings for the GHG inventory report. To reuse the template for another client or
// campus, add a brand here with its own image files (in templates/assets/) and colours.

export interface BrandImages {
  cover_photo: string; // cover, right-hand photo
  gateway_photo: string; // photo band on the "About this report" page
  back_photo: string; // back cover
  logo_white: string; // cover and back cover
  logo_colour: string; // running header
  tagline: string; // footer and cover tagline
}

export interface Brand {
  id: string;
  name: string;
  images: BrandImages;
  colours: {
    maroon: string; // headings, Scope 1
    red: string; // accents, section tabs, Scope 2
    charcoal: string; // table headers
    grey: string; // rules, Scope 3
    mist: string; // box backgrounds
  };
  scopeColours: [string, string, string];
}

// Paths the template uses for each image slot (relative to templates/).
export const TEMPLATE_IMAGE_PATHS: Record<keyof BrandImages, string> = {
  cover_photo: "assets/cover_kl_tower.jpg",
  gateway_photo: "assets/kl_gateway.jpg",
  back_photo: "assets/kl_collage.jpg",
  logo_white: "assets/logo_white.png",
  logo_colour: "assets/logo_colour.png",
  tagline: "assets/tagline_maroon.png",
};

export const BRANDS: Record<string, Brand> = {
  utm: {
    id: "utm",
    name: "Universiti Teknologi Malaysia",
    images: {
      cover_photo: "cover_kl_tower.jpg",
      gateway_photo: "kl_gateway.jpg",
      back_photo: "kl_collage.jpg",
      logo_white: "logo_white.png",
      logo_colour: "logo_colour.png",
      tagline: "tagline_maroon.png",
    },
    colours: { maroon: "#7A1A2A", red: "#C1393E", charcoal: "#3E3E3E", grey: "#C9C9C9", mist: "#F3F3F3" },
    scopeColours: ["#7A1A2A", "#C1393E", "#8C8C8C"],
  },
};

export const DEFAULT_BRAND_ID = "utm";

export function getBrand(id?: string | null): Brand {
  return BRANDS[id || DEFAULT_BRAND_ID] || BRANDS[DEFAULT_BRAND_ID];
}
