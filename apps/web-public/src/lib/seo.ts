import type { Product } from "../products/types";

const FALLBACK_SITE = "https://proforma.net.br";

export function buildCanonicalUrl({
  site,
  path,
}: {
  site?: string | URL;
  path: string;
}): string {
  const base = site ? new URL(site.toString()) : new URL(FALLBACK_SITE);
  const prefixedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath =
    prefixedPath === "/" ? prefixedPath : prefixedPath.endsWith("/") ? prefixedPath : `${prefixedPath}/`;

  return new URL(normalizedPath, base).toString();
}

export function buildMetaTags({
  title,
  description,
  canonical,
  ogImage,
  ogUrl,
}: {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogUrl?: string;
}) {
  const image = ogImage ?? "/brand/mark.svg";
  const ogCanonical = ogUrl ?? canonical;

  return {
    title,
    description,
    canonical,
    og: {
      title,
      description,
      image,
      url: ogCanonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      image,
    },
  };
}

export function buildJsonLdSoftwareApplication(product: Product, canonical: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.name,
    description: product.description,
    url: canonical,
    applicationCategory: "BusinessApplication",
    featureList: product.features.map((feature) => feature.title),
  };
}
