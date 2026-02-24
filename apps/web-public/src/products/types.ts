export type ProductFeature = {
  title: string;
  description: string;
};

export type ProductModule = {
  title: string;
  description: string;
};

export type ProductCta = {
  label: string;
  href: string;
  kind?: "primary" | "secondary";
};

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  ogImage?: string;
  features: ProductFeature[];
  modules: ProductModule[];
  ctas: ProductCta[];
  seo: {
    title: string;
    description: string;
  };
};
