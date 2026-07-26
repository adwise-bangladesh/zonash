import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Storefront toast styling.
 *
 * The storefront is a 480px centred phone frame, so toasts are anchored to the
 * top and width-capped to that frame instead of floating in the desktop corner
 * — a corner toast on a wide screen sits far away from the button the user just
 * tapped, and on mobile it collided with the sticky cart bar at the bottom.
 *
 * Styling is deliberately flat and uniform (one shape, one shadow, brand-tinted
 * icons) so an "Added to cart" and an error read as the same component rather
 * than two unrelated widgets.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={12}
      gap={8}
      duration={2200}
      visibleToasts={2}
      toastOptions={{
        // `!` on the layout utilities: sonner sets width/padding through inline
        // CSS variables on the element, which outrank plain classes.
        classNames: {
          toast:
            "group toast !w-[min(calc(100vw-24px),420px)] !mx-auto !gap-3 !rounded-2xl !border !px-4 !py-3 " +
            "group-[.toaster]:bg-background group-[.toaster]:text-foreground " +
            "group-[.toaster]:border-border/70 group-[.toaster]:shadow-[0_8px_28px_-8px_rgb(0_0_0/0.28)]",
          title: "text-sm font-semibold leading-tight",
          description: "group-[.toast]:text-muted-foreground text-xs leading-snug",
          icon: "shrink-0",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:text-xs group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:text-xs",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
