import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { buildReviewQueue } from "@/lib/review-queue";
import { periodLabel } from "@/lib/tax/filing-period";
import { PageHeader } from "@/components/page-header";
import { QueueView } from "./queue-view";

/**
 * PLAN Phase 12 — everything that needs a human, across every client the
 * user belongs to. Gated by `queue:read` (middleware + roles.ts).
 */
export default async function QueuePage() {
  const { t } = await getT();
  const session = await getServerSession(authOptions);
  const { items, board, truncated } = await buildReviewQueue(session!.user.id);

  return (
    <div>
      <PageHeader title={t("queue.title")} description={t("queue.description")} />
      <QueueView
        truncated={truncated}
        items={items.map((i) => ({ ...i, fecha: i.fecha?.toISOString() ?? null }))}
        board={board.map((b) => ({
          ...b,
          deadline: b.deadline
            ? {
                dueDate: b.deadline.dueDate.toISOString(),
                daysRemaining: b.deadline.daysRemaining,
                overdue: b.deadline.overdue,
                status: b.deadline.status,
                period: periodLabel(b.deadline.year, b.deadline.month),
              }
            : null,
        }))}
      />
    </div>
  );
}
