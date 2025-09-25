import { redirect, notFound } from "next/navigation";

import RecordSportForm from "./RecordSportForm";
import {
  resolveRecordSportRoute,
  type RecordSportPageProps,
} from "./resolveRecordSportRoute";

export default function RecordSportPage(props: RecordSportPageProps) {
  const resolution = resolveRecordSportRoute(props);
  if (resolution.type === "not-found") {
    notFound();
  }
  if (resolution.type === "redirect") {
    redirect(resolution.destination);
  }
  return <RecordSportForm sportId={resolution.sportId} />;
}
