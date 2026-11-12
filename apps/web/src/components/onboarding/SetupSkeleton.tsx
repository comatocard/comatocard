import { Skeleton } from "../ui";
import { LoadingLine } from "../ui/Loader";

/** Setup while the chain is read: the same frame as the steps, so nothing moves when it lands. */
export function SetupSkeleton() {
  return (
    <main
      aria-busy="true"
      className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(440px,42%)_1fr]"
    >
      <aside className="px-6 pt-[max(16px,env(safe-area-inset-top))] lg:flex lg:flex-col lg:justify-between lg:bg-[#0b0c0d] lg:px-14 lg:py-10">
        <div className="flex items-center gap-3.5 lg:hidden">
          <Skeleton className="size-[38px] rounded-full" />
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-1 flex-1 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-3 w-6 rounded-full" />
        </div>
        <Skeleton className="hidden h-[26px] w-36 rounded-full opacity-20 lg:block" />
        <div className="py-8 lg:py-0">
          <Skeleton className="mx-auto aspect-[1.586] w-full max-w-[320px] rounded-[16px] lg:opacity-20" />
        </div>
        <div className="hidden space-y-3.5 lg:block">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[26px] w-40 rounded-full opacity-20" />
          ))}
        </div>
      </aside>
      <section className="flex flex-1 flex-col px-6 pb-6 lg:items-center lg:justify-center lg:px-16">
        <div className="flex w-full max-w-[420px] flex-1 flex-col gap-3 lg:flex-none">
          <Skeleton className="h-7 w-56 rounded-[10px] lg:h-9 lg:w-72" />
          <Skeleton className="h-4 w-44 rounded-full" />
          <Skeleton className="mt-4 h-14 w-full rounded-[16px]" />
          <Skeleton className="h-12 w-full rounded-[16px]" />
          <div className="mt-4">
            <LoadingLine>Checking your setup</LoadingLine>
          </div>
          <Skeleton className="mt-auto h-14 w-full rounded-full lg:mt-6" />
        </div>
      </section>
    </main>
  );
}
