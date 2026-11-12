import { LoadingLine } from "./Loader";
import { Skeleton } from "./Skeleton";

const ROW = "flex items-center justify-between";

/** The card page while its card is read: face, actions, limits, in the same places as the real ones. */
export function CardScreenSkeleton() {
  return (
    <div aria-busy="true" className="space-y-[22px]">
      <Skeleton className="mx-auto mt-6 aspect-[1.586] w-full max-w-[340px] rounded-[22px]" />
      <div className="flex gap-2">
        {["w-[92px]", "w-[104px]", "w-24"].map((w) => (
          <Skeleton key={w} className={`h-10 ${w} rounded-full`} />
        ))}
      </div>
      <div className="space-y-4 rounded-[22px] bg-card px-5 py-4">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <div className={ROW}>
              <Skeleton className="h-3 w-14 rounded-full" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
        <div className="space-y-3 border-t border-line pt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={ROW}>
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <LoadingLine>Reading this card</LoadingLine>
    </div>
  );
}

/** A request in the approval queue while the queue is read. */
export function ApprovalSkeleton() {
  return (
    <div aria-busy="true" className="space-y-5">
      <div className="space-y-4 rounded-[22px] bg-card p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded-full" />
            <Skeleton className="h-2.5 w-28 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-36 rounded-[12px]" />
        {[0, 1, 2].map((i) => (
          <div key={i} className={ROW}>
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
        ))}
        <div className="flex gap-2.5">
          <Skeleton className="h-12 flex-1 rounded-full" />
          <Skeleton className="h-12 flex-1 rounded-full" />
        </div>
      </div>
      <LoadingLine>Checking for requests</LoadingLine>
    </div>
  );
}
