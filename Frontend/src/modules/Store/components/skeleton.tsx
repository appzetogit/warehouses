import { cn } from "@store/utils/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      {...props}
    />
  )
}

export { Skeleton }
