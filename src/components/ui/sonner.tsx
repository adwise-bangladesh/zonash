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
      // Object form: a bare string offsets every side, which shifted the
      // centred container sideways too.
      offset={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}
      mobileOffset={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}
      gap={8}
      duration={2000}
      visibleToasts={2}
      // Sonner centres the *container*, and each toast fills it. Narrowing the
      // container (rather than the toast) is what keeps the small pill centred
      // — a `w-auto` toast would hang off the container's left edge.
      style={{ "--width": "260px" } as React.CSSProperties}
      toastOptions={{
        // `!` on the layout utilities: sonner sets width/padding through inline
        // CSS variables on the element, which outrank plain classes.
        classNames: {
          toast:
            "group toast !w-fit !max-w-[calc(100vw-48px)] !mx-auto !justify-center !gap-2 !rounded-full !border !px-3.5 !py-2 !text-center " +
            "!bg-foreground !text-background !border-transparent " +
            "!shadow-[0_10px_24px_-10px_rgb(0_0_0/0.45)]",
          content: "!w-auto !flex-none",
          title: "text-[13px] font-semibold leading-tight",
          description: "!text-background/70 text-[11px] leading-snug",
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
