import SharedCollection from '@/components/shared-collection';
export const metadata = {
  title: 'Shared collection · TeamVault',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { token } = await params;
  const { team } = await searchParams;
  return <SharedCollection token={token} teamId={team} />;
}
