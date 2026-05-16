import { redirect } from 'next/navigation';

type LegacyCatalogProductRedirectPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LegacyCatalogProductRedirectPage({
  params,
}: LegacyCatalogProductRedirectPageProps) {
  const { slug } = await params;
  redirect(`/catalog/${slug}`);
}
