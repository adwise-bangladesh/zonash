import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Storefront toast styling.
 *
 * The storefront is a 480px centred phone frame with a sticky action bar
 * (add-to-cart / checkout) pinned to the bottom. Toasts are therefore anchored
 * bottom-centre and offset above that bar, so feedback appears right where the
 * thumb just tapped instead of at the far top of the screen.
 *
 * One compact pill shape for every kind of toast — success and error read as
 * the same component, only the icon colour changes.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-center"
      // Sticky bar (~72px) + safe area + breathing room.
      offset="calc(88px + env(safe-area-inset-bottom))"
      mobileOffset="calc(88px + env(safe-area-inset-bottom))"
      gap={8}
      duration={2000}
      visibleToasts={2}
      toastOptions={{
        // `!` on the layout utilities: sonner sets width/padding through inline
        // CSS variables on the element, which outrank plain classes.
        classNames: {
          toast:
            "group toast !w-auto !max-w-[min(calc(100vw-48px),320px)] !mx-auto !gap-2 !rounded-full !border !px-3.5 !py-2 " +
            "group-[.toaster]:bg-foreground group-[.toaster]:text-background " +
            "group-[.toaster]:border-transparent group-[.toaster]:shadow-[0_10px_24px_-10px_rgb(0_0_0/0.45)]",
          title: "text-[13px] font-semibold leading-tight",
          description: "group-[.toast]:text-background/70 text-[11px] leading-snug",
          icon: "shrink-0 !mr-0 [&>svg]:h-4 [&>svg]:w-4",
          actionButton:
            "group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:text-xs group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-background/20 group-[.toast]:text-background group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:text-xs",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
