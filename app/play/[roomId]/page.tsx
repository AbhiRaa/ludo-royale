import { Game } from "@/components/Game";
import { normaliseCode } from "@/lib/id";

export default async function PlayPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <Game code={normaliseCode(roomId)} />;
}
