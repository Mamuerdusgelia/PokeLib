import SharedTeam from '@/components/shared-team';
export const metadata = {
  title: 'Shared team · PokéLib',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedTeam token={token} />;
}
