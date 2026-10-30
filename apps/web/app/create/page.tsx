import type { Metadata } from "next";
import { poolFees } from "@/lib/chain";
import { indexer, type TokenListItem } from "@/lib/indexer";
import { CreateForm } from "./CreateForm";

export const metadata: Metadata = { title: "Launch a token" };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  // The protocol fee is set per pool at launch; show the real value from the latest launch if there is one.
  const latest = await indexer<{ items: TokenListItem[] }>("/tokens?tab=new&limit=1");
  const token = latest?.items[0]?.address;
  const fees = token ? await poolFees(token) : null;
  return (
    <>
      <h1 className="py-6 font-pixel text-4xl">LAUNCH A TOKEN</h1>
      <CreateForm fees={fees} />
    </>
  );
}
